# Deploy en Railway (servicio único)

LibrApp se despliega como **un solo servicio web** (FastAPI sirve la API y el frontend
ya compilado) + un **Postgres**. El `Dockerfile` de la raíz es multi-stage: Node compila
el SPA y Python lo sirve same-origin, así que no hay CORS ni URLs que cablear entre servicios.

## Pasos

1. **Railway → New Project → Add Postgres.** Railway crea la base y expone la variable
   `DATABASE_URL`.

2. **Add Service → GitHub Repo** (este repositorio). Railway detecta el `Dockerfile` de la
   raíz (reforzado por `railway.toml`) y construye la imagen.

3. En el servicio web → pestaña **Variables**, cargar:

   | Variable | Valor | Nota |
   |---|---|---|
   | `ENV` | `production` | Apaga `/docs`, activa HSTS y exige un JWT fuerte |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al plugin Postgres (se autocompleta) |
   | `JWT_SECRET_KEY` | *(ver abajo)* | **Obligatorio**: con placeholder el arranque falla en prod |
   | `RUN_SEED_ON_STARTUP` | `true` | Siembra en el 1er deploy (idempotente) |
   | `ADMIN_USERNAME` | `admin` | Opcional (default `admin`) |
   | `ADMIN_PASSWORD` | `Admin1234!` | Opcional (default `Admin1234!`) |
   | `CORS_ORIGINS` | `*` | Same-origin ⇒ CORS irrelevante; sólo emite un warning |

   Generar el `JWT_SECRET_KEY` (aleatorio, ≥32 chars):

   ```bash
   openssl rand -hex 32
   ```

4. **Deploy.** Al arrancar, `scripts/start.sh` corre las migraciones Alembic
   (`db_migrate.py`) y luego el `lifespan` ejecuta el seed: **3 administradores**
   (`admin`, `admin2`, `admin3` — todos rol *Administrador*, clave `Admin1234!`) y el catálogo
   demo (2 zonas, 5 categorías, 5 estantes con 3 niveles c/u, ~96 libros, anotaciones de mapa).

5. **Verificar**: abrir la URL pública que asigna Railway.
   - `/` → autoconsulta pública.
   - `/login` → entrar con `admin` / `Admin1234!` (o `admin2` / `admin3`).

6. **(Opcional)** Tras el primer deploy, poner `RUN_SEED_ON_STARTUP=false` para no reejecutar
   el seed en cada reinicio (es idempotente, pero no hace falta).

## Notas

- El puerto lo inyecta Railway (`$PORT`); `start.sh` lo respeta. No hace falta configurarlo.
- `DATABASE_URL` puede venir como `postgres://…`; la app lo normaliza a `postgresql://…`.
- `VITE_API_URL` **no** es variable del servicio: se fija a `/api/v1` en build-time dentro del
  `Dockerfile`, para que el SPA pegue a la API del mismo origen.
- El flujo de **desarrollo** no cambia: `docker compose up --build` sigue levantando db +
  backend + frontend por separado.
