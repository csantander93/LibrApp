"""Giro ("rotacion") de los estantes en el mapa.

Permite girar un estante manualmente desde el editor sin cambiar su tamaño
(RF-10 / CU-05). Análogo a la rotación que ya tenían las anotaciones.

Revision ID: 0005_rotacion_estante
Revises: 0004_configuracion
Create Date: 2026-09-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_rotacion_estante"
down_revision: Union[str, None] = "0004_configuracion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "estantes",
        sa.Column("rotacion", sa.Numeric(6, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("estantes", "rotacion")
