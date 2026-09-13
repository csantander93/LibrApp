"""Imágenes de libros (portada u otras vistas) — opcionales.

Cada libro puede tener 0..N imágenes. El binario se guarda en la propia DB
(columna diferida en el modelo) y se sirve por endpoint público. `orden` define
la posición en la galería; la de menor `orden` es la portada/principal.

Revision ID: 0007_imagenes_libro
Revises: 0006_auditoria
Create Date: 2026-09-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_imagenes_libro"
down_revision: Union[str, None] = "0006_auditoria"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "imagenes_libro",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("libro_id", sa.Uuid(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("contenido", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["libro_id"], ["libros.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_imagenes_libro_libro_id", "imagenes_libro", ["libro_id"])


def downgrade() -> None:
    op.drop_index("ix_imagenes_libro_libro_id", table_name="imagenes_libro")
    op.drop_table("imagenes_libro")
