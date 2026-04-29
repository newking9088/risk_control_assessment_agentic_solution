from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_env: str = "dev"
    log_level: str = "INFO"
    secret_key: str = "change-me"

    # Database
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/appdb"
    db_schema: str = "app"
    db_pool_min: int = 3
    db_pool_max: int = 10

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    auth_service_url: str = "http://localhost:8001"

    # CORS
    cors_allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    # LLM
    openai_api_key: str = ""
    openai_api_url: str = "https://api.openai.com"
    openai_model: str = "gpt-4o"
    openai_temperature: float = 0.2

    # Blob storage
    blob_provider: str = "local"
    local_blob_path: str = "./data/blobs"
    azure_storage_connection_string: str = ""
    azure_blob_container: str = "rca-documents"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket: str = "rca-documents"

    # Embeddings
    embedding_model: str = "paraphrase-MiniLM-L6-v2"
    embedding_dim: int = 384
    chunk_size: int = 512
    chunk_overlap: int = 64

    # Feature flags
    enable_metrics: bool = False
    multi_tenant_enabled: bool = False
    enable_docs: bool = True

    # Rate limiting
    rate_limit_default: str = "100/minute"
    rate_limit_llm: str = "20/minute"

    # Session store
    session_store_path: str = "/tmp/rca_sessions.db"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
