"""REST routes for buildings, floors, rooms."""

from fastapi import APIRouter, HTTPException

from ..services.building_store import store

router = APIRouter(prefix="/api/buildings", tags=["buildings"])


@router.get("")
def list_buildings():
    return list(store.buildings.values())


@router.get("/{building_id}")
def get_building(building_id: str):
    b = store.buildings.get(building_id)
    if not b:
        raise HTTPException(404, "Building not found")
    return b


@router.get("/{building_id}/floors")
def list_floors(building_id: str):
    b = store.buildings.get(building_id)
    if not b:
        raise HTTPException(404, "Building not found")
    return [store.floors[fid] for fid in b.floors if fid in store.floors]


@router.get("/floors/{floor_id}")
def get_floor(floor_id: str):
    f = store.floors.get(floor_id)
    if not f:
        raise HTTPException(404, "Floor not found")
    return f


@router.get("/floors/{floor_id}/rooms")
def list_rooms(floor_id: str):
    f = store.floors.get(floor_id)
    if not f:
        raise HTTPException(404, "Floor not found")
    return [store.rooms[rid] for rid in f.rooms if rid in store.rooms]


@router.get("/rooms/{room_id}")
def get_room(room_id: str):
    r = store.rooms.get(room_id)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


@router.get("/rooms/{room_id}/detail")
def get_room_detail(room_id: str):
    """Return room with its sensors and objects expanded inline."""
    r = store.rooms.get(room_id)
    if not r:
        raise HTTPException(404, "Room not found")
    sensors = [store.sensors[sid] for sid in r.sensors if sid in store.sensors]
    objects = [store.placed_objects[oid] for oid in r.placed_objects if oid in store.placed_objects]
    return {
        "room": r,
        "sensors": sensors,
        "objects": objects,
    }
