from pydantic import BaseModel, ConfigDict


class ConfiguracionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    isbn_obligatorio: bool


class ConfiguracionUpdate(BaseModel):
    # Edición parcial: solo se aplican los campos presentes.
    isbn_obligatorio: bool | None = None
