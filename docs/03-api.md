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
| GET | `/api/auth/me/` | 当前用户信息 | 已登录 |
| GET | `/api/workspaces/` | 当前用户可访问的 Workspace 列表 | 已登录 |
| GET | `/api/workspaces/{id}/` | Workspace 详情 | 该 Workspace 成员 |
| GET | `/api/workspaces/{id}/members/` | 成员列表 | 该 Workspace 成员 |
| PATCH | `/api/workspaces/{id}/members/{mid}/` | 修改角色或称呼 | owner |
| GET | `/api/workspaces/{id}/records/` | 成长记录列表 | 该 Workspace 成员 |
| POST | `/api/workspaces/{id}/records/` | 创建记录 | owner / editor |
| GET | `/api/workspaces/{id}/records/{rid}/` | 记录详情 | 该 Workspace 成员 |
| PATCH | `/api/workspaces/{id}/records/{rid}/` | 更新记录 | owner；或 editor 且作者本人 |
| DELETE | `/api/workspaces/{id}/records/{rid}/` | 删除记录 | owner；或 editor 且作者本人 |
| POST | `/api/workspaces/{id}/media/presign/` | 获取 OSS 预签名上传 URL | owner / editor |
| POST | `/api/workspaces/{id}/media/complete/` | 上传完成回调，写入 MediaAsset | owner / editor |

> 注册接口可选；MVP 用 Admin 创建用户即可。若实现：`POST /api/auth/register/` 仅内网/关闭，或完全不做。

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
  "email": "dad@example.com"
}
```

### GET `/api/workspaces/`

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

### GET `/api/workspaces/{id}/records/`

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
          "file_url": "https://...",
          "thumbnail_url": "https://...?x-oss-process=..."
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

**Request**

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

前端用 `upload_url` 对 OSS 发 **PUT**（带要求的 headers），成功后调 complete。

### POST `/api/workspaces/{id}/media/complete/`

**Request**

```json
{
  "record_id": 10,
  "object_key": "workspaces/1/records/10/uuid.jpg",
  "media_type": "image",
  "file_url": "https://cdn.example.com/workspaces/1/records/10/uuid.jpg",
  "thumbnail_url": ""
}
```

服务端校验：用户有写权限、`record` 属于该 Workspace、`object_key` 前缀匹配该 Workspace。写入 `MediaAsset`，**201**。

---

## 3.4 前端 API 层约定

- Base URL：环境变量 `VITE_API_BASE_URL`（如 `http://127.0.0.1:8000`）
- Axios / fetch 拦截器自动附加 Bearer token
- 401：尝试 refresh；失败则清 token 跳转登录
- 当前 Workspace id：放在前端全局状态（URL 或 context），所有业务请求带路径中的 `{id}`

## 3.5 OpenAPI

阶段 1 起可用 `drf-spectacular` 自动生成 `/api/schema/`；本文件为人工摘要，冲突时以**已实现且测试通过的行为** + 同步回本文档为准。
