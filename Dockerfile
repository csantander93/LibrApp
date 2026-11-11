# Imagen de producción: un solo servicio web que sirve la API FastAPI y el SPA ya
# compilado (servicio único en Railway). Dev sigue usando docker-compose.yml.

# ── Stage 1: build del frontend ───────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
# Relativo → axios pega al mismo origen (sin CORS). Ver frontend/src/lib/api.ts.
ENV VITE_API_URL=/api/v1
RUN npm run build          # tsc && vite build → /fe/dist

# ── Stage 2: backend + SPA ────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1

# pg_dump para el respaldo/descarga de la base (modules/configuracion/backup.py).
# Instalamos el cliente desde el repo oficial PGDG y fijamos la MISMA major que el
# servidor: pg_dump se niega a volcar una base de un servidor más nuevo que él
# (Railway corre Postgres 18; el postgresql-client de Debian trae 17). Si Railway
# sube de major en el futuro, actualizá PG_MAJOR acá.
ENV PG_MAJOR=18
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
         -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-${PG_MAJOR} \
    && apt-get purge -y --auto-remove curl gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# alembic.ini, alembic/, app/ y scripts/ quedan en /app (cwd de db_migrate.py).
COPY backend/ ./
# El build del front cae en /app/static (= STATIC_DIR en app/main.py).
COPY --from=frontend /fe/dist ./static

COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
