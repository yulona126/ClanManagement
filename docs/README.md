# 开发文档索引

本目录是 Claner 的**唯一需求与设计真源**。实现时以本文档为准；代码与文档冲突时，先改文档再改代码，或在 ADR 中记录例外。

| 文档 | 内容 | 何时查阅 |
| :--- | :--- | :--- |
| [01-srs.md](./01-srs.md) | 需求、双端形态、领域模型、权限矩阵、用户故事、非功能 | 定功能边界、做权限判断 |
| [02-database.md](./02-database.md) | ER、表结构、索引、字段说明 | 写 model / migration |
| [03-api.md](./03-api.md) | 鉴权、端点、请求响应约定 | 写 View / Serializer / 前端 API 层 |
| [04-adr.md](./04-adr.md) | 已采纳的架构决策与后果 | 选型争议、为什么这么做 |
| [05-roadmap.md](./05-roadmap.md) | 阶段 0–6 ✅、**U1–U5 双端 IA**、阶段 7 上线、增强 | **每天开工前看** |
| [06-project-structure.md](./06-project-structure.md) | 前后端目录约定 | 新建文件时对齐结构 |
| [07-dev-setup.md](./07-dev-setup.md) | 环境变量、启动命令、验收检查 | 搭环境、联调 |
| [08-test-cases.md](./08-test-cases.md) | 核心权限与业务验收用例 | 阶段验收、回归 |
| [09-scaffold.md](./09-scaffold.md) | **阶段 0 已实现脚手架说明** | 了解当前仓库能跑什么 |
| [10-frontend-theme.md](./10-frontend-theme.md) | **Minimal White 视觉锁定**、交互规则、`Button` / 空状态 | 做页面样式与按钮时必读 |
| [11-product-ia.md](./11-product-ia.md) | **用户端 / 管理端页面地图与导航** | 改路由、壳、Feed 前必读 |
| [12-deploy.md](./12-deploy.md) | **生产部署到新服务器**（Nginx + gunicorn + OSS + HTTPS） | 上线、换机、运维发布 |

## 快速对照：你现在该做什么

```
阶段 0–6 ✅ → U1 双端壳 + Feed → U2…U5 → 阶段 7 上线 → E2/E3/E4
```

新人建议顺序：`09-scaffold` → `07-dev-setup` 跑通 → `11-product-ia` → `05-roadmap`（U1）→ `01-srs` / `03-api`。

## 文档维护约定

- 新增接口：同步改 `03-api.md`。
- 改表结构：同步改 `02-database.md`，并新增 ADR（如有取舍）。
- 阶段完成：在 `05-roadmap.md` 对应阶段勾选验收项。
- 脚手架/启动方式变更：同步改 `07-dev-setup.md`、`09-scaffold.md`。
- 视觉规范变更：同步改 `10-frontend-theme.md` 与 `frontend/src/styles/tokens.css`。
- 页面 / 导航 / 双端边界变更：同步改 `11-product-ia.md` 与 `01-srs.md` 双端章节。
