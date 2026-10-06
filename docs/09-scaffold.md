# 文档 9：阶段 0 脚手架说明（已实现）

本文描述仓库**当前已落地的前后端骨架**，与 [05-roadmap](./05-roadmap.md) 阶段 0 验收对应。业务功能（鉴权、Workspace、记录、媒体）尚未实现，目录占位见 [06-project-structure](./06-project-structure.md)。

## 9.1 总览

```
浏览器 (Vite :5180, PWA)
        │  HTTP + CORS
        ▼
Django API (:8000 或 :8001)
        │  DATABASE_URL
        ▼
PostgreSQL (Docker claner-pg → 宿主机 :5433)
```

| 层 | 实际选型 | 阶段 0 已具备 |
| :--- | :--- | :--- |
| 后端 | Django 6 + DRF + SimpleJWT + corsheaders + storages | 项目包、settings 拆分、健康检查、JWT/CORS/本地存储配置就绪 |
| 前端 | React 19 + Vite 8 + TypeScript + axios + vite-plugin-pwa | 健康检查页、axios 客户端、PWA manifest/SW、更新提示 |
| 数据库 | PostgreSQL 16（`docker compose`） | migration 可执行；默认库名/用户/密码均为 `claner` |
| 配置 | `.env` + `dj-database-url` / `VITE_*` | 前后端 `.env.example` 已提供 |

## 9.2 后端（`backend/`）

### 目录要点

| 路径 | 说明 |
| :--- | :--- |
| `config/settings/` | `base` / `local` / `production`；默认入口为 `local` |
| `config/urls.py` | `admin/` + `api/`（core） |
| `apps/core` | `GET /api/health/` → `{"status":"ok"}`（无需登录） |
| `apps/accounts` | 空壳，阶段 1 放登录 / me |
| `apps/clan` | 空壳 + `permissions` / `serializers` / `urls` 占位，阶段 2+ 放领域模型 |
| `media/` | 本地存储根目录（`STORAGE_BACKEND=local`） |
| `requirements.txt` | 当前锁版本（含 Django 6.1、psycopg、SimpleJWT 等） |

### 已启用能力

- **鉴权框架**：DRF 默认 `JWTAuthentication` + `IsAuthenticated`；健康检查显式 `AllowAny`。
- **CORS**：读 `CORS_ALLOWED_ORIGINS`（默认 Vite `5180`）。
- **数据库**：仅 PostgreSQL；`DATABASE_URL` 解析。
- **存储**：`STORAGE_BACKEND=local` → `FileSystemStorage`；`oss` 分支已留形状，阶段 4 再接。

### 尚未实现

登录/刷新/me、Workspace、Membership、GrowthRecord、MediaAsset、Admin 业务注册等——见路线图阶段 1–4。

## 9.3 前端（`frontend/`）

### 目录要点

| 路径 | 说明 |
| :--- | :--- |
| `src/api/client.ts` | axios 实例，`baseURL = VITE_API_BASE_URL` |
| `src/api/health.ts` | `GET /api/health/` |
| `src/App.tsx` | 阶段 0 验收页：成功显示「后端连接成功」 |
| `src/pwa/PwaUpdateToast.tsx` | SW 有更新时提示刷新 |
| `vite.config.ts` | `VitePWA`：manifest、预缓存壳层、`devOptions.enabled` |
| `public/icons/` | `icon-192.png` / `icon-512.png` |
| `auth/` / `features/*` / `routes/` | 空目录占位，阶段 1+ 填充 |

### PWA 基线范围

已做：可安装配置、图标、基础 Service Worker、开发态注册、更新 toast。  
未做：API 列表精细缓存、媒体离线、Web Push（见路线图 E4「PWA 深化」）。

### 依赖备注

已安装 `react-router-dom`，阶段 0 **尚未挂路由**；阶段 1 登录页再接入。

## 9.4 基础设施

| 文件 | 作用 |
| :--- | :--- |
| 仓库根 `docker-compose.yml` | 服务名 `db`，容器名 `claner-pg`，映射 **`5433:5432`** |
| `backend/.env` | 本地密钥与 `DATABASE_URL`（**勿提交**；已在 `.gitignore`） |
| `frontend/.env` | `VITE_API_BASE_URL`（勿提交） |

端口冲突约定（本机常见）：

| 默认 | 冲突时 | 改哪里 |
| :--- | :--- | :--- |
| Postgres `5432` | 用 `5433` | `docker-compose.yml` + `DATABASE_URL` |
| Django `8000` | 用 `8001` | `runserver` 端口 + `VITE_API_BASE_URL` |
| Vite `5180` | 端口被占用 | 改 `vite.config.ts` `server.port`，并同步 `CORS_ALLOWED_ORIGINS` |

## 9.5 联调验收清单

1. `docker compose up -d` → `claner-pg` healthy  
2. `python manage.py migrate` 成功  
3. `curl $API/api/health/` → `{"status":"ok"}`  
4. 浏览器打开前端 → 「后端连接成功」  
5. DevTools → Application：Manifest / Service Worker 可见  

日常命令见 [07-dev-setup](./07-dev-setup.md)。
