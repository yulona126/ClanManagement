"""排查「上传后图片显示为黑图 / 无法显示」。

黑图有两类原因，修法完全不同，所以先把它们分开：

  A. **文件本身就是坏的/黑的** —— 前端 canvas 重编码失败（HEIC 解码失败、
     超大图 toBlob 失败）或直传时字节没传完整。这类要看对象存储里的真实字节。
  B. **文件是好的，但显示链路把它弄坏了** —— Content-Type 与扩展名不一致、
     OSS 图片处理参数（`x-oss-process`）报错、桶权限/防盗链、CDN 缓存了坏版本。

本命令做 A 的验证：把对象从存储里取回来，看魔数、解码、平均亮度，
并同时打印库里记录的 URL / Content-Type，便于和 B 对照。

用法（容器内）::

    docker compose exec api python manage.py dbg_media --limit 30
    docker compose exec api python manage.py dbg_media --key workspaces/1/library/xxx.jpg
    docker compose exec api python manage.py dbg_media --since 2026-10-01 --only-suspect
    docker compose exec api python manage.py dbg_media --dark-threshold 12
    docker compose exec api python manage.py dbg_media --http        # 按浏览器方式走 CDN 取图

`--http` 会额外用 HTTP GET 拉 `file_url` 与 `thumbnail_url`（就是你浏览器实际
请求的那两个 URL），报告状态码 / Content-Type / 长度 / 能否解码。
存储里字节正常、但 `--http` 报错，就确定是显示链路（B 类）的问题。

只读操作，不会修改任何数据。
"""

from __future__ import annotations

import io
import urllib.error
import urllib.request

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.clan.models import MediaAsset
from apps.clan.services.storage import (
    _oss_client,
    image_kind_matches_extension,
    is_definitely_not_image,
    public_url,
    sniff_image_kind,
)

# Pillow 不是本项目依赖；有就用，没有就降级（命令会明确提示，避免"测不到"当成"没问题"）
try:  # noqa: SIM105
    from PIL import Image, ImageStat

    PIL_AVAILABLE = True
except ImportError:  # pragma: no cover
    PIL_AVAILABLE = False


def mean_luma(data: bytes) -> float | None:
    """
    平均亮度（0–255）。纯黑图接近 0。

    依赖 Pillow；没装就返回 None，此时改用「文件大小 + 能否解码」判断，
    命令输出里会明确提示 Pillow 缺失，避免把"测不到"误当成"没问题"。
    """
    if not PIL_AVAILABLE:
        return None
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        stat = ImageStat.Stat(img.convert("L"))
        return round(stat.mean[0], 1)
    except Exception:
        return None


class Command(BaseCommand):
    help = "诊断上传后的图片：取回真实字节，判断是坏文件还是显示链路问题。"

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=20, help="最多检查多少条（默认 20）")
        parser.add_argument("--key", help="只检查指定 object_key")
        parser.add_argument("--since", help="只检查该日期之后创建的（YYYY-MM-DD）")
        parser.add_argument(
            "--only-suspect",
            action="store_true",
            help="只列出有问题的（解码失败 / 偏黑 / 类型不符）",
        )
        parser.add_argument(
            "--dark-threshold",
            type=float,
            default=8.0,
            help="平均亮度低于此值判为黑图（默认 8）",
        )
        parser.add_argument(
            "--verbose-ok",
            action="store_true",
            help="把正常条目也打印出来（默认只打一行汇总）",
        )
        parser.add_argument(
            "--http",
            action="store_true",
            help="额外按浏览器方式 GET file_url / thumbnail_url，检查状态码与 Content-Type",
        )

    def handle(self, *args, **options):
        backend = settings.STORAGE_BACKEND
        self.stdout.write(f"STORAGE_BACKEND = {backend}")
        if not PIL_AVAILABLE:
            self.stdout.write(
                self.style.WARNING(
                    "未安装 Pillow：无法测平均亮度，黑图判定会退化为「大小/魔数」启发式。\n"
                    "  想精确判定就临时装：docker compose exec api pip install pillow"
                )
            )
        if backend == "oss":
            self.stdout.write(f"OSS_BUCKET = {settings.OSS_BUCKET_NAME}")
            self.stdout.write(f"OSS_ENDPOINT = {settings.OSS_ENDPOINT}")
            self.stdout.write(f"OSS_CUSTOM_DOMAIN = {settings.OSS_CUSTOM_DOMAIN}")
        else:
            self.stdout.write(f"MEDIA_ROOT = {settings.MEDIA_ROOT}")

        qs = MediaAsset.objects.all().order_by("-id")
        if options.get("key"):
            qs = qs.filter(object_key=options["key"])
        if options.get("since"):
            try:
                y, m, d = (int(x) for x in options["since"].split("-"))
                qs = qs.filter(created_at__gte=timezone.datetime(y, m, d, tzinfo=timezone.utc))
            except ValueError as exc:
                raise CommandError("--since 需要 YYYY-MM-DD") from exc
        rows = list(qs[: options["limit"]])
        if not rows:
            raise CommandError("没有匹配的 MediaAsset；用 --limit / --key / --since 放宽条件。")

        client = _oss_client() if backend == "oss" else None
        suspects = 0

        for a in rows:
            label = f"#{a.id} [{a.media_type}] {a.object_key}"
            asset_ext = (a.object_key.rsplit(".", 1)[-1] or "").lower()

            try:
                data = self._fetch(client, a.object_key)
            except Exception as exc:  # noqa: BLE001 - 诊断命令，如实报告
                suspects += 1
                self.stdout.write(
                    self.style.ERROR(f"✗ {label}\n    取回失败: {exc}")
                )
                self.stdout.write(f"    file_url: {a.file_url}\n")
                continue

            head = data[:16]
            kind = sniff_image_kind(head)
            trusted, _ = image_kind_matches_extension(a.object_key, head)
            luma = mean_luma(data)
            size = len(data)

            problems = []
            if size == 0:
                problems.append("对象为空（0 字节）")
            if is_definitely_not_image(kind, head):
                problems.append(f"确证不是图片（识别为 {kind}，前 16 字节 {head!r}）")
            elif not trusted:
                problems.append(f"扩展名与真实类型不符（实际 {kind}）")
            if kind not in ("unknown",) and asset_ext in (
                "jpg",
                "jpeg",
                "png",
                "gif",
                "webp",
            ):
                expected = {"jpg": "jpeg", "jpeg": "jpeg"}.get(asset_ext, asset_ext)
                if kind != expected:
                    problems.append(f"扩展名 .{asset_ext} 但字节是 {kind}")
            if luma is not None and luma < options["dark_threshold"]:
                problems.append(f"平均亮度 {luma}（接近全黑）")
            if luma is None and kind in ("jpeg", "png") and size < 200:
                problems.append("图片过小，可能是不完整的写入")

            if problems:
                suspects += 1
                self.stdout.write(self.style.ERROR(f"✗ {label}"))
                for p in problems:
                    self.stdout.write(f"    - {p}")
                self.stdout.write(
                    f"    大小={size}B 格式={kind} 亮度={luma} 记录尺寸={a.width}x{a.height}"
                )
                self.stdout.write(f"    file_url: {a.file_url}")
                self.stdout.write(f"    thumbnail_url: {a.thumbnail_url}")
                self.stdout.write(
                    f"    浏览器直开: {public_url(a.object_key)}"
                )
                if options["http"]:
                    self._check_http(a)
                self.stdout.write("")
            elif options["verbose_ok"] or options["http"]:
                if options["http"]:
                    self._check_http(a, ok_prefix="✓")
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ {label}  大小={size}B 格式={kind} 亮度={luma}"
                    )
                )

        total = len(rows)
        self.stdout.write("")
        self.stdout.write(
            f"检查 {total} 条，可疑 {suspects} 条，正常 {total - suspects} 条。"
        )
        if suspects:
            self.stdout.write(
                self.style.WARNING(
                    "\n有可疑条目：说明存储里的字节本身有问题（属于 A 类）。\n"
                    "下一步：用上面打印的 `浏览器直开` URL 直接访问。\n"
                    "  - 直开也是黑的/坏的 → 上传阶段就坏了，查前端 canvas 重编码\n"
                    "    （HEIC、超大图、toBlob 失败）与直传是否完整。\n"
                    "  - 直开是好的、只有页面里黑 → 属于 B 类，查显示链路：\n"
                    "    Content-Type、x-oss-process 参数、桶权限/防盗链、CDN 缓存。"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "存储里的字节都正常。若页面仍显示黑图，问题在显示链路（B 类），"
                    "见本文档末尾的排查顺序。"
                )
            )

    def _check_http(self, a, ok_prefix: str = "   ") -> None:
        """按浏览器的方式取图：状态码 / Content-Type / 长度 / 能否解码。"""
        for name, url in (("原图", a.file_url), ("缩略图", a.thumbnail_url)):
            if not url:
                continue
            if url.startswith("/"):
                self.stdout.write(f"{ok_prefix} {name}: {url}（站内相对路径，需带登录态才能取，跳过）")
                continue
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "claner-media-check/1.0"},
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=20) as resp:
                    body = resp.read(65536)
                    ctype = resp.headers.get("Content-Type", "")
                    clen = resp.headers.get("Content-Length")
                    status = resp.status
                kind = sniff_image_kind(body[:16])
                bad = []
                if status >= 400:
                    bad.append(f"HTTP {status}")
                if ctype and not ctype.lower().startswith("image/"):
                    bad.append(f"Content-Type={ctype}（不是 image/*）")
                if not ctype:
                    bad.append("缺少 Content-Type")
                if kind == "unknown":
                    bad.append(f"返回的不是图片（前 16 字节 {body[:16]!r}）")
                if clen and int(clen) < 200:
                    bad.append(f"Content-Length={clen} 过小")
                if bad:
                    self.stdout.write(
                        self.style.ERROR(f"   ✗ {name} GET 异常: {'; '.join(bad)}")
                    )
                    self.stdout.write(f"     {url[:160]}")
                else:
                    self.stdout.write(
                        f"   {ok_prefix} {name} GET ok: status={status} type={ctype} "
                        f"bytes={clen or '?'} 格式={kind}"
                    )
            except urllib.error.HTTPError as exc:
                self.stdout.write(
                    self.style.ERROR(f"   ✗ {name} HTTP {exc.code}: {exc.reason}")
                )
                self.stdout.write(f"     {url[:160]}")
            except Exception as exc:  # noqa: BLE001
                self.stdout.write(
                    self.style.ERROR(f"   ✗ {name} 请求失败: {exc}")
                )
                self.stdout.write(f"     {url[:160]}")

    def _fetch(self, client, object_key: str) -> bytes:
        if client is None:
            from pathlib import Path

            path = Path(settings.MEDIA_ROOT) / object_key
            if not path.exists():
                raise FileNotFoundError(f"本地文件不存在: {path}")
            return path.read_bytes()
        obj = client.get_object(Bucket=settings.OSS_BUCKET_NAME, Key=object_key)
        body = obj["Body"]
        try:
            return body.read()
        finally:
            body.close()
