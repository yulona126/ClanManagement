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
- **决策：** 生产使用阿里云 OSS 标准存储 + 同城冗余；Django 通过 django-storages 接入。开发期可用 `FileSystemStorage` 占位，接口形状与生产一致。
- **理由：** 上传成本可控、支持图片处理参数、易接 CDN。
- **后果：** 需配置 OSS 凭证与 Bucket；应用服务器不存媒体正文。

## ADR-003：前端直传 OSS，Django 只签发预签名 URL

- **状态：** 已采纳
- **背景：** 大视频经 Django 转发会占用服务器带宽和内存。
- **决策：** Django 生成预签名 PUT URL；前端直传 OSS；成功后调用 `media/complete/` 写 `MediaAsset`。
- **理由：** 上传快，服务器近零负载。
- **后果：** 需处理「预签名但未 complete」的孤儿对象（可后续用生命周期规则清理临时前缀）。

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
- **背景：** 路线图含「一天一张照片」「写给 hexia」「Timeline」「PWA」。
- **决策：** MVP 仅 `GrowthRecord` + `MediaAsset`；增强通过可选字段（`record_kind` / `record_date`）或只读前端视图叠加，不另起平行权限体系。
- **理由：** 保持阶段 2 地基稳定。
- **后果：** Timeline/PWA 主要是前端与运维工作；信件/日照片需小 migration，提前在文档预留即可。

## ADR-008：PWA 作为增强交付，不阻塞后端

- **状态：** 已采纳
- **背景：** PWA 体验好，但涉及 Service Worker、缓存策略与 HTTPS。
- **决策：** 阶段 6 或独立增强阶段再加；先保证可安装壳层与 API 缓存策略文档化。
- **理由：** 核心价值是内容与权限，不是离线工程。
- **后果：** 开发期可用普通 Web；上线域名需 HTTPS 才能完整体验 PWA。
