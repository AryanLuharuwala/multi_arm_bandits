"""REST routes for sensors and placed objects."""

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    PlaceObjectRequest,
    PlaceSensorRequest,
    SensorUpdateRequest,
)
from ..services.building_store import store

router = APIRouter(prefix="/api", tags=["sensors"])


# ---- Sensors ----

@router.get("/sensors")
def list_sensors(room_id: str | None = None):
    if room_id:
        return [s for s in store.sensors.values() if s.room_id == room_id]
    return list(store.sensors.values())


@router.get("/sensors/{sensor_id}")
def get_sensor(sensor_id: str):
    s = store.sensors.get(sensor_id)
    if not s:
        raise HTTPException(404, "Sensor not found")
    return s


@router.post("/sensors")
def place_sensor(req: PlaceSensorRequest):
    try:
        sensor = store.add_sensor(
            room_id=req.room_id,
            name=req.name,
            sensor_type=req.sensor_type,
            position=req.position,
            config=req.config,
        )
        return sensor
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.post("/sensors/{sensor_id}/reading")
def update_sensor_reading(sensor_id: str, req: SensorUpdateRequest):
    try:
        reading = store.update_sensor_reading(
            sensor_id=sensor_id,
            value=req.value,
            unit=req.unit,
            metadata=req.metadata,
        )
        return reading
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.get("/sensors/{sensor_id}/history")
def sensor_history(sensor_id: str, limit: int = 100):
    history = store.sensor_history.get(sensor_id, [])
    return history[-limit:]


@router.delete("/sensors/{sensor_id}")
def remove_sensor(sensor_id: str):
    store.remove_sensor(sensor_id)
    return {"status": "deleted"}


# ---- Placed objects ----

@router.get("/objects")
def list_objects(room_id: str | None = None):
    if room_id:
        return [o for o in store.placed_objects.values() if o.room_id == room_id]
    return list(store.placed_objects.values())


@router.post("/objects")
def place_object(req: PlaceObjectRequest):
    try:
        obj = store.add_placed_object(
            room_id=req.room_id,
            name=req.name,
            object_type=req.object_type,
            position=req.position,
            rotation=req.rotation,
            scale=req.scale,
            model_url=req.model_url,
            metadata=req.metadata,
        )
        return obj
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.delete("/objects/{object_id}")
def remove_object(object_id: str):
    store.remove_placed_object(object_id)
    return {"status": "deleted"}
