#!/bin/sh
set -e

echo "[claner-api] waiting for database…"
python - <<'PY'
import os, time
import dj_database_url
import psycopg

url = os.environ.get("DATABASE_URL", "")
cfg = dj_database_url.parse(url)
deadline = time.time() + 60
while True:
    try:
        with psycopg.connect(
            host=cfg.get("HOST") or "localhost",
            port=cfg.get("PORT") or 5432,
            user=cfg.get("USER"),
            password=cfg.get("PASSWORD"),
            dbname=cfg.get("NAME"),
            connect_timeout=3,
        ) as conn:
            conn.execute("SELECT 1")
        break
    except Exception as exc:
        if time.time() > deadline:
            raise SystemExit(f"database not ready: {exc}") from exc
        time.sleep(1)
print("database ok")
PY

echo "[claner-api] migrate…"
python manage.py migrate --noinput

echo "[claner-api] collectstatic…"
python manage.py collectstatic --noinput

echo "[claner-api] starting gunicorn…"
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-3}" \
  --timeout "${GUNICORN_TIMEOUT:-60}" \
  --access-logfile - \
  --error-logfile -
