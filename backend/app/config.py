from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Motman FX Reference Index"
    api_prefix: str = "/api/v1"
    use_demo_market: bool = True
    enable_live_binance: bool = False
    cors_origins: str = "*"
    telegram_bot_token: str = ""
    database_url: str = "sqlite+aiosqlite:///./motman.db"
    stale_seconds_default: int = 120
    paid_ranking_forbidden: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()