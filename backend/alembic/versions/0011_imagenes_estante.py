"""Fotos de referencia de estantes — opcionales.

Cada estante puede tener 0..N fotos reales (vistas de la sala). El binario se
guarda en la propia DB (columna diferida en el modelo) y se sirve por endpoint.
`orden` define la posición en la galería. Mismo esquema que `imagenes_libro`.

Revision ID: 0011_imagenes_estante
Revises: 5b2ff8752468
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_imagenes_estante"
down_revision: Union[str, None] = "5b2ff8752468"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "imagenes_estante",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("estante_id", sa.Uuid(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("contenido", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["estante_id"], ["estantes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_imagenes_estante_estante_id", "imagenes_estante", ["estante_id"])


def downgrade() -> None:
    op.drop_index("ix_imagenes_estante_estante_id", table_name="imagenes_estante")
    op.drop_table("imagenes_estante")
