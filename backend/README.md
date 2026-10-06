# backend — Claner API

Django + DRF 后端。阶段 0 已提供健康检查与基础设施配置；业务 API 按 `docs/05-roadmap.md` 推进。

## 快速启动

```bash
# 仓库根目录先起 Postgres
docker compose up -d

cd backend
source .venv/bin/activate   # 首次需 python3 -m venv .venv && pip install -r requirements.txt
cp .env.example .env        # 若尚无
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000   # 端口冲突时改 8001
```

- 健康检查：`GET /api/health/` → `{"status":"ok"}`
- 登录：`POST /api/auth/login/` → `{ access, refresh }`
- 当前用户：`GET /api/auth/me/`（需 Bearer token）

## 包结构

| 包 | 职责 |
| :--- | :--- |
| `config` | settings / urls / wsgi / asgi |
| `apps.core` | 健康检查（已实现） |
| `apps.accounts` | 鉴权相关（阶段 1） |
| `apps.clan` | Workspace 等领域（阶段 2+） |

更多：`docs/06-project-structure.md`、`docs/07-dev-setup.md`、`docs/09-scaffold.md`。
