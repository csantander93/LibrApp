"""Textura de piso por zona en el mapa.

Permite elegir el aspecto del plano de cada zona (parquet, baldosa, cemento,
madera) o la grilla por defecto. Solo estética del mapa 2D (RF-01/RF-11).

Revision ID: 0008_textura_zona
Revises: 95af4396bdae
Create Date: 2026-09-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_textura_zona"
down_revision: Union[str, None] = "95af4396bdae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("zonas", sa.Column("textura", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("zonas", "textura")
