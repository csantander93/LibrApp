"""Roles dinámicos con permisos + FK usuarios.rol_id (reemplaza el enum rol).

Crea la tabla `roles`, siembra el rol de sistema "Administrador" (acceso total),
agrega `usuarios.rol_id` apuntando a ese rol para los usuarios existentes y
elimina la vieja columna enum `usuarios.rol` (y su tipo `rol_enum`).

Revision ID: 0010_roles_permisos
Revises: 0009_libro_orden
Create Date: 2026-09-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0010_roles_permisos"
down_revision: Union[str, None] = "0009_libro_orden"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# UUID fijo del rol Administrador (así el backfill y el seed lo referencian igual).
ADMIN_ROL_ID = "0a1b2c3d-0010-4000-8000-000000000001"


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=50), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=True),
        sa.Column("permisos", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("es_sistema", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_roles_nombre", "roles", ["nombre"], unique=True)

    # Rol de sistema con acceso total (comodín "*").
    op.execute(
        sa.text(
            "INSERT INTO roles (id, nombre, descripcion, permisos, es_sistema, created_at, updated_at) "
            "VALUES (CAST(:id AS uuid), 'Administrador', 'Acceso total al sistema.', "
            "CAST('[\"*\"]' AS jsonb), true, now(), now())"
        ).bindparams(id=ADMIN_ROL_ID)
    )

    # rol_id: se agrega nullable, se rellena con el rol Administrador y recién ahí
    # se vuelve NOT NULL (los usuarios existentes eran todos admin).
    op.add_column("usuarios", sa.Column("rol_id", sa.Uuid(), nullable=True))
    op.execute(sa.text("UPDATE usuarios SET rol_id = CAST(:id AS uuid)").bindparams(id=ADMIN_ROL_ID))
    op.alter_column("usuarios", "rol_id", nullable=False)
    op.create_index("ix_usuarios_rol_id", "usuarios", ["rol_id"])
    op.create_foreign_key(
        "fk_usuarios_rol_id", "usuarios", "roles", ["rol_id"], ["id"], ondelete="RESTRICT",
    )

    # Fuera el viejo enum.
    op.drop_column("usuarios", "rol")
    op.execute("DROP TYPE IF EXISTS rol_enum")


def downgrade() -> None:
    rol_enum = postgresql.ENUM("admin", "publico", name="rol_enum")
    rol_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "usuarios",
        sa.Column("rol", rol_enum, nullable=False, server_default="admin"),
    )
    op.drop_constraint("fk_usuarios_rol_id", "usuarios", type_="foreignkey")
    op.drop_index("ix_usuarios_rol_id", table_name="usuarios")
    op.drop_column("usuarios", "rol_id")
    op.drop_index("ix_roles_nombre", table_name="roles")
    op.drop_table("roles")
