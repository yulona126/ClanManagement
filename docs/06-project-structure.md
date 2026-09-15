# 文档 6：项目结构约定

阶段 0 完成后，仓库应接近如下结构（名称可微调，职责勿混）。

```
ClanManagement/
├── README.md
├── docs/                          # 本套开发文档
├── backend/
│   ├── manage.py
│   ├── requirements.txt           # 或 pyproject.toml
│   ├── .env.example
│   ├── config/                    # Django 项目包（settings/urls）
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── local.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── apps/
│   │   ├── core/                  # health 等
│   │   ├── accounts/              # auth/me（若需扩展）
│   │   └── clan/                  # Workspace / Membership / Record / Media
│   │       ├── models.py
│   │       ├── admin.py
│   │       ├── serializers.py
│   │       ├── views.py
│   │       ├── permissions.py
│   │       ├── urls.py
│   │       └── services/          # presign 等
│   └── media/                     # 仅开发本地占位（勿提交大文件）
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── .env.example
│   ├── public/
│   │   └── (PWA icons 后期)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                   # axios 实例、endpoints
│       ├── auth/                  # token、守卫
│       ├── features/
│       │   ├── workspaces/
│       │   ├── records/
│       │   └── media/
│       ├── components/
│       ├── hooks/                 # useVoiceRecorder 等
│       ├── routes/
│       └── styles/
└── .gitignore
```

## 后端包职责

| 包 | 职责 |
| :--- | :--- |
| `config` | 设置、根 URL、中间件 |
| `apps.core` | `/api/health/` |
| `apps.clan` | 领域模型、权限、业务 API |
| `permissions.py` | `IsWorkspaceMember` / `Editor` / `Owner` |
| `services/` | OSS 预签名、URL 拼装，不进 View 糊逻辑 |

## 前端职责

| 目录 | 职责 |
| :--- | :--- |
| `api/` | 纯 HTTP，不含 UI |
| `auth/` | 登录态、拦截器、路由守卫 |
| `features/*` | 按业务切片的页面与组件 |
| `hooks/` | 可复用副作用（录音、懒加载） |

## Git 忽略建议（写入根 `.gitignore`）

- `__pycache__/`, `*.pyc`, `.venv/`, `backend/.env`, `backend/media/`
- `frontend/node_modules/`, `frontend/dist/`, `frontend/.env`
- `.DS_Store`, IDE 配置按需
