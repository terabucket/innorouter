from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # SQLite by default. See .env.example for MySQL / PostgreSQL connection strings.
    database_url: str = f"sqlite:///{BACKEND_DIR / 'innoroutes.db'}"
    secret_key: str = "change-me"
    access_token_minutes: int = 12 * 60
    cors_origins: str = "http://localhost:5173"

    scheduler_enabled: bool = True
    default_poll_interval: int = 30
    raw_retention_days: int = 8
    hourly_retention_days: int = 400

    seed_admin_username: str = "admin"
    seed_admin_password: str = ""
    seed_usr_password: str = ""
    seed_huawei_password: str = ""


settings = Settings()
