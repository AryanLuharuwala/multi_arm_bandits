/**
 * AR Building Management System – main entry point.
 *
 * Wires together:  API  <->  SceneManager (3D)  <->  Dashboard (2D)
 */

import * as api from "./api.js";
import { SceneManager } from "./scene.js";
import { Dashboard } from "./dashboard.js";

// ---- State ----
let currentView = "3d"; // "3d" | "ar" | "dashboard"
let selectedRoomId = null;
let buildings = [];
let floors = [];
let rooms = [];
let sensors = [];

// ---- DOM refs ----
const $viewport = document.getElementById("viewport-container");
const $dashboardC = document.getElementById("dashboard-container");
const $inspector = document.getElementById("inspector");
const $inspectorTitle = document.getElementById("inspector-title");
const $inspectorBody = document.getElementById("inspector-body");
const $breadcrumb = document.getElementById("breadcrumb");
const $navTree = document.getElementById("nav-tree");
const $infoOverlay = document.getElementById("info-overlay");
const $infoContent = document.getElementById("info-overlay-content");
const $modalOverlay = document.getElementById("modal-overlay");
const $modalTitle = document.getElementById("modal-title");
const $modalBody = document.getElementById("modal-body");

// ---- Initialise 3D scene ----
const scene = new SceneManager(document.getElementById("viewport"));
const dashboard = new Dashboard();

// ---- View switching ----
document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    document.querySelectorAll("[data-view]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    switchView();
  });
});

function switchView() {
  $viewport.classList.toggle("hidden", currentView === "dashboard");
  $dashboardC.classList.toggle("hidden", currentView !== "dashboard");

  if (currentView === "dashboard") {
    dashboard.render();
    dashboard.renderColmapPanel();
  }
  if (currentView === "ar") {
    startAR();
  }
}

// ---- Navigation tree ----

async function buildNavTree() {
  buildings = await api.getBuildings();
  let html = "";
  for (const b of buildings) {
    html += `<div class="nav-building" data-id="${b.id}"><span class="nav-icon">&#x1F3E2;</span>${b.name}</div>`;
    floors = await api.getBuildingFloors(b.id);
    for (const f of floors) {
      html += `<div class="nav-floor" data-id="${f.id}"><span class="nav-icon">&#x23F5;</span>${f.name}</div>`;
      const fRooms = await api.getFloorRooms(f.id);
      rooms.push(...fRooms);
      for (const r of fRooms) {
        html += `<div class="nav-room" data-id="${r.id}"><span class="nav-icon">&#x25AB;</span>${r.name}</div>`;
      }
    }
  }
  $navTree.innerHTML = html;

  // Click handlers
  $navTree.querySelectorAll(".nav-room").forEach((el) => {
    el.addEventListener("click", () => selectRoom(el.dataset.id));
  });
  $navTree.querySelectorAll(".nav-floor").forEach((el) => {
    el.addEventListener("click", () => selectFloor(el.dataset.id));
  });
}

function selectRoom(roomId) {
  selectedRoomId = roomId;
  // Update nav active state
  $navTree.querySelectorAll(".nav-room").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === roomId);
  });
  const room = rooms.find((r) => r.id === roomId);
  if (room) {
    $breadcrumb.textContent = `Dashboard > ${room.name}`;
    dashboard.selectedRoomId = roomId;
    if (currentView === "dashboard") dashboard.render();
    loadRoomIn3D(roomId);
  }
}

function selectFloor(floorId) {
  const floor = floors.find((f) => f.id === floorId);
  if (!floor) return;
  $navTree.querySelectorAll(".nav-floor").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === floorId);
  });
  $breadcrumb.textContent = `Dashboard > ${floor.name}`;
  loadFloorIn3D(floorId);
}

// ---- 3D scene population ----

async function loadBuildingIn3D() {
  scene.clearRooms();
  scene.clearSensors();
  scene.clearObjects();

  for (const floor of floors) {
    const floorRooms = rooms.filter((r) => floor.rooms.includes(r.id));
    for (const room of floorRooms) {
      scene.addRoom(room, floor.height_offset);
    }
  }

  sensors = await api.getSensors();
  for (const s of sensors) {
    scene.addSensor(s);
  }

  const objects = await api.getObjects();
  for (const o of objects) {
    scene.addObject(o);
  }
}

async function loadFloorIn3D(floorId) {
  scene.clearRooms();
  scene.clearSensors();
  scene.clearObjects();

  const floor = floors.find((f) => f.id === floorId);
  if (!floor) return;

  const floorRooms = rooms.filter((r) => floor.rooms.includes(r.id));
  for (const room of floorRooms) {
    scene.addRoom(room, 0);
  }

  for (const room of floorRooms) {
    const roomSensors = sensors.filter((s) => s.room_id === room.id);
    for (const s of roomSensors) scene.addSensor(s);
  }

  scene.focusOn({ x: 0, y: 1.5, z: 0 }, 15);
}

async function loadRoomIn3D(roomId) {
  scene.clearRooms();
  scene.clearSensors();
  scene.clearObjects();

  const room = rooms.find((r) => r.id === roomId);
  if (!room) return;

  const floor = floors.find((f) => f.rooms.includes(room.id));
  scene.addRoom(room, 0);

  const detail = await api.getRoomDetail(roomId);
  for (const s of detail.sensors) scene.addSensor(s);
  for (const o of detail.objects) scene.addObject(o);

  // Focus camera on room center
  const cx = (room.bounds_min.x + room.bounds_max.x) / 2;
  const cy = (room.bounds_min.y + room.bounds_max.y) / 2;
  const cz = (room.bounds_min.z + room.bounds_max.z) / 2;
  scene.focusOn({ x: cx, y: cy, z: cz }, 10);
}

// ---- 3D selection handler ----

scene.onSelect = (type, id) => {
  if (type === "sensor") showSensorInspector(id);
  else if (type === "object") showObjectInspector(id);
  else if (type === "room") selectRoom(id);
};

function showSensorInspector(sensorId) {
  const sensor = sensors.find((s) => s.id === sensorId);
  if (!sensor) return;
  $inspector.classList.remove("hidden");
  $inspectorTitle.textContent = sensor.name;
  const reading = sensor.last_reading;
  $inspectorBody.innerHTML = `
    <div class="insp-section">
      <h4>Sensor Info</h4>
      <div class="insp-row"><span class="label">Type</span><span class="value">${sensor.sensor_type}</span></div>
      <div class="insp-row"><span class="label">Status</span><span class="value"><span class="tag tag-${sensor.status}">${sensor.status}</span></span></div>
      <div class="insp-row"><span class="label">Room</span><span class="value">${sensor.room_id}</span></div>
    </div>
    <div class="insp-section">
      <h4>Current Reading</h4>
      <div style="font-size:32px; font-weight:700; color:var(--accent); text-align:center; padding:16px 0;">
        ${reading ? reading.value : "--"} <span style="font-size:14px; color:var(--text-dim);">${reading ? reading.unit : ""}</span>
      </div>
    </div>
    <div class="insp-section">
      <h4>Position</h4>
      <div class="insp-row"><span class="label">X</span><span class="value">${sensor.transform.position.x.toFixed(2)}</span></div>
      <div class="insp-row"><span class="label">Y</span><span class="value">${sensor.transform.position.y.toFixed(2)}</span></div>
      <div class="insp-row"><span class="label">Z</span><span class="value">${sensor.transform.position.z.toFixed(2)}</span></div>
    </div>
    <div class="insp-section">
      <h4>Actions</h4>
      <button class="btn btn-danger btn-sm" id="btn-delete-sensor">Delete Sensor</button>
    </div>
  `;
  document.getElementById("btn-delete-sensor")?.addEventListener("click", async () => {
    await api.deleteSensor(sensorId);
    sensors = sensors.filter((s) => s.id !== sensorId);
    $inspector.classList.add("hidden");
    if (selectedRoomId) loadRoomIn3D(selectedRoomId);
    else loadBuildingIn3D();
    dashboard.sensors = sensors;
  });
}

function showObjectInspector(objectId) {
  // Similar pattern
  $inspector.classList.remove("hidden");
  $inspectorTitle.textContent = "Object";
  $inspectorBody.innerHTML = `
    <div class="insp-section">
      <h4>Object ID</h4>
      <div class="insp-row"><span class="label">ID</span><span class="value">${objectId}</span></div>
    </div>
    <div class="insp-section">
      <h4>Actions</h4>
      <button class="btn btn-danger btn-sm" id="btn-delete-object">Delete Object</button>
    </div>
  `;
  document.getElementById("btn-delete-object")?.addEventListener("click", async () => {
    await api.deleteObject(objectId);
    $inspector.classList.add("hidden");
    if (selectedRoomId) loadRoomIn3D(selectedRoomId);
    else loadBuildingIn3D();
  });
}

document.getElementById("inspector-close")?.addEventListener("click", () => {
  $inspector.classList.add("hidden");
});

// ---- Placement ----

document.getElementById("btn-place-sensor")?.addEventListener("click", () => {
  if (!selectedRoomId) {
    showInfo("Select a room first before placing a sensor.");
    return;
  }
  showPlaceSensorModal();
});

document.getElementById("btn-place-object")?.addEventListener("click", () => {
  if (!selectedRoomId) {
    showInfo("Select a room first before placing an object.");
    return;
  }
  showPlaceObjectModal();
});

function showPlaceSensorModal() {
  $modalOverlay.classList.remove("hidden");
  $modalTitle.textContent = "Place Sensor";
  $modalBody.innerHTML = `
    <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px;">Name</label>
    <input class="insp-input" id="inp-sensor-name" placeholder="e.g. Hallway Light Sensor" />
    <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px; margin-top:8px;">Type</label>
    <select class="insp-select" id="inp-sensor-type">
      <option value="light">Light</option>
      <option value="temperature">Temperature</option>
      <option value="humidity">Humidity</option>
      <option value="motion">Motion</option>
      <option value="smoke">Smoke</option>
      <option value="camera">Camera</option>
      <option value="door">Door</option>
      <option value="hvac">HVAC</option>
      <option value="power">Power</option>
      <option value="custom">Custom</option>
    </select>
    <p style="font-size:11px; color:var(--text-dim); margin-top:12px;">
      Click "Confirm" then click in the 3D view to place the sensor.
    </p>
  `;

  const confirmBtn = document.getElementById("modal-confirm");
  const handler = () => {
    const name = document.getElementById("inp-sensor-name").value || "Sensor";
    const type = document.getElementById("inp-sensor-type").value;
    closeModal();
    showInfo("Click in the 3D view to place the sensor...");

    scene.enterPlacementMode(async (pos) => {
      scene.exitPlacementMode();
      hideInfo();
      try {
        const sensor = await api.placeSensor({
          room_id: selectedRoomId,
          name,
          sensor_type: type,
          position: pos,
        });
        sensors.push(sensor);
        scene.addSensor(sensor);
        dashboard.sensors = sensors;
        showInfo(`Sensor "${name}" placed successfully.`);
        setTimeout(hideInfo, 3000);
      } catch (err) {
        showInfo(`Error: ${err.message}`);
      }
    });
    confirmBtn.removeEventListener("click", handler);
  };
  confirmBtn.addEventListener("click", handler);
}

function showPlaceObjectModal() {
  $modalOverlay.classList.remove("hidden");
  $modalTitle.textContent = "Place Object";
  $modalBody.innerHTML = `
    <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px;">Name</label>
    <input class="insp-input" id="inp-obj-name" placeholder="e.g. Fire Extinguisher" />
    <label style="font-size:12px; color:var(--text-dim); display:block; margin-bottom:4px; margin-top:8px;">Type</label>
    <select class="insp-select" id="inp-obj-type">
      <option value="furniture">Furniture</option>
      <option value="equipment">Equipment</option>
      <option value="marker">Marker</option>
      <option value="safety">Safety Equipment</option>
      <option value="generic">Generic</option>
    </select>
    <p style="font-size:11px; color:var(--text-dim); margin-top:12px;">
      Click "Confirm" then click in the 3D view to place the object.
    </p>
  `;

  const confirmBtn = document.getElementById("modal-confirm");
  const handler = () => {
    const name = document.getElementById("inp-obj-name").value || "Object";
    const type = document.getElementById("inp-obj-type").value;
    closeModal();
    showInfo("Click in the 3D view to place the object...");

    scene.enterPlacementMode(async (pos) => {
      scene.exitPlacementMode();
      hideInfo();
      try {
        const obj = await api.placeObject({
          room_id: selectedRoomId,
          name,
          object_type: type,
          position: pos,
        });
        scene.addObject(obj);
        showInfo(`Object "${name}" placed successfully.`);
        setTimeout(hideInfo, 3000);
      } catch (err) {
        showInfo(`Error: ${err.message}`);
      }
    });
    confirmBtn.removeEventListener("click", handler);
  };
  confirmBtn.addEventListener("click", handler);
}

// ---- Modal helpers ----

function closeModal() {
  $modalOverlay.classList.add("hidden");
}
document.getElementById("modal-close")?.addEventListener("click", closeModal);
document.getElementById("modal-cancel")?.addEventListener("click", closeModal);

// ---- Info overlay ----

function showInfo(msg) {
  $infoOverlay.classList.remove("hidden");
  $infoContent.textContent = msg;
}

function hideInfo() {
  $infoOverlay.classList.add("hidden");
}

// ---- Point cloud upload ----

document.getElementById("btn-upload-pc")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".ply,.pcd,.xyz,.txt";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showInfo(`Uploading ${file.name}...`);
    try {
      await api.uploadPointCloud(file);
      showInfo(`Loading point cloud...`);
      const buf = await api.getPointCloudData(file.name);
      scene.clearPointClouds();
      scene.addPointCloud(buf, file.name);
      hideInfo();
    } catch (err) {
      showInfo(`Error: ${err.message}`);
    }
  };
  input.click();
});

// ---- COLMAP load ----

document.getElementById("btn-load-colmap")?.addEventListener("click", async () => {
  showInfo("Loading COLMAP workspace...");
  try {
    const result = await api.loadColmap("default");
    showInfo(`Loaded ${result.cameras} cameras, ${result.images} images, ${result.points} points`);

    // Show cameras in 3D
    const images = await api.getColmapImages();
    scene.clearColmapCameras();
    for (const img of images) {
      scene.addColmapCamera(img);
    }

    if (currentView === "dashboard") {
      dashboard.renderColmapPanel();
    }
    setTimeout(hideInfo, 4000);
  } catch (err) {
    showInfo(`COLMAP: ${err.message}`);
  }
});

// ---- AR mode ----

async function startAR() {
  try {
    await scene.enterAR();
  } catch (err) {
    showInfo(`AR: ${err.message}`);
    // Fall back to 3D view
    currentView = "3d";
    document.querySelectorAll("[data-view]").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-view="3d"]')?.classList.add("active");
    switchView();
  }
}

// ---- Dashboard callbacks ----

dashboard.onRoomSelect = (roomId) => selectRoom(roomId);
dashboard.onSensorSelect = (sensorId) => {
  showSensorInspector(sensorId);
  // Switch to 3D and focus
  currentView = "3d";
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.remove("active"));
  document.querySelector('[data-view="3d"]')?.classList.add("active");
  switchView();
  const sensor = sensors.find((s) => s.id === sensorId);
  if (sensor?.transform?.position) {
    scene.focusOn(sensor.transform.position, 5);
  }
};

// ---- Boot ----

async function init() {
  try {
    await buildNavTree();
    sensors = await api.getSensors();
    dashboard.buildings = buildings;
    dashboard.floors = floors;
    dashboard.rooms = rooms;
    dashboard.sensors = sensors;
    await loadBuildingIn3D();

    // Try loading any existing point clouds
    const pcs = await api.getPointClouds();
    for (const pc of pcs) {
      try {
        const buf = await api.getPointCloudData(pc.name);
        scene.addPointCloud(buf, pc.name);
      } catch { /* skip */ }
    }
  } catch (err) {
    console.error("Init failed:", err);
    showInfo("Backend not available. Start with: uvicorn backend.app.main:app --reload");
  }
}

init();
