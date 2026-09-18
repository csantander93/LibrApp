# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

App web de **localización de libros** para la Librería Rodolfo Walsh (UNLa): un catálogo
bibliográfico vinculado a un **mapa 2D de estantes**, con una **vista pública sin login**
(autoconsulta) y un **panel admin con JWT**. Fuera de alcance explícito: stock, facturación,
remitos.

La **fuente de verdad de los requerimientos** son los PDFs en `../inicio de proyecto/`
(Análisis Funcional con IDs RF-xx / RNF-xx / RN-xx / CU-xx, e informe del TFI). El código
referencia esos IDs en comentarios; al implementar, respetá las reglas de negocio (RN-*).

## Comandos

```bash
docker compose up --build          # levantar todo (primera vez / tras cambiar deps)
docker compose up -d                # levantar en background
docker compose up -d backend        # recrear solo backend (+ db)
docker compose logs -f backend      # ver logs
docker compose down                 # bajar  (agregar -v para BORRAR la DB y re-seedear)

# Typecheck del frontend (Vite NO chequea tipos; esto es lo que los caza):
docker compose exec -T frontend npx tsc --noEmit

# Migraciones Alembic (autogenerate dentro del contenedor):
docker compose exec backend alembic revision --autogenerate -m "descripcion"
docker compose exec backend alembic upgrade head   # el arranque ya corre esto
```

No hay suite de tests todavía. El backend recarga solo (`uvicorn --reload`) y el frontend
también (Vite HMR con polling). Tras editar código no hace falta reconstruir la imagen,
salvo que cambien `requirements.txt` o `package.json`.

### Puertos (conviven con el proyecto Operix en la misma máquina)

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5175  (host 5175 → contenedor 5173) |
| Backend  | http://localhost:8000  · Swagger en `/docs` |
| Postgres | localhost:5434 |

Credenciales admin (seed): **admin / Admin1234!** (en `backend/.env` → `ADMIN_USERNAME`/`ADMIN_PASSWORD`).
`RUN_SEED_ON_STARTUP=true` en el `.env` fuerza el seed en producción (fuera de `ENV=development`).

## Arquitectura

Monorepo `backend/` (FastAPI) + `frontend/` (React+Vite), orquestado por `docker-compose.yml`
(db + backend + frontend). Convenciones tomadas del proyecto **Operix** (`../../Cris/Operix Pro V 1/Operix`)
pero **simplificadas**: sin multi-tenancy, sin Celery/Redis, sin mails.

### Backend (`backend/app`)
- **Modular por feature**: `modules/<x>/{models,schemas,router,service}.py`. La lógica de
  negocio vive en `service.py`; el router es fino. Casi todo el dominio está en el módulo
  `catalogo` (libros, estantes, zonas, colecciones, importador). Otros: `auth`, `dashboard`,
  `usuarios` (ABM de usuarios y roles), `configuracion`, `auditoria`.
- **Autorización por permisos** (RF-08): los roles son dinámicos (tabla `roles`, columna
  `permisos` JSONB) y cada usuario tiene un `rol_id`. El catálogo fijo de permisos vive en
  `auth/permisos.py` (una clave por sección: `catalogo.gestionar`, `estantes.gestionar`,
  `mapa.gestionar`, `importar.ejecutar`, `registros.ver`, `configuracion.editar`,
  `usuarios.gestionar`; el comodín `"*"` = acceso total del rol de sistema "Administrador").
  Las escrituras se protegen con `require_permiso(...)` / `audit_ctx(...)` de `core/deps.py`
  (reemplazaron al viejo `require_admin`). El catálogo mezcla 3 secciones, por eso usa
  `AUDIT`/`AUDIT_EST`/`AUDIT_MAPA`/`AUDIT_IMP` según el endpoint.
- `core/`: `config` (Pydantic Settings, lee `.env`), `database` (engine/SessionLocal/`get_db`),
  `security` (JWT + bcrypt), `deps` (`get_current_user`, `require_admin`).
- `shared/models.py`: `Base`, `UUIDMixin` (PK UUID generada en Python), `TimestampMixin`.
  `shared/exceptions.py`: `NotFoundError`/`ConflictError`/`UnauthorizedError`/`ForbiddenError`
  (HTTPException con mensajes en español; el service lanza estas, no arma HTTP a mano).
- **Esquema por Alembic** (`alembic/versions/`), NO por `create_all`. El seed (`app/seed.py`)
  solo inserta datos idempotentes (admin + zonas + colecciones + estantes + libros demo) y
  corre en el `lifespan` de `main.py` cuando `ENV=development`.
- Todas las rutas cuelgan de `API_PREFIX = /api/v1`.

### Frontend (`frontend/src`)
- `app/`: `App` → `providers` (QueryClient + BrowserRouter + `AuthProvider`) → `AppRoutes`.
- `modules/<x>/`: feature-first (`auth`, `dashboard`, `public`, `catalogo`, `mapa`,
  `configuracion`, `usuarios`, `auditoria`). Solo
  `auth` y `catalogo` tienen su propio `api.ts`; el módulo `mapa` importa de `catalogo/api.ts`
  y `dashboard`/`public` definen sus fetches inline. Al agregar una feature, agregá a
  `catalogo/api.ts` o creá un nuevo `api.ts` en el módulo según corresponda.
- `shared/`: `components/ui` (Button/Input/Select/Card/Modal), `AdminLayout` (sidebar),
  `ProtectedRoute` (guard de sesión). `types.ts` centraliza los tipos del dominio.
- `lib/api.ts`: instancia axios única. El token va en `localStorage` (`librapp_token`) y se
  inyecta como Bearer; un 401 lo limpia. La **base URL se deriva del host** (`window.location`)
  apuntando al :8000 — así funciona desde `localhost` o desde otro dispositivo en la red sin
  configurar nada. `VITE_API_URL` la overridea en prod.
- Alias `@/` → `src/`. Estado de servidor con **TanStack Query** (invalidar por `queryKey`).
- `lib/utils.ts`: `cn` (clsx+tailwind-merge), `colorEstante(estante, zonas)` (color derivado de
  zona si `estante.color` es null), `COLORES_ESTANTE` (paleta de swatches del editor de mapa).

### Rutas de la app

| Ruta | Descripción |
|---|---|
| `/` | Autoconsulta pública (RF-07) |
| `/login` | Login del administrador |
| `/admin` | Dashboard con KPIs |
| `/admin/catalogo` | ABM de libros (RF-04/RF-06/RF-09) |
| `/admin/estantes` | ABM de estantes (RF-02) |
| `/admin/mapa` | Editor de mapa 2D con drag & resize (RF-01/RF-10/RF-11) |
| `/admin/importar` | Importador Excel/CSV con dry-run (RF-05/CU-04) |
| `/admin/registros` | Registros de auditoría (permiso `registros.ver`) |
| `/admin/configuracion` | Ajustes + pestañas **Usuarios** y **Roles** (RF-08); las pestañas se muestran según permiso |

## Reglas de negocio clave (implementadas — no romper)

- **RN-01**: ISBN único entre libros (409 si se duplica).
- **RN-02**: título/autor/editorial obligatorios.
- **RN-04**: código de estante único por zona.
- **RN-05**: toda escritura (ABM, import, guardar posiciones) va detrás de `require_admin`.
  La lectura del catálogo es pública (vista de autoconsulta, RF-07).
- **RN-07/RN-09**: `estante_id` nulo = "Sin ubicar"; el import deja así lo que no matchea estante.
- **RN-08** (y análogo para zonas): no se puede eliminar un estante con libros, ni una zona
  con estantes (409 con mensaje explicativo).
- **Usuarios/roles** (módulo `usuarios`, gating con `usuarios.gestionar`): username único;
  no podés eliminar tu propia cuenta ni quitarte a vos mismo el permiso de gestión; siempre
  debe quedar ≥1 usuario activo con `usuarios.gestionar`; el rol de sistema ("Administrador",
  `es_sistema`) no se edita ni elimina; no se elimina un rol con usuarios asignados (409).

## Gotchas (aprendidos, ahorran tiempo)

- **Orden de rutas**: las rutas "literales" que comparten prefijo con una `/{id}` deben
  declararse ANTES (ej: `PUT /catalogo/estantes/posiciones` va antes de `/estantes/{estante_id}`,
  y `PUT /catalogo/anotaciones/posiciones` antes de `/anotaciones/{anotacion_id}`; si no
  "posiciones" se parsea como UUID → 422). Ídem `GET /roles/permisos` va antes de `/roles/{id}`.
- **Migrar ANTES de que recargue el seed**: al tocar un modelo, `uvicorn --reload` reinicia y el
  `lifespan` corre el seed, que consulta las columnas nuevas → si la migración aún no se aplicó,
  el arranque falla (`UndefinedColumn`). Aplicá `docker compose exec backend alembic upgrade head`
  y recién ahí reiniciá el backend (`docker compose restart backend`).
- **Importador** (`catalogo/importer.py`): tolera los CSV reales (fila de título antes del
  header, delimitador `;`, precios `$ 25.000,00`, columnas faltantes) y `.xlsx`. Deduplica por
  ISBN y, para las MUCHAS filas sin ISBN, por (título+editorial normalizados), así reimportar
  el mismo archivo **no duplica** el catálogo. Tiene modo `dry_run` (preview) → confirmar.
- **Mapa**: plano cenital, estantes y anotaciones en coordenadas % (0-100) sobre un canvas
  aspect 3/2. `MapaCanvas` (compartido admin/público) hace drag **y resize** (handle esquina SE)
  con pointer events, sin librería externa. Estantes: `color` propio o, si es null, uno derivado
  de la zona (`colorEstante` en `lib/utils`). **Anotaciones** (`AnotacionMapa`, tipo
  `texto`/`flecha` con `rotacion`) son marcas de referencia (ENTRADA, ESCALERA, VENTANA); CRUD en
  `catalogo`, se editan en el editor y se ven en público (solo lectura). Estantes y anotaciones se
  persisten con guardado **en lote** (`.../posiciones`); el alta/baja es inmediata pero se agrega
  a la copia local optimista para no perder cambios sin guardar.
- **Tailwind v4**: usar `4.1.12` (el `4.0.0` exacto tiene un bug de compilación). Config por
  `@tailwindcss/vite` + `@theme` en `index.css` (color de acento `--color-unla`, bordó UNLa).
- **`db_migrate.py`** necesita `PYTHONPATH=/app` (corre como script suelto; ya está en el
  `command` del compose).
- **Windows/shell**: subir archivos con acentos en el nombre vía curl/Bash FALLA (curl no abre
  la ruta) — copiar antes a nombre ASCII con PowerShell `Get-ChildItem`/`Copy-Item -LiteralPath`.
  Mandar acentos en `-d '{...}'` de curl los mal-codifica (no es bug de la API); para tests de
  API usar JSON vía `python urllib`, no curl.

## Al agregar una feature (patrón)

1. Backend: modelo → migración Alembic → schema (Pydantic) → service (lógica + reglas) →
   router (fino, `dependencies=[ADMIN]` si escribe) → incluir router en `main.py` si es módulo nuevo.
2. Frontend: en `modules/<feature>/` agregar funciones en `api.ts` + la página; registrar la
   ruta en `app/AppRoutes.tsx`; si va en el panel, sumar el ítem en `shared/components/AdminLayout.tsx`.
3. Invalidar las `queryKey` afectadas tras mutar (`libros`, `estantes`, `anotaciones`, `zonas`, `dashboard`).
