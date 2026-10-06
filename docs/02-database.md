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
                                │ object_key          │
                                │ file_url            │
                                │ media_type          │
                                │ thumbnail_url       │
                                │ width / height      │
                                │ taken_at            │
                                │ latitude/longitude  │
                                │ exif_json           │
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
| relation_label | CharField(20) | NOT NULL | 对宝宝称呼，如「爸爸」「外婆」 |
| display_name | CharField(50) | blank | 图谱显示名；空则回落 username |
| avatar_url | CharField(500) | blank | 成员头像 |
| bio | CharField(200) | blank | 一句话简介 |
| generation | SmallIntegerField | NULL | 排布提示：-1 祖辈 / 0 父母辈 / 1 同辈等 |
| created_at | DateTimeField | auto_now_add | |

**约束与索引：**

- `UNIQUE(user_id, workspace_id)`：一人在一个宝宝下只有一条关系。
- 建议索引：`(workspace_id,)` 便于成员列表查询。

**校验建议（模型 `clean` / Serializer）：**

- `role` 仅允许上述三枚举值。
- 每个 Workspace 至少一个 `owner`（删除/降级 owner 时校验，可放业务层）。

### KinshipLink（家族关系边）

以 Workspace 宝宝为图中心；成员挂在宝宝与（可选）其他成员上。

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| id | BigAutoField | PK | |
| workspace_id | FK → Workspace | NOT NULL, CASCADE | |
| from_membership_id | FK → Membership | NULL, CASCADE | 出发成员；`to_baby` 时必填 |
| to_membership_id | FK → Membership | NULL, CASCADE | 目标成员；`peer` 时必填 |
| to_baby | BooleanField | default false | true = 指向宝宝中心 |
| label | CharField(40) | NOT NULL | 「妈妈」「夫妻」「姐弟」等 |
| link_kind | CharField(10) | NOT NULL | `to_baby` / `peer` |
| created_by_id | FK → User | NULL, SET_NULL | |
| created_at | DateTimeField | auto_now_add | |

**规则：**

- 两端 membership（若有）必须属于同一 `workspace_id`。
- `link_kind=to_baby`：`from_membership` 必填，`to_membership` 空，`to_baby=true`；与 Membership.`relation_label` 同步。
- `link_kind=peer`：双方 membership 非空，`to_baby=false`。
- **入图硬规则**：Workspace 内第 1 个成员只需 `to_baby` 边；第 2 个及以后成员，邀请/分配时必须同时写 `to_baby` + 一条相对已有成员的 `peer`（锚点）边，禁止孤立节点。

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
| object_key | CharField(500) | NOT NULL, UNIQUE | 桶内路径真源，如 `workspaces/1/records/10/{uuid}.jpg` |
| file_url | CharField(500) | NOT NULL | 可读 URL（由 `object_key` + CDN/域名拼装后落库；换域名以 key 为准重算） |
| media_type | CharField(10) | NOT NULL | `image` / `video` / `audio` |
| thumbnail_url | CharField(500) | blank 可 | 可空；图片推荐读时用 OSS 处理参数生成，不强制落库 |
| width | PositiveIntegerField | NULL | 像素宽（image；来自 EXIF/解码） |
| height | PositiveIntegerField | NULL | 像素高 |
| taken_at | DateTimeField | NULL | 拍摄时间（`DateTimeOriginal` 等，带时区或按 UTC 存） |
| camera_make | CharField(100) | blank 可 | 厂商 |
| camera_model | CharField(100) | blank 可 | 型号 |
| orientation | PositiveSmallIntegerField | NULL | EXIF Orientation 1–8；上传前已转正可写 1 |
| latitude | DecimalField(9,6) | NULL | GPS 纬度（WGS84）；无 GPS 则为 NULL |
| longitude | DecimalField(9,6) | NULL | GPS 经度（WGS84） |
| exif_json | JSONField | default=`{}` | 白名单扩展字段（ISO、焦距等）；不含未声明键 |
| created_at | DateTimeField | auto_now_add | |

**索引建议：** `(record_id,)`、`(workspace_id,)`、`(workspace_id, taken_at)`（按拍摄日浏览时用）。

**一致性规则：**

- `MediaAsset.workspace_id` 必须等于其 `record.workspace_id`（Serializer / 写入逻辑强制）。
- `object_key` 前缀必须为 `workspaces/{workspace_id}/`。
- 非 `image`：EXIF/GPS 相关列一律为空 / `{}`，忽略客户端传入的 `exif`。
- **GPS 对 Workspace 内全体成员可见**（与照片同权）；无 GPS 的图允许 `latitude`/`longitude` 为 NULL，上传不失败。

**URL 约定：** 应用服务器不存文件字节。`object_key` 为存储真源；`file_url` / 缩略图读地址由配置拼装（见 ADR-010）。

### Comment（阶段 5）

家族内留言；挂在 Record 或 MediaAsset 上（实现可用两张表或一张表 + `target_type`/`target_id`，二选一在实现时定，须保证 Workspace 隔离）。

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| id | BigAutoField | PK | |
| workspace_id | FK → Workspace | NOT NULL, CASCADE | 隔离 |
| author_id | FK → User | NOT NULL, PROTECT | 作者 |
| record_id | FK → GrowthRecord | NULL | 与 media_id 二选一 |
| media_id | FK → MediaAsset | NULL | 与 record_id 二选一 |
| body | TextField | blank 可 | 文字；可与 audio 二选一或并存 |
| audio_id | FK → MediaAsset | NULL | 可选语音；对象须属同一 workspace，且挂在相关 GrowthRecord 上 |
| created_at | DateTimeField | auto_now_add | |

**规则：** `record`/`media` 必须属于同一 `workspace_id`；删除目标对象时评论 CASCADE。**正文与语音至少其一非空。** 语音 MediaAsset 的 `record_id`：评记录→该记录；评照片→该照片所属记录。

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
    object_key = models.CharField(max_length=500, unique=True)
    file_url = models.CharField(max_length=500)
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    thumbnail_url = models.CharField(max_length=500, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    taken_at = models.DateTimeField(null=True, blank=True)
    camera_make = models.CharField(max_length=100, blank=True)
    camera_model = models.CharField(max_length=100, blank=True)
    orientation = models.PositiveSmallIntegerField(null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    exif_json = models.JSONField(default=dict, blank=True)
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
