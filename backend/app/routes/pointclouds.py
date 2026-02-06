"""Routes for point-cloud and COLMAP data."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from ..services.building_store import store
from ..services.point_cloud import point_cloud_info, to_binary_buffer
from ..services.colmap_parser import load_colmap_workspace

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
PC_DIR = DATA_DIR / "point_clouds"
COLMAP_DIR = DATA_DIR / "colmap"

router = APIRouter(prefix="/api", tags=["pointclouds"])


@router.get("/pointclouds")
def list_point_clouds():
    """List available point cloud files."""
    if not PC_DIR.exists():
        return []
    files = []
    for f in PC_DIR.iterdir():
        if f.suffix.lower() in (".ply", ".pcd", ".xyz", ".txt"):
            files.append({"name": f.name, "size": f.stat().st_size})
    return files


@router.get("/pointclouds/{filename}/info")
def get_point_cloud_info(filename: str):
    path = PC_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Point cloud file not found")
    try:
        return point_cloud_info(path)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/pointclouds/{filename}/data")
def get_point_cloud_data(filename: str):
    """Stream point cloud as compact binary buffer."""
    path = PC_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Point cloud file not found")
    try:
        buf = to_binary_buffer(path)
        return Response(content=buf, media_type="application/octet-stream")
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/pointclouds/upload")
async def upload_point_cloud(file: UploadFile = File(...)):
    """Upload a new point cloud file."""
    PC_DIR.mkdir(parents=True, exist_ok=True)
    dest = PC_DIR / file.filename
    content = await file.read()
    dest.write_bytes(content)
    return {"name": file.filename, "size": len(content)}


# ---- COLMAP ----

@router.post("/colmap/load")
def load_colmap(workspace: str = "default"):
    """Load COLMAP text workspace from data/colmap/{workspace}/."""
    ws_path = COLMAP_DIR / workspace
    if not ws_path.exists():
        raise HTTPException(404, f"COLMAP workspace '{workspace}' not found")
    result = load_colmap_workspace(ws_path)
    cameras = result.get("cameras", [])
    images = result.get("images", [])
    store.set_colmap_data(cameras, images)
    return {
        "cameras": len(cameras),
        "images": len(images),
        "points": len(result.get("points", [])),
    }


@router.get("/colmap/cameras")
def get_colmap_cameras():
    return list(store.colmap_cameras.values())


@router.get("/colmap/images")
def get_colmap_images():
    return list(store.colmap_images.values())


@router.post("/colmap/images/{image_id}/assign")
def assign_image_to_room(image_id: int, room_id: str):
    store.assign_image_to_room(image_id, room_id)
    return {"status": "assigned"}
