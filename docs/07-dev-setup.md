# 文档 7：本地开发环境

阶段 0 脚手架已落地。本文为**现行**启动方式；结构说明见 [06](./06-project-structure.md)，已实现能力见 [09](./09-scaffold.md)。

## 7.1 前置依赖

| 工具 | 建议版本 |
| :--- | :--- |
| Python | 3.12+（本机曾用 3.14 验证通过） |
| Node.js | 20 LTS+ |
| npm | 与 Node 捆绑即可 |
| Docker | 推荐；用于 PostgreSQL（`docker compose`） |

可选：本机 Homebrew PostgreSQL 16+（不用 Docker 时）。

## 7.2 一键起库（推荐 Docker）

在仓库根目录：

```bash
docker compose up -d db
docker compose ps   # claner-pg 应为 healthy；宿主机端口 5433
```

完整一键部署（含前端编译 + API + Nginx）见 [12-deploy.md](./12-deploy.md)：

```bash
cp .env.example .env
docker compose up -d --build
```

若你本地还是旧容器名 `clan-pg` / 旧库账号 `clan`，需要重建库（**会清空数据**）：

```bash
docker compose down
docker volume rm ClanManagement_clan_pg_data 2>/dev/null || true
docker volume rm clanmanagement_clan_pg_data 2>/dev/null || true
docker compose up -d
```

默认账号（与 `backend/.env.example` 一致）：

- 用户 / 密码 / 库名：`claner` / `claner` / `claner`
- URL：`postgres://claner:claner@127.0.0.1:5433/claner`

不用 Docker、改用本机 Postgres 时：自建库后把 `DATABASE_URL` 端口改成 `5432`（或你的实际端口）。

## 7.3 后端

首次：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # 若尚无 .env
python manage.py migrate
python manage.py createsuperuser   # 阶段 1/2 再用；阶段 0 可跳过
```

日常启动：

```bash
cd backend
source .venv/bin/activate
python manage.py runserver 8000
```

若 `8000` 已被占用：

```bash
python manage.py runserver 8001
# 同时改 frontend/.env：
# VITE_API_BASE_URL=http://127.0.0.1:8001
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/health/
# 或 :8001
# {"status":"ok"}
```

Admin：`http://127.0.0.1:8000/admin/`（需先 `createsuperuser`）。

## 7.4 前端

首次：

```bash
cd frontend
cp .env.example .env
# 确认 VITE_API_BASE_URL 与后端端口一致
npm install
```

日常：

```bash
npm run dev
# 本机 http://127.0.0.1:5180/
# 局域网 http://<你的局域网IP>:5180/（vite 已 host: true；端口避开常见 5173）
```

验收：页面显示「后端连接成功」。

### 局域网手机/其他电脑访问

推荐方式（已配置）：**只访问前端端口**，Vite 把 `/api`、`/media` 代理到本机 Django。

1. 前端 `vite.config.ts`：`server.host: true` + `proxy` → `127.0.0.1:8001`
2. 前端 `.env`：`VITE_API_BASE_URL=`（空 = 同源，不要写 `127.0.0.1`）
3. 后端可继续：`python manage.py runserver 8001`（仅本机即可）
4. 手机浏览器打开：`http://<电脑局域网IP>:5180/`（例如 `http://192.168.50.247:5180/`）
5. **两边都要重启**：改 `.env` / `vite.config` 后重启 `npm run dev`；改后端 `.env` 后重启 Django
6. 本地媒体：`STORAGE_BACKEND=local` 时 `file_url` / `local-put` 使用**相对路径**（`/media/...`、`/api/...`），经 Vite 代理，手机与本机都能显示。`PUBLIC_API_BASE_URL` 可留空。

若不用代理、手机直连后端，则需 `runserver 0.0.0.0:8001`，并把 `VITE_API_BASE_URL` / `ALLOWED_HOSTS` / `CORS` 都写成局域网 IP（见 `.env.example`）。

PWA：

- 开发：DevTools → Application → Manifest / Service Worker  
- 更接近安装体验：`npm run build && npm run preview`

## 7.5 环境变量

### 后端 `backend/.env.example`

```env
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5180,http://127.0.0.1:5180

# Docker compose 默认映射 5433；本机 Postgres 常用 5432
DATABASE_URL=postgres://claner:claner@127.0.0.1:5433/claner

STORAGE_BACKEND=local

# 本地直传回调与 file_url 拼装用
PUBLIC_API_BASE_URL=http://127.0.0.1:8001

# 阿里云 OSS（STORAGE_BACKEND=oss）；图/视频/音频共用一个 Bucket
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET_NAME=claner
OSS_ENDPOINT=https://oss-cn-chengdu.aliyuncs.com
OSS_REGION=cn-chengdu
OSS_CUSTOM_DOMAIN=
```

**说明：**

| 变量 | 作用 |
| :--- | :--- |
| `STORAGE_BACKEND` | `local` 或 `oss`；部署切存储只改此开关 + OSS 变量 |
| `OSS_BUCKET_NAME` | 目标 Bucket，默认示例 `claner`；换环境换桶只改此值 |
| `OSS_ENDPOINT` / `OSS_REGION` | 地域 Endpoint 与 region（与控制台一致） |
| `OSS_CUSTOM_DOMAIN` | 可选 CDN 域名；空则用 `https://{bucket}.{endpoint主机}/{object_key}` |
| `PUBLIC_API_BASE_URL` | `local` 模式下拼 `file_url` 与 local PUT 地址 |

**不需要**为图片、视频分两个 Bucket（见 ADR-011）。对象键形如：

`workspaces/{workspace_id}/records/{record_id}/{uuid}.jpg|mp4|webm|…`

OSS Bucket 需配置 CORS：允许前端源、方法 `PUT`/`GET`/`HEAD`、暴露必要头。

**浏览器直传 OSS 必须开 CORS**（否则会报 Network Error / 上传失败）。一键配置：

```bash
cd backend && source .venv/bin/activate
python manage.py configure_oss_cors
# 追加其他 Origin（如生产域名）：
python manage.py configure_oss_cors --origin https://your.domain
```

或在控制台 → Bucket → 数据安全 → 跨域设置，允许 `PUT/GET/HEAD`、来源含 `http://<局域网IP>:5173`。

生产读图：MVP 建议 Bucket 策略或 CDN 对 `workspaces/*` 可公开读（或绑定 `OSS_CUSTOM_DOMAIN`）；预签名仅用于 **PUT**。图/视频/音频**共用** `OSS_BUCKET_NAME`（默认 `claner`），见 ADR-011。

### 前端 `frontend/.env.example`

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Vite 仅在启动时读入 `VITE_*`，改端口后需重启 `npm run dev`。

## 7.6 CORS

开发期允许 `CORS_ALLOWED_ORIGINS` 中的源，并允许带 `Authorization`。若 Vite 因端口占用落到 `5174`，把该源补进后端 `.env` 后重启 Django。

## 7.7 实际依赖（与仓库锁定文件对齐）

后端见 `backend/requirements.txt`（摘要）：

- Django 6.x、djangorestframework、djangorestframework-simplejwt  
- django-cors-headers、django-storages、boto3  
- python-dotenv、dj-database-url、psycopg[binary]

前端见 `frontend/package.json`（摘要）：

- react / react-dom、react-router-dom、typescript、vite  
- axios、vite-plugin-pwa、@vitejs/plugin-react、oxlint  

UI 组件库：阶段 0–3 可不引入重型库。

## 7.8 阶段 0 页面行为

1. 挂载时 `GET {VITE_API_BASE_URL}/api/health/`  
2. 成功：「后端连接成功」  
3. 失败：展示错误（CORS / 后端未启 / 网络等）  
4. PWA：Manifest + SW；可选更新提示（不阻塞健康检查）

## 7.9 常见问题

| 现象 | 处理 |
| :--- | :--- |
| `connection refused` 5433 | `docker compose up -d`，确认 `claner-pg` healthy |
| `Bind for 0.0.0.0:5432 failed` | 本仓库已改用 **5433**；勿与其他项目抢 5432 |
| Django 启动报 migration / DB | 检查 `DATABASE_URL` 与容器是否就绪 |
| 前端「无法连接后端」 | 核对后端端口与 `VITE_API_BASE_URL`，看浏览器 Network / CORS |
| PWA SW 怪异缓存 | Application → Service Workers → Unregister，硬刷新 |

## 7.10 Admin 造数流程（阶段 2 验收）

1. `createsuperuser` 登录 Admin  
2. 创建 User A、User B  
3. 创建 Workspace「小满」「小禾」  
4. Membership：A-owner-爸爸 @小满；A-viewer-舅舅 @小禾；B 反之等  
5. 前端分别登录验证列表隔离与称呼  
