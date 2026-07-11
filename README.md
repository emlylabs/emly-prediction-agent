# Emly Prediction Agent

An AI-powered predictive analytics platform for non-technical users. Upload data, train machine learning models, and make predictions — all through a simple web interface.

## Features

- **Data Upload** — CSV, Excel, JSON, ZIP files with chunked upload and resume
- **Data Connectors** — Import from PostgreSQL, MySQL, SQLite, MSSQL, Oracle, SFTP
- **Data Preparation** — Interactive table editor with 40+ operations and AI copilot
- **Machine Learning** — 16 algorithms for regression, classification, and clustering
- **AutoML** — AI-powered model selection using natural language descriptions
- **Dashboards** — Build interactive charts and visualizations
- **Model Testing** — Batch predictions, one-by-one testing, and manual form input

## Quick Start (3 Steps)

### Prerequisites

- Python 3.10
- Node.js 18+
- PostgreSQL 14+ with pgvector extension

### Step 1: Set Up PostgreSQL

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
# Install PostgreSQL and pgvector
sudo apt install postgresql postgresql-15-pgvector

# Start PostgreSQL
sudo systemctl start postgresql

# Create database
sudo -u postgres psql -c "CREATE USER vectoruser WITH PASSWORD 'vectorpass';"
sudo -u postgres psql -c "CREATE DATABASE vectordb OWNER vectoruser;"
sudo -u postgres psql -d vectordb -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
</details>

<details>
<summary><b>macOS</b></summary>

```bash
# Install PostgreSQL (using Homebrew)
brew install postgresql@16
brew install pgvector

# Start PostgreSQL
brew services start postgresql@16

# Create database
psql postgres -c "CREATE USER vectoruser WITH PASSWORD 'vectorpass';"
psql postgres -c "CREATE DATABASE vectordb OWNER vectoruser;"
psql -d vectordb -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
</details>

<details>
<summary><b>Windows</b></summary>

1. Download and install [PostgreSQL 16](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) from the EDB installer. During installation:
   - Set the password for the `postgres` superuser (remember this password).
   - Keep the default port `5432`.

2. Install the pgvector extension:
   - Open **SQL Shell (psql)** from the Start Menu (or use `psql` from a terminal).
   - Connect to your database and run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - Alternatively, download the [pgvector Windows binaries](https://github.com/pgvector/pgvector#windows) and copy into your PostgreSQL installation.

3. Create the database and user:
   ```sql
   CREATE USER vectoruser WITH PASSWORD 'vectorpass';
   CREATE DATABASE vectordb OWNER vectoruser;
   \c vectordb
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
</details>

<details>
<summary><b>Docker (all platforms)</b></summary>

```bash
docker run -d --name emly-postgres \
  -e POSTGRES_USER=vectoruser \
  -e POSTGRES_PASSWORD=vectorpass \
  -e POSTGRES_DB=vectordb \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Enable pgvector extension
docker exec -it emly-postgres psql -U vectoruser -d vectordb \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
</details>

### Step 2: Configure Environment

Clone the repository, then copy `.env.sample` to `.env` and edit the `.env` file:

```bash
git clone https://github.com/emly/emly-prediction-agent.git
cd emly-prediction-agent
cp .env.sample .env
```

On **Windows (PowerShell)**:
```powershell
git clone https://github.com/emly/emly-prediction-agent.git
cd emly-prediction-agent
copy .env.sample .env
```

Edit `.env` with your settings:

```env
# Database (required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vectordb
POSTGRES_USER=vectoruser
POSTGRES_PASSWORD=vectorpass

# LLM (required for AI features: AutoML, Copilot)
EMLY_SOURCE=openai
EMLY_MODEL=gpt-4.1-mini
EMLY_KEY=sk-your-openai-api-key-here

# Optional: Custom LLM Base URL
# When LLM_URL is provided, the application connects to that URL using the
# OpenAI-compatible API format (works with LiteLLM, Ollama, vLLM, LocalAI, etc.).
# In this mode, EMLY_KEY and EMLY_MODEL must be valid for the target endpoint:
#   - EMLY_KEY = API key required by that endpoint (use "not-needed" if none required)
#   - EMLY_MODEL = model name served by that endpoint
# Example for Ollama running locally:
#   LLM_URL=http://localhost:11434/v1
#   EMLY_MODEL=llama3
#   EMLY_KEY=not-needed
# Example for LiteLLM proxy:
#   LLM_URL=http://your-litellm-server:4000
#   EMLY_MODEL=gpt-4o
#   EMLY_KEY=sk-your-litellm-key
LLM_URL=

# Embeddings (optional, for document vectorization)
EMBEDDING_SOURCE=huggingface
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### Step 3: Install and Run

<details>
<summary><b>Linux / macOS</b></summary>

```bash
# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Build the frontend (one-time)
cd frontend && npm ci && npm run build && cd ..

# Start the application
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file .env
```
</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
# Create Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install Python dependencies
pip install -r requirements.txt

# Build the frontend (one-time)
cd frontend; npm ci; npm run build; cd ..

# Start the application
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file .env
```

> **Note:** If you get a PowerShell execution policy error when activating the virtual environment, run:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
</details>

<details>
<summary><b>Windows (CMD)</b></summary>

```cmd
:: Create Python virtual environment
python -m venv .venv
.\.venv\Scripts\activate.bat

:: Install Python dependencies
pip install -r requirements.txt

:: Build the frontend (one-time)
cd frontend && npm ci && npm run build && cd ..

:: Start the application
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --env-file .env
```
</details>

Open your browser: **http://localhost:8000**

That's it. The frontend is served automatically by FastAPI — no separate dev server needed.



## Docker Deployment

```bash
# Build image
docker build -t emly-prediction-agent .

# Run container
docker run -d --name emly-app \
  -p 8080:8080 \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=vectordb \
  -e POSTGRES_USER=vectoruser \
  -e POSTGRES_PASSWORD=vectorpass \
  -e EMLY_SOURCE=openai \
  -e EMLY_MODEL=gpt-4.1-mini \
  -e EMLY_KEY=sk-your-key-here \
  -e LLM_URL=http://your-llm-endpoint/v1 \
  emly-prediction-agent
```

Access at **http://localhost:8080**

## Usage Guide

For detailed instructions on uploading data, training models, building dashboards, and more, see:

**[USER_GUIDE.md](USER_GUIDE.md)**

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, Peewee ORM, scikit-learn, mljar-supervised, LangChain |
| Frontend | React 18, Vite, Tailwind CSS, Radix UI, Recharts |
| Database | PostgreSQL with pgvector extension |
| LLM | OpenAI, Anthropic, Google Gemini, Ollama, LiteLLM, vLLM, LocalAI (any OpenAI-compatible endpoint) |

## Project Structure

```
predictive-agent/
├── app/
│   ├── main.py              # FastAPI entry point
│   ├── config.py             # Environment configuration
│   ├── routes/api.py         # REST API endpoints
│   ├── services/             # Business logic
│   │   ├── prediction_service.py   # ML training, inference, data prep
│   │   ├── automl_service.py       # AutoML with mljar
│   │   ├── llm_service.py          # LLM integration
│   │   └── vectorization.py        # Document vectorization
│   ├── connectors/           # Data source connectors
│   ├── models/               # Database models
│   └── migrations/           # Schema migrations
├── frontend/
│   └── src/
│       ├── App.jsx           # Main application
│       └── components/       # UI components
├── data/
│   ├── prediction/           # Uploaded datasets and trained models
│   └── automl/               # AutoML training results
├── .env                      # Environment configuration
├── requirements.txt          # Python dependencies
└── Dockerfile                # Container build
```

## API Reference

All endpoints are prefixed with `/emly/api/prediction`.

| Category | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| Datasets | GET | `/datasets` | List all datasets |
| Datasets | POST | `/upload/init` | Initialize chunked upload |
| Datasets | POST | `/upload/chunk/{id}` | Upload file chunk |
| Datasets | POST | `/upload/complete/{id}` | Finalize upload |
| Models | GET | `/models` | List trained models |
| Models | GET | `/algorithms` | List available algorithms |
| Models | POST | `/train/start` | Start model training |
| Models | GET | `/train/status/{job_id}` | Check training progress |
| Models | GET | `/models/{id}/report` | Get model diagnostics |
| Inference | POST | `/infer` | Run predictions |
| AutoML | POST | `/automl/detect-problem` | Detect problem type |
| AutoML | POST | `/automl/start` | Start AutoML training |
| Dashboards | GET | `/dashboards` | List dashboards |
| Dashboards | POST | `/dashboards` | Create dashboard |
| Connectors | GET | `/connectors` | List connectors |
| Connectors | POST | `/connectors/sql` | Create SQL connector |
| Health | GET | `/health` | System health metrics |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Database connection failed | Check PostgreSQL is running and credentials in `.env` are correct |
| Module not found | Activate virtual environment: `source .venv/bin/activate` (Linux/macOS) or `.venv\Scripts\Activate.ps1` (Windows) |
| Port in use | Change `APP_PORT` in `.env` or stop other process |
| pgvector error | Run `CREATE EXTENSION IF NOT EXISTS vector;` in your database |
| Frontend not loading | Run `cd frontend && npm run build` |
| AI features not working | Set valid `EMLY_KEY` in `.env` |
| LLM_URL not connecting | Ensure `EMLY_KEY` and `EMLY_MODEL` are valid for the endpoint at `LLM_URL`. For local endpoints (Ollama, vLLM) set `EMLY_KEY=not-needed` |
| Windows: `python3` not recognized | Use `python` instead of `python3` on Windows |
| Windows: PowerShell script execution error | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Windows: `pgvector` extension install | See [pgvector Windows build instructions](https://github.com/pgvector/pgvector#windows) or use Docker |

### Refer USER_GUIDE FOR MORE DETAILS 
