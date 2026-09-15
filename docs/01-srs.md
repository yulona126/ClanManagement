# 文档 1：软件需求规格说明书（SRS）

## 1.1 项目概述

| 项目 | 内容 |
| :--- | :--- |
| 项目名称 | 婴儿成长记录博客（ClanManagement） |
| 核心目标 | 为每个宝宝建立一个独立的 Workspace，记录成长照片、视频和文字，家族成员按关系参与 |
| 部署形态 | 单实例部署，所有用户属于同一家族，Workspace 之间数据完全隔离 |
| 目标用户 | 家族内部成员（父母、祖辈、亲戚等），非公开社交产品 |

## 1.2 产品路线愿景（与核心 SRS 的关系）

以下能力建立在 Workspace / Membership / GrowthRecord / MediaAsset 之上，**不改变核心领域模型**，以扩展字段或新实体叠加：

| 方向 | 产品意图 | 对模型的影响（预留） |
| :--- | :--- | :--- |
| 一天一张照片 | 按日沉淀视觉记忆，强调「日」维度 | `GrowthRecord` 或独立 `DailyPhoto` 关联 `record_date`；列表/日历视图 |
| 写给 hexia | 写给宝宝的信件，可日后回看 | `GrowthRecord` 增加 `record_kind=letter`，或独立 `Letter` 表 |
| Timeline | 沉浸式时间轴回顾（Codrops Lookback 风格） | 前端叙事层；数据仍来自 records + media，按时间排序 |
| PWA | 可安装、弱网可用、可选推送 | 前端 manifest / service worker；后端可后续加 Web Push |

**原则：** MVP（阶段 0–4）先完成「登录 → Workspace → 文字记录 → 图片视频」。日照片、信件、Timeline、PWA 列入阶段 5 之后的增强，避免阻塞地基。

## 1.3 核心领域模型

```
User（全局唯一，家族成员）
  └── Membership（User × Workspace）
        ├── workspace_id
        ├── role           → owner / editor / viewer
        └── relation_label → 爸爸 / 妈妈 / 舅舅 / 外公 ...
```

**关键规则：**

- User 是全局实体，不隶属于任何 Workspace。
- 称呼（`relation_label`）由 Membership 决定，不同 Workspace 可不同。
- 权限（`role`）与称呼独立，互不影响。
- 业务数据（GrowthRecord / MediaAsset）必须挂在 Workspace 上，查询一律带 `workspace_id` 作用域。

## 1.4 用户角色与权限矩阵

| 功能 | owner | editor | viewer |
| :--- | :---- | :----- | :----- |
| 查看 Workspace 内容 | ✅ | ✅ | ✅ |
| 上传照片/视频/音频 | ✅ | ✅ | ❌ |
| 创建/编辑自己的成长记录 | ✅ | ✅ | ❌ |
| 删除自己的成长记录 | ✅ | ✅ | ❌ |
| 编辑/删除他人的内容 | ✅ | ❌ | ❌ |
| 邀请/移除成员 | ✅ | ❌ | ❌ |
| 修改成员角色与称呼 | ✅ | ❌ | ❌ |
| 修改 Workspace 信息 | ✅ | ❌ | ❌ |

> 阶段 1–2：成员由 Django Admin 创建（US-01）。自助邀请可作为后续增强，不阻塞 MVP。

## 1.5 功能需求（用户故事）

### MVP（阶段 1–4）

| 编号 | 用户故事 | 阶段 |
| :--- | :--- | :--- |
| US-01 | 作为 owner，我可以在 Django Admin 中创建用户并分配 Membership | 2 |
| US-02 | 作为用户，我可以登录并看到自己有权限的所有 Workspace | 1–2 |
| US-03 | 作为用户，我切换 Workspace 时，界面上的称呼自动更新 | 2 |
| US-04 | 作为 editor，我可以上传照片和视频到当前 Workspace | 4 |
| US-05 | 作为 viewer，我只能浏览，看不到上传和编辑按钮 | 3–4 |
| US-06 | 作为 owner，我可以修改某个成员在当前 Workspace 的称呼 | 2 |
| US-07 | 作为 editor，我可以创建带标题与正文的成长记录 | 3 |
| US-08 | 作为用户，我可以按时间浏览当前 Workspace 的记录列表与详情 | 3 |

### 增强（阶段 5+）

| 编号 | 用户故事 | 阶段 |
| :--- | :--- | :--- |
| US-09 | 作为 editor，我可以按住说话录音并附加到记录 | 5 |
| US-10 | 作为用户，我可以按「日」查看/补录当天照片（一天一张照片） | 增强 |
| US-11 | 作为 editor，我可以写一封「写给 hexia」的信并按时间回看 | 增强 |
| US-12 | 作为用户，我可以进入沉浸式 Timeline 回顾成长 | 增强 |
| US-13 | 作为用户，我可以把站点安装为 PWA，在主屏打开 | 增强 |

## 1.6 非功能需求

| 编号 | 要求 |
| :--- | :--- |
| NFR-01 | 图片列表页首屏加载 ≤ 2 秒（含缩略图） |
| NFR-02 | 所有业务 API 必须鉴权：未登录 401，无权限 403 |
| NFR-03 | 媒体文件存储于 OSS，不占用应用服务器磁盘（开发可用本地占位） |
| NFR-04 | Workspace 间数据隔离：任何跨 Workspace 读取/写入必须失败 |
| NFR-05 | 前端生产构建可部署为静态资源；后端无状态（JWT）便于水平扩展 |
| NFR-06 | （PWA）关键路由离线可打开壳层；媒体原片不强制离线全量缓存 |

## 1.7 范围外（当前不做）

- 公开注册、开放式社交、评论点赞体系
- 多租户 SaaS（多家族隔离计费）
- 原生 iOS / Android App（以 PWA 为替代）
- 实时协作编辑、WebSocket 聊天
