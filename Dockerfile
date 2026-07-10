# Emly Prediction Agent - Lightweight Python Backend Only
# PostgreSQL should be provided externally with pgvector extension installed

# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build production bundle
RUN npm run build

# Stage 2: Main application (Python only)
FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    # Application environment
    APP_HOST=0.0.0.0 \
    APP_PORT=8000 \
    # UV package manager
    UV_SYSTEM_PYTHON=1

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # PostgreSQL client library (for psycopg2)
    libpq-dev \
    # General utilities
    curl \
    && rm -rf /var/lib/apt/lists/*
    

# Install uv package manager
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies using uv
RUN uv pip install -r requirements.txt

# Copy application code
COPY app/ ./app/

# Copy built frontend from builder stage
COPY --from=frontend-builder /frontend/dist ./static/

# Create necessary directories
RUN mkdir -p /app/uploads /app/data

# Expose port (8000=API serving both backend and frontend)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start uvicorn directly
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
