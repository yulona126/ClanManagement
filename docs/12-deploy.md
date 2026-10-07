# 文档 12：生产部署（新服务器）

面向：把 Claner 部署为可访问站点。**推荐优先用 Docker Compose 一键启动**；需要手工拆分时再看后文 Nginx/systemd 方案。

本地开发仍看 [07-dev-setup.md](./07-dev-setup.md)。

---

## 推荐：Docker Compose 一键部署

仓库根目录已提供完整栈：`db`（Postgres）+ `api`（Django/gunicorn，启动时自动 migrate / collectstatic）+ `web`（多阶段构建前端 + Nginx 反代）。

```bash
cd /path/to/ClanManagement
cp .env.example .env
# 至少改：DJANGO_SECRET_KEY、密码；上线域名时改 ALLOWED_HOSTS / CSRF / CORS

docker compose up -d --build
# 浏览器打开 http://localhost/   （或 http://服务器IP/）
```

服务说明：

| 服务 | 容器 | 作用 |
| :--- | :--- | :--- |
| `db` | `claner-pg` | PostgreSQL 16 |
| `api` | `claner-api` | gunicorn；入口脚本会等库就绪 → migrate → collectstatic |
| `web` | `claner-web` | 构建 `frontend` 后用 Nginx 托管；`/api` `/admin` 反代到 api；`/media` `/static` 挂卷 |

常用命令：

```bash
docker compose ps
docker compose logs -f api
docker compose exec api python manage.py createsuperuser
docker compose up -d --build          # 改代码后重新构建并启动
docker compose down                   # 停服务（数据卷保留）
```

生产域名示例（`.env`）：

```env
DJANGO_ALLOWED_HOSTS=claner.example.com
CSRF_TRUSTED_ORIGINS=https://claner.example.com
CORS_ALLOWED_ORIGINS=https://claner.example.com
SECURE_SSL_REDIRECT=true
STORAGE_BACKEND=oss
# …填写 OSS_* …
WEB_PUBLISH_PORT=80
```

HTTPS：在宿主机用 Certbot / Caddy / 云负载均衡终止 TLS，反代到本机 `WEB_PUBLISH_PORT`；或自行在 compose 前加 TLS 代理。Compose 内默认是 **HTTP :80**。

仅起数据库（本地开发照旧）：

```bash
docker compose up -d db
```

---

## 0. 上线前检查结论（仓库现状）

| 项 | 状态 | 说明 |
| :--- | :--- | :--- |
| 业务功能（鉴权 / Workspace / 动态 / 媒体 / 评论语音 / 相册） | ✅ | 本地可跑；migration 至 `0008_album_and_nullable_record` |
| `docker compose` 全栈 | ✅ | `docker compose up -d --build` → db + api + web（含前端编译） |
| gunicorn | ✅ | `backend/requirements.txt` + 容器入口 |
| 生产 settings | ✅ | `DJANGO_ENV=production`（compose 已注入） |
| 媒体存储 | ⚠️ | 试用可用 `STORAGE_BACKEND=local`（卷持久化）；正式建议 `oss` |
| 手工 Nginx / systemd | 下文可选 | Compose 不够用时再拆 |
| CI/CD | ⬜ 未做 | 可先手工 `compose up --build` |
| 删媒体是否同步删 OSS | ⬜ 未定 | 见路线图阶段 7 |

**Compose 架构：**

```
浏览器 ──▶ web (:80 Nginx)
              ├─ /           → 前端 dist（镜像内 build）
              ├─ /api /admin → api:8000
              ├─ /static     → 共享卷（collectstatic）
              └─ /media      → 共享卷（local 存储）

         api ──▶ db:5432
         （OSS 模式：浏览器直传 Bucket）
```

前端构建时 **`VITE_API_BASE_URL` 为空**（Dockerfile 已写死），请求走同源 `/api`。

---

## 1. 服务器与账号准备

### 1.1 机器规格（起步）

| 资源 | 建议 |
| :--- | :--- |
| CPU / 内存 | 2 vCPU / 4 GB（家人小流量够用） |
| 磁盘 | 40 GB+ 系统盘；媒体走 OSS 后系统盘压力小 |
| 系统 | Ubuntu 22.04 / 24.04 LTS |
| 网络 | 公网 IP + 已解析域名（例：`claner.example.com`） |

### 1.2 云资源

1. **域名** A 记录 → 服务器公网 IP  
2. **阿里云 OSS Bucket**（与开发可同桶或独立生产桶）  
   - 读写：服务端密钥做预签名 PUT；对象建议公网可读或走 CDN 域名  
   - CORS：允许生产源 `https://claner.example.com`，方法含 `PUT/GET/HEAD`  
3. （可选）**CDN / 自定义域名** → 填 `OSS_CUSTOM_DOMAIN`  
4. （可选）云数据库 PostgreSQL，替代本机 Docker

### 1.3 服务器基础软件

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx \
  python3.12-venv python3-pip build-essential libpq-dev

# Docker（跑 Postgres；若用云 RDS 可跳过）
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # 重新登录后生效

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

建议专用用户（非 root）跑应用：

```bash
sudo adduser --system --group --home /opt/claner claner
sudo mkdir -p /opt/claner
sudo chown claner:claner /opt/claner
```

---

## 2. 拉代码与目录约定

```bash
sudo -u claner -H bash
cd /opt/claner
git clone <你的仓库URL> app
cd app
```

约定路径：

| 路径 | 用途 |
| :--- | :--- |
| `/opt/claner/app` | 仓库根 |
| `/opt/claner/app/backend` | Django |
| `/opt/claner/app/frontend/dist` | 前端构建产物（Nginx root） |
| `/opt/claner/app/backend/.venv` | Python 虚拟环境 |
| `/opt/claner/app/backend/.env` | **生产密钥，勿提交 Git** |

---

## 3. 数据库

### 方案 A：本机 Docker（与仓库 compose 一致）

在仓库根（可用 root/`claner` 有 docker 权限的用户）：

```bash
cd /opt/claner/app
# 生产勿把 5433 暴露到公网：改 compose 为仅 127.0.0.1:5433:5432
docker compose up -d
docker compose ps   # claner-pg healthy
```

建议把 `docker-compose.yml` 的 ports 改成：

```yaml
ports:
  - "127.0.0.1:5433:5432"
```

`DATABASE_URL`：

```env
DATABASE_URL=postgres://claner:claner@127.0.0.1:5433/claner
```

**务必改掉默认密码**（改 Postgres 环境变量 + `DATABASE_URL` 一致）。

### 方案 B：云 RDS

把 `DATABASE_URL` 写成云厂商提供的连接串，并放行服务器出口 IP。

---

## 4. 后端

```bash
cd /opt/claner/app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### 4.1 生产 `.env`（示例）

`cp .env.example .env` 后改成类似：

```env
DJANGO_ENV=production
DJANGO_SECRET_KEY=<用 openssl rand -hex 32 生成>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=claner.example.com
CSRF_TRUSTED_ORIGINS=https://claner.example.com
CORS_ALLOWED_ORIGINS=https://claner.example.com
SECURE_SSL_REDIRECT=true

DATABASE_URL=postgres://claner:<强密码>@127.0.0.1:5433/claner

STORAGE_BACKEND=oss
PUBLIC_API_BASE_URL=

OSS_ACCESS_KEY_ID=<生产 AK>
OSS_ACCESS_KEY_SECRET=<生产 SK>
OSS_BUCKET_NAME=claner-prod
OSS_ENDPOINT=https://oss-cn-chengdu.aliyuncs.com
OSS_REGION=cn-chengdu
OSS_CUSTOM_DOMAIN=https://cdn.example.com
```

要点：

- **`DJANGO_ENV=production`**：加载 `production.py`（关 DEBUG、安全 Cookie、强制配置 Hosts）。  
- **同源部署时** `CORS_ALLOWED_ORIGINS` 仍建议写上生产域名；前端 `VITE_API_BASE_URL` 为空即可。  
- **`STORAGE_BACKEND=oss`**：浏览器直传 OSS；服务端只做 presign/complete。  
- 若暂无 HTTPS，临时设 `SECURE_SSL_REDIRECT=false`（仅联调，上线前改回）。

### 4.2 迁移与管理员

```bash
source .venv/bin/activate
export DJANGO_ENV=production
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

### 4.3 OSS CORS

```bash
python manage.py configure_oss_cors --origin https://claner.example.com
```

Bucket 读权限：生产 MVP 可对 `workspaces/*` 公网读，或绑定 CDN 域名到 `OSS_CUSTOM_DOMAIN`。

### 4.4 用 gunicorn 试跑

```bash
cd /opt/claner/app/backend
source .venv/bin/activate
export DJANGO_ENV=production
gunicorn config.wsgi:application \
  --bind 127.0.0.1:8000 \
  --workers 3 \
  --timeout 60 \
  --access-logfile - \
  --error-logfile -
```

另开终端：`curl -s http://127.0.0.1:8000/api/health/` → `{"status":"ok"}`。

---

## 5. 前端构建

```bash
cd /opt/claner/app/frontend
# 生产同源：空字符串或不要写绝对后端地址
printf 'VITE_API_BASE_URL=\n' > .env.production
npm ci
npm run build
# 产物：frontend/dist
ls dist
```

确认 `dist/index.html`、`dist/assets/`、PWA 的 `sw` / `manifest` 存在。

---

## 6. systemd：常驻 gunicorn

`/etc/systemd/system/claner-api.service`：

```ini
[Unit]
Description=Claner Django (gunicorn)
After=network.target docker.service
Wants=docker.service

[Service]
User=claner
Group=claner
WorkingDirectory=/opt/claner/app/backend
Environment=DJANGO_ENV=production
EnvironmentFile=/opt/claner/app/backend/.env
ExecStart=/opt/claner/app/backend/.venv/bin/gunicorn config.wsgi:application \
  --bind 127.0.0.1:8000 \
  --workers 3 \
  --timeout 60 \
  --access-logfile /var/log/claner/access.log \
  --error-logfile /var/log/claner/error.log
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/log/claner
sudo chown claner:claner /var/log/claner
sudo systemctl daemon-reload
sudo systemctl enable --now claner-api
sudo systemctl status claner-api
```

---

## 7. Nginx + HTTPS

### 7.1 站点配置

`/etc/nginx/sites-available/claner`：

```nginx
server {
    listen 80;
    server_name claner.example.com;

    # certbot 会改写为跳转 HTTPS；也可先仅 HTTP 联调
    root /opt/claner/app/frontend/dist;
    index index.html;

    client_max_body_size 32m;  # 头像 multipart / local-put；动态大图走 OSS 直传

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django collectstatic（Admin CSS/JS）
    location /static/ {
        alias /opt/claner/app/backend/staticfiles/;
        expires 7d;
        access_log off;
    }

    # SPA + PWA：非文件回退 index.html；勿吞掉 /api
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        try_files $uri =404;
        expires 30d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/claner /etc/nginx/sites-enabled/claner
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 7.2 证书

```bash
sudo certbot --nginx -d claner.example.com
```

证书续期：`certbot.timer` 一般已启用。确认 `SECURE_SSL_REDIRECT=true` 且 `CSRF_TRUSTED_ORIGINS` 为 `https://...`。

---

## 8. 防火墙

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
# 不要对公网开放 5433 / 8000
```

---

## 9. 验收清单

| # | 检查 | 期望 |
| :- | :--- | :--- |
| 1 | `https://claner.example.com/api/health/` | `{"status":"ok"}` |
| 2 | 打开站点 → `/login` | 可登录 |
| 3 | Admin `https://…/admin/` | 样式正常（static 已收集） |
| 4 | Staff 建 Workspace / 用户 | `/manage` 可用 |
| 5 | 发动态 + 传图 | OSS 直传成功；Feed 可见 |
| 6 | 相册：全部照片 / 自建相册 / 上传 | 不跳进文章；全屏预览 OK |
| 7 | 评论语音 | 评论区播放，不进正文媒体 |
| 8 | 手机「添加到主屏幕」 | PWA 可安装（HTTPS 必备） |
| 9 | 浏览器控制台 | 无 CORS / 混合内容错误 |

---

## 10. 日常发布流程

```bash
cd /opt/claner/app
sudo -u claner git pull

# 后端
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart claner-api

# 前端
cd ../frontend
npm ci
npm run build
# dist 已就位，Nginx 无需重启（除非改过站点配置）
sudo systemctl reload nginx   # 可选
```

回滚：`git checkout <prev>` + 重新 `migrate`（注意反向 migration 风险）+ rebuild + restart。

---

## 11. 备份建议

| 对象 | 方式 |
| :--- | :--- |
| PostgreSQL | 每日 `pg_dump` 到对象存储或另一磁盘 |
| OSS | 开启版本控制 / 跨区域复制（控制台） |
| `.env` | 仅存密钥保管处，不进 Git |
| 代码 | Git 远端 |

示例 dump：

```bash
docker exec claner-pg pg_dump -U claner claner | gzip > claner-$(date +%F).sql.gz
```

---

## 12. 常见故障

| 现象 | 处理 |
| :--- | :--- |
| 502 Bad Gateway | `systemctl status claner-api`；看 `/var/log/claner/error.log` |
| Admin 无样式 | 再跑 `collectstatic`；检查 Nginx `/static/` alias |
| 上传 Network Error | OSS CORS 是否含生产 Origin；`configure_oss_cors --origin https://域名` |
| 上传 403 | PUT 的 Content-Type 须与预签名一致；iOS 空 MIME 已由前端推断/转 JPEG |
| HEIC/实况失败 | 前端会转 JPEG 并丢掉配套 MOV；仍失败时让用户导出 JPEG |
| 大图很慢 | 前端会压到长边 ≤1920；确认已部署最新前端 |
| 回动态重复加载 | 前端 feed 缓存 60s；发布/删除会失效缓存 |
| OSS 流量偏高 | 新上传对象带 `Cache-Control: immutable`；旧对象需控制台批量改元数据或 CDN |
| CSRF 403 on Admin | `CSRF_TRUSTED_ORIGINS` 必须带 `https://` 域名 |
| DisallowedHost | `DJANGO_ALLOWED_HOSTS` 漏域名 |
| PWA 装不上 | 必须 HTTPS；检查 manifest / SW |
| 图片 404 | 确认 `STORAGE_BACKEND=oss` 与 Bucket 公网读/CDN |

---

## 13. 可选增强（阶段 7 未完成项）

- 独立生产 `docker-compose`（api + web + db 一键）  
- GitHub Actions：测 → build → SSH 发布  
- OSS 生命周期清理孤儿对象  
- CDN 加速 `OSS_CUSTOM_DOMAIN`  
- 媒体删除与 OSS 对象同步策略  

---

## 14. 最小命令速查

```bash
# 健康
curl -fsS https://claner.example.com/api/health/

# 服务
sudo systemctl restart claner-api
sudo systemctl reload nginx
docker compose -f /opt/claner/app/docker-compose.yml ps

# 日志
journalctl -u claner-api -f
tail -f /var/log/claner/error.log
```
