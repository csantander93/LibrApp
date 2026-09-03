"""Niveles ("pisos") por estante + libros.nivel_id.

Cada estante puede tener múltiples niveles (1..N, abajo→arriba). Un libro se
ubica en un nivel. Data-migration: crea un "Nivel 1" por cada estante existente
y mueve todos sus libros a ese nivel (RF-02).

Revision ID: 0003_niveles
Revises: 0002_color_y_anotaciones
Create Date: 2026-09-02
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_niveles"
down_revision: Union[str, None] = "0002_color_y_anotaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Tabla niveles ───────────────────────────────────────────────────────────
    op.create_table(
        "niveles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("estante_id", sa.Uuid(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("etiqueta", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["estante_id"], ["estantes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("estante_id", "numero", name="uq_nivel_estante_numero"),
    )
    op.create_index("ix_niveles_estante_id", "niveles", ["estante_id"])

    # ── libros.nivel_id ─────────────────────────────────────────────────────────
    op.add_column("libros", sa.Column("nivel_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_libros_nivel_id", "libros", "niveles",
        ["nivel_id"], ["id"], ondelete="SET NULL",
    )

    # ── Data migration: Nivel 1 por estante + reasignar libros ──────────────────
    bind = op.get_bind()
    estantes = bind.execute(sa.text("SELECT id FROM estantes")).fetchall()
    for (estante_id,) in estantes:
        nivel_id = uuid.uuid4()
        bind.execute(
            sa.text(
                "INSERT INTO niveles (id, estante_id, numero, etiqueta) "
                "VALUES (:id, :estante_id, 1, NULL)"
            ),
            {"id": nivel_id, "estante_id": estante_id},
        )
        bind.execute(
            sa.text("UPDATE libros SET nivel_id = :nivel_id WHERE estante_id = :estante_id"),
            {"nivel_id": nivel_id, "estante_id": estante_id},
        )


def downgrade() -> None:
    op.drop_constraint("fk_libros_nivel_id", "libros", type_="foreignkey")
    op.drop_column("libros", "nivel_id")
    op.drop_index("ix_niveles_estante_id", table_name="niveles")
    op.drop_table("niveles")
