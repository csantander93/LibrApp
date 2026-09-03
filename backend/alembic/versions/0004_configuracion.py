"""Tabla de configuración (fila única / singleton).

Ajustes generales de la app editables desde el panel admin. Primer ajuste:
isbn_obligatorio (RN-01/RN-02). Se inserta la fila por defecto (obligatorio=true).

Revision ID: 0004_configuracion
Revises: 0003_niveles
Create Date: 2026-09-02
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_configuracion"
down_revision: Union[str, None] = "0003_niveles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "configuracion",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("isbn_obligatorio", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Fila única inicial (ISBN obligatorio por defecto).
    op.get_bind().execute(
        sa.text("INSERT INTO configuracion (id, isbn_obligatorio) VALUES (:id, true)"),
        {"id": uuid.uuid4()},
    )


def downgrade() -> None:
    op.drop_table("configuracion")
