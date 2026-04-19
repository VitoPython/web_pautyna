from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Pavutyna API"
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"
    # Used to build URLs that external services (Unipile webhooks, OAuth
    # redirects) call back to. In prod set to the public HTTPS origin.
    PUBLIC_URL: str = "http://localhost"
    ENVIRONMENT: str = "dev"  # dev | prod

    # MongoDB
    MONGODB_URI: str = "mongodb://mongodb:27017"
    MONGODB_DB_NAME: str = "pavutyna"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24 * 7  # 7 days

    # Cookie — True in production so browsers only send it over HTTPS.
    COOKIE_SECURE: bool = False

    # CORS — comma-separated origins allowed to hit the API. In prod this
    # must be the public URL only; "*" is reserved for local dev.
    CORS_ORIGINS: str = "*"

    # Telegram
    TELEGRAM_API_ID: int = 0
    TELEGRAM_API_HASH: str = ""

    # Unipile
    UNIPILE_API_KEY: str = ""
    UNIPILE_DSN: str = ""
    UNIPILE_WEBHOOK_SECRET: str = ""  # HMAC-SHA256 secret for incoming webhook verification

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # Stripe
    STRIPE_SECRET_KEY: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

# Fail-fast in production — refuse to boot with the default JWT secret.
# This prevents accidentally shipping a server anyone can forge tokens for.
if settings.ENVIRONMENT == "prod":
    if settings.JWT_SECRET == "change-me-in-production" or len(settings.JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET must be a random 32+ char string in production. "
            "Generate with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    if not settings.PUBLIC_URL.startswith("https://"):
        raise RuntimeError(
            f"PUBLIC_URL must be https:// in production (got {settings.PUBLIC_URL!r})"
        )
