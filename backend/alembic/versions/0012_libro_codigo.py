"""libro.codigo (identificador interno único autogenerado)

Revision ID: 0012_libro_codigo
Revises: d11568a5ac77
Create Date: 2026-11-11

Agrega la columna `codigo` a `libros`: identificador legible y único (formato
"L-000123"). Crea una secuencia Postgres (`libro_codigo_seq`) que el service usa
para generar el próximo código en cada alta, hace backfill de los libros ya
existentes por orden de alta y recién entonces marca la columna NOT NULL + única.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012_libro_codigo'
down_revision: Union[str, None] = 'd11568a5ac77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('libros', sa.Column('codigo', sa.String(length=12), nullable=True))

    # Secuencia usada tanto por el backfill como por el runtime (generar_codigo_libro).
    op.execute("CREATE SEQUENCE IF NOT EXISTS libro_codigo_seq")

    # Backfill: numera los libros existentes por orden de alta (created_at, id).
    op.execute(
        """
        WITH ordenados AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM libros
        )
        UPDATE libros
        SET codigo = 'L-' || LPAD(ordenados.rn::text, 6, '0')
        FROM ordenados
        WHERE libros.id = ordenados.id
        """
    )

    # Deja la secuencia lista para el próximo alta: nextval = cantidad_actual + 1
    # (o 1 si la tabla está vacía).
    op.execute(
        """
        SELECT setval(
            'libro_codigo_seq',
            GREATEST((SELECT COUNT(*) FROM libros), 1),
            (SELECT COUNT(*) FROM libros) > 0
        )
        """
    )

    op.alter_column('libros', 'codigo', nullable=False)
    op.create_index('ix_libros_codigo', 'libros', ['codigo'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_libros_codigo', table_name='libros')
    op.drop_column('libros', 'codigo')
    op.execute("DROP SEQUENCE IF EXISTS libro_codigo_seq")
