"""Media storage: local FS or Aliyun OSS via env (single bucket, ADR-011)."""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import time
import uuid
from pathlib import Path
from urllib.parse import quote, urlencode

from django.conf import settings


PRESIGN_TTL_SECONDS = 600
# Object keys include uuid — safe for long-lived browser/CDN cache.
OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable"


def make_object_key(workspace_id: int, record_id: int, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if len(ext) > 12:
        ext = ""
    return f"workspaces/{workspace_id}/records/{record_id}/{uuid.uuid4().hex}{ext}"


def make_library_object_key(workspace_id: int, filename: str) -> str:
    """Album / library upload not attached to a GrowthRecord."""
    ext = Path(filename).suffix.lower()
    if len(ext) > 12:
        ext = ""
    return f"workspaces/{workspace_id}/library/{uuid.uuid4().hex}{ext}"


def make_album_object_key(workspace_id: int, album_id: int, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if len(ext) > 12:
        ext = ""
    return f"workspaces/{workspace_id}/albums/{album_id}/{uuid.uuid4().hex}{ext}"


def expected_key_prefix(workspace_id: int) -> str:
    return f"workspaces/{workspace_id}/"


def public_url(object_key: str) -> str:
    key = object_key.lstrip("/")
    if settings.STORAGE_BACKEND == "oss":
        if settings.OSS_CUSTOM_DOMAIN:
            return f"{settings.OSS_CUSTOM_DOMAIN}/{key}"
        endpoint = settings.OSS_ENDPOINT
        if not endpoint:
            raise RuntimeError("OSS_ENDPOINT is required when STORAGE_BACKEND=oss")
        host = endpoint.replace("https://", "").replace("http://", "")
        bucket = settings.OSS_BUCKET_NAME
        return f"https://{bucket}.{host}/{key}"
    # Relative path so phone/LAN via Vite proxy (/media → Django) always works.
    return f"{settings.MEDIA_URL}{key}"


def thumbnail_url(object_key: str, media_type: str, file_url: str | None = None) -> str:
    """Build a display URL for list/grid covers (image resize or video snapshot)."""
    url = file_url or public_url(object_key)
    # 相对路径（本地 MEDIA_URL，如 /media/...）不是 OSS 对象，不能拼图片处理参数
    if not url.lower().startswith(("http://", "https://")):
        return url if media_type == "image" else ""
    if settings.STORAGE_BACKEND != "oss":
        # Local: images use the file itself; video covers are uploaded separately.
        return url if media_type == "image" else ""
    sep = "&" if "?" in url else "?"
    if media_type == "image":
        return f"{url}{sep}x-oss-process=image/resize,w_400"
    if media_type == "video":
        # t_1000 = 1s (avoid pure black first frame); m_fast = cheaper snapshot.
        return f"{url}{sep}x-oss-process=video/snapshot,t_1000,f_jpg,w_400,m_fast"
    return ""


def local_public_base() -> str:
    """Optional absolute origin for local PUT; empty → same-origin relative URL."""
    return (settings.PUBLIC_API_BASE_URL or "").rstrip("/")


def _local_sign(object_key: str, expires: int, content_type: str) -> str:
    payload = f"{object_key}:{expires}:{content_type}".encode()
    return hmac_mod.new(
        settings.SECRET_KEY.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()


def verify_local_put_signature(
    object_key: str,
    expires: int,
    content_type: str,
    signature: str,
) -> bool:
    if expires < int(time.time()):
        return False
    expected = _local_sign(object_key, expires, content_type)
    return hmac_mod.compare_digest(expected, signature)


def save_local_object(object_key: str, body: bytes) -> None:
    path = Path(settings.MEDIA_ROOT) / object_key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)


def presign_put(
    *,
    workspace_id: int,
    object_key: str,
    content_type: str,
) -> dict:
    expires_in = PRESIGN_TTL_SECONDS
    file_url = public_url(object_key)
    headers = {
        "Content-Type": content_type,
        "Cache-Control": OBJECT_CACHE_CONTROL,
    }

    if settings.STORAGE_BACKEND == "oss":
        upload_url = _oss_presign_put(object_key, content_type, expires_in)
    else:
        # Local PUT ignores Cache-Control; nginx /media/ sets its own expires.
        headers = {"Content-Type": content_type}
        expires = int(time.time()) + expires_in
        sig = _local_sign(object_key, expires, content_type)
        qs = urlencode(
            {
                "object_key": object_key,
                "expires": expires,
                "content_type": content_type,
                "signature": sig,
            },
            quote_via=quote,
        )
        path = f"/api/workspaces/{workspace_id}/media/local-put/?{qs}"
        # Prefer relative URL (Vite proxy). Absolute only if PUBLIC_API_BASE_URL set.
        base = local_public_base()
        upload_url = f"{base}{path}" if base else path

    return {
        "upload_url": upload_url,
        "file_url": file_url,
        "object_key": object_key,
        "headers": headers,
        "expires_in": expires_in,
    }


def _oss_client():
    import boto3
    from botocore.client import Config

    if not settings.OSS_ACCESS_KEY_ID or not settings.OSS_ACCESS_KEY_SECRET:
        raise RuntimeError("OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET required")
    if not settings.OSS_ENDPOINT:
        raise RuntimeError("OSS_ENDPOINT required")

    # Aliyun OSS rejects botocore's default flexible checksum trailers
    # (STREAMING-UNSIGNED-PAYLOAD-TRAILER / Aws MultiChunkedEncoding).
    return boto3.client(
        "s3",
        aws_access_key_id=settings.OSS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.OSS_ACCESS_KEY_SECRET,
        endpoint_url=settings.OSS_ENDPOINT,
        region_name=settings.OSS_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def _oss_presign_put(object_key: str, content_type: str, expires_in: int) -> str:
    client = _oss_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.OSS_BUCKET_NAME,
            "Key": object_key,
            "ContentType": content_type,
            "CacheControl": OBJECT_CACHE_CONTROL,
        },
        ExpiresIn=expires_in,
        HttpMethod="PUT",
    )


def put_oss_bytes(object_key: str, body: bytes, content_type: str) -> None:
    """Server-side OSS PUT (avatars / covers) with long-lived Cache-Control."""
    client = _oss_client()
    client.put_object(
        Bucket=settings.OSS_BUCKET_NAME,
        Key=object_key,
        Body=body,
        ContentType=content_type or "image/jpeg",
        CacheControl=OBJECT_CACHE_CONTROL,
    )


# ---------------------------------------------------------------- 内容校验
#
# 黑图 / 打不开的一个常见根因：对象存的字节和扩展名/声明类型不一致
# （前端 canvas 编码失败、直传被截断、或拿到的是错误页 HTML）。
# 登记前先读前几个字节做魔数校验，把问题挡在上传时，而不是等用户看到黑图。

_IMAGE_MAGIC = (
    (b"\xff\xd8\xff", "jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"BM", "bmp"),
)

_EXT_TO_KIND = {
    "jpg": "jpeg",
    "jpeg": "jpeg",
    "png": "png",
    "gif": "gif",
    "webp": "webp",
    "bmp": "bmp",
}


def sniff_image_kind(head: bytes) -> str:
    """按魔数判断实际图片类型；识别不出返回 'unknown'。"""
    for sig, kind in _IMAGE_MAGIC:
        if head.startswith(sig):
            return kind
    # WEBP: "RIFF" + 4 字节长度 + "WEBP"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    # ISO-BMFF: heic / heif / avif / mp4 —— 第 4..8 字节是 "ftyp"
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12].lower()
        if brand.startswith(b"hei") or brand.startswith(b"hev"):
            return "heic"
        if brand.startswith(b"avi"):
            return "avif"
        if brand.startswith(b"mp4") or brand.startswith(b"isom"):
            return "mp4"
        return "bmff"
    # 以下是"明确不是图片"的类型
    if head.startswith(b"%PDF"):
        return "pdf"
    if head.startswith(b"PK\x03\x04"):
        return "zip"
    stripped = head.lstrip()
    if stripped[:1] in (b"<", b"{"):
        return "html-or-json"
    return "unknown"


def read_object_head(object_key: str, size: int = 16) -> bytes:
    """读对象开头若干个字节，用于登记前的魔数校验。失败返回 b""。"""
    try:
        if settings.STORAGE_BACKEND == "oss":
            client = _oss_client()
            obj = client.get_object(
                Bucket=settings.OSS_BUCKET_NAME,
                Key=object_key,
                Range=f"bytes=0-{size - 1}",
            )
            try:
                return obj["Body"].read()
            finally:
                obj["Body"].close()
        path = Path(settings.MEDIA_ROOT) / object_key
        with path.open("rb") as fh:
            return fh.read(size)
    except Exception:  # noqa: BLE001 - 校验失败不应阻断上传，交给调用方记录
        return b""


# 确证"不是图片"的类型：只有这些才拒绝入库
_DEFINITELY_NOT_IMAGE = frozenset({"pdf", "zip", "html-or-json"})

# 认得出、且确实是图片的类型
_IMAGE_KINDS = frozenset(
    {"jpeg", "png", "gif", "webp", "bmp", "heic", "avif", "mp4", "bmff"}
)


def is_definitely_not_image(kind: str, head: bytes) -> bool:
    """是否确证不是图片。只对空对象 / HTML / PDF / ZIP 这类返回 True。"""
    return not head or kind in _DEFINITELY_NOT_IMAGE


def image_kind_matches_extension(object_key: str, head: bytes) -> tuple[bool, str]:
    """
    校验「扩展名」与「真实字节」是否一致。

    返回 (是否可信, 实际类型)。

    策略是**宁可放过、不可错杀**：用户手机上明明能看到这张照片，
    我们因为认不出字节就拒收，体验比存一张坏图还糟。所以：
      - 扩展名与真实类型一致 → 可信
      - 认得出是图片但扩展名不符（例如 PNG 存成 .jpg）→ 不可信但**放行**，只记日志
      - 认不出（可能是新格式 / 编码器变体）→ 放行
      - 确证不是图片（空 / HTML / PDF / ZIP）→ 拒绝
    """
    actual = sniff_image_kind(head)
    if is_definitely_not_image(actual, head):
        return False, actual
    if actual not in _IMAGE_KINDS:
        return True, actual  # 认不出但不像错误页，放过
    ext = object_key.rsplit(".", 1)[-1].lower() if "." in object_key else ""
    expected = _EXT_TO_KIND.get(ext)
    # heic/avif/mp4 等不一定有对应扩展名映射，交给调用方按 kind 判断
    if expected is None:
        return True, actual
    if expected != actual:
        return False, actual
    return True, actual
