# 文档 5：开发阶段与任务清单

按顺序执行。**每个阶段验收通过再进入下一阶段。**

## 阶段依赖

```
阶段0 初始化（PostgreSQL + PWA 基线）
    │
    ▼
阶段1 用户与鉴权
    │
    ▼
阶段2 Workspace 与成员管理  ← 核心地基
    │
    ├──────────────┐
    ▼              ▼
阶段3 成长记录    阶段4 媒体上传
    │              │
    └──────┬───────┘
           ▼
      阶段5 媒体库 + 评论
           │
           ▼
      阶段6 录音功能          ← 主干 API/能力 ✅
           │
           ▼
      U1–U5 双端 IA / Feed   ← 当前主线（见 11-product-ia）
           │
           ▼
      阶段7 体验优化与上线
           │
           ▼
      产品增强（可并行）
      · 写给 hexia（E2）
      · Timeline（E3）
      · PWA 深化（E4）
      （E1 一天一张照片主体并入 U3）
```

> 信息架构真源：[11-product-ia.md](./11-product-ia.md)。阶段 0–6 能力已齐；**下一实现主线是 U1**。

---

## 阶段 0：项目初始化

**目标：** 前后端骨架跑通；PostgreSQL migration 可用；PWA 基线可安装；健康检查联调成功。


| 任务                               | 产出                                 | 状态  |
| -------------------------------- | ---------------------------------- | --- |
| 创建 Django 项目 + DRF + JWT 配置      | 后端可启动，`GET /api/health/` 返回 200    | ✅   |
| 创建 React + Vite + TS 项目          | 前端可启动，能请求到后端健康检查                   | ✅   |
| 配置 PostgreSQL（开发即用，与生产同引擎）       | `DATABASE_URL` 指向本机库；migration 可执行 | ✅   |
| 配置 django-storages（先用本地存储占位）     | 文件存储后端就绪                           | ✅   |
| 配置 CORS、环境变量管理                   | 前后端跨域可通信                           | ✅   |
| 接入 PWA 基线（manifest + 图标 + 基础 SW） | 开发构建可「添加到主屏」；壳层可预缓存                | ✅   |


**验收：** 前端页面显示「后端连接成功」；浏览器 Application / 安装提示可确认 PWA 基线生效（localhost 下以 DevTools 为准）。✅（本机联调：后端 `8001`，前端 `5180`，PG `5433`）

---



## 阶段 1：用户与鉴权

**目标：** 用户能登录，拿到 JWT，访问受保护接口。


| 任务                           | 产出                  | 状态  |
| ---------------------------- | ------------------- | --- |
| 使用 Django 内置 User 模型         | 无需自定义               | ✅   |
| 实现 `POST /api/auth/login/`   | 返回 access + refresh | ✅   |
| 实现 `POST /api/auth/refresh/` | 刷新 access           | ✅   |
| 实现 `GET /api/auth/me/`       | 当前用户信息              | ✅   |
| 前端：登录页 + token 存储 + 请求拦截器    | 登录后自动带 token        | ✅   |
| 前端：路由守卫                      | 未登录跳转登录页            | ✅   |


**验收：** Admin 创建用户 → 前端登录成功 → 能访问 `/api/auth/me/`。

> 注册接口可选；MVP 默认 Admin 创建。前端主题 token 见 `docs/10-frontend-theme.md`。

---



## 阶段 2：Workspace 与成员管理（地基）

**目标：** 用户能查看自己的 Workspace；owner 能改角色与称呼。


| 任务                                          | 产出                              | 状态  |
| ------------------------------------------- | ------------------------------- | --- |
| 创建 Workspace 模型                             | 宝宝信息可存储                         | ✅   |
| 创建 Membership 模型（role + relation_label）     | 关系可存储                           | ✅   |
| Django Admin 注册两模型                          | 可手动建数据                          | ✅   |
| `GET /api/workspaces/`                      | 含 `my_role`、`my_relation_label` | ✅   |
| `GET /api/workspaces/{id}/`                 | 详情                              | ✅   |
| `GET /api/workspaces/{id}/members/`         | 成员列表                            | ✅   |
| `PATCH /api/workspaces/{id}/members/{mid}/` | owner 可改                        | ✅   |
| DRF Permission：`IsWorkspaceMember` 等        | 接口自动鉴权                          | ✅   |
| 前端：Workspace 切换器                            | 切换后称呼更新                         | ✅   |


**验收：** 两用户 × 两 Workspace 交叉角色；各自只看到有权限的 Workspace；称呼正确。✅（已 seed：`parent_a` / `relative_b` × 小满 / 小禾）

---



## 阶段 2.5：管理台与 Owner 邀请

**目标：** staff 可在前端管理用户/Workspace；owner 可邀请/移除成员。App 壳 UI。


| 任务                                                       | 产出          | 状态  |
| -------------------------------------------------------- | ----------- | --- |
| `/api/manage/users/` `/workspaces/` `/memberships/`      | staff CRUD  | ✅   |
| `POST .../members/invite/` + `DELETE .../members/{mid}/` | owner 邀请/移除 | ✅   |
| 前端 `/manage` + AppShell                                  | 主流简约壳 + 管理台 | ✅   |
| 首页 Owner 邀请表单                                            | 闭环          | ✅   |


**验收：** staff 建用户并分配；非 staff 进 `/manage` 被拒；owner 邀请成功；不可删最后 owner。✅

---



## 阶段 3：成长记录

**目标：** 记录 CRUD + 权限生效。


| 任务                                    | 产出                    | 状态  |
| ------------------------------------- | --------------------- | --- |
| GrowthRecord 模型                       | 可存储                   | ✅   |
| `GET/POST .../records/`               | 列表分页；创建限 owner/editor | ✅   |
| `GET/PATCH/DELETE .../records/{rid}/` | 详情与分级权限               | ✅   |
| 前端：列表页                                | 标题、摘要、时间、作者称呼         | ✅   |
| 前端：详情页                                | 完整内容                  | ✅   |
| 前端：创建/编辑表单                            | 仅 owner/editor 可见     | ✅   |


**验收：** viewer 无创建按钮且 POST→403；editor 不可删他人记录；owner 可以。✅（联调：`parent_a` viewer@小禾→403；`relative_b` editor 删他人→403、删自己→204；owner 删他人→204）

---



## 阶段 4：媒体上传

**目标：** 记录可挂图片/视频；直传存储；图片 EXIF（含 GPS）入库；列表缩略图可看。


| 任务                                               | 产出                             | 状态  |
| ------------------------------------------------ | ------------------------------ | --- |
| MediaAsset 模型（含 `object_key` + EXIF/GPS 列）       | migration + Admin              | ✅   |
| 存储服务：local 占位 / OSS 预签名 + `public_url`           | `clan/services/`               | ✅   |
| `POST .../media/presign/`                        | 签发 `upload_url` + `object_key` | ✅   |
| `POST .../media/complete/`（校验 key；写库；规范化 `exif`） | MediaAsset 201                 | ✅   |
| 前端：选图 → 解析 EXIF(GPS) → PUT → complete            | 上传闭环                           | ✅   |
| 详情页展示图/视频 + 拍摄时间/位置（有则显示）                        | 可用                             | ✅   |
| 列表缩略图（OSS 处理参数或本地等价）+ lazy                       | 首屏可控                           | ✅   |


**验收：** 上传一张带 GPS 的图 → 存储有原图 → DB 有 `object_key`/`taken_at`/经纬度 → 列表缩略图 → 详情大图与位置信息。无 EXIF/无 GPS 的图仍可上传成功。开发期 `STORAGE_BACKEND=local` 用等价 PUT 验收。生产用 `STORAGE_BACKEND=oss` + `OSS_BUCKET_NAME=claner`（可环境变量切换）。

> 契约与字段见 `02-database` / `03-api`；决策见 ADR-010 / ADR-011（图视频同桶）。

---



## 阶段 5：媒体库 + 评论

**目标：** 不另开「独立上传相册」；在现有 `MediaAsset`（仍挂 Record）上做汇总浏览，并能跳回记录；家族内可对**照片**与**成长记录**留言。

**产品约定：**

- 媒体真源仍是 Record → MediaAsset → OSS；相册是**视图**，禁止相册二次上传以免重复文件。
- 列表时间：`captured_at = taken_at ?? created_at`（EXIF 优先，否则上传时间）。
- 按年龄分桶：用 `Workspace.baby_birthday` + `captured_at`（无生日则仅时间线）。
- 评论为 Workspace 成员可见的轻量留言，**不是**开放社交点赞体系。


| 任务                                                                    | 产出                | 状态  |
| --------------------------------------------------------------------- | ----------------- | --- |
| `MediaAsset` 序列化暴露 `record_id`（及可选 `captured_at` / `taken_at_source`） | 照片可反查记录           | ✅   |
| `GET .../media/`（workspace 作用域，分页；可筛 image；按 `captured_at`）           | 媒体库 API           | ✅   |
| 前端：媒体库 / 照片墙；点图进所属 Record                                             | `/media` 或等价路由    | ✅   |
| 按年龄分段 UI（一岁 / 两岁…；未知时间一组）                                             | 智能分组，无新表          | ✅   |
| Comment 模型（目标：record 或 media；workspace + author）                      | migration + Admin | ✅   |
| `GET/POST .../records/{rid}/comments/`                                | 记录评论              | ✅   |
| `GET/POST .../media/{mid}/comments/`（或统一 comments + target）           | 图片评论              | ✅   |
| 评论删除权限（作者本人或 owner）                                                   | 与记录分级策略对齐         | ✅   |
| 前端：记录详情与大图页评论列表 + 发表                                                  | 闭环                | ✅   |


**验收：** 媒体库能看到本 Workspace 全部图片；点图进入对应记录；无 EXIF 的图仍按上传时间入组；成员可对记录与图片发评论并刷新可见；viewer 只读；非成员 403。✅

> 不做：相册独立上传、点赞/收藏（若需要另开增强项）。删除 OSS 同步策略仍见阶段 7 待定项。

---



## 阶段 6：录音（记录 + 评论复用）

**目标：** 按住说话 → 直传 OSS（`media_type=audio`）→ 可播放；同一套组件用于**成长记录附件**与**评论语音**。

**产品约定：**

- 音频存为 `MediaAsset`（同图/视频桶与 key 规则），不另建存储。
- 评论语音：`Comment.audio` → `MediaAsset`；`MediaAsset` 仍挂所属 `GrowthRecord`（评照片时用该照片的 `record_id`）。
- `Comment.body` 可空；允许纯语音评论；须至少有正文或语音之一。
- 格式以浏览器 `MediaRecorder` 为准（常见 `audio/webm`；Safari 可能 `audio/mp4`）。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| `useVoiceRecorder` Hook | MediaRecorder 生命周期 | ✅ |
| 按住说话按钮 `HoldToTalk` | 触摸/鼠标 | ✅ |
| 录音走预签名直传（复用 upload） | `media_type=audio` | ✅ |
| `AudioPlayer` 组件 | `<audio>` 封装 | ✅ |
| 记录详情：添加语音附件 | 挂到当前 Record | ✅ |
| Comment：`body` 可空 + `audio` FK | migration + API | ✅ |
| CommentsPanel 接入语音（记录/照片评论） | 闭环 | ✅ |

**验收：** 记录可按住说话上传并播放；评论可发纯语音或文字+语音；viewer 只读；语音文件在 OSS/`MediaAsset` 可查。✅

---



## 阶段 U1：双端壳拆分 + Feed 首页

**目标：** 用户端与管理端分壳；登录后进入朋友圈式动态流；Owner 成员治理迁出首页。

**约定：** 详见 [11-product-ia.md](./11-product-ia.md)。Feed 一期复用 `GET .../records/`，按 `created_at` 自然日分组；不改后端模型。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| `UserShell`（底栏：动态 / 相册 / 发布 / 我的） | 用户端壳 | ✅ |
| `ManageShell`（侧栏 + 返回用户端） | 管理端壳 | ✅ |
| Feed 页替代默认首页 | `/` 或 `/feed` | ✅ |
| `/album`、`/compose`、`/me`；旧路径重定向 | 路由表对齐 IA | ✅ |
| MembersPanel → `/settings/workspace`（owner） | 用户端空间设置 | ✅ |
| `/manage` 仅 staff；登录后默认进 Feed | 入口分离 | ✅ |
| 更新前端路由 [`AppRoutes.tsx`](../frontend/src/routes/AppRoutes.tsx) | 可导航 | ✅ |

**验收：** 家人登录第一屏为动态流；无成员表主视觉；staff 从「我的」进管理台且为独立壳；viewer 无发布入口。✅（开发端口：前端 `5180`）

---



## 阶段 U2：朋友圈体验打磨

**目标：** Feed / 详情 / 发布在移动端达到「可每日刷」的阅读与发布体验。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| Feed 卡片：称呼、摘要、九宫格、语音、评论入口 | 朋友圈视觉 | ✅ |
| 详情页阅读向排版；编辑/删除收入菜单 | 非后台感 | ✅ |
| Compose：图文一体、移动端友好 | 发布闭环 | ✅ |
| 空状态 / 骨架屏 / 基础错误提示 | 叠阶段 7 部分体验 | ✅ |
| 底栏安全区与 PWA 全屏 | 手机可用 | ✅ |

**验收：** 手机上完成「刷 → 发 → 评」主路径；无「管理台列表」观感。✅

---



## 阶段 U3：日历与一天一张（原 E1 主体）

**目标：** 按「日」浏览与软提示补录；引入业务日字段（若需要）。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| `record_date`（或等价按日聚合） | 模型/API 或纯前端聚合增强 | ⬜ |
| 日历页 + 底栏「日历」 | `/calendar` | ⬜ |
| 有内容日子打点；点日进当日动态 | 导航闭环 | ⬜ |
| 「今天还没照片」软提示 | 不硬限制每日一张 | ⬜ |

**验收：** 可从日历跳到某日内容；软提示可见；不阻止同日多发。

---



## 阶段 U4：管理端完善

**目标：** staff 管理台多页化，与用户端彻底分离。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| `/manage` 概览（可简） | 入口页 | ✅ |
| `/manage/users` | 用户 CRUD | ✅ |
| `/manage/workspaces` | 工作区 | ✅ |
| `/manage/memberships` | 跨空间分配 | ✅ |
| 危险操作确认与权限文案 | 防误操作 | ✅ |

**验收：** 非 staff 无法使用管理路由；staff 可完成建用户/空间/分配；有「返回用户端」。✅

---



## 阶段 U5：对齐上线准备（衔接阶段 7）

**目标：** 双端 IA 稳定后，把剩余体验项并入阶段 7 执行清单，避免重复开工。

| 任务 | 产出 | 状态 |
| :--- | :--- | :--- |
| 核对 IA 文档与路由实现一致 | 11 / 05 / 代码三方对齐 | ⬜ |
| 将骨架屏/错误边界未完成项并入阶段 7 | 无重复任务 | ⬜ |
| README / 文档索引反映「用户端 vs 管理端」 | 可维护 | ⬜ |

**验收：** 文档描述与线上/本地路由一致；可进入阶段 7 部署。

---



## 阶段 7：体验优化与上线


| 任务                            | 产出                      | 状态  |
| ----------------------------- | ----------------------- | --- |
| CDN 加速 OSS                    | 媒体更快                    | ⬜   |
| 删 MediaAsset/记录时是否同步删存储对象     | 策略待定（软删 / 同步硬删 / 仅生命周期） | ⬜   |
| OSS 生命周期规则                    | 低频存储 / 清理临时前缀与孤儿对象      | ⬜   |
| 骨架屏 / 加载态                     | 减少白屏                    | ⬜   |
| 错误边界与友好提示                     | 401/403/网络错误            | ⬜   |
| 生产部署：gunicorn + nginx + HTTPS | 可部署；PWA 完整体验可用          | ⬜   |
| CI/CD（可选）                     | 自动构建                    | ⬜   |
| README 部署章节                   | 可维护                     | ⬜   |


**验收：** 家人可访问；图视频流畅。

---



## 产品增强（U 阶段与阶段 7 之后）

优先级与愿景对齐。**E1（一天一张照片）主体已并入阶段 U3**；此处保留索引以免旧链接失效。

### E1. 一天一张照片

→ 见 **阶段 U3**。约束已定为**软提示**（非硬限制）。

### E2. 写给 hexia


| 任务                   | 说明                      |
| -------------------- | ----------------------- |
| `record_kind=letter` | 或独立 Letter 表            |
| 信件列表 / 详情            | 偏阅读体验的排版                |
| 权限                   | 仍走 Workspace Membership |



### E3. Timeline


| 任务   | 说明                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 数据   | 复用 records + media，按时间排序                                                                                                               |
| 交互参考 | [The Lookback — Codrops](https://tympanus.net/codrops/2026/03/03/the-lookback-a-digital-capsule-for-better-off-studios-creative-past/) |
| 实现   | 前端沉浸式滚动/章节；注意移动端性能与媒体懒加载                                                                                                               |



### E4. PWA 深化


| 任务     | 说明                            |
| ------ | ----------------------------- |
| 缓存策略   | API 列表 / 元数据缓存；媒体原片按需，不强制全量离线 |
| （可选）推送 | 「该拍今日照片」等提醒；需后端 Web Push      |
| 回归     | 生产 HTTPS 下安装、更新与旧 SW 清理       |


> PWA **基线**（Manifest、图标、基础 SW、可安装）已在阶段 0 完成，本项仅覆盖深化。

---



## 开发原则（再次强调）

1. **阶段 2 是地基**，多花时间值得。
2. **不要跳过鉴权**，第一天就挂 Permission。
3. **媒体可晚于文字记录**；**媒体库是视图，不另存一套图**。
4. **主干 API（0–6）完成后，先做双端 IA（U1–U5），再阶段 7 上线**；信件 / Timeline / PWA 深化放增强。
5. **单阶段跑通再开下一阶段**；页面与导航以 [11-product-ia.md](./11-product-ia.md) 为准。

