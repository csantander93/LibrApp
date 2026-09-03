from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.auth.router import router as auth_router
from app.modules.catalogo.router import router as catalogo_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.configuracion.router import router as configuracion_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed idempotente (admin + datos demo). En dev corre siempre; en prod solo
    # si RUN_SEED_ON_STARTUP=true. El esquema lo maneja Alembic (db_migrate.py).
    if settings.ENV == "development" or settings.RUN_SEED_ON_STARTUP:
        from app.seed import bootstrap_dev
        bootstrap_dev()
    yield


_ES_DEV = settings.ENV == "development"

# Swagger/OpenAPI solo en dev.
app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs" if _ES_DEV else None,
    redoc_url="/redoc" if _ES_DEV else None,
    openapi_url="/openapi.json" if _ES_DEV else None,
    lifespan=lifespan,
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if not _ES_DEV:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response


# Con "*" el navegador ignora credenciales; la app usa Bearer token, no cookies.
_cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(catalogo_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(configuracion_router, prefix=API_PREFIX)


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "app": settings.APP_NAME}
