"""libro.sinopsis

Revision ID: 5b2ff8752468
Revises: 7162bb1f3a36
Create Date: 2026-10-14 01:59:43.446158
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b2ff8752468'
down_revision: Union[str, None] = '7162bb1f3a36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sinopsis del libro. El drift de índice/constraint del ISBN que detecta el
    # autogenerate es preexistente y ajeno a este cambio; no se toca acá.
    op.add_column('libros', sa.Column('sinopsis', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('libros', 'sinopsis')
