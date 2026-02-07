"""Pydantic models for the Building Management System."""

from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Geometry primitives
# ---------------------------------------------------------------------------

class Vec3(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Quaternion(BaseModel):
    w: float = 1.0
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Transform(BaseModel):
    position: Vec3 = Field(default_factory=Vec3)
    rotation: Quaternion = Field(default_factory=Quaternion)
    scale: Vec3 = Field(default_factory=lambda: Vec3(x=1, y=1, z=1))


# ---------------------------------------------------------------------------
# Building hierarchy
# ---------------------------------------------------------------------------

class Building(BaseModel):
    id: str
    name: str
    description: str = ""
    floors: list[str] = Field(default_factory=list)  # floor ids
    point_cloud_file: Optional[str] = None
    transform: Transform = Field(default_factory=Transform)


class Floor(BaseModel):
    id: str
    building_id: str
    name: str
    level: int = 0  # e.g. 0 = ground, 1 = first, -1 = basement
    rooms: list[str] = Field(default_factory=list)
    point_cloud_file: Optional[str] = None
    height_offset: float = 0.0  # metres above building origin


class Room(BaseModel):
    id: str
    floor_id: str
    name: str
    room_type: str = "generic"  # office, hallway, bathroom, server_room …
    point_cloud_file: Optional[str] = None
    bounds_min: Vec3 = Field(default_factory=Vec3)
    bounds_max: Vec3 = Field(default_factory=Vec3)
    sensors: list[str] = Field(default_factory=list)
    placed_objects: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)  # image ids


# ---------------------------------------------------------------------------
# COLMAP camera / image data
# ---------------------------------------------------------------------------

class ColmapCamera(BaseModel):
    id: int
    model: str = "PINHOLE"
    width: int = 0
    height: int = 0
    params: list[float] = Field(default_factory=list)  # fx, fy, cx, cy …


class ColmapImage(BaseModel):
    id: int
    camera_id: int
    name: str  # original filename
    rotation: Quaternion = Field(default_factory=Quaternion)
    translation: Vec3 = Field(default_factory=Vec3)
    room_id: Optional[str] = None  # which room this image belongs to


# ---------------------------------------------------------------------------
# Placed objects & sensors
# ---------------------------------------------------------------------------

class SensorType(str, Enum):
    LIGHT = "light"
    TEMPERATURE = "temperature"
    HUMIDITY = "humidity"
    MOTION = "motion"
    SMOKE = "smoke"
    CAMERA = "camera"
    DOOR = "door"
    HVAC = "hvac"
    POWER = "power"
    CUSTOM = "custom"


class SensorReading(BaseModel):
    sensor_id: str
    timestamp: float  # epoch seconds
    value: float
    unit: str = ""
    metadata: dict = Field(default_factory=dict)


class Sensor(BaseModel):
    id: str
    room_id: str
    name: str
    sensor_type: SensorType
    transform: Transform = Field(default_factory=Transform)
    status: str = "online"  # online | offline | warning | error
    last_reading: Optional[SensorReading] = None
    config: dict = Field(default_factory=dict)


class PlacedObject(BaseModel):
    id: str
    room_id: str
    name: str
    object_type: str = "generic"  # furniture, equipment, marker …
    model_url: Optional[str] = None  # URL / path to 3D model
    transform: Transform = Field(default_factory=Transform)
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Point-cloud metadata (returned to frontend, not the raw cloud)
# ---------------------------------------------------------------------------

class PointCloudInfo(BaseModel):
    file: str
    num_points: int = 0
    bounds_min: Vec3 = Field(default_factory=Vec3)
    bounds_max: Vec3 = Field(default_factory=Vec3)
    has_colors: bool = False
    has_normals: bool = False


# ---------------------------------------------------------------------------
# API request / response helpers
# ---------------------------------------------------------------------------

class PlaceSensorRequest(BaseModel):
    room_id: str
    name: str
    sensor_type: SensorType
    position: Vec3
    config: dict = Field(default_factory=dict)


class PlaceObjectRequest(BaseModel):
    room_id: str
    name: str
    object_type: str = "generic"
    model_url: Optional[str] = None
    position: Vec3
    rotation: Optional[Quaternion] = None
    scale: Optional[Vec3] = None
    metadata: dict = Field(default_factory=dict)


class SensorUpdateRequest(BaseModel):
    value: float
    unit: str = ""
    metadata: dict = Field(default_factory=dict)
