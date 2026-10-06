# 文档 4：架构决策记录（ADR）

## ADR-001：用户与 Workspace 的关系采用 Membership 中间表

- **状态：** 已采纳
- **背景：** 需要支持一个用户在不同宝宝下有不同的角色和称呼。
- **决策：** 不使用 Django 内置 Group/Permission 表达 Workspace 权限，自建 `Membership` 表。
- **理由：** Django 内置权限是全局的，无法表达「在宝宝 A 是 owner，在宝宝 B 是 viewer」这种对象级权限。
- **后果：** 每个 Workspace 作用域 API 必须显式校验 Membership；换来清晰的权限模型与称呼绑定。

## ADR-002：媒体文件使用 OSS + django-storages

- **状态：** 已采纳
- **背景：** 图片视频持续增长，本地磁盘不可持续。
- **决策：** 生产使用阿里云 OSS 标准存储 + 同城冗余；Django 通过 django-storages / boto3 接入。Bucket、Endpoint、密钥全部走环境变量（见 `OSS_*`）。开发期 `STORAGE_BACKEND=local` 占位，接口形状与生产一致。
- **理由：** 上传成本可控、支持图片处理参数、易接 CDN；部署用环境变量切换 Bucket，无需改代码。
- **后果：** 需配置 OSS 凭证与 Bucket；应用服务器不存媒体正文。示例 Bucket 名：`claner`。

## ADR-003：前端直传 OSS，Django 只签发预签名 URL

- **状态：** 已采纳
- **背景：** 大视频经 Django 转发会占用服务器带宽和内存。
- **决策：** Django 生成预签名 PUT URL；前端直传 OSS；成功后调用 `media/complete/` 写 `MediaAsset`。
- **理由：** 上传快，服务器近零负载。
- **后果：** 需处理「预签名但未 complete」的孤儿对象（可后续用生命周期规则清理临时前缀）。删除 `MediaAsset`/记录时是否同步删 OSS，待定（见路线图待办）。

## ADR-004：单实例家族部署，非多租户 SaaS

- **状态：** 已采纳
- **背景：** 产品服务单一家族；Workspace 隔离宝宝，而非隔离租户。
- **决策：** 不做 Organization/Tenant 层；User 全局可见于该实例。
- **理由：** 降低复杂度；Admin 即可完成用户与成员管理。
- **后果：** 若未来要服务多家族，需引入 Tenant 并迁移数据——明确为后续大改，MVP 不做。

## ADR-005：JWT 无状态鉴权

- **状态：** 已采纳
- **背景：** 前后端分离；需要移动端/PWA 友好。
- **决策：** SimpleJWT，access + refresh；前端存储（优先 memory + httpOnly cookie 可后续加固，MVP 可用 localStorage 并知悉 XSS 风险）。
- **理由：** 实现简单，与 DRF 集成成熟。
- **后果：** 注销依赖 token 过期或黑名单（可选）；敏感环境应缩短 access 寿命。

## ADR-006：权限校验放在 DRF Permission 类

- **状态：** 已采纳
- **背景：** 避免每个 View 手写重复 Membership 查询。
- **决策：** 实现如 `IsWorkspaceMember`、`IsWorkspaceEditor`、`IsWorkspaceOwner`；从 URL `workspace_id` 解析。
- **理由：** 声明式、可单测、难漏。
- **后果：** 所有嵌套路由必须带 `workspace_id`；禁止「全局按 record id 操作」的裸端点。

## ADR-007：产品增强不破坏核心模型

- **状态：** 已采纳
- **背景：** 路线图含「一天一张照片」「写给 hexia」「Timeline」，以及 PWA 深化（离线列表 / 推送）。
- **决策：** MVP 仅 `GrowthRecord` + `MediaAsset`；增强通过可选字段（`record_kind` / `record_date`）或只读前端视图叠加，不另起平行权限体系。PWA **基线**（manifest / Service Worker / 可安装）在阶段 0 落地，不改变后端模型。
- **理由：** 保持阶段 2 地基稳定；安装能力尽早可用。
- **后果：** Timeline / PWA 深化主要是前端与运维工作；信件/日照片需小 migration，提前在文档预留即可。

## ADR-008：PWA 基线进阶段 0，深化不阻塞主干

- **状态：** 已采纳（取代「PWA 整段后置」的旧决策）
- **背景：** 产品希望尽早可安装到主屏；完整离线与推送成本较高。
- **决策：** 阶段 0 使用 `vite-plugin-pwa`（或等价方案）交付：Web App Manifest、应用图标、基础 Service Worker（预缓存壳层）。媒体原片全量离线、API 精细缓存策略、Web Push 等列入「PWA 深化」增强项。
- **理由：** 基线与业务解耦，初始化成本低；深化依赖真实域名 HTTPS 与内容闭环后再做更合适。
- **后果：** 本地 `http://localhost` 可验证安装提示的部分行为；生产需 HTTPS 才能完整体验。开发期勿把 SW 调试复杂度拖慢鉴权/Membership。

## ADR-009：开发与生产统一使用 PostgreSQL

- **状态：** 已采纳
- **背景：** 原先计划开发用 SQLite、生产用 PostgreSQL，易在类型、约束与 JSON/并发行为上出现「本地能过、上线翻车」。
- **决策：** 开发与生产均使用 PostgreSQL；通过 `DATABASE_URL` 区分本机与部署实例。不把 SQLite 作为默认开发库。
- **理由：** 引擎一致，migration 与查错路径统一；本机可用 Docker / Homebrew 快速起库。
- **后果：** 阶段 0 前置依赖增加 PostgreSQL；贡献者需先起库再 `migrate`。`.gitignore` 可保留对偶发 `db.sqlite3` 的忽略，但不作为推荐路径。

## ADR-010：图片 EXIF（含 GPS）由前端解析，complete 写入 MediaAsset

- **状态：** 已采纳
- **背景：** 成长相册需要拍摄时间与位置；直传 OSS 后服务端若不拉对象则无法默认得到 EXIF。
- **决策：**
  1. **方案 A：** 前端在选图后用库（如 `exifr`）解析 EXIF，经 `POST .../media/complete/` 的 `exif` 字段提交。
  2. **要 GPS：** 有则写入 `latitude`/`longitude`（WGS84）；无则 NULL，上传仍成功。
  3. **存储：** 常用列（宽高、拍摄时间、机型、orientation、经纬度）+ `exif_json` 白名单扩展；**`object_key` 为对象真源**，`file_url` 由服务端拼装落库。
  4. **可见性：** GPS 与照片同权，对本 Workspace **全体成员**（含 viewer）可读。
  5. **缩略图：** MVP 不另存对象；列表用读 URL + OSS 图片处理参数（本地开发用等价规则或原图）。
- **理由：** 与直传架构一致、实现快；列字段便于按 `taken_at` 查询；白名单降低伪造面。
- **后果：** 客户端可伪造 EXIF（家族实例可接受）；若需防篡改，后续可在 complete 后异步从 OSS 再解析覆盖。原图内嵌 EXIF 是否剥离由前端决定，**业务以 DB 为准**。

## ADR-011：图片与视频共用同一 OSS Bucket，靠 object_key 区分

- **状态：** 已采纳
- **背景：** 是否为视频单独建 Bucket。
- **决策：** **不拆 Bucket。** 图/视频/音频共用一个 Bucket（当前：`claner`，可由 `OSS_BUCKET_NAME` 覆盖）。对象键统一为 `workspaces/{ws}/records/{rid}/{uuid}.{ext}`。部署换桶只改环境变量，不改代码。
- **理由：** 家族规模下拆桶增加 CORS、CDN、密钥与运维面，收益很小；类型已由 `media_type` + Content-Type + 扩展名表达；生命周期/权限可按前缀配置。
- **后果：** 大视频与小图同桶；若未来要按媒体类型做不同存储类/冷热分层，优先用 **前缀 + 生命周期规则**，仍不必第二 Bucket。

## ADR-012：媒体库是视图，评论挂 Record/Media，不另建上传相册

- **状态：** 已废止（由 ADR-014 取代）
- **背景：** 需要「看全部照片、按年龄逛、点回记录」以及记录/图片留言；若相册再上传会重复占 OSS。
- **决策：**
  1. **不**做独立上传相册；`GET .../media/` 聚合本 Workspace 的 `MediaAsset`，响应含 `record_id`，前端跳转记录。
  2. 浏览时间 `captured_at = taken_at ?? created_at`；年龄段用 `baby_birthday` + `captured_at` 计算，无新表。
  3. **Comment** 表（或等价）关联 Workspace + 作者，目标为 GrowthRecord 或 MediaAsset；成员可读写评论，viewer 只读；不做点赞。
- **理由：** 一份媒体真源；与 ADR-003/010/011 一致；家族留言够用。
- **后果：** 阶段 5 需扩序列化与评论 API；点赞/收藏若需要另开增强项。

## ADR-014：独立相册 + 全部照片汇总；MediaAsset.record 可空

- **状态：** 已采纳
- **背景：** 相册不应再跳转到动态；需要「汇总全部照片」与「自建/管理相册、直接上传」。
- **决策：**
  1. 新增 `Album` / `AlbumItem`；相册项引用已有 `MediaAsset`（来自动态或相册上传）。
  2. `MediaAsset.record` 可空：动态附件仍挂 Record；相册/资料库直传 `record=null`，对象键 `workspaces/{ws}/albums/{aid}/…` 或 `…/library/…`。
  3. 「全部照片」仍为 `GET .../media/` 视图（排除 `for_comment`），前端全屏浏览，**不**跳转动态。
  4. 删除相册只删 `AlbumItem`，不删原图；从相册移除同理。
- **理由：** 一份文件真源，相册是组织层；与现有 OSS/presign 流程兼容。
- **后果：** ADR-012 废止；评论语音仍要求挂 Record。

## ADR-013：录音复用 MediaAsset；评论语音经 Comment.audio 引用

- **状态：** 已采纳（阶段 6）
- **背景：** 记录与评论都需要按住说话；不宜为评论另建存储。
- **决策：** 录音经现有 presign/complete 写成 `media_type=audio` 的 `MediaAsset`（仍挂 GrowthRecord）。`Comment.audio` 可选 FK 指向该资产；`body` 可空。组件（Hook / 按住说话 / 播放器）记录与评论共用。
- **理由：** 与 ADR-003/011/012 一致；路径仍为 `workspaces/.../records/{rid}/...`。
- **后果：** 评照片时语音仍写入该照片所属 record 的媒体列表（会出现在记录详情媒体区）；可接受，或日后用标记字段区分「附件 vs 评论专用」。
