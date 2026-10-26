from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    # Ограничения длины — чтобы нельзя было заставить сервер хэшировать мегабайтные строки
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=200)


class PasswordChanged(Token):
    """После смены пароля старые сессии закрываются — возвращаем новый токен для текущей."""

    message: str = "Пароль изменён"
