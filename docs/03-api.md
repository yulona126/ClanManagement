# 文档 3：API 接口规范

## 3.1 通用约定

### 鉴权

- 除登录、健康检查外，所有接口需携带 JWT：

```http
Authorization: Bearer <access_token>
```

- 未登录 / token 无效 → **401**
- 已登录但非该 Workspace 成员，或角色不足 → **403**
- 资源不存在（且不可枚举时可统一 403/404，团队统一选一种）→ 建议成员外 **404**，避免泄露存在性

### 内容类型

- 请求/响应：`application/json`（上传本体除外，走 OSS PUT）
- 时间字段：ISO 8601，UTC 或带时区

### 分页

列表接口统一：

```json
{
  "count": 100,
  "next": "https://.../records/?page=2",
  "previous": null,
  "results": [ ... ]
}
```

默认 `page_size=20`，可用 `?page=`、`?page_size=`（上限 50）。

---

## 3.2 端点一览

| 方法 | 路径 | 说明 | 权限 |
| :--- | :--- | :--- | :--- |
| GET | `/api/health/` | 健康检查 | 公开 |
| POST | `/api/auth/login/` | 登录获取 token | 公开 |
| POST | `/api/auth/refresh/` | 刷新 access token | 持有 refresh |
| GET | `/api/auth/me/` | 当前用户信息（含 `is_staff`） | 已登录 |
| GET | `/api/workspaces/` | 当前用户可访问的 Workspace 列表（含统计与 latest_memory） | 已登录 |
| POST | `/api/workspaces/` | （保留兼容）创建宝宝空间；**仅 staff** | `is_staff` |
| GET | `/api/workspaces/{id}/` | Workspace 详情（同列表摘要字段） | 该 Workspace 成员 |
| PATCH | `/api/workspaces/{id}/` | 修改空间名、宝宝名、生日 | owner |
| POST | `/api/workspaces/{id}/avatar/` | 上传宝宝封面照片 | owner |
| GET | `/api/workspaces/{id}/members/` | 成员列表 | 该 Workspace 成员 |
| POST | `/api/workspaces/{id}/members/invite/` | 邀请成员（绑定或新建用户） | owner |
| PATCH | `/api/workspaces/{id}/members/me/` | 本人改档案（显示名/头像/简介/辈分） | 该 Workspace 成员 |
| PATCH | `/api/workspaces/{id}/members/{mid}/` | 修改角色或称呼 | owner |
| DELETE | `/api/workspaces/{id}/members/{mid}/` | 移除成员 | owner |
| GET | `/api/workspaces/{id}/graph/` | 家族图谱（宝宝 + nodes + links） | 该 Workspace 成员 |
| POST | `/api/workspaces/{id}/kinship/` | 新增人对人关系边 | owner / editor |
| PATCH/DELETE | `/api/workspaces/{id}/kinship/{kid}/` | 改标签 / 删除 peer 边 | owner / editor |
| GET/POST | `/api/manage/users/` | 用户列表 / 创建 | `is_staff` |
| GET/POST | `/api/manage/workspaces/` | 宝宝空间列表 / 创建（推荐创建入口） | `is_staff` |
| PATCH | `/api/manage/workspaces/{id}/` | 修改宝宝空间资料 | `is_staff` |
| POST | `/api/manage/workspaces/{id}/avatar/` | 上传宝宝封面 | `is_staff` |
| GET/POST | `/api/manage/memberships/` | Membership 列表（可按 workspace 筛）/ 创建 | `is_staff` |
| GET | `/api/workspaces/{id}/records/` | 成长记录列表 | 该 Workspace 成员 |
| POST | `/api/workspaces/{id}/records/` | 创建记录 | owner / editor |
| GET | `/api/workspaces/{id}/records/{rid}/` | 记录详情 | 该 Workspace 成员 |
| PATCH | `/api/workspaces/{id}/records/{rid}/` | 更新记录 | owner；或 editor 且作者本人 |
| DELETE | `/api/workspaces/{id}/records/{rid}/` | 删除记录 | owner；或 editor 且作者本人 |
| POST | `/api/workspaces/{id}/media/presign/` | 获取 OSS 预签名上传 URL | owner/editor；成员仅 `audio` |
| POST | `/api/workspaces/{id}/media/complete/` | 上传完成回调，写入 MediaAsset | owner/editor；成员仅 `audio` |
| GET | `/api/workspaces/{id}/media/` | 媒体库列表（阶段 5） | 该 Workspace 成员 |
| GET/POST | `/api/workspaces/{id}/records/{rid}/comments/` | 记录评论列表 / 发表（阶段 5） | 成员读；成员写 |
| GET/POST | `/api/workspaces/{id}/media/{mid}/comments/` | 图片评论列表 / 发表（阶段 5） | 成员读；成员写 |
| DELETE | `.../comments/{cid}/` | 删除评论（阶段 5） | 作者本人或 owner |

> **不做公开注册。** 用户由 staff 管理台或 owner 邀请创建。Django Admin 可并存。

---

## 3.3 详细说明

### GET `/api/health/`

```json
{ "status": "ok" }
```

### POST `/api/auth/login/`

**Request**

```json
{ "username": "dad", "password": "******" }
```

**Response 200**

```json
{
  "access": "<jwt>",
  "refresh": "<jwt>"
}
```

### GET `/api/auth/me/`

```json
{
  "id": 1,
  "username": "dad",
  "email": "dad@example.com",
  "is_staff": false,
  "display_name": "阿琳",
  "bio": "小满妈妈",
  "avatar_url": "/media/profiles/1/….jpg"
}
```

### PATCH `/api/auth/me/`

Body（均可选）：`{ "display_name", "bio", "email" }`（登录名 `username` 不可通过此接口修改）

### POST `/api/auth/me/avatar/`

`multipart/form-data`，字段 `file`（图片，≤5MB）。返回更新后的 me。

### GET `/api/workspaces/`

当前用户 Membership 下的空间列表（**不分页**）。每项含角色与列表摘要：

```json
[
  {
    "id": 1,
    "name": "Emma的空间",
    "baby_name": "Emma",
    "baby_birthday": "2025-06-01",
    "avatar_url": "",
    "created_at": "2026-01-01T00:00:00Z",
    "my_role": "owner",
    "my_relation_label": "妈妈",
    "photo_count": 128,
    "video_count": 24,
    "member_count": 6,
    "last_activity_at": "2026-09-29T04:00:00Z",
    "latest_memory": {
      "id": 10,
      "content_preview": "第一次站起来…",
      "created_at": "2026-09-29T04:00:00Z",
      "cover_thumbnail_url": "https://…/thumb.jpg",
      "cover_media_type": "image"
    }
  }
]
```

- `latest_memory`：该空间最新一条成长记录；无记录时为 `null`。
- `last_activity_at`：最新记录时间与空间 `created_at` 的较大者。
- Cover 由前端优先用 `avatar_url`，否则用 `latest_memory.cover_thumbnail_url`。

### POST `/api/workspaces/`

**仅 `is_staff`**。普通用户不可创建；日常创建请用管理端 `POST /api/manage/workspaces/`。若走本接口，创建者自动成为 **owner**（含 `to_baby` 亲属边）。

**Request**

```json
{
  "baby_name": "Emma",
  "name": "",
  "baby_birthday": "2025-06-01",
  "relation_label": "妈妈"
}
```

| 字段 | 说明 |
| :--- | :--- |
| `baby_name` | 必填 |
| `relation_label` | 必填；创建者对宝宝的称呼 |
| `name` | 可选；空则默认 `{baby_name}的空间` |
| `baby_birthday` | 可选 |

**201** 返回与列表项同结构的对象（计数为 0，`latest_memory` 为 `null`）。

staff 用 `POST /api/manage/workspaces/` 建空间（不自动加 Membership，需另建 membership）；可选再 `POST .../avatar/` 上传封面。

### GET `/api/workspaces/{id}/`

成员可读；字段与列表项摘要一致。

### Staff 管理台

#### GET/POST `/api/manage/users/`

创建 body：`{ "username": "uncle", "password": "******", "email": "" }`  
列表项：`{ id, username, email, is_staff }`

#### GET/POST `/api/manage/workspaces/`

创建 body：`{ "name", "baby_name", "baby_birthday?", "avatar_url?" }`

#### GET/POST `/api/manage/memberships/`

- GET 可选 `?workspace_id=`
- POST：`{ "user_id", "workspace_id", "role", "relation_label", "anchor_membership_id?", "anchor_label?" }`
  - 该 Workspace **已有成员**时：`anchor_membership_id` + `anchor_label` **必填**（锚点须属于该空间）
  - **首个成员**：只需 `relation_label`（对宝宝）
  - 唯一冲突 → 400

### GET `/api/workspaces/`

当前用户 Membership 下的空间列表（非分页）。每项含角色与选空间页摘要：

```json
[
  {
    "id": 1,
    "name": "Emma的空间",
    "baby_name": "Emma",
    "baby_birthday": "2025-06-01",
    "avatar_url": "",
    "created_at": "2026-03-01T12:00:00Z",
    "my_role": "owner",
    "my_relation_label": "妈妈",
    "photo_count": 128,
    "video_count": 24,
    "member_count": 6,
    "last_activity_at": "2026-09-29T06:00:00Z",
    "latest_memory": {
      "id": 10,
      "content_preview": "第一次站起来…",
      "created_at": "2026-09-29T06:00:00Z",
      "cover_thumbnail_url": "https://…/thumb.jpg",
      "cover_media_type": "image"
    }
  }
]
```

- `latest_memory` 可为 `null`（尚无成长记录）。
- `last_activity_at` 为最新记录时间与空间 `created_at` 的较晚者。

### POST `/api/workspaces/`

**仅 `is_staff`**。推荐改用管理端创建。若走本接口，创建者自动成为 **owner**（含 `to_baby` 亲属边）。

```json
{
  "baby_name": "Emma",
  "name": "",
  "baby_birthday": "2025-06-01",
  "relation_label": "妈妈"
}
```

| 字段 | 说明 |
| :--- | :--- |
| `baby_name` | 必填 |
| `relation_label` | 必填；创建者对宝宝的称呼 |
| `name` | 可选；空则默认 `{baby_name}的空间` |
| `baby_birthday` | 可选 |

**201** 返回与列表项同结构的对象（新建时计数为 0，`latest_memory` 为 null）。

> 管理端 `POST /api/manage/workspaces/` 建空间不自动加 Membership，需另建 membership；可再上传封面。

### GET `/api/workspaces/{id}/`

成员可读；字段与列表项摘要一致。

### POST `/api/workspaces/{id}/members/invite/`

```json
{
  "username": "uncle",
  "password": "******",
  "role": "viewer",
  "relation_label": "叔叔",
  "anchor_membership_id": 12,
  "anchor_label": "弟弟"
}
```

- 用户已存在：忽略 `password`，只建 Membership（已是成员 → 400）
- 用户不存在：`password` 必填，创建 User 再挂 Membership
- 空间内**已有成员**时：`anchor_membership_id` + `anchor_label` 必填；同事务写 Membership + `to_baby` 边 + `peer` 锚点边
- 空间内**尚无成员**（冷启动）：只需 `relation_label`

### GET `/api/workspaces/{id}/graph/`

```json
{
  "baby": { "id": "ws_1", "name": "小满", "birthday": "2024-01-01", "avatar_url": "" },
  "nodes": [
    {
      "id": "m_12",
      "membership_id": 12,
      "user_id": 3,
      "username": "alin",
      "display_name": "阿琳",
      "relation_to_baby": "妈妈",
      "avatar_url": "",
      "bio": "",
      "generation": 0,
      "role": "owner"
    }
  ],
  "links": [
    { "id": 1, "kind": "to_baby", "source": "m_12", "target": "ws_1", "label": "妈妈" },
    { "id": 2, "kind": "peer", "source": "m_12", "target": "m_15", "label": "夫妻" }
  ]
}
```

### PATCH `/api/workspaces/{id}/members/me/`

Body（均可选）：`{ "display_name", "avatar_url", "bio", "generation" }`

### POST `/api/workspaces/{id}/kinship/`

```json
{ "from_membership_id": 12, "to_membership_id": 15, "label": "夫妻" }
```

仅创建 `peer` 边；`to_baby` 边由邀请/改称呼维护。

### PATCH `/api/workspaces/{id}/members/{mid}/`

返回「当前用户在每个 Workspace 里的角色和称呼」，前端直接渲染切换器。

```json
[
  {
    "id": 1,
    "name": "小满的成长",
    "baby_name": "小满",
    "baby_birthday": "2024-01-15",
    "avatar_url": "https://oss.example.com/...",
    "my_role": "owner",
    "my_relation_label": "爸爸"
  },
  {
    "id": 2,
    "baby_name": "小禾",
    "avatar_url": "https://oss.example.com/...",
    "my_role": "viewer",
    "my_relation_label": "舅舅"
  }
]
```

### GET `/api/workspaces/{id}/members/`

```json
[
  {
    "id": 5,
    "user_id": 1,
    "username": "dad",
    "role": "owner",
    "relation_label": "爸爸",
    "created_at": "2026-01-01T00:00:00Z"
  }
]
```

### PATCH `/api/workspaces/{id}/members/{mid}/`

**Request（部分字段）**

```json
{ "role": "editor", "relation_label": "叔叔" }
```

仅 owner；不可把最后一个 owner 降级（业务校验）。

### DELETE `/api/workspaces/{id}/members/{mid}/`

仅 owner；不可移除最后一个 owner。

### GET `/api/workspaces/`

分页列表。每条可含作者称呼（服务端 join 当前 Workspace 的 Membership）与媒体摘要。

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 10,
      "title": "第一次翻身",
      "content": "今天……",
      "author_id": 1,
      "author_relation_label": "爸爸",
      "created_at": "2026-03-01T12:00:00Z",
      "updated_at": "2026-03-01T12:00:00Z",
      "media": [
        {
          "id": 100,
          "media_type": "image",
          "object_key": "workspaces/1/records/10/uuid.jpg",
          "file_url": "https://cdn.example.com/workspaces/1/records/10/uuid.jpg",
          "thumbnail_url": "https://cdn.example.com/workspaces/1/records/10/uuid.jpg?x-oss-process=image/resize,w_400",
          "width": 4032,
          "height": 3024,
          "taken_at": "2024-01-15T09:30:00+08:00",
          "captured_at": "2024-01-15T09:30:00+08:00",
          "taken_at_source": "exif",
          "created_at": "2026-03-01T12:00:00Z"
        }
      ]
    }
  ]
}
```

### POST `/api/workspaces/{id}/records/`

```json
{ "title": "第一次翻身", "content": "今天……" }
```

`author` 取当前用户。**201** 返回完整记录对象。

### PATCH / DELETE 记录

- owner：可操作任意记录
- editor：仅 `author_id == request.user.id`
- viewer：403

### POST `/api/workspaces/{id}/media/presign/`

owner / editor 可上传任意类型；**普通成员仅可上传 `media_type=audio`**（语音评论）。

```json
{
  "filename": "photo.jpg",
  "content_type": "image/jpeg",
  "media_type": "image",
  "record_id": 10
}
```

**Response 200**

```json
{
  "upload_url": "https://bucket.oss-cn-xxx.aliyuncs.com/...?签名",
  "file_url": "https://cdn.example.com/workspaces/1/records/10/uuid.jpg",
  "object_key": "workspaces/1/records/10/uuid.jpg",
  "headers": { "Content-Type": "image/jpeg" },
  "expires_in": 600
}
```

- `object_key` 由服务端生成（含 `workspaces/{id}/records/{record_id}/` 前缀 + UUID + 扩展名）。
- 前端用 `upload_url` 对 OSS（或本地等价 PUT）发 **PUT**（带 `headers`），成功后调 complete。
- **不在此步写 `MediaAsset`。**
- `STORAGE_BACKEND=local` 时 `upload_url` 指向本 API 的 `.../media/local-put/`（签名校验）；`oss` 时为阿里云预签名 URL。Bucket 由环境变量 `OSS_BUCKET_NAME` 决定（图/视频同桶）。

### POST `/api/workspaces/{id}/media/complete/`

上传完成后写库。图片可附带前端解析的 EXIF（方案 A，见 ADR-010）。

**Request**

```json
{
  "record_id": 10,
  "object_key": "workspaces/1/records/10/uuid.jpg",
  "media_type": "image",
  "exif": {
    "width": 4032,
    "height": 3024,
    "taken_at": "2024-01-15T09:30:00+08:00",
    "orientation": 1,
    "make": "Apple",
    "model": "iPhone 15",
    "gps": { "lat": 31.2304, "lng": 121.4737 },
    "extra": { "iso": 100, "focal_length_mm": 26 }
  }
}
```

| 字段 | 说明 |
| :--- | :--- |
| `record_id` / `object_key` / `media_type` | 必填 |
| `exif` | 可选；仅 `media_type=image` 时处理，否则忽略 |
| `exif.gps.lat` / `lng` | WGS84；有则写入 `latitude`/`longitude`；缺省则两列 NULL |
| `exif.extra` | 仅白名单键进入 `exif_json`（见下） |
| `thumbnail_object_key` | 可选；仅 `media_type=video`。客户端上传时抽帧得到的 JPEG，须与视频同属该 `record` 前缀；**不**另建 `MediaAsset` |

**服务端行为**

1. 校验：写权限、`record` 属于该 Workspace、`object_key` 前缀为 `workspaces/{id}/`。
2. **`file_url` 由服务端按 `object_key` 重算**，不信任客户端传入的读 URL。
3. `thumbnail_url`：
   - 图片：OSS 下序列化时可拼 `x-oss-process=image/resize`；本地用原图 URL。
   - 视频：若传了 `thumbnail_object_key` → 存其公开 URL（本地抽帧封面）；否则 OSS 下拼 `video/snapshot`；再否则空（Feed 用占位）。
   - 客户端上传前会：过滤 iOS 实况配套 MOV、HEIC→JPEG、过大图缩到长边 2560（再 PUT）。
4. 规范化 `exif`：非法数字/越界 GPS（lat∉[-90,90]、lng∉[-180,180]）→ 对应字段置空，**不导致整单失败**；未知 `extra` 键丢弃。
5. 写入 `MediaAsset`，**201** 返回完整媒体对象（含 GPS 列，对本 Workspace 全体成员可见）。

**`exif.extra` 白名单（可演进）：** `iso`、`focal_length_mm`、`lens_model`、`software`。

**非目标：** complete 不下载原图再解析 EXIF（保留为后续可选加固，不阻塞阶段 4）。

### （阶段 5）媒体库与评论 — 契约摘要

**`GET /api/workspaces/{id}/media/`**

- 分页；默认 `media_type=image` 可覆盖；排序按 `captured_at`（`taken_at` 优先，否则 `created_at`）降序。
- 每项为**精简媒体对象**（见下），不含 `exif_json` / 机型 / GPS。
- 嵌套在记录列表里的 `media[]` 同样精简；**记录详情** `GET .../records/{rid}/` 与 `media/complete/` 返回完整媒体（含 `camera_*`、`latitude`/`longitude`、`exif_json`）。

**精简媒体字段：** `id`、`record_id`、`media_type`、`object_key`、`file_url`、`thumbnail_url`、`width`、`height`、`taken_at`、`captured_at`、`taken_at_source`、`created_at`。

**评论**

- `GET` 分页（默认 `page_size=30`，`max=100`）：`{ count, next, previous, results }`；按 `created_at` **降序**（最新在前），`next` 为更早一页。
- `POST` body：`{ "body"?: "文字", "audio_id"?: 123 }`；作者为当前用户；`body` 与 `audio_id` 至少其一。
- `audio_id` 须为本 Workspace 的 `MediaAsset`，且 `media_type=audio`，`record` 与评论目标一致（评记录→该 record；评照片→照片的 record）。
- 列表含 `author_id`、`author_relation_label`、`created_at`、`body`、精简 `audio`（`id`/`record_id`/`media_type`/`object_key`/`file_url`/`created_at`）。
- 目标对象必须属于该 Workspace；删评论：作者或 owner。

详细字段以阶段 5 实现时同步扩写本节为准。

---

## 3.4 前端 API 层约定

- Base URL：环境变量 `VITE_API_BASE_URL`（如 `http://127.0.0.1:8000`）
- Axios / fetch 拦截器自动附加 Bearer token
- 401：尝试 refresh；失败则清 token 跳转登录
- 当前 Workspace id：放在前端全局状态（URL 或 context），所有业务请求带路径中的 `{id}`

## 3.5 OpenAPI

阶段 1 起可用 `drf-spectacular` 自动生成 `/api/schema/`；本文件为人工摘要，冲突时以**已实现且测试通过的行为** + 同步回本文档为准。
