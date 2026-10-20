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

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# alembic.ini, alembic/, app/ y scripts/ quedan en /app (cwd de db_migrate.py).
COPY backend/ ./
# El build del front cae en /app/static (= STATIC_DIR en app/main.py).
COPY --from=frontend /fe/dist ./static

COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
