"""busqueda inteligente de libros (documento materializado + trigram)

Buscador tolerante a acentos / typos / sinónimos para la autoconsulta pública
(RF-07 / CU-01). Agrega:
  - extensiones `pg_trgm` (similitud trigram) y `unaccent` (backfill sin acentos),
  - columna materializada `libros.busqueda` (texto normalizado: minúsculas + sin
    acentos, concatenando titulo+autor+editorial+isbn+codigo+sinopsis),
  - índice GIN `gin_trgm_ops` que acelera el `LIKE '%...%'` y el operador `<%`.

El documento se mantiene desde el service (crear/editar/importar/seed); este
backfill inicial usa `unaccent()` para poblar las filas ya existentes.

Revision ID: 0014_busqueda_libros
Revises: 0013_campo_visible_publico
Create Date: 2026-11-12 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0014_busqueda_libros"
down_revision: Union[str, None] = "0013_campo_visible_publico"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.add_column("libros", sa.Column("busqueda", sa.Text(), nullable=True))
    # Backfill de las filas existentes. `concat_ws` ignora los NULL (isbn/sinopsis).
    op.execute(
        """
        UPDATE libros SET busqueda = lower(unaccent(concat_ws(' ',
            titulo, autor, editorial, isbn, codigo, sinopsis)))
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_libros_busqueda_trgm "
        "ON libros USING gin (busqueda gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_libros_busqueda_trgm")
    op.drop_column("libros", "busqueda")
