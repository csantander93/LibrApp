import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class LogAccesoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    usuario_id: uuid.UUID | None
    username: str
    ip: str | None
    agente: str | None
    exito: bool
    fecha: datetime


class LogAccionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    usuario_id: uuid.UUID | None
    usuario_nombre: str | None
    username: str | None
    detalle: str
    modulo: str | None
    accion: str | None
    ip: str | None
    fecha: datetime
