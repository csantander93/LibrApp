import logging
from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings

# Secretos placeholder que NUNCA deben quedar en producción (bloquean el arranque).
_JWT_SECRETS_DEBILES = {"", "changeme-jwt-secret", "changeme", "secret"}


class Settings(BaseSettings):
    APP_NAME: str = "LibrApp"
    ENV: str = "development"
    DEBUG: bool = True

    # Orígenes permitidos por CORS. En dev alcanza con "*"; en producción hay que
    # listar el/los dominios del frontend separados por coma.
    CORS_ORIGINS: str = "*"

    # Ejecuta el seed (admin + datos demo) al arrancar. En dev ya corre por
    # ENV=development; este flag lo habilita en prod para el primer despliegue.
    RUN_SEED_ON_STARTUP: bool = False

    # Base de datos
    DATABASE_URL: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Credenciales del administrador inicial (seed idempotente).
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "Admin1234!"

    # ── Respaldo a Google Drive (módulo configuracion/backup.py) ──
    # Cliente OAuth "Aplicación web" de la app (lo crea el dev una vez en Google
    # Cloud Console, scope drive.file). El refresh token del usuario NO va acá:
    # lo setea el flujo OAuth desde la UI y vive en la tabla backup_config.
    GDRIVE_CLIENT_ID: str = ""
    GDRIVE_CLIENT_SECRET: str = ""
    # Callback del OAuth. DEBE coincidir con el redirect URI registrado en Google.
    BACKUP_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/v1/configuracion/backup/oauth/callback"
    # A dónde vuelve el navegador tras el callback. Vacío = redirect relativo
    # (prod, SPA same-origin). En dev el front corre en otro puerto (5175).
    FRONTEND_URL: str = ""

    @property
    def gdrive_configurado(self) -> bool:
        """True si el cliente OAuth de la app está cargado (sin esto no se puede
        iniciar la conexión con Drive)."""
        return bool(self.GDRIVE_CLIENT_ID and self.GDRIVE_CLIENT_SECRET)

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS ("a,b,c" o "*") como lista, sin espacios ni vacíos."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _endurecer_produccion(self):
        """En producción, falla cerrado si el secreto JWT quedó en un placeholder:
        con HS256 un secreto conocido permite forjar cualquier token."""
        if self.ENV != "development":
            log = logging.getLogger("librapp.config")
            if self.JWT_SECRET_KEY in _JWT_SECRETS_DEBILES:
                raise ValueError(
                    "JWT_SECRET_KEY es un placeholder en producción. Generá uno "
                    "aleatorio (openssl rand -hex 32) y cargalo como variable del entorno."
                )
            if len(self.JWT_SECRET_KEY) < 32:
                log.warning("JWT_SECRET_KEY corto (<32 chars) en producción.")
            if self.cors_origins_list == ["*"]:
                log.warning("CORS_ORIGINS='*' en producción: restringí a los dominios del frontend.")
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
