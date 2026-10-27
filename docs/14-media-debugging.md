# 排查「上传后图片是黑图 / 打不开」

线上出现黑图时，**先分清是哪一类**，因为两类原因的修法完全不同：

| 类别 | 现象 | 根因位置 |
| :--- | :--- | :--- |
| **A. 文件本身坏/黑** | 浏览器直接打开对象 URL 也是黑的、打不开 | 上传阶段：前端 canvas 重编码失败、直传字节不完整 |
| **B. 文件好、显示链路坏** | 直接开 URL 正常，页面里黑/不显示 | Content-Type、`x-oss-process`、桶权限/防盗链、CDN 缓存 |

分界线就是：**直接用浏览器打开那条对象 URL**。
下面先讲怎么拿日志，再讲怎么一次判出是 A 还是 B。

---

## 1. 日志在哪看

媒体上传链路已经埋好日志（logger `apps.clan.media`，见
[`config/settings/base.py`](../backend/config/settings/base.py) 的 `LOGGING`）：

```bash
# 线上（docker compose）
docker compose logs -f api | grep -E "presign|complete|media"

# 只看上传相关，且带时间戳
docker compose logs --since 2h api | grep -E "presign (start|ok|failed)|complete (start|ok|reject|deny)"
```

每条上传会打三行，把这三行按 `object_key` 串起来就是一次完整事件：

| 日志 | 关键字段 | 读法 |
| :--- | :--- | :--- |
| `presign start` | `backend` `media_type` `content_type` `filename` | `content_type` 与实际文件是否相符 |
| `presign ok` | `key` `upload` | `key` 的后缀决定浏览器按什么类型解析 |
| `complete image bytes` | `actual` `trusted` `checked` | **新增**：登记前嗅探到的真实类型 |
| `complete ok` | `asset_id` `file_url` `width` `height` | `width/height` 为空说明前端没读到尺寸 |
| `complete reject non-image` | `actual` `head` | **新增**：明确不是图片（空/HTML/PDF），已拒绝入库 |

### 典型信号

- `complete image bytes ... actual=html-or-json` → 对象里存的是 HTML（错误页），A 类
- `complete image bytes ... actual=unknown trusted=false` → 字节认不出，可能被截断，A 类
- `presign start ... content_type=image/heic` 而对象后缀是 `.heic` → iOS 没转换成功，很多浏览器解不了
- `complete ok ... width=None height=None` → 前端解码就失败了，图大概率是坏的
- 日志里完全没有某次上传的 `complete` → 直传（PUT）阶段就失败了，查 CORS / 网络

---

## 2. 一次判出 A 还是 B：`dbg_media`

新增的管理命令，把对象**真实字节取回来**做三项检查：魔数（实际是什么格式）、
扩展名是否一致、能否解码 + 平均亮度（黑图判定）。

```bash
# 看最近的 20 条
docker compose exec api python manage.py dbg_media

# 只看最近 2 天、只列有问题的
docker compose exec api python manage.py dbg_media --since 2026-10-08 --only-suspect

# 只看某一条（把日志里的 object_key 贴进来）
docker compose exec api python manage.py dbg_media --key workspaces/1/library/abc123.jpg

# 关键：再按浏览器的方式走 HTTP 取一遍，检查状态码 / Content-Type
docker compose exec api python manage.py dbg_media --http --limit 10
```

`--http` 会额外 GET `file_url` 和 `thumbnail_url` —— 就是你浏览器实际请求的那两个
URL，报告状态码、Content-Type、长度、返回的是不是图片。

> **黑图判定依赖 Pillow**（本项目未内置）。没有时会提示"无法测平均亮度"，
> 此时退化为只看魔数/大小。要精确判定就临时装：
> `docker compose exec api pip install pillow`

### 怎么读结论

| `dbg_media` 结果 | `--http` 结果 | 结论 |
| :--- | :--- | :--- |
| ✗ 字节坏 / 全黑 | 也坏 | **A 类**：上传阶段就坏了 |
| ✓ 字节正常 | `file_url` 正常、`thumbnail_url` 异常 | **B 类**：OSS 图片处理参数问题 |
| ✓ 字节正常 | 原图也异常（非 `image/*`、404） | **B 类**：Content-Type / 桶权限 / CDN |

---

## 3. A 类（文件本身坏）常见原因

前端 [`prepareImageForUpload.ts`](../frontend/src/features/media/prepareImageForUpload.ts)
会在超过 1.2MB 或 HEIC 时用 canvas 重编码。黑图通常来自这里：

| 原因 | 特征 | 处理 |
| :--- | :--- | :--- |
| **HEIC 解码失败** | iOS 上传 `.heic`；Chrome/安卓 `createImageBitmap` 解不了 | 提示用户换 JPEG；或在上传页检测能力后拒绝 HEIC |
| **canvas 画成空白** | 亮度 ≈ 0，尺寸正常 | `toBlob` 前确认 `createImageBitmap` 已 resolve；大图分块 |
| **直传被截断** | 对象大小为 0 或远小于原图 | 查 `putToUploadUrl` 的超时 / 网络；看 RUM 里失败率 |
| **上传的是错误页** | `actual=html-or-json` | 直传 URL 过期（`PRESIGN_TTL_SECONDS=600`）后 PUT 到了鉴权页 |

现在 `complete` 会**在读字节后拒绝**「确证不是图片」（空 / HTML / PDF / ZIP），
所以这类不会再进库。**认不出或是扩展名不符的一律放行只记日志** ——
用户手机上明明能看到的好照片，不能因为后端认不出就拒收。

这个校验由 `MEDIA_BYTE_CHECK` 控制（默认开）。它会让每张图多一次对象存储
Range 读（约 20–50ms）；如果更在意上传速度，可在 `.env` 里设 `MEDIA_BYTE_CHECK=0`
关掉，`dbg_media` 仍可事后扫描。

## 4. B 类（显示链路坏）常见原因

| 原因 | 特征 | 处理 |
| :--- | :--- | :--- |
| **Content-Type 不对** | `--http` 显示 `application/octet-stream` | 直传时 `headers` 里的 `Content-Type` 必须与实际字节一致；检查 [`storage.py`](../backend/apps/clan/services/storage.py) 的 `presign_put` |
| **`x-oss-process` 报错** | 缩略图 400 / 返回错误图，原图正常 | 参数写错或对该格式不支持；`thumbnail_url` 在 [`storage.py`](../backend/apps/clan/services/storage.py) 的 `thumbnail_url()` |
| **桶权限 / 防盗链** | 404 / 403；换了域名就坏 | OSS 控制台读权限、Referer 白名单要含线上域名 |
| **CDN 缓存了坏版本** | 修好后仍显示旧的 | 对象 key 带 uuid 且 `immutable`，正常不会；若用了自定义域名，刷新 CDN |
| **CORS** | 上传阶段就失败（PUT 报错） | `docker compose exec api python manage.py configure_oss_cors --origin https://你的域名` |

---

## 5. 快速定位清单

```bash
# 1) 最近 2 小时有没有上传失败
docker compose logs --since 2h api | grep -E "presign failed|complete reject|complete deny"

# 2) 有没有"字节认不出"的
docker compose logs --since 24h api | grep "complete image bytes" | grep -v "trusted=True"

# 3) 从库里找可疑对象（需要 Pillow 才能判黑图）
docker compose exec api python manage.py dbg_media --since 2026-10-08 --only-suspect --http

# 4) 拿到 object_key 后，用浏览器直接开这个 URL
#    https://<bucket>.<endpoint>/<object_key>
#    黑/打不开 → A 类；正常 → B 类
```

## 6. 自测

判定逻辑可以脱离数据库自测（用 Pillow 造几张图：正常 / 纯黑 / 扩展名不符 / 空 / HTML）：

```bash
cd backend
PYTHONPATH=. DJANGO_ENV=local .venv/bin/python - <<'PY'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()
from apps.clan.services.storage import sniff_image_kind, image_kind_matches_extension, is_definitely_not_image

cases = [
    ("正常 jpeg", b"\xff\xd8\xff\xe0" + b"0" * 20, "a.jpg"),
    ("iPhone HEIC", b"\x00\x00\x00\x18ftypheic" + b"0" * 8, "a.heic"),
    ("HTML 错误页", b"<!DOCTYPE html>", "a.jpg"),
    ("空对象", b"", "a.jpg"),
    ("PNG 存成 jpg", b"\x89PNG\r\n\x1a\n" + b"0" * 8, "a.jpg"),
]
for label, head, key in cases:
    trusted, actual = image_kind_matches_extension(key, head)
    reject = (not trusted) and is_definitely_not_image(actual, head)
    print(f"{label:14s} actual={sniff_image_kind(head):14s} -> {'拒绝' if reject else '放行'}")
PY
```

预期：正常 jpeg / HEIC 放行，HTML / 空对象拒绝，PNG 存成 jpg 放行（只记日志）。
