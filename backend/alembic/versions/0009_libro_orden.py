"""Orden manual de libros dentro del nivel/estante.

Agrega `libros.orden` (entero, default 0) para persistir el reordenamiento por
drag & drop de los lomos en el mapa (RF-01/RF-03). El listado ordena por
(orden, titulo) para respetar la secuencia elegida.

Revision ID: 0009_libro_orden
Revises: 0008_textura_zona
Create Date: 2026-09-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_libro_orden"
down_revision: Union[str, None] = "0008_textura_zona"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "libros",
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("libros", "orden")
