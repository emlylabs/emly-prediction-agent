import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import APP_HOST, APP_PORT, DEBUG
from app.routes.api import router as api_router
from app.utils.logger import setup_logger
from app.services.pod_resources import get_pod_resources

# Setup logging
setup_logger()
log = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Emly Prediction Agent",
    description="Backend API for prediction workflows, document ingestion, and system health.",
    version="1.0.0",
    debug=DEBUG
)

# CORS middleware - allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(api_router, prefix="/emly")

# Static files directory
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
STATIC_DIR_CANDIDATES = [
    os.path.join(PROJECT_ROOT, "frontend", "dist"),
    os.path.join(PROJECT_ROOT, "static"),
]
# Allow overriding static directory path through environment variable.
STATIC_DIR = os.getenv(
    "STATIC_DIR",
    next((path for path in STATIC_DIR_CANDIDATES if os.path.exists(path)), STATIC_DIR_CANDIDATES[0])
)
log.info(f"Static directory set to: {STATIC_DIR}")

@app.get("/")
async def serve_frontend():
    """Serve the frontend index.html"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "status": "healthy",
        "app": "Emly Prediction Agent",
        "version": "1.0.0",
        "note": "Frontend not found. API is running."
    }
@app.get("/api/v1")
async def api_v1():
    """API version endpoint"""
    return {
        "version": "1.0.0"
    }


@app.get("/api/status")
async def api_status():
    """API health check endpoint"""
    return {
        "status": "healthy",
        "app": "Emly Prediction Agent",
        "version": "1.0.0"
    }


@app.get("/health")
def pod_resources():
    """
    Get pod resource usage metrics.
    Returns CPU, Memory, and Disk usage for the container.
    """
    return get_pod_resources(disk_path="/app/data")


@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    log.info("Starting Emly Prediction Agent...")
    log.info(f"Debug mode: {DEBUG}")
    
    # Mount static files if directory exists
    if os.path.exists(STATIC_DIR):
        app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")
        log.info(f"Serving static files from: {STATIC_DIR}")
    else:
        log.warning(f"Static directory not found: {STATIC_DIR}")
    
    log.info("Application started successfully!")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    log.info("Shutting down Emly Prediction Agent...")
    log.info("Application shutdown complete.")


# Catch-all route for SPA - must be defined last
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Catch-all route to serve frontend for SPA routing"""
    # Don't serve frontend for API routes
    if full_path.startswith(("emly/", "api/", "health")):
        return {"error": "Not found"}
    
    # Try to serve the requested file from static directory
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # For all other routes, serve index.html (SPA routing)
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return {"error": "Frontend not found"}


if __name__ == "__main__":
    import uvicorn
    
    log.info(f"Starting server at http://{APP_HOST}:{APP_PORT}")
    uvicorn.run(
        "app.main:app",
        host=APP_HOST,
        port=APP_PORT,
        reload=DEBUG
    )
