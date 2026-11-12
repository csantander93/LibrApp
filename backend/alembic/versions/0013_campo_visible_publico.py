"""campo_libro.visible_publico

Visibilidad de cada campo personalizado en la autoconsulta pública (RF-07/RF-08):
True = se muestra al público; False = campo interno del negocio, solo en el panel
admin. Los campos ya existentes quedan visibles (server_default="true").

Revision ID: 0013_campo_visible_publico
Revises: 0012_libro_codigo
Create Date: 2026-11-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0013_campo_visible_publico"
down_revision: Union[str, None] = "0012_libro_codigo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "campos_libro",
        sa.Column(
            "visible_publico",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("campos_libro", "visible_publico")
