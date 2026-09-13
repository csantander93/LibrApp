"""
Paginación reutilizable para listados (tomada de Operix, simplificada).

Uso en un service:
    return paginate(query.order_by(LogAccion.created_at.desc()), page, size)
"""
from math import ceil
from typing import Generic, TypeVar
from pydantic import BaseModel
from sqlalchemy.orm import Query

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


def paginate(query: Query, page: int = 1, size: int = 20) -> dict:
    """
    Ejecuta la query paginada y devuelve un dict compatible con `Page`.
    Devolvemos las entidades ORM crudas; FastAPI las serializa vía el
    `response_model=Page[XxxResponse]` del endpoint.
    """
    page = max(page, 1)
    size = max(min(size, 500), 1)

    total = query.order_by(None).count()
    items = query.offset((page - 1) * size).limit(size).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": ceil(total / size) if total else 0,
    }
