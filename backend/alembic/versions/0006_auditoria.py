"""Módulo de auditoría: logs de accesos (login) y de acciones (ABM).

Registra quién hizo qué, cuándo y desde qué IP en el panel admin (accesos y
altas/bajas/modificaciones). Tomado de Operix y simplificado a single-tenant.

Revision ID: 0006_auditoria
Revises: 0005_rotacion_estante
Create Date: 2026-09-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_auditoria"
down_revision: Union[str, None] = "0005_rotacion_estante"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "log_accesos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=True),
        sa.Column("username", sa.String(length=150), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("agente", sa.String(length=512), nullable=True),
        sa.Column("exito", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_log_accesos_usuario_id", "log_accesos", ["usuario_id"])
    op.create_index("ix_log_accesos_username", "log_accesos", ["username"])

    op.create_table(
        "log_acciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=True),
        sa.Column("usuario_nombre", sa.String(length=150), nullable=True),
        sa.Column("username", sa.String(length=150), nullable=True),
        sa.Column("detalle", sa.Text(), nullable=False),
        sa.Column("modulo", sa.String(length=100), nullable=True),
        sa.Column("accion", sa.String(length=50), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_log_acciones_usuario_id", "log_acciones", ["usuario_id"])
    op.create_index("ix_log_acciones_username", "log_acciones", ["username"])
    op.create_index("ix_log_acciones_modulo", "log_acciones", ["modulo"])


def downgrade() -> None:
    op.drop_index("ix_log_acciones_modulo", table_name="log_acciones")
    op.drop_index("ix_log_acciones_username", table_name="log_acciones")
    op.drop_index("ix_log_acciones_usuario_id", table_name="log_acciones")
    op.drop_table("log_acciones")
    op.drop_index("ix_log_accesos_username", table_name="log_accesos")
    op.drop_index("ix_log_accesos_usuario_id", table_name="log_accesos")
    op.drop_table("log_accesos")
