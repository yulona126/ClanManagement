# 文档 2：数据库设计

## 2.1 ER 图

```
┌─────────────────────┐
│        User         │
│  (Django 内置)       │
├─────────────────────┤
│ id (PK)             │
│ username            │
│ password            │
│ email               │
│ first_name          │
│ last_name           │
└─────────┬───────────┘
          │
          │ 1
          │
          │ N
┌─────────▼───────────┐         ┌─────────────────────┐
│     Membership      │         │     Workspace       │
├─────────────────────┤         ├─────────────────────┤
│ id (PK)             │ N     1 │ id (PK)             │
│ user_id (FK)        ├─────────┤ name                │
│ workspace_id (FK)   │         │ baby_name           │
│ role                │         │ baby_birthday       │
│ relation_label      │         │ avatar_url          │
│ created_at          │         │ created_at          │
└─────────────────────┘         └─────────┬───────────┘
                                          │
                                          │ 1
                                          │
                                          │ N
                                ┌─────────▼───────────┐
                                │    GrowthRecord     │
                                ├─────────────────────┤
                                │ id (PK)             │
                                │ workspace_id (FK)   │
                                │ author_id (FK→User) │
                                │ title               │
                                │ content             │
                                │ created_at          │
                                │ updated_at          │
                                └─────────┬───────────┘
                                          │
                                          │ 1
                                          │
                                          │ N
                                ┌─────────▼───────────┐
                                │     MediaAsset      │
                                ├─────────────────────┤
                                │ id (PK)             │
                                │ record_id (FK)      │
                                │ workspace_id (FK)   │
                                │ file_url            │
                                │ media_type          │
                                │ thumbnail_url       │
                                │ created_at          │
                                └─────────────────────┘
```

## 2.2 表定义

### User

使用 Django 内置 `django.contrib.auth.models.User`，不自定义用户表。

### Workspace

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| id | BigAutoField | PK | |
| name | CharField(100) | NOT NULL | Workspace 显示名，可与宝宝名相同 |
| baby_name | CharField(50) | NOT NULL | 宝宝昵称 |
| baby_birthday | DateField | NULL | 生日，用于年龄展示 |
| avatar_url | URLField / CharField(500) | NULL | 头像 OSS URL |
| created_at | DateTimeField | auto_now_add | |

### Membership

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| id | BigAutoField | PK | |
| user_id | FK → User | NOT NULL, CASCADE | 全局用户 |
| workspace_id | FK → Workspace | NOT NULL, CASCADE | 所属宝宝 |
| role | CharField(10) | NOT NULL | `owner` / `editor` / `viewer` |
| relation_label | CharField(20) | NOT NULL | 如「爸爸」「外婆」 |
| created_at | DateTimeField | auto_now_add | |

**约束与索引：**

- `UNIQUE(user_id, workspace_id)`：一人在一个宝宝下只有一条关系。
- 建议索引：`(workspace_id,)` 便于成员列表查询。

**校验建议（模型 `clean` / Serializer）：**

- `role` 仅允许上述三枚举值。
- 每个 Workspace 至少一个 `owner`（删除/降级 owner 时校验，可放业务层）。

### GrowthRecord

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| id | BigAutoField | PK | |
| workspace_id | FK → Workspace | NOT NULL, CASCADE | |
| author_id | FK → User | NOT NULL, PROTECT | 作者；删除用户时需业务处理 |
| title | CharField(200) | blank 可 | 标题 |
| content | TextField | blank 可 | 正文 |
| created_at | DateTimeField | auto_now_add | |
| updated_at | DateTimeField | auto_now | |

**索引建议：** `(workspace_id, -created_at)` 支撑时间线列表。

**增强预留（勿过早实现，文档占位）：**

| 字段 | 说明 |
| :--- | :--- |
| `record_kind` | 可选：`note` / `letter` / `daily_photo` |
| `record_date` | 可选：业务日期（「这一天」），与 `created_at` 分离 |

### MediaAsset

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| id | BigAutoField | PK | |
| record_id | FK → GrowthRecord | NOT NULL, CASCADE | 所属记录 |
| workspace_id | FK → Workspace | NOT NULL, CASCADE | 冗余字段，便于按 Workspace 隔离查询与权限 |
| file_url | CharField(500) | NOT NULL | OSS 对象 URL 或 key |
| media_type | CharField(10) | NOT NULL | `image` / `video` / `audio` |
| thumbnail_url | CharField(500) | NULL | 缩略图；图片可用 OSS 处理参数即时生成则可空 |
| created_at | DateTimeField | auto_now_add | |

**索引建议：** `(record_id,)`、`(workspace_id,)`。

**一致性规则：** `MediaAsset.workspace_id` 必须等于其 `record.workspace_id`（Serializer / signal 中强制）。

## 2.3 Django 模型伪代码（实现参照）

```python
class Workspace(models.Model):
    name = models.CharField(max_length=100)
    baby_name = models.CharField(max_length=50)
    baby_birthday = models.DateField(null=True, blank=True)
    avatar_url = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Membership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Viewer"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=10, choices=Role.choices)
    relation_label = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "workspace"], name="uniq_user_workspace"),
        ]

class GrowthRecord(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="records")
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name="authored_records")
    title = models.CharField(max_length=200, blank=True)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["workspace", "-created_at"])]

class MediaAsset(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"

    record = models.ForeignKey(GrowthRecord, on_delete=models.CASCADE, related_name="media")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="media")
    file_url = models.CharField(max_length=500)
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    thumbnail_url = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

## 2.4 数据隔离查询范式

所有业务查询必须形如：

```python
# 1) 先确认 Membership
membership = Membership.objects.filter(user=request.user, workspace_id=workspace_id).first()
if not membership:
    raise PermissionDenied

# 2) 再按 workspace 过滤
GrowthRecord.objects.filter(workspace_id=workspace_id)
```

禁止：仅按 `id` 取记录而不校验所属 Workspace。
