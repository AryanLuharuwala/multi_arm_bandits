/**
 * API client for the AR Building Management System backend.
 */

const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// Buildings / Floors / Rooms
export const getBuildings = () => request("/buildings");
export const getBuilding = (id) => request(`/buildings/${id}`);
export const getBuildingFloors = (id) => request(`/buildings/${id}/floors`);
export const getFloor = (id) => request(`/buildings/floors/${id}`);
export const getFloorRooms = (id) => request(`/buildings/floors/${id}/rooms`);
export const getRoom = (id) => request(`/buildings/rooms/${id}`);
export const getRoomDetail = (id) => request(`/buildings/rooms/${id}/detail`);

// Sensors
export const getSensors = (roomId) =>
  request(`/sensors${roomId ? `?room_id=${roomId}` : ""}`);
export const getSensor = (id) => request(`/sensors/${id}`);
export const placeSensor = (data) =>
  request("/sensors", { method: "POST", body: JSON.stringify(data) });
export const updateSensorReading = (id, data) =>
  request(`/sensors/${id}/reading`, { method: "POST", body: JSON.stringify(data) });
export const getSensorHistory = (id, limit = 100) =>
  request(`/sensors/${id}/history?limit=${limit}`);
export const deleteSensor = (id) =>
  request(`/sensors/${id}`, { method: "DELETE" });

// Objects
export const getObjects = (roomId) =>
  request(`/objects${roomId ? `?room_id=${roomId}` : ""}`);
export const placeObject = (data) =>
  request("/objects", { method: "POST", body: JSON.stringify(data) });
export const deleteObject = (id) =>
  request(`/objects/${id}`, { method: "DELETE" });

// Point clouds
export const getPointClouds = () => request("/pointclouds");
export const getPointCloudInfo = (filename) =>
  request(`/pointclouds/${filename}/info`);

export async function getPointCloudData(filename) {
  const res = await fetch(`${BASE}/pointclouds/${filename}/data`);
  if (!res.ok) throw new Error(`Failed to load point cloud: ${res.status}`);
  return res.arrayBuffer();
}

export async function uploadPointCloud(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/pointclouds/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

// COLMAP
export const loadColmap = (workspace = "default") =>
  request(`/colmap/load?workspace=${workspace}`, { method: "POST" });
export const getColmapCameras = () => request("/colmap/cameras");
export const getColmapImages = () => request("/colmap/images");
export const assignImageToRoom = (imageId, roomId) =>
  request(`/colmap/images/${imageId}/assign?room_id=${roomId}`, { method: "POST" });
