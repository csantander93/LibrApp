"""estante.coleccion_id

Revision ID: 7162bb1f3a36
Revises: 0010_roles_permisos
Create Date: 2026-10-14 01:33:48.380303
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7162bb1f3a36'
down_revision: Union[str, None] = '0010_roles_permisos'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Categoría del estante (reusa colecciones — RN-10). Las diferencias de índice/
    # constraint del ISBN que detecta el autogenerate son drift preexistente ajeno a
    # este cambio; no se tocan acá.
    op.add_column('estantes', sa.Column('coleccion_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_estantes_coleccion_id', 'estantes', 'colecciones',
        ['coleccion_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_estantes_coleccion_id', 'estantes', type_='foreignkey')
    op.drop_column('estantes', 'coleccion_id')
