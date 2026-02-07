"""Parse COLMAP text-format output files (cameras.txt, images.txt, points3D.txt).

COLMAP docs: https://colmap.github.io/format.html
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from ..models.schemas import ColmapCamera, ColmapImage, Quaternion, Vec3

_COMMENT = re.compile(r"^\s*#")


def parse_cameras_txt(path: str | Path) -> list[ColmapCamera]:
    """Parse a COLMAP cameras.txt file.

    Format per line: CAMERA_ID MODEL WIDTH HEIGHT PARAMS...
    """
    cameras: list[ColmapCamera] = []
    with open(path) as f:
        for line in f:
            if _COMMENT.match(line) or not line.strip():
                continue
            parts = line.strip().split()
            cam = ColmapCamera(
                id=int(parts[0]),
                model=parts[1],
                width=int(parts[2]),
                height=int(parts[3]),
                params=[float(p) for p in parts[4:]],
            )
            cameras.append(cam)
    return cameras


def parse_images_txt(path: str | Path) -> list[ColmapImage]:
    """Parse a COLMAP images.txt file.

    Every *pair* of lines describes one image:
      Line 1: IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME
      Line 2: POINTS2D[] (ignored here)
    """
    images: list[ColmapImage] = []
    with open(path) as f:
        lines = [l for l in f if not _COMMENT.match(l) and l.strip()]

    # Process pairs of lines
    i = 0
    while i < len(lines):
        parts = lines[i].strip().split()
        if len(parts) < 10:
            i += 1
            continue
        img = ColmapImage(
            id=int(parts[0]),
            rotation=Quaternion(
                w=float(parts[1]),
                x=float(parts[2]),
                y=float(parts[3]),
                z=float(parts[4]),
            ),
            translation=Vec3(
                x=float(parts[5]),
                y=float(parts[6]),
                z=float(parts[7]),
            ),
            camera_id=int(parts[8]),
            name=parts[9],
        )
        images.append(img)
        i += 2  # skip the POINTS2D line
    return images


def parse_points3d_txt(path: str | Path) -> list[dict]:
    """Parse a COLMAP points3D.txt file, returning raw dicts.

    Format: POINT3D_ID X Y Z R G B ERROR TRACK[]
    """
    points = []
    with open(path) as f:
        for line in f:
            if _COMMENT.match(line) or not line.strip():
                continue
            parts = line.strip().split()
            points.append(
                {
                    "id": int(parts[0]),
                    "x": float(parts[1]),
                    "y": float(parts[2]),
                    "z": float(parts[3]),
                    "r": int(parts[4]),
                    "g": int(parts[5]),
                    "b": int(parts[6]),
                    "error": float(parts[7]),
                }
            )
    return points


def load_colmap_workspace(
    workspace_dir: str | Path,
) -> dict:
    """Load an entire COLMAP text workspace (sparse/0/ or similar).

    Returns dict with keys: cameras, images, points (if files exist).
    """
    ws = Path(workspace_dir)
    result: dict = {}

    cameras_path = ws / "cameras.txt"
    images_path = ws / "images.txt"
    points_path = ws / "points3D.txt"

    if cameras_path.exists():
        result["cameras"] = parse_cameras_txt(cameras_path)
    if images_path.exists():
        result["images"] = parse_images_txt(images_path)
    if points_path.exists():
        result["points"] = parse_points3d_txt(points_path)

    return result
