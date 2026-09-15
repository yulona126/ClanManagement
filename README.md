# ClanManagement — 婴儿成长记录博客

为每个宝宝建立独立 Workspace，记录成长照片、视频、文字与语音；家族成员按关系参与，数据按 Workspace 完全隔离。

## 产品愿景（Roadmap）

| 优先级 | 方向 | 说明 |
| :----- | :--- | :--- |
| 1 | 一天一张照片 | 日历/日维度沉淀：每天至少一张成长照，形成连续记忆 |
| 2 | 写给 hexia | 私密/半私密信件流：写给宝宝的话，可按时间线回看 |
| 3 | Timeline | 沉浸式时间轴回顾（参考 [The Lookback](https://tympanus.net/codrops/2026/03/03/the-lookback-a-digital-capsule-for-better-off-studios-creative-past/)） |
| 4 | PWA | 渐进式 Web 应用：可安装、离线缓存媒体列表、推送提醒（可选） |

## 技术栈（目标）

| 层 | 选型 |
| :--- | :--- |
| 后端 | Django + Django REST Framework + SimpleJWT |
| 前端 | React + Vite + TypeScript |
| 鉴权 | JWT（access + refresh） |
| 存储 | 阿里云 OSS（开发期可用本地/FileSystemStorage 占位）+ django-storages |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） |
| 部署 | gunicorn + nginx（阶段 6） |

## 文档入口

完整开发文档见 [`docs/`](./docs/README.md)。

**建议阅读顺序：**

1. [产品与需求（SRS）](./docs/01-srs.md)
2. [数据库设计](./docs/02-database.md)
3. [API 接口规范](./docs/03-api.md)
4. [架构决策（ADR）](./docs/04-adr.md)
5. [开发阶段与任务清单](./docs/05-roadmap.md)
6. [项目结构约定](./docs/06-project-structure.md)
7. [本地开发环境](./docs/07-dev-setup.md)
8. [测试用例](./docs/08-test-cases.md)

## 当前状态

项目目录已初始化文档，**代码尚未创建**。从 [阶段 0：项目初始化](./docs/05-roadmap.md#阶段-0项目初始化) 开始动手。

## 核心原则（开发时记住）

1. **阶段 2 是地基**：Workspace + Membership 定好后再做业务。
2. **鉴权从第一天就带上**：每个 Workspace 接口显式校验 Membership。
3. **媒体可晚于文字记录**：先跑通 CRUD，再接 OSS。
4. **录音与 Timeline/PWA 放后半程**：不影响主干闭环。
5. **每个阶段验收通过再进入下一阶段**。
