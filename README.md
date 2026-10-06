# Claner — 婴儿成长记录博客

为每个宝宝建立独立 Workspace，记录成长照片、视频、文字与语音；家族成员按关系参与，数据按 Workspace 完全隔离。

> 产品名：**Claner**。后端 Django 包仍为 `apps.clan`（历史 migration label），不影响对外品牌。

## 产品形态

| 端 | 说明 | 入口 |
| :--- | :--- | :--- |
| **用户端** | Blog / 朋友圈：动态 Feed、相册、发布、空间设置 | 登录后默认 Feed |
| **管理端** | Staff Console：用户 / Workspace / 成员（独立壳） | `/manage` |

页面与导航真源：[`docs/11-product-ia.md`](./docs/11-product-ia.md)。

## 产品愿景（Roadmap）

| 优先级 | 方向 | 说明 |
| :----- | :--- | :--- |
| 当前 | 双端 IA / Feed | 用户端朋友圈化 + 管理端分离（roadmap U1–U5） |
| 1 | 一天一张照片 | 日历 / 日维度（并入 U3，软提示） |
| 2 | 写给 hexia | 私密/半私密信件流 |
| 3 | Timeline | 沉浸式时间轴回顾（参考 [The Lookback](https://tympanus.net/codrops/2026/03/03/the-lookback-a-digital-capsule-for-better-off-studios-creative-past/)） |
| 4 | PWA 深化 | 离线列表、推送等（基线可安装在阶段 0） |

## 技术栈

| 层 | 选型 |
| :--- | :--- |
| 后端 | Django 6 + Django REST Framework + SimpleJWT |
| 前端 | React 19 + Vite + TypeScript + PWA（vite-plugin-pwa） |
| 鉴权 | JWT（access + refresh） |
| 存储 | 阿里云 OSS（`STORAGE_BACKEND=local\|oss`）+ django-storages |
| 数据库 | PostgreSQL 16（`docker compose`，宿主机默认 **5433**） |
| 部署 | gunicorn + nginx（阶段 7） |

## 当前状态

- **阶段 0–6 ✅**：鉴权、Workspace、记录、媒体上传、媒体库+评论、录音  
- **U1 ✅**：用户端 / 管理端分壳 + Feed 首页（开发端口 **5180**）  
- **U2 ✅**：朋友圈卡片、详情菜单、Compose、空状态/骨架  
- **U4 ✅**：管理台标准后台（概览 / 用户 / 工作区 / 成员关系）  
- **下一阶段：U3** — 日历与一天一张（见 [`docs/05-roadmap.md`](./docs/05-roadmap.md)）  
- **视觉主题**：[`docs/10-frontend-theme.md`](./docs/10-frontend-theme.md)

### 本地启动

**一键全栈（推荐试用 / 服务器）：**

```bash
cp .env.example .env
docker compose up -d --build
# http://localhost/   创建管理员：
# docker compose exec api python manage.py createsuperuser
```

说明见 [docs/12-deploy.md](./docs/12-deploy.md)。

**开发模式（本机前后端 + 仅 Docker 数据库）：**

```bash
docker compose up -d db

cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py createsuperuser   # 或 Admin 创建普通用户供登录
python manage.py runserver 8001    # 与 Vite 代理默认一致；也可用 8000

cd frontend
npm run dev                        # http://127.0.0.1:5180/ → /login
```

详细步骤与排错：[docs/07-dev-setup.md](./docs/07-dev-setup.md)。  
**生产部署到新服务器：** [docs/12-deploy.md](./docs/12-deploy.md)。  
子项目说明：[backend/README.md](./backend/README.md)、[frontend/README.md](./frontend/README.md)。

## 文档入口

完整开发文档见 [`docs/`](./docs/README.md)。

**建议阅读顺序：**

1. [脚手架说明（阶段 0）](./docs/09-scaffold.md)
2. [本地开发环境](./docs/07-dev-setup.md)
3. [双端信息架构](./docs/11-product-ia.md) ← 当前体验主线
4. [开发阶段与任务清单](./docs/05-roadmap.md)
5. [产品与需求（SRS）](./docs/01-srs.md)
6. [数据库设计](./docs/02-database.md)
7. [API 接口规范](./docs/03-api.md)
8. [架构决策（ADR）](./docs/04-adr.md)
9. [项目结构约定](./docs/06-project-structure.md)
10. [测试用例](./docs/08-test-cases.md)

## 核心原则（开发时记住）

1. **阶段 2 是地基**：Workspace + Membership 定好后再做业务。
2. **鉴权从第一天就带上**：每个 Workspace 接口显式校验 Membership。
3. **媒体库是视图**：不另开独立上传相册。
4. **用户端与管理端分壳**：家人刷 Feed；staff 进 `/manage`；Owner 用空间设置。
5. **每个阶段验收通过再进入下一阶段**。
