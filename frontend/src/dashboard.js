/**
 * Dashboard rendering – populates the dashboard cards with live data.
 */

import * as api from "./api.js";

const SENSOR_ICONS = {
  light: "\u{1F4A1}",      // light bulb
  temperature: "\u{1F321}", // thermometer
  humidity: "\u{1F4A7}",   // droplet
  motion: "\u{1F3C3}",     // runner
  smoke: "\u{1F525}",      // fire
  camera: "\u{1F4F7}",     // camera
  door: "\u{1F6AA}",       // door
  hvac: "\u{2744}",        // snowflake
  power: "\u{26A1}",       // zap
  custom: "\u{2699}",      // gear
};

export class Dashboard {
  constructor() {
    this.buildings = [];
    this.floors = [];
    this.rooms = [];
    this.sensors = [];
    this.selectedRoomId = null;
    this.onRoomSelect = null;
    this.onSensorSelect = null;
  }

  async loadData() {
    try {
      this.buildings = await api.getBuildings();
      if (this.buildings.length > 0) {
        this.floors = await api.getBuildingFloors(this.buildings[0].id);
        // Load all rooms
        this.rooms = [];
        for (const floor of this.floors) {
          const rooms = await api.getFloorRooms(floor.id);
          this.rooms.push(...rooms);
        }
        this.sensors = await api.getSensors();
      }
    } catch (err) {
      console.error("Dashboard data load failed:", err);
    }
  }

  render() {
    this._renderOverview();
    this._renderSensors();
    this._renderAlerts();
    this._renderFloorMap();
    this._renderRoomDetail();
  }

  _renderOverview() {
    const el = document.getElementById("overview-content");
    if (!el) return;

    const totalSensors = this.sensors.length;
    const online = this.sensors.filter((s) => s.status === "online").length;
    const totalRooms = this.rooms.length;

    el.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:8px;">
        <div style="text-align:center;">
          <div style="font-size:28px; font-weight:700; color:var(--accent);">${this.buildings.length}</div>
          <div style="font-size:11px; color:var(--text-dim);">Buildings</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:28px; font-weight:700; color:var(--green);">${totalRooms}</div>
          <div style="font-size:11px; color:var(--text-dim);">Rooms</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:28px; font-weight:700; color:var(--yellow);">${totalSensors}</div>
          <div style="font-size:11px; color:var(--text-dim);">Sensors</div>
        </div>
      </div>
      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        ${this.floors
          .map(
            (f) => `
          <div style="flex:1; min-width:100px; padding:8px 12px; background:var(--bg-panel); border-radius:var(--radius); border-left:3px solid var(--accent);">
            <div style="font-size:12px; font-weight:600;">${f.name}</div>
            <div style="font-size:10px; color:var(--text-dim);">Level ${f.level} &middot; ${f.rooms.length} rooms</div>
          </div>`
          )
          .join("")}
      </div>
      <div style="margin-top:12px; font-size:11px; color:var(--text-dim);">
        ${online}/${totalSensors} sensors online
      </div>
    `;
  }

  _renderSensors() {
    const el = document.getElementById("sensors-grid");
    if (!el) return;

    if (this.sensors.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No sensors configured</p></div>';
      return;
    }

    el.innerHTML = this.sensors
      .map((s) => {
        const icon = SENSOR_ICONS[s.sensor_type] || SENSOR_ICONS.custom;
        const reading = s.last_reading;
        const value = reading ? reading.value : "--";
        const unit = reading ? reading.unit : "";
        const room = this.rooms.find((r) => r.id === s.room_id);
        const statusClass = s.status !== "online" ? `status-${s.status}` : "";
        return `
          <div class="sensor-tile ${statusClass}" data-sensor-id="${s.id}">
            <div class="sensor-icon">${icon}</div>
            <div class="sensor-info">
              <div class="sensor-name">${s.name}</div>
              <div class="sensor-room">${room ? room.name : s.room_id}</div>
            </div>
            <div style="text-align:right;">
              <div class="sensor-reading">${value}</div>
              <div class="sensor-unit">${unit}</div>
            </div>
            <span class="tag tag-${s.status}">${s.status}</span>
          </div>`;
      })
      .join("");

    // Click handlers
    el.querySelectorAll(".sensor-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const id = tile.dataset.sensorId;
        if (this.onSensorSelect) this.onSensorSelect(id);
      });
    });
  }

  _renderAlerts() {
    const el = document.getElementById("alerts-list");
    if (!el) return;

    const alerts = [];

    // Generate alerts from sensor data
    for (const s of this.sensors) {
      if (s.status === "offline") {
        alerts.push({ level: "red", msg: `${s.name} is offline` });
      } else if (s.status === "warning") {
        alerts.push({ level: "yellow", msg: `${s.name} warning` });
      }
      if (s.sensor_type === "temperature" && s.last_reading?.value > 30) {
        alerts.push({ level: "yellow", msg: `${s.name}: High temperature (${s.last_reading.value}${s.last_reading.unit})` });
      }
      if (s.sensor_type === "smoke" && s.last_reading?.value > 0) {
        alerts.push({ level: "red", msg: `${s.name}: SMOKE DETECTED` });
      }
    }

    if (alerts.length === 0) {
      alerts.push({ level: "green", msg: "All systems normal" });
    }

    el.innerHTML = alerts
      .map(
        (a) => `
      <div class="alert-item">
        <div class="alert-dot ${a.level}"></div>
        <span>${a.msg}</span>
      </div>`
      )
      .join("");
  }

  _renderFloorMap() {
    const canvas = document.getElementById("floor-map-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Set actual pixel dimensions
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#1a1d27";
    ctx.fillRect(0, 0, w, h);

    if (this.rooms.length === 0) return;

    // Simple 2D layout: arrange rooms in a grid per floor
    const padding = 12;
    const floorH = (h - padding * 2) / Math.max(this.floors.length, 1);

    this.floors.forEach((floor, fi) => {
      const fy = padding + fi * floorH;
      const floorRooms = this.rooms.filter((r) => floor.rooms.includes(r.id));
      const roomW = (w - padding * 2) / Math.max(floorRooms.length, 1);

      // Floor label
      ctx.fillStyle = "#8b8fa3";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(floor.name, padding, fy + 12);

      floorRooms.forEach((room, ri) => {
        const rx = padding + ri * roomW + 4;
        const ry = fy + 18;
        const rw = roomW - 8;
        const rh = floorH - 26;

        const isSelected = room.id === this.selectedRoomId;
        ctx.strokeStyle = isSelected ? "#4f8cff" : "#2e3348";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.fillStyle = isSelected ? "rgba(79,140,255,0.1)" : "rgba(34,38,50,0.8)";

        // Rounded rect
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + rw - r, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
        ctx.lineTo(rx + rw, ry + rh - r);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
        ctx.lineTo(rx + r, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Room name
        ctx.fillStyle = isSelected ? "#4f8cff" : "#e2e4ea";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.fillText(room.name, rx + 6, ry + 14);

        // Sensor count
        const sensorCount = this.sensors.filter((s) => s.room_id === room.id).length;
        if (sensorCount > 0) {
          ctx.fillStyle = "#8b8fa3";
          ctx.font = "8px Inter, sans-serif";
          ctx.fillText(`${sensorCount} sensors`, rx + 6, ry + 26);
        }
      });
    });

    // Click handler for floor map
    canvas.onclick = (e) => {
      const cr = canvas.getBoundingClientRect();
      const mx = e.clientX - cr.left;
      const my = e.clientY - cr.top;

      const floorHh = (h - padding * 2) / Math.max(this.floors.length, 1);
      this.floors.forEach((floor, fi) => {
        const fy = padding + fi * floorHh;
        const floorRooms = this.rooms.filter((r) => floor.rooms.includes(r.id));
        const roomW = (w - padding * 2) / Math.max(floorRooms.length, 1);
        floorRooms.forEach((room, ri) => {
          const rx = padding + ri * roomW;
          const ry = fy + 18;
          const rw = roomW;
          const rh = floorHh - 26;
          if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
            this.selectedRoomId = room.id;
            if (this.onRoomSelect) this.onRoomSelect(room.id);
            this.render();
          }
        });
      });
    };
  }

  _renderRoomDetail() {
    const el = document.getElementById("room-detail-panel");
    if (!el) return;

    if (!this.selectedRoomId) {
      el.innerHTML = '<div class="empty-state"><p>Select a room to view details</p></div>';
      return;
    }

    const room = this.rooms.find((r) => r.id === this.selectedRoomId);
    if (!room) return;

    const roomSensors = this.sensors.filter((s) => s.room_id === room.id);

    el.innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="font-size:16px; font-weight:700;">${room.name}</div>
        <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
          Type: ${room.room_type} &middot; ${roomSensors.length} sensors
        </div>
      </div>
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">SENSORS</div>
      ${roomSensors
        .map((s) => {
          const icon = SENSOR_ICONS[s.sensor_type] || SENSOR_ICONS.custom;
          const val = s.last_reading ? `${s.last_reading.value} ${s.last_reading.unit}` : "--";
          return `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border);">
              <span>${icon}</span>
              <span style="flex:1; font-size:12px;">${s.name}</span>
              <span style="font-size:13px; font-weight:600; color:var(--accent);">${val}</span>
            </div>`;
        })
        .join("")}
    `;
  }

  async renderColmapPanel() {
    const el = document.getElementById("colmap-panel");
    if (!el) return;

    try {
      const images = await api.getColmapImages();
      if (images.length === 0) {
        el.innerHTML = '<div class="empty-state"><p>No COLMAP data loaded.<br>Use "Load COLMAP" to import.</p></div>';
        return;
      }

      el.innerHTML = `
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">${images.length} registered images</div>
        ${images
          .slice(0, 20)
          .map(
            (img) => `
          <div class="colmap-image-item">
            <span class="cam-icon">&#x1F4F7;</span>
            <span style="flex:1;">${img.name}</span>
            <span style="font-size:10px; color:var(--text-dim);">cam ${img.camera_id}</span>
            ${img.room_id ? `<span class="tag tag-online">${img.room_id}</span>` : ""}
          </div>`
          )
          .join("")}
        ${images.length > 20 ? `<div style="font-size:11px; color:var(--text-dim); margin-top:8px;">+ ${images.length - 20} more</div>` : ""}
      `;
    } catch {
      el.innerHTML = '<div class="empty-state"><p>COLMAP data not available</p></div>';
    }
  }
}
