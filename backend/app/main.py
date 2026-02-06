"""AR Building Management System – FastAPI backend."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routes import buildings, sensors, pointclouds

app = FastAPI(
    title="AR Building Management System",
    version="0.1.0",
    description="Backend for the AR BMS – point clouds, sensors, COLMAP, and building hierarchy.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check (must be before static mounts)
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


# Mount API routers
app.include_router(buildings.router)
app.include_router(sensors.router)
app.include_router(pointclouds.router)

# Serve uploaded images / data statically
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")

# Serve frontend build (catch-all – must be last)
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
