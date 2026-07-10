
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def get_int_env(key: str, default: int) -> int:
    """Safely get integer from environment variable, handling empty strings."""
    value = os.getenv(key)
    if value is None or value.strip() == "":
        return default
    return int(value)

# Database Configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = get_int_env("DB_PORT", 5432)
DB_NAME = os.getenv("DB_NAME", os.getenv("POSTGRES_DB", "vectordb"))
DB_USER = os.getenv("POSTGRES_USER", "vectoruser")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "vectorpass")
DB_CONNECTION_STRING = os.getenv(
    "DB_CONNECTION_STRING",
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# LLM Configuration (EMLY = LLM)
EMLY_SOURCE = os.getenv("EMLY_SOURCE", "openai")  # openai, google, anthropic, ollama
EMLY_MODEL = os.getenv("EMLY_MODEL", "gpt-4o-mini")  # LLM chat model
EMLY_KEY = os.getenv("EMLY_KEY", "")

# LLM URL - Custom base URL (e.g., for OpenAI-compatible APIs, vLLM, LocalAI, etc.)
# If None/empty, use default provider URLs
LLM_URL = os.getenv("LLM_URL", None)

# Ollama specific (used when EMLY_SOURCE=ollama)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Embedding Configuration
EMBEDDING_SOURCE = os.getenv("EMBEDDING_SOURCE", "huggingface")  # huggingface, openai, google, anthropic, ollama
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")  # Embedding model
EMBEDDING_KEY = os.getenv("EMBEDDING_KEY", "")  # Not needed for huggingface

# Vector Store Configuration
VECTOR_COLLECTION_NAME = os.getenv("VECTOR_COLLECTION_NAME", "documents")

# Chunking Configuration
CHUNK_SIZE = get_int_env("CHUNK_SIZE", 1000)
CHUNK_OVERLAP = get_int_env("CHUNK_OVERLAP", 200)

# Search Configuration
TOP_K = get_int_env("TOP_K", 5)
WEB_SEARCH_PROVIDER = os.getenv("WEB_SEARCH_PROVIDER", "duckduckgo")  # duckduckgo, serper, auto
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "ec2bf8a52d27561960fd27ef5599875ae4961b8d")

# Application Configuration
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = get_int_env("APP_PORT", 8000)
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# Frontend runtime configuration (served via backend API)
VITE_GOOGLE_MAPS_API_KEY = os.getenv("VITE_GOOGLE_MAPS_API_KEY", "")
VITE_GOOGLE_MAPS_MAP_ID = os.getenv("VITE_GOOGLE_MAPS_MAP_ID", "")
