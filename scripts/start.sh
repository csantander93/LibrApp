#!/bin/sh
# Arranque de producción: aplica migraciones Alembic y levanta uvicorn en $PORT
# (Railway inyecta PORT). El seed corre en el lifespan si RUN_SEED_ON_STARTUP=true.
set -e
python scripts/db_migrate.py
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
