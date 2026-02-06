"""In-memory store for building hierarchy, sensors, and placed objects.

In production this would back onto a database.  For the MVP we keep
everything in memory with JSON persistence so restarts don't lose data.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Optional

from ..models.schemas import (
    Building,
    ColmapCamera,
    ColmapImage,
    Floor,
    PlacedObject,
    Room,
    Sensor,
    SensorReading,
    SensorType,
    Transform,
    Vec3,
    Quaternion,
)

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
PERSIST_FILE = DATA_DIR / "store.json"


def _uid() -> str:
    return uuid.uuid4().hex[:12]


class BuildingStore:
    """Central in-memory data store for the BMS."""

    def __init__(self) -> None:
        self.buildings: dict[str, Building] = {}
        self.floors: dict[str, Floor] = {}
        self.rooms: dict[str, Room] = {}
        self.sensors: dict[str, Sensor] = {}
        self.placed_objects: dict[str, PlacedObject] = {}
        self.colmap_cameras: dict[int, ColmapCamera] = {}
        self.colmap_images: dict[int, ColmapImage] = {}
        self.sensor_history: dict[str, list[SensorReading]] = {}  # sensor_id -> readings

        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        if not PERSIST_FILE.exists():
            self._create_demo_data()
            return
        try:
            raw = json.loads(PERSIST_FILE.read_text())
            for bid, b in raw.get("buildings", {}).items():
                self.buildings[bid] = Building(**b)
            for fid, f in raw.get("floors", {}).items():
                self.floors[fid] = Floor(**f)
            for rid, r in raw.get("rooms", {}).items():
                self.rooms[rid] = Room(**r)
            for sid, s in raw.get("sensors", {}).items():
                self.sensors[sid] = Sensor(**s)
            for oid, o in raw.get("placed_objects", {}).items():
                self.placed_objects[oid] = PlacedObject(**o)
        except Exception:
            self._create_demo_data()

    def save(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        data = {
            "buildings": {k: v.model_dump() for k, v in self.buildings.items()},
            "floors": {k: v.model_dump() for k, v in self.floors.items()},
            "rooms": {k: v.model_dump() for k, v in self.rooms.items()},
            "sensors": {k: v.model_dump() for k, v in self.sensors.items()},
            "placed_objects": {k: v.model_dump() for k, v in self.placed_objects.items()},
        }
        PERSIST_FILE.write_text(json.dumps(data, indent=2, default=str))

    # ------------------------------------------------------------------
    # Demo / seed data
    # ------------------------------------------------------------------

    def _create_demo_data(self) -> None:
        """Seed with a sample building so the UI has something to show."""
        b_id = "building_01"
        self.buildings[b_id] = Building(
            id=b_id,
            name="HQ Building",
            description="Main headquarters – 3-storey office building",
            floors=["floor_0", "floor_1", "floor_2"],
        )

        floor_defs = [
            ("floor_0", "Ground Floor", 0, 0.0, ["room_lobby", "room_reception", "room_server"]),
            ("floor_1", "First Floor", 1, 3.5, ["room_open_office", "room_meeting_a", "room_kitchen"]),
            ("floor_2", "Second Floor", 2, 7.0, ["room_exec", "room_meeting_b", "room_lounge"]),
        ]
        for fid, name, level, h, room_ids in floor_defs:
            self.floors[fid] = Floor(
                id=fid,
                building_id=b_id,
                name=name,
                level=level,
                height_offset=h,
                rooms=room_ids,
            )

        room_defs = [
            ("room_lobby", "floor_0", "Lobby", "hallway"),
            ("room_reception", "floor_0", "Reception", "office"),
            ("room_server", "floor_0", "Server Room", "server_room"),
            ("room_open_office", "floor_1", "Open Office", "office"),
            ("room_meeting_a", "floor_1", "Meeting Room A", "meeting"),
            ("room_kitchen", "floor_1", "Kitchen", "kitchen"),
            ("room_exec", "floor_2", "Executive Suite", "office"),
            ("room_meeting_b", "floor_2", "Board Room", "meeting"),
            ("room_lounge", "floor_2", "Staff Lounge", "lounge"),
        ]
        for rid, fid, name, rtype in room_defs:
            self.rooms[rid] = Room(
                id=rid,
                floor_id=fid,
                name=name,
                room_type=rtype,
                bounds_min=Vec3(x=-5, y=0, z=-5),
                bounds_max=Vec3(x=5, y=3, z=5),
            )

        # Seed some sensors
        sensor_seeds = [
            ("room_lobby", "Lobby Lights", SensorType.LIGHT, 78.0, "%"),
            ("room_lobby", "Lobby Motion", SensorType.MOTION, 1.0, "bool"),
            ("room_server", "Server Temp", SensorType.TEMPERATURE, 22.4, "°C"),
            ("room_server", "Server Humidity", SensorType.HUMIDITY, 45.0, "%"),
            ("room_server", "Smoke Detector", SensorType.SMOKE, 0.0, "bool"),
            ("room_open_office", "Office Lights", SensorType.LIGHT, 100.0, "%"),
            ("room_open_office", "Office Temp", SensorType.TEMPERATURE, 23.1, "°C"),
            ("room_meeting_a", "Meeting-A HVAC", SensorType.HVAC, 21.0, "°C"),
            ("room_kitchen", "Kitchen Power", SensorType.POWER, 1.8, "kW"),
            ("room_exec", "Exec Door Lock", SensorType.DOOR, 1.0, "locked"),
        ]
        for room_id, name, stype, value, unit in sensor_seeds:
            sid = _uid()
            self.sensors[sid] = Sensor(
                id=sid,
                room_id=room_id,
                name=name,
                sensor_type=stype,
                last_reading=SensorReading(
                    sensor_id=sid,
                    timestamp=time.time(),
                    value=value,
                    unit=unit,
                ),
            )
            self.rooms[room_id].sensors.append(sid)

        self.save()

    # ------------------------------------------------------------------
    # CRUD helpers
    # ------------------------------------------------------------------

    def add_sensor(
        self,
        room_id: str,
        name: str,
        sensor_type: SensorType,
        position: Vec3,
        config: dict | None = None,
    ) -> Sensor:
        if room_id not in self.rooms:
            raise KeyError(f"Room {room_id} not found")
        sid = _uid()
        sensor = Sensor(
            id=sid,
            room_id=room_id,
            name=name,
            sensor_type=sensor_type,
            transform=Transform(position=position),
            config=config or {},
        )
        self.sensors[sid] = sensor
        self.rooms[room_id].sensors.append(sid)
        self.save()
        return sensor

    def update_sensor_reading(
        self, sensor_id: str, value: float, unit: str = "", metadata: dict | None = None
    ) -> SensorReading:
        if sensor_id not in self.sensors:
            raise KeyError(f"Sensor {sensor_id} not found")
        reading = SensorReading(
            sensor_id=sensor_id,
            timestamp=time.time(),
            value=value,
            unit=unit,
            metadata=metadata or {},
        )
        self.sensors[sensor_id].last_reading = reading
        self.sensor_history.setdefault(sensor_id, []).append(reading)
        # Keep only last 1000 readings in memory
        if len(self.sensor_history[sensor_id]) > 1000:
            self.sensor_history[sensor_id] = self.sensor_history[sensor_id][-500:]
        self.save()
        return reading

    def add_placed_object(
        self,
        room_id: str,
        name: str,
        object_type: str,
        position: Vec3,
        rotation: Quaternion | None = None,
        scale: Vec3 | None = None,
        model_url: str | None = None,
        metadata: dict | None = None,
    ) -> PlacedObject:
        if room_id not in self.rooms:
            raise KeyError(f"Room {room_id} not found")
        oid = _uid()
        obj = PlacedObject(
            id=oid,
            room_id=room_id,
            name=name,
            object_type=object_type,
            model_url=model_url,
            transform=Transform(
                position=position,
                rotation=rotation or Quaternion(),
                scale=scale or Vec3(x=1, y=1, z=1),
            ),
            metadata=metadata or {},
        )
        self.placed_objects[oid] = obj
        self.rooms[room_id].placed_objects.append(oid)
        self.save()
        return obj

    def remove_sensor(self, sensor_id: str) -> None:
        sensor = self.sensors.pop(sensor_id, None)
        if sensor and sensor.room_id in self.rooms:
            room = self.rooms[sensor.room_id]
            room.sensors = [s for s in room.sensors if s != sensor_id]
        self.save()

    def remove_placed_object(self, object_id: str) -> None:
        obj = self.placed_objects.pop(object_id, None)
        if obj and obj.room_id in self.rooms:
            room = self.rooms[obj.room_id]
            room.placed_objects = [o for o in room.placed_objects if o != object_id]
        self.save()

    # ------------------------------------------------------------------
    # COLMAP data
    # ------------------------------------------------------------------

    def set_colmap_data(
        self,
        cameras: list[ColmapCamera],
        images: list[ColmapImage],
    ) -> None:
        self.colmap_cameras = {c.id: c for c in cameras}
        self.colmap_images = {i.id: i for i in images}

    def assign_image_to_room(self, image_id: int, room_id: str) -> None:
        if image_id in self.colmap_images:
            self.colmap_images[image_id].room_id = room_id
            if room_id in self.rooms:
                img_name = self.colmap_images[image_id].name
                if img_name not in self.rooms[room_id].images:
                    self.rooms[room_id].images.append(img_name)


# Singleton
store = BuildingStore()
