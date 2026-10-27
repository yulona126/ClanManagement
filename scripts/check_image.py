#!/usr/bin/env python3
"""检查图片 URL 为什么「黑掉 / 打不开」。

用法::

    python3 scripts/check_image.py <url> [<url> ...]
    python3 scripts/check_image.py --file urls.txt
    python3 scripts/check_image.py --oss https://bucket.host/object_key

对每个 URL 报告：

  1. HTTP 状态、Content-Type、Content-Length —— 判断是不是被当成非图片/空对象
  2. 真实字节类型（魔数）—— 判断扩展名与内容是否一致
  3. 能否解码、尺寸、**平均亮度** —— 亮度接近 0 就是真正的黑图
  4. 追加 `?x-oss-process=image/resize,w_400` 再取一次 ——
     缩略图走的就是这条路径；原图正常但缩略图失败，就是 OSS 处理的问题

为什么要用服务端脚本而不是浏览器：跨域图片会污染 canvas，`getImageData`
拿不到像素，浏览器里无法判断「黑」还是「深色照片」。这里直接抓字节。

需要 Pillow 才能测亮度；没有就只报字节信息（会提示）。
"""

from __future__ import annotations

import argparse
import io
import sys
import urllib.error
import urllib.request

try:  # Pillow 不是项目依赖
    from PIL import Image, ImageStat

    HAS_PIL = True
except ImportError:  # pragma: no cover
    HAS_PIL = False

TIMEOUT = 30
UA = "claner-image-check/1.0"

MAGIC = (
    (b"\xff\xd8\xff", "jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"BM", "bmp"),
)
# 亮度低于这个值判为「黑图」（纯黑=0；正常照片通常 > 30）
DARK_THRESHOLD = 8.0

# Pillow 解不了的图片格式（不要因此判为坏图）
NOT_DECODABLE = {"svg"}


def sniff(head: bytes) -> str:
    for sig, kind in MAGIC:
        if head.startswith(sig):
            return kind
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12].lower()
        if brand.startswith(b"hei") or brand.startswith(b"hev"):
            return "heic"
        if brand.startswith(b"avi"):
            return "avif"
        return "bmff"
    if head.startswith(b"%PDF"):
        return "pdf"
    stripped = head.lstrip()
    # SVG 也是合法图片，别和「HTML 错误页」混为一谈
    if stripped[:4].lower() == b"<svg":
        return "svg"
    if stripped[:5].lower() == b"<?xml" and b"<svg" in head[:400].lower():
        return "svg"
    if stripped[:1] == b"{" or stripped[:1] == b"[":
        return "json"
    if stripped[:9].lower() == b"<!doctype" or stripped[:5].lower() == b"<html":
        return "html"
    return "unknown"


def fetch(url: str) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        body = resp.read(3_000_000)  # 3MB 足够判断
        headers = {k.lower(): v for k, v in resp.headers.items()}
        return resp.status, headers, body


def luma(data: bytes) -> tuple[float | None, tuple[int, int] | None, str | None]:
    """返回 (平均亮度, (宽,高), 错误信息)。"""
    if not HAS_PIL:
        return None, None, "Pillow 未安装"
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        size = img.size
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        stat = ImageStat.Stat(img.convert("L"))
        return round(stat.mean[0], 1), size, None
    except Exception as exc:  # noqa: BLE001
        return None, None, f"{type(exc).__name__}: {exc}"


def with_oss_process(url: str, param: str) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}x-oss-process={param}"


def check(url: str, label: str = "") -> list[str]:
    """返回问题列表；空表示这张图看起来正常。"""
    problems: list[str] = []
    tag = label or url
    print(f"\n─── {tag}")
    print(f"    {url[:150]}")

    try:
        status, headers, body = fetch(url)
    except urllib.error.HTTPError as exc:
        print(f"    HTTP {exc.code} {exc.reason}")
        return [f"HTTP {exc.code}"]
    except Exception as exc:  # noqa: BLE001
        print(f"    请求失败: {exc}")
        return [f"请求失败: {exc}"]

    ctype = headers.get("content-type", "")
    clen = headers.get("content-length", "?")
    kind = sniff(body[:16])

    print(f"    HTTP {status}  type={ctype or '(无)'}  length={clen}  实际={kind}")

    if not body:
        problems.append("对象为空（0 字节）")
    if ctype and not ctype.lower().startswith("image/"):
        problems.append(f"Content-Type 不是 image/*（{ctype}）")
    if not ctype:
        problems.append("缺少 Content-Type")
    if kind in ("html", "json", "pdf", "unknown"):
        problems.append(f"返回的不是图片（{kind}，前 16 字节 {body[:16]!r}）")

    if kind in NOT_DECODABLE:
        print("    解码: 跳过（SVG，Pillow 不解码；浏览器可正常渲染）")
        avg, size, err = None, None, None
    else:
        avg, size, err = luma(body)
    if err:
        print(f"    解码: {err}")
        if kind not in ("html", "json", "pdf", "unknown"):
            problems.append(f"无法解码（{err}）")
    elif size:
        print(f"    尺寸: {size[0]}x{size[1]}  平均亮度: {avg}")
        if avg is not None and avg < DARK_THRESHOLD:
            problems.append(f"平均亮度 {avg}，接近全黑")

    # 缩略图路径：OSS 图片处理
    thumb_url = with_oss_process(url, "image/resize,w_400")
    print(f"    缩略图参数: ?x-oss-process=image/resize,w_400")
    try:
        t_status, t_headers, t_body = fetch(thumb_url)
        t_kind = sniff(t_body[:16])
        t_type = t_headers.get("content-type", "")
        t_avg, t_size, t_err = luma(t_body)
        print(
            f"      -> HTTP {t_status} type={t_type or '(无)'} 实际={t_kind}"
            + (f" 亮度={t_avg}" if t_avg is not None else "")
        )
        if t_status >= 400:
            problems.append(f"OSS 缩略图处理失败（HTTP {t_status}）")
        elif t_kind in ("html", "json", "unknown", "pdf"):
            problems.append(f"OSS 缩略图返回的不是图片（{t_kind}）")
        elif t_avg is not None and t_avg < DARK_THRESHOLD and (avg is None or avg >= DARK_THRESHOLD):
            problems.append("原图正常但缩略图偏黑（OSS 处理问题）")
    except urllib.error.HTTPError as exc:
        print(f"      -> HTTP {exc.code} {exc.reason}")
        problems.append(f"OSS 缩略图处理失败（HTTP {exc.code}）")
    except Exception as exc:  # noqa: BLE001
        print(f"      -> 失败: {exc}")
        problems.append(f"OSS 缩略图请求失败: {exc}")

    if problems:
        print("    ✗ " + "；".join(problems))
    else:
        print("    ✓ 看起来正常")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="检查图片 URL 的黑图/打不开问题")
    ap.add_argument("urls", nargs="*", help="要检查的图片 URL")
    ap.add_argument("--file", help="从文件读 URL（每行一个，忽略 # 注释）")
    ap.add_argument(
        "--oss",
        help="给一个 OSS 对象 URL，自动补出 w_400 缩略图一起测（等价于 --file 单条）",
    )
    args = ap.parse_args()

    urls = list(args.urls)
    if args.oss:
        urls.append(args.oss)
    if args.file:
        with open(args.file, encoding="utf-8") as fh:
            urls += [
                line.strip()
                for line in fh
                if line.strip() and not line.strip().startswith("#")
            ]

    if not urls:
        ap.print_help()
        return 2
    if not HAS_PIL:
        print("⚠ 未安装 Pillow：无法测亮度，黑图判定会退化为只看字节/类型")
        print("  安装：python3 -m pip install pillow\n")

    bad = 0
    for u in urls:
        if check(u):
            bad += 1

    print(f"\n{'=' * 60}")
    print(f"检查 {len(urls)} 张，有问题 {bad} 张")
    if bad:
        print("\n对照表：")
        print("  字节坏/全黑         → 上传阶段就坏了（前端重编码 / 直传截断）")
        print("  Content-Type 不对   → 直传时的 headers 与真实类型不一致")
        print("  仅缩略图失败/偏黑   → OSS x-oss-process 对该图不适用（格式/CMYK/超大）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
