# 文档 6：项目结构约定

阶段 0 已按下列结构落地（见 [09-scaffold](./09-scaffold.md)）。名称可微调，**职责勿混**。

```
Claner/
├── README.md
├── docker-compose.yml             # PostgreSQL（claner-pg → 宿主机 5433）
├── docs/                          # 本套开发文档
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/                    # Django 项目包
│   │   ├── settings/
│   │   │   ├── __init__.py        # 默认导入 local
│   │   │   ├── base.py
│   │   │   ├── local.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── apps/
│   │   ├── core/                  # health（已实现）
│   │   ├── accounts/              # 阶段 1：auth / me
│   │   └── clan/                  # Claner 领域（包名 apps.clan，Django label 仍为 clan）
│   │       ├── models.py
│   │       ├── admin.py
│   │       ├── serializers.py
│   │       ├── views.py
│   │       ├── permissions.py
│   │       ├── urls.py
│   │       └── services/          # presign 等（阶段 4）
│   └── media/                     # 开发本地上传占位（勿提交大文件）
├── frontend/
│   ├── package.json
│   ├── vite.config.ts             # 含 VitePWA
│   ├── index.html
│   ├── .env.example
│   ├── public/
│   │   └── icons/                 # PWA 图标（已提供）
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                # 阶段 0：健康检查页
│       ├── api/                   # axios、health（已实现）
│       ├── auth/                  # 阶段 1：token、守卫
│       ├── features/
│       │   ├── workspaces/
│       │   ├── records/
│       │   └── media/
│       ├── components/
│       ├── hooks/
│       ├── routes/                # 阶段 1：路由表
│       ├── styles/
│       └── pwa/                   # 更新提示（已实现）
└── .gitignore
```

## 后端包职责

| 包 | 职责 | 阶段 |
| :--- | :--- | :--- |
| `config` | 设置、根 URL、中间件 | 0 ✅ |
| `apps.core` | `/api/health/` | 0 ✅ |
| `apps.accounts` | 登录、刷新、当前用户 | 1 |
| `apps.clan` | Claner 领域：Workspace / Membership / Record / Media（Django app label 仍为 `clan`） | 2–4 |
| `permissions.py` | `IsWorkspaceMember` / `Editor` / `Owner` | 2 |
| `services/` | 预签名、`object_key`/`file_url` 拼装、EXIF 规范化（白名单/GPS） | 4 |

## 前端职责

| 目录 | 职责 | 阶段 |
| :--- | :--- | :--- |
| `api/` | 纯 HTTP，不含 UI | 0 ✅（health） |
| `auth/` | 登录态、拦截器、路由守卫 | 1 |
| `features/*` | 按业务切片的页面与组件 | 2+ |
| `features/media/` | 选图上传、EXIF 解析（`exifr`）、直传 | 4 |
| `hooks/` | 可复用副作用（录音、懒加载） | 5 等 |
| `pwa/` + `vite.config` | Manifest、SW、更新提示 | 0 ✅ 基线 |

## 根目录 Docker

| 项 | 值 |
| :--- | :--- |
| Compose 服务名 | `db` |
| 容器名 | `claner-pg` |
| 镜像 | `postgres:16` |
| 宿主机端口 | **5433** → 容器 5432 |
| 数据卷 | `clan_pg_data` |

## Git 忽略（根 `.gitignore` 已含）

- `__pycache__/`, `*.pyc`, `.venv/`, `backend/.env`, `backend/media/`（保留 `.gitkeep`）
- `frontend/node_modules/`, `frontend/dist/`, `frontend/dev-dist/`, `frontend/.env`
- 偶发 `*.sqlite3`（默认开发库仍是 PostgreSQL）
