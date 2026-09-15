# 开发文档索引

本目录是 ClanManagement 的**唯一需求与设计真源**。实现时以本文档为准；代码与文档冲突时，先改文档再改代码，或在 ADR 中记录例外。

| 文档 | 内容 | 何时查阅 |
| :--- | :--- | :--- |
| [01-srs.md](./01-srs.md) | 需求、领域模型、权限矩阵、用户故事、非功能 | 定功能边界、做权限判断 |
| [02-database.md](./02-database.md) | ER、表结构、索引、字段说明 | 写 model / migration |
| [03-api.md](./03-api.md) | 鉴权、端点、请求响应约定 | 写 View / Serializer / 前端 API 层 |
| [04-adr.md](./04-adr.md) | 已采纳的架构决策与后果 | 选型争议、为什么这么做 |
| [05-roadmap.md](./05-roadmap.md) | 阶段 0–6 + 产品路线（照片/信件/Timeline/PWA） | **每天开工前看** |
| [06-project-structure.md](./06-project-structure.md) | 前后端目录约定 | 新建文件时对齐结构 |
| [07-dev-setup.md](./07-dev-setup.md) | 环境变量、启动命令、验收检查 | 搭环境、联调 |
| [08-test-cases.md](./08-test-cases.md) | 核心权限与业务验收用例 | 阶段验收、回归 |

## 快速对照：你现在该做什么

```
空仓库 → 读 05-roadmap 阶段 0 → 按 06/07 搭骨架
骨架通 → 阶段 1 鉴权 → 阶段 2 Membership（地基）
       → 阶段 3 记录 ↔ 阶段 4 媒体
       → 阶段 5 录音 → 产品增强（日照片 / 信件 / Timeline / PWA）
       → 阶段 6 上线
```

## 文档维护约定

- 新增接口：同步改 `03-api.md`。
- 改表结构：同步改 `02-database.md`，并新增 ADR（如有取舍）。
- 阶段完成：在 `05-roadmap.md` 对应阶段勾选验收项。
