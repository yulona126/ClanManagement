#!/usr/bin/env bash
# 本地开发环境自检：一条命令看出「哪一层没起来」。
#
# 用法（仓库根目录）：
#   bash scripts/devcheck.sh
#
# 只读检查，不启动任何东西。
set -u

# 定位到仓库根目录（脚本在 scripts/ 下）
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

API_PORT="${API_PORT:-8002}"
WEB_PORT="${WEB_PORT:-5180}"

# 前端代理目标：可能是本机后端，也可能指向线上（见 frontend/.env）
DEV_TARGET="$(grep -E '^DEV_API_TARGET=' frontend/.env 2>/dev/null | cut -d= -f2- | tr -d '\r')"
DEV_READONLY="$(grep -E '^DEV_API_READONLY=' frontend/.env 2>/dev/null | cut -d= -f2- | tr -d '\r')"
case "$DEV_TARGET" in
  *127.0.0.1*|*localhost*) TARGET_KIND="本机" ;;
  "") DEV_TARGET="http://127.0.0.1:${API_PORT}"; TARGET_KIND="本机（默认）" ;;
  *) TARGET_KIND="远端" ;;
esac

ok()  { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad() { printf "  \033[31m✗\033[0m %s\n" "$1"; }
tip() { printf "      → %s\n" "$1"; }

echo "本地开发自检（仓库：${ROOT}）"
echo "  后端目标：${DEV_TARGET}  [${TARGET_KIND}]${DEV_READONLY:+  只读=${DEV_READONLY}}"
if [ "$TARGET_KIND" = "远端" ]; then
  echo "  ⚠ 当前连的是远端 API：页面上的写操作会作用于远端数据"
fi
echo

echo "1) 数据库容器"
if docker compose ps db 2>/dev/null | grep -qi "healthy"; then
  port=$(grep -E "^POSTGRES_PUBLISH_PORT=" .env 2>/dev/null | cut -d= -f2)
  ok "claner-pg healthy（宿主机端口 ${port:-见 .env}）"
else
  bad "claner-pg 未运行"
  tip "docker compose up -d db"
fi

echo "2) 后端健康（${DEV_TARGET}）"
if [ "${TARGET_KIND}" = "远端" ]; then
  if curl -sf -m 15 "${DEV_TARGET%/}/api/health/" >/dev/null 2>&1; then
    ok "远端 /api/health/ 正常"
  else
    bad "远端不可达（或 /api/health/ 非 200）"
    tip "确认域名、证书与线上服务状态"
  fi
elif curl -sf -m 3 "http://127.0.0.1:$API_PORT/api/health/" >/dev/null 2>&1; then
  ok "Django /api/health/ 正常"
else
  bad "后端未响应"
  tip "cd backend && PYTHONPATH=. DJANGO_ENV=local .venv/bin/python manage.py runserver 127.0.0.1:$API_PORT"
fi

echo "3) 前端 (127.0.0.1:${WEB_PORT})"
if curl -sf -m 3 "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
  ok "Vite 正常"
else
  bad "前端未响应"
  tip "cd frontend && npm run dev"
fi

echo "4) 关键一步：经前端代理访问后端"
# 只靠前端端口也能问到后端，才算真的打通
code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
  "http://127.0.0.1:$WEB_PORT/api/health/" 2>/dev/null || echo 000)
if [ "$code" = "200" ]; then
  ok "代理打通（${WEB_PORT}/api -> ${DEV_TARGET}）"
else
  bad "代理失败（HTTP $code）"
  tip "frontend/.env 的 DEV_API_TARGET 是否等于后端实际端口（${API_PORT}）?"
fi

echo "5) 数据库连接（仅本机后端模式有意义）"
if [ "$TARGET_KIND" = "远端" ]; then
  echo "  跳过（当前连远端，本地库不参与）"
elif (cd backend && PYTHONPATH=. DJANGO_ENV=local .venv/bin/python -c "
import django, os, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.local')
django.setup()
from django.db import connection
connection.ensure_connection()
print(connection.settings_dict['HOST'], connection.settings_dict['PORT'])
" 2>/dev/null); then
  ok "Django 能连上 Postgres（上面是实际使用的 host:port）"
else
  bad "Django 连不上 Postgres"
  tip "检查 .env 的 DATABASE_URL 端口是否等于 POSTGRES_PUBLISH_PORT"
fi

echo "6) 端口冲突排查"
for p in 8000 8001; do
  who=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1}')
  if [ -n "$who" ]; then
    echo "  $p 被 $who 占用"
  else
    echo "  $p 空闲"
  fi
done

echo
echo "全部通过后，浏览器打开 http://localhost:$WEB_PORT/"
