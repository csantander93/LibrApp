"""
Agendado in-process del respaldo diario a Google Drive.

LibrApp es deliberadamente *sin Celery/Redis* (a diferencia de Operix), y el
deploy corre un único proceso uvicorn, así que el respaldo diario lo maneja un
task asyncio lanzado en el `lifespan` de `app/main.py`.

Estrategia *catch-up* (robusta a reinicios): cada `_INTERVALO` el loop lee
`backup_config` y corre el respaldo si está habilitado, hay un Drive conectado,
es la hora configurada y todavía no se respaldó hoy. Así no se duplica ni se
pierde si el proceso reinicia cerca de la hora. pg_dump y httpx son bloqueantes,
por eso el respaldo corre en un hilo (`asyncio.to_thread`).
"""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger("librapp.backup")

_INTERVALO = 15 * 60  # segundos entre chequeos


def _tarea_pendiente() -> dict | None:
    """Corre en un hilo: abre su propia sesión, decide si toca respaldar y, si sí,
    ejecuta el respaldo. Devuelve el resultado o None si no correspondía."""
    from app.core.database import SessionLocal
    from app.modules.configuracion import service, backup

    db = SessionLocal()
    try:
        cfg = service.obtener_backup_config(db)
        if not (cfg.habilitado and cfg.drive_refresh_token and cfg.drive_folder_id):
            return None

        ahora = datetime.now(timezone.utc)
        if ahora.hour != cfg.hora_utc:
            return None
        if cfg.ultimo_backup_at and cfg.ultimo_backup_at.astimezone(timezone.utc).date() == ahora.date():
            return None  # ya se respaldó hoy

        logger.info("Respaldo diario: disparando (hora_utc=%s)…", cfg.hora_utc)
        try:
            return backup.ejecutar_backup(db)
        except Exception:
            logger.exception("El respaldo diario falló")
            return None
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            await asyncio.to_thread(_tarea_pendiente)
        except Exception:
            logger.exception("Error en el loop del scheduler de respaldo")
        await asyncio.sleep(_INTERVALO)


def iniciar(loop_task_holder: list) -> None:
    """Lanza el loop como task de fondo y guarda la referencia para cancelarla
    en el shutdown (ver el lifespan de main.py)."""
    loop_task_holder.append(asyncio.create_task(_loop()))
    logger.info("Scheduler de respaldo diario iniciado (cada %d min).", _INTERVALO // 60)
