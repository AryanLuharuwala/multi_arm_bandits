"""Point-cloud loading, conversion, and serving utilities.

Supports PLY, PCD, XYZ, and COLMAP points3D.txt files.
Converts everything to a compact binary format the frontend can stream.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Optional

import numpy as np

from ..models.schemas import PointCloudInfo, Vec3


def _try_open3d(path: Path) -> Optional[np.ndarray]:
    """Attempt to load via Open3D; returns Nx6 (xyzrgb) or Nx3 array."""
    try:
        import open3d as o3d

        pcd = o3d.io.read_point_cloud(str(path))
        pts = np.asarray(pcd.points, dtype=np.float32)
        if len(pts) == 0:
            return None
        colors = np.asarray(pcd.colors, dtype=np.float32)
        if colors.shape[0] == pts.shape[0]:
            return np.hstack([pts, colors])
        return pts
    except Exception:
        return None


def _load_xyz(path: Path) -> Optional[np.ndarray]:
    """Simple whitespace-delimited XYZ (RGB) loader."""
    try:
        data = np.loadtxt(str(path), dtype=np.float32)
        if data.ndim == 1:
            data = data.reshape(1, -1)
        return data
    except Exception:
        return None


def load_point_cloud(path: str | Path) -> tuple[np.ndarray, bool]:
    """Load a point cloud file and return (Nx3-or-6 array, has_colors).

    Returns positions as float32.  If RGB is available the array is Nx6 with
    colours in 0-1 range.
    """
    path = Path(path)
    suffix = path.suffix.lower()

    data = None
    if suffix in (".ply", ".pcd"):
        data = _try_open3d(path)
    if data is None:
        data = _load_xyz(path)
    if data is None:
        raise ValueError(f"Unable to load point cloud from {path}")

    has_colors = data.shape[1] >= 6
    if has_colors:
        # Normalise colours to 0-1 if they look like 0-255
        if data[:, 3:6].max() > 1.5:
            data[:, 3:6] /= 255.0
        return data[:, :6], True
    return data[:, :3], False


def point_cloud_info(path: str | Path) -> PointCloudInfo:
    """Return metadata about a point cloud without sending the full data."""
    arr, has_colors = load_point_cloud(path)
    mins = arr[:, :3].min(axis=0)
    maxs = arr[:, :3].max(axis=0)
    return PointCloudInfo(
        file=str(path),
        num_points=int(arr.shape[0]),
        bounds_min=Vec3(x=float(mins[0]), y=float(mins[1]), z=float(mins[2])),
        bounds_max=Vec3(x=float(maxs[0]), y=float(maxs[1]), z=float(maxs[2])),
        has_colors=has_colors,
        has_normals=False,
    )


def to_binary_buffer(path: str | Path) -> bytes:
    """Convert a point cloud to a compact binary buffer for streaming.

    Wire format (little-endian):
        4 bytes  uint32  num_points
        1 byte   uint8   has_colors (0 or 1)
        N * 12 bytes     float32 x, y, z
        (if has_colors) N * 3 bytes  uint8 r, g, b
    """
    arr, has_colors = load_point_cloud(path)
    n = arr.shape[0]

    buf = struct.pack("<IB", n, int(has_colors))
    buf += arr[:, :3].astype(np.float32).tobytes()
    if has_colors:
        colors = (arr[:, 3:6] * 255).clip(0, 255).astype(np.uint8)
        buf += colors.tobytes()
    return buf
