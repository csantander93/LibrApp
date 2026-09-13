"""
Servicio de auditoría. Stateless, singleton (`auditoria_service`).

Expone:
  - `registrar_acceso`  → alta de un log de acceso (login exitoso/fallido).
  - `registrar_accion`  → alta de un log de acción, reutilizable por toda la app.
  - `listar_accesos` / `listar_acciones` → listados filtrables y paginados
    (fecha desde/hasta y búsqueda por usuario).

Los `registrar_*` hacen su propio commit y nunca deben tumbar la operación que
los invoca: si falla el guardado del log, se hace rollback silencioso.
"""
import uuid
from datetime import datetime, date, time

from sqlalchemy import or_
from sqlalchemy.orm import Session, Query

from app.modules.auditoria.models import LogAcceso, LogAccion
from app.shared.pagination import paginate


class AuditoriaService:

    # ─────────────────── Registro (escritura) ───────────────────

    def registrar_acceso(
        self,
        db: Session,
        *,
        username: str,
        ip: str | None = None,
        agente: str | None = None,
        usuario_id: uuid.UUID | None = None,
        exito: bool = True,
    ) -> None:
        """Registra un intento de acceso (login). No propaga errores."""
        try:
            log = LogAcceso(
                username=(username or "")[:150],
                ip=ip,
                agente=(agente or "")[:512] or None,
                usuario_id=usuario_id,
                exito=exito,
            )
            db.add(log)
            db.commit()
        except Exception:
            db.rollback()

    def registrar_accion(
        self,
        db: Session,
        *,
        detalle: str,
        usuario_id: uuid.UUID | None = None,
        usuario_nombre: str | None = None,
        username: str | None = None,
        modulo: str | None = None,
        accion: str | None = None,
        ip: str | None = None,
    ) -> None:
        """
        Registra una acción de auditoría. Método global reutilizable por todos
        los endpoints ABM / operaciones sensibles. No propaga errores.
        """
        try:
            log = LogAccion(
                detalle=detalle,
                usuario_id=usuario_id,
                usuario_nombre=usuario_nombre,
                username=username,
                modulo=modulo,
                accion=accion,
                ip=ip,
            )
            db.add(log)
            db.commit()
        except Exception:
            db.rollback()

    # ─────────────────── Listados (lectura) ───────────────────

    def listar_accesos(
        self, db: Session,
        desde: date | None = None, hasta: date | None = None,
        usuario: str | None = None, page: int = 1, size: int = 20,
    ) -> dict:
        query: Query = db.query(LogAcceso)
        query = self._aplicar_rango_fecha(query, LogAcceso, desde, hasta)
        if usuario:
            query = query.filter(LogAcceso.username.ilike(f"%{usuario}%"))
        return paginate(query.order_by(LogAcceso.created_at.desc()), page, size)

    def listar_acciones(
        self, db: Session,
        desde: date | None = None, hasta: date | None = None,
        usuario: str | None = None, page: int = 1, size: int = 20,
    ) -> dict:
        query: Query = db.query(LogAccion)
        query = self._aplicar_rango_fecha(query, LogAccion, desde, hasta)
        if usuario:
            like = f"%{usuario}%"
            query = query.filter(or_(
                LogAccion.username.ilike(like),
                LogAccion.usuario_nombre.ilike(like),
            ))
        return paginate(query.order_by(LogAccion.created_at.desc()), page, size)

    # ─────────────────── helpers ───────────────────

    def _aplicar_rango_fecha(self, query: Query, model, desde: date | None, hasta: date | None) -> Query:
        if desde:
            query = query.filter(model.created_at >= datetime.combine(desde, time.min))
        if hasta:
            # `hasta` inclusive: hasta el final del día indicado.
            query = query.filter(model.created_at <= datetime.combine(hasta, time.max))
        return query


auditoria_service = AuditoriaService()
