# 文档 7：本地开发环境

本文在阶段 0 执行；命令以约定目录为准，实际脚手架生成后若路径不同，以仓库 README 为准并回写本文。

## 7.1 前置依赖

| 工具 | 建议版本 |
| :--- | :--- |
| Python | 3.12+ |
| Node.js | 20 LTS+ |
| npm / pnpm | 任选其一，团队统一 |

## 7.2 后端（目标命令）

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/health/
# {"status":"ok"}
```

## 7.3 前端（目标命令）

```bash
cd frontend
cp .env.example .env
# VITE_API_BASE_URL=http://127.0.0.1:8000
npm install
npm run dev
```

浏览器打开 Vite 地址，应看到「后端连接成功」（阶段 0 验收页）。

## 7.4 环境变量

### 后端 `.env.example`（字段清单）

```env
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DATABASE_URL=sqlite:///db.sqlite3
# 生产示例：postgres://user:pass@host:5432/clan

# 存储：local | oss
STORAGE_BACKEND=local

# OSS（STORAGE_BACKEND=oss 时）
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET_NAME=
OSS_ENDPOINT=
OSS_CUSTOM_DOMAIN=
```

### 前端 `.env.example`

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## 7.5 CORS

开发期允许前端源访问；仅开放需要的方法与头（含 `Authorization`）。生产收紧为真实域名。

## 7.6 推荐依赖（后端起点）

```
Django>=5.x
djangorestframework
djangorestframework-simplejwt
django-cors-headers
django-storages
boto3   # 或阿里云官方 SDK，按 storages 后端选择
python-dotenv
# 可选：drf-spectacular, psycopg[binary], gunicorn
```

## 7.7 推荐依赖（前端起点）

```
react
react-dom
react-router-dom
typescript
vite
axios   # 或 ky
```

UI 组件库：阶段 0–3 可不引入重型库；需要时再选，避免过早锁定视觉。

## 7.8 阶段 0 最小页面行为

1. 挂载时 `GET {VITE_API_BASE_URL}/api/health/`
2. 成功：展示「后端连接成功」
3. 失败：展示错误信息（CORS / 未启动等）

## 7.9 Admin 造数流程（阶段 2 验收）

1. `createsuperuser` 登录 Admin
2. 创建 User A、User B
3. 创建 Workspace「小满」「小禾」
4. Membership：A-owner-爸爸 @小满；A-viewer-舅舅 @小禾；B 反之等
5. 前端分别登录验证列表隔离与称呼
