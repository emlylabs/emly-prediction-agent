# Emly Prediction Agent — User Guide

Complete guide to using the Emly Prediction Agent platform.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Interface Overview](#2-interface-overview)
3. [Uploading Data](#3-uploading-data)
4. [Managing Data](#4-managing-data)
5. [Training Models](#5-training-models)
6. [AutoML (AI-Powered Training)](#6-automl-ai-powered-training)
7. [Viewing Model Reports](#7-viewing-model-reports)
8. [Testing Models](#8-testing-models)
9. [Building Dashboards](#9-building-dashboards)
10. [Data Connectors](#10-data-connectors)
11. [Data Preparation](#11-data-preparation)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Getting Started

### Installation

```bash
# Clone and enter directory
git clone <repository-url>
cd predictive-agent

# Set up Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Build frontend (one-time only)
cd frontend && npm ci && npm run build && cd ..

# Configure database in .env file, then start
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000** in your browser.

The frontend is built once and served automatically by the backend. No separate frontend server needed.

### Environment Configuration

Edit the `.env` file:

```env
# Database (required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vectordb
POSTGRES_USER=vectoruser
POSTGRES_PASSWORD=vectorpass

# LLM for AI features (required for AutoML and Copilot)
EMLY_SOURCE=openai
EMLY_MODEL=gpt-4.1-mini
EMLY_KEY=sk-your-api-key-here
```

---

## 2. Interface Overview

The application has three main sections accessible from the left sidebar:

| Section | Purpose |
|---------|---------|
| **Dashboard** | Create and view data visualizations |
| **Data** | Upload files, manage folders, configure connectors |
| **Models** | Train models, run AutoML, test predictions, view reports |

---

## 3. Uploading Data

### Supported Formats

| Format | Extensions |
|--------|------------|
| CSV | .csv |
| Excel | .xlsx, .xls |
| JSON | .json |
| ZIP | .zip (containing any of the above) |

### Upload Steps

1. Click **Data** in the sidebar
2. Click **New Upload** button
3. Select one or more files
4. Choose a destination folder (optional, defaults to "default")
5. Upload begins automatically

A status window shows progress for each file. Large files are split into 5MB chunks with automatic retry on failure. You can pause and resume uploads.

### After Upload

The system automatically:
- Parses the file and detects column types
- Stores data in a dedicated database table
- Computes dataset statistics and insights

---

## 4. Managing Data

### Folders

- **Create**: Click **New Folder** and enter a name
- **Rename**: Click the edit icon on the folder card
- **Delete**: Click the delete icon on the folder card (deletes all datasets inside)
- **Filter**: Click a folder to show only its datasets

### Dataset Actions

Each dataset has an actions menu with:

| Action | Description |
|--------|-------------|
| Open | View and edit data in the preparation screen |
| Download | Download the original file |
| Insights | View statistical analysis |
| Schema | View and edit column types |
| Rename | Change the dataset name |
| Move | Move to a different folder |
| Delete | Permanently remove the dataset |

### Search

Use the search bar above the dataset table to filter by filename, folder, or column names.

---

## 5. Training Models

### Step 1: Navigate to Training

Click **Models** in the sidebar, then click **Train New Model** tab.

### Step 2: Select Dataset

Click **Choose Dataset** and select your dataset from the modal.

### Step 3: Configure Target and Features

- **Target Column**: The column you want to predict
- **Feature Columns**: The input columns used for prediction (all columns except target are selected by default)

### Step 4: Choose Algorithm

Select an algorithm based on your problem type:

**Regression** (predicting numbers):
- Linear Regression, Ridge, Lasso, Elastic Net
- Random Forest Regressor, Gradient Boosting Regressor
- SVR, KNN Regressor

**Classification** (predicting categories):
- Logistic Regression, Decision Tree, Random Forest
- Gradient Boosting, KNN, SVM

**Clustering** (grouping without labels):
- K-Means, DBSCAN, Agglomerative

### Step 5: Configure Parameters

Each algorithm has configurable parameters:

| Parameter | Description |
|-----------|-------------|
| n_estimators | Number of trees (Random Forest, Gradient Boosting) |
| max_depth | Maximum tree depth |
| learning_rate | Step size for boosting |
| C | Regularization strength (SVM, Logistic Regression) |
| n_neighbors | Number of neighbors (KNN) |

### Step 6: Training Options

| Option | Description | Default |
|--------|-------------|---------|
| Train Split | Fraction for training | 0.80 |
| Test Split | Fraction for evaluation | 0.20 |
| Random State | Seed for reproducibility | 42 |
| Cross Validation | Enable k-fold CV | Off |
| CV Folds | Number of folds | 5 |

### Step 7: Start Training

Click **Start Training**. Progress updates appear in real time. When complete, the model appears in the Model List.

---

## 6. AutoML (AI-Powered Training)

AutoML uses AI to automatically select the best algorithm and configuration.

### Requirements

A valid LLM API key must be configured in `.env` (OpenAI, Anthropic, Google, or Ollama).

### Step 1: Open AutoML Wizard

Click **Models** then **AutoML** tab.

### Step 2: Describe Your Problem

1. Select a dataset from the dropdown
2. Describe what you want to predict in plain English, for example:
   - "Predict total sales based on product category and region"
   - "Classify whether a customer will churn"
   - "Predict house prices from size and location"
3. Click **Detect Problem**

The AI analyzes your data and description, then determines:
- Problem type (regression, classification, clustering)
- Target column
- Feature columns
- Data quality notes

### Step 3: Review Configuration

The wizard shows:
- Detected problem type and target
- Feature columns (toggle on/off as needed)
- Recommended algorithm with explanation
- Time budget slider

### Step 4: Choose Training Mode

| Mode | Description |
|------|-------------|
| Explain | Quick exploration, 1 model per algorithm |
| Perform | Production-ready, balanced speed/quality |
| Compete | Maximum performance, stacking and ensembles |

### Step 5: Start Training

Click **Start AutoML Training**. Watch real-time progress as models are trained. When complete, view the leaderboard and select the best model.

---

## 7. Viewing Model Reports

### Accessing Reports

1. Go to **Models** then **Model List** tab
2. Click **Report** on any model

### Report Contents

Reports vary by problem type:

#### Regression Models

| Section | Content |
|---------|---------|
| Metrics | R2, Adjusted R2, MAE, MSE, RMSE, MAPE |
| Metric Explanations | Why each metric matters |
| Business Meaning | Plain-English interpretation of error |
| Feature Importance | Which inputs matter most |
| Actual vs Predicted | Scatter plot of predictions |
| Residual Plot | Error distribution |
| QQ Plot | Normal distribution check |
| VIF Table | Multicollinearity check |

#### Classification Models

| Section | Content |
|---------|---------|
| Metrics | Accuracy, F1, Precision, Recall |
| Metric Explanations | Why each metric matters |
| Business Meaning | Plain-English interpretation |
| Feature Importance | Which inputs matter most |
| Confusion Matrix | Prediction accuracy by class |

#### Clustering Models

| Section | Content |
|---------|---------|
| Metrics | N Clusters, Silhouette Score, Davies-Bouldin, Inertia |
| Metric Explanations | Why each metric matters |
| Feature Importance | Which features drive clustering |

#### AutoML Models

AutoML models include additional content:
- AutoML Model Visuals: Learning curves, ROC curve, confusion matrix, etc.
- AutoML Detailed Report: Full MLJAR analysis with metrics and recommendations

### Comparing Models

1. In Model List, click the menu on any model
2. Click **Compare**
3. Select a second model from the dropdown
4. View side-by-side metrics with winner highlighted

---

## 8. Testing Models

### Accessing Test Mode

Go to **Models** then **Test Model** tab.

### Test Modes

| Mode | Description |
|------|-------------|
| Batch | Run predictions on multiple examples at once |
| One by One | Step through examples individually |
| Form | Manually enter values for a single prediction |

### Batch Testing

1. Select a model (active model is selected by default)
2. Click **Choose From Data Explorer** and select test datasets
3. Click **Run Batch Examples**
4. View predictions in the results table

### One-by-One Testing

1. Select **One by One** mode
2. Click **Run Next Example**
3. View the prediction for each example
4. Continue clicking to step through all examples

### Form Testing

1. Select **Form** mode
2. Enter values for each feature column
3. For categorical columns, select from dropdown options
4. Click **Predict From Form**
5. View the prediction result

### Setting Active Model

The active model is the default for testing and API inference.

1. In Model List, click the menu on a model
2. Click **Make Active**
3. Confirm the action

---

## 9. Building Dashboards

### Creating a Dashboard

1. Click **Dashboard** in the sidebar
2. Click the **New Dashboard** card
3. The Dashboard Builder opens

### Adding Widgets

1. Click **Add Widget**
2. Choose a widget type:
   - Bar Chart: Compare values across categories
   - Line Chart: Show trends over time
   - Pie Chart: Show proportions
   - Area Chart: Cumulative data visualization
   - Scatter Plot: Show relationships between variables
   - Metric Card: Display a single KPI number
   - Table: Show tabular data
   - Text: Add descriptions or notes

### Configuring Widgets

Each widget has these options:

| Option | Description |
|--------|-------------|
| Title | Widget heading |
| Dataset | Data source |
| X-Axis | Column for horizontal axis |
| Y-Axis | Column for vertical axis |
| Aggregation | How to combine values (sum, avg, count, min, max) |
| Color | Accent color |

### Arranging Layout

- Drag and drop widgets to rearrange
- Resize widgets by dragging edges
- Delete widgets using the remove button

### Saving and Activating

1. Click **Save Dashboard** and enter a name
2. Click **Set as Active** to make it the default view

---

## 10. Data Connectors

### Supported Connectors

| Type | Supported |
|------|-----------|
| SQL | PostgreSQL, MySQL, SQLite, MSSQL, Oracle |
| SFTP | Any SFTP server |

### Creating a SQL Connector

1. Go to **Data** then **Connectors** tab
2. Click **New Connector**
3. Select **SQL** type
4. Fill in connection details:
   - Name, Driver, Host, Port, Database
   - Username, Password
   - Read Only (recommended)
5. Click **Test Connection** to verify
6. Click **Save**

### Syncing Data

1. Click the menu on a connector
2. Click **Sync**
3. Select tables to import
4. Click **Sync Selected Tables**

### Running Custom SQL

1. Open the connector's sync modal
2. Switch to **SQL Query** tab
3. Enter your query
4. Enter a filename for results
5. Click **Run Query**

---

## 11. Data Preparation

### Opening Preparation Screen

1. Go to **Data** tab
2. Click **Open** on any dataset

### Manual Editing

- Click any cell to edit its value
- Use the toolbar for bulk operations

### Available Operations

| Category | Operations |
|----------|------------|
| Cleaning | Drop duplicates, fill missing, drop missing, trim whitespace |
| Transform | Cast types, rename columns, split/merge/derive columns |
| Filter | Sort rows, delete by condition, filter values |
| Scale | Min-max, z-score, robust, log transform |
| Encode | One-hot encode, label encode |
| Date | Extract parts, date differences |
| Math | Scalar operations, unary functions |
| Statistics | Z-score, percentile, rolling mean |
| Merge | Append datasets, join by keys |

### AI Copilot

1. Click **Copilot** button
2. Describe what you want in natural language, for example:
   - "Remove duplicates and fill missing age values with median"
   - "Add a profit_margin column as (revenue - cost) / revenue"
   - "Standardize numeric columns and one-hot encode categories"
3. Click **Generate Plan**
4. Review the step-by-step plan
5. Click **Dry Run** to preview results
6. Click **Apply** to execute

### Undo/Redo/Checkpoints

- **Undo**: Revert last operation
- **Redo**: Reapply undone operation
- **Checkpoints**: Save state with a label, restore to any checkpoint

### Saving

1. Click **Save**
2. Choose **Overwrite** (replace original) or **New** (create new dataset)

---

## 12. Troubleshooting

### Application Issues

| Problem | Solution |
|---------|----------|
| Database connection error | Verify PostgreSQL is running and credentials in `.env` are correct |
| Module not found | Run `source .venv/bin/activate` then `pip install -r requirements.txt` |
| Port 8000 in use | Change port in startup command or stop other process |
| pgvector extension error | Run `CREATE EXTENSION IF NOT EXISTS vector;` in your database |
| Frontend not loading | Run `cd frontend && npm run build` |

### Upload Issues

| Problem | Solution |
|---------|----------|
| Upload fails | Check file format (CSV, Excel, JSON, ZIP only) |
| Parse error | Verify file is well-formed with consistent delimiters |
| Large file timeout | Use chunked upload (automatic for files over 5MB) |

### Training Issues

| Problem | Solution |
|---------|----------|
| Target has too many values | Use a column with fewer categories for classification |
| All features are NaN | Clean data first using Data Preparation |
| Insufficient data | Upload a dataset with more rows |
| Training hangs | Check `/health` endpoint for resource usage |

### AI Feature Issues

| Problem | Solution |
|---------|----------|
| LLM request failed | Check `EMLY_KEY` is set correctly in `.env` |
| Unsupported provider | Set `EMLY_SOURCE` to: openai, anthropic, google, or ollama |
| Slow responses | Try a faster model like gpt-4.1-mini |

### Checking System Health

```bash
curl http://localhost:8000/health
```

Returns CPU, memory, and disk usage metrics.

---

## Quick Reference

```
1. UPLOAD:      Data > New Upload > Select file
2. EXPLORE:     Data > Open > View table and insights
3. PREPARE:     Data > Open > Clean and transform > Save
4. TRAIN:       Models > Train New Model > Configure > Start
5. AUTOML:      Models > AutoML > Describe problem > Detect > Train
6. CHECK:       Models > Model List > Report > View metrics and charts
7. TEST:        Models > Test Model > Select model > Run predictions
8. DASHBOARD:   Dashboard > New Dashboard > Add widgets > Save
```
