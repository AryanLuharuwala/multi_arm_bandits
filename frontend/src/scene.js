/**
 * Three.js 3D scene manager for the AR Building Management System.
 *
 * Handles:
 *  - Point cloud rendering
 *  - Room bounding boxes
 *  - Sensor / object markers
 *  - Camera controls (orbit)
 *  - Raycasting for object selection
 *  - WebXR AR mode
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Sensor type -> colour
const SENSOR_COLORS = {
  light: 0xfbbf24,
  temperature: 0xf87171,
  humidity: 0x60a5fa,
  motion: 0x34d399,
  smoke: 0xfb923c,
  camera: 0xa78bfa,
  door: 0x818cf8,
  hvac: 0x2dd4bf,
  power: 0xe879f9,
  custom: 0x94a3b8,
};

export class SceneManager {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.onSelect = null; // callback(type, id)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x0f1117, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0f1117, 0.015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      500
    );
    this.camera.position.set(15, 12, 15);

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 2, 0);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);

    // Grid
    const grid = new THREE.GridHelper(60, 60, 0x2e3348, 0x1a1d27);
    this.scene.add(grid);

    // Groups for organisation
    this.pointCloudGroup = new THREE.Group();
    this.roomGroup = new THREE.Group();
    this.sensorGroup = new THREE.Group();
    this.objectGroup = new THREE.Group();
    this.cameraGroup = new THREE.Group(); // COLMAP cameras
    this.scene.add(
      this.pointCloudGroup,
      this.roomGroup,
      this.sensorGroup,
      this.objectGroup,
      this.cameraGroup
    );

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.15;
    this.mouse = new THREE.Vector2();

    // Interaction
    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    window.addEventListener("resize", () => this._onResize());

    // Placement mode
    this._placementMode = false;
    this._placementCallback = null;
    this._placementPreview = null;

    // Start render loop
    this._animate();
  }

  // ---- Render loop ----

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---- Point clouds ----

  /**
   * Add a point cloud from a binary buffer.
   * Wire format: uint32 numPoints, uint8 hasColors, float32[] xyz, uint8[] rgb
   */
  addPointCloud(buffer, name = "cloud") {
    const view = new DataView(buffer);
    const numPoints = view.getUint32(0, true);
    const hasColors = view.getUint8(4) === 1;

    const posOffset = 5;
    const positions = new Float32Array(buffer, posOffset, numPoints * 3);

    let colors = null;
    if (hasColors) {
      const colOffset = posOffset + numPoints * 12;
      const rawColors = new Uint8Array(buffer, colOffset, numPoints * 3);
      colors = new Float32Array(numPoints * 3);
      for (let i = 0; i < numPoints * 3; i++) {
        colors[i] = rawColors[i] / 255;
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (colors) {
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    const mat = new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: !!colors,
      color: colors ? 0xffffff : 0x4f8cff,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geom, mat);
    points.name = name;
    this.pointCloudGroup.add(points);

    // Auto-center camera
    geom.computeBoundingBox();
    const center = new THREE.Vector3();
    geom.boundingBox.getCenter(center);
    this.controls.target.copy(center);
    const size = new THREE.Vector3();
    geom.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    this.camera.position.copy(
      center.clone().add(new THREE.Vector3(maxDim, maxDim * 0.8, maxDim))
    );

    return points;
  }

  clearPointClouds() {
    this.pointCloudGroup.clear();
  }

  // ---- Rooms ----

  addRoom(roomData, floorHeight = 0) {
    const min = roomData.bounds_min;
    const max = roomData.bounds_max;
    const sx = max.x - min.x;
    const sy = max.y - min.y;
    const sz = max.z - min.z;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2 + floorHeight;
    const cz = (min.z + max.z) / 2;

    // Wireframe box
    const geom = new THREE.BoxGeometry(sx, sy, sz);
    const edges = new THREE.EdgesGeometry(geom);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x4f8cff, opacity: 0.4, transparent: true })
    );
    line.position.set(cx, cy, cz);
    line.userData = { type: "room", id: roomData.id, name: roomData.name };

    // Semi-transparent floor plane
    const floorGeom = new THREE.PlaneGeometry(sx, sz);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x4f8cff,
      opacity: 0.06,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, min.y + floorHeight, cz);
    floorMesh.userData = { type: "room", id: roomData.id };

    // Label
    const label = this._makeTextSprite(roomData.name, { color: "#4f8cff", size: 0.4 });
    label.position.set(cx, max.y + floorHeight + 0.3, cz);

    const group = new THREE.Group();
    group.add(line, floorMesh, label);
    group.userData = { type: "room", id: roomData.id };
    this.roomGroup.add(group);
    return group;
  }

  clearRooms() {
    this.roomGroup.clear();
  }

  // ---- Sensors ----

  addSensor(sensor) {
    const color = SENSOR_COLORS[sensor.sensor_type] || 0x94a3b8;
    const pos = sensor.transform?.position || { x: 0, y: 0, z: 0 };

    // Glowing sphere
    const geom = new THREE.SphereGeometry(0.15, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { type: "sensor", id: sensor.id, sensorType: sensor.sensor_type };

    // Pulsing ring
    const ringGeom = new THREE.RingGeometry(0.2, 0.28, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      opacity: 0.3,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.copy(mesh.position);
    ring.rotation.x = -Math.PI / 2;

    // Label
    const label = this._makeTextSprite(sensor.name, { color: "#e2e4ea", size: 0.25 });
    label.position.set(pos.x, pos.y + 0.35, pos.z);

    const group = new THREE.Group();
    group.add(mesh, ring, label);
    group.userData = { type: "sensor", id: sensor.id };
    this.sensorGroup.add(group);
    return group;
  }

  clearSensors() {
    this.sensorGroup.clear();
  }

  // ---- Placed objects ----

  addObject(obj) {
    const pos = obj.transform?.position || { x: 0, y: 0, z: 0 };
    const scale = obj.transform?.scale || { x: 1, y: 1, z: 1 };

    // Simple box placeholder (real app would load glTF models)
    const geom = new THREE.BoxGeometry(0.4 * scale.x, 0.4 * scale.y, 0.4 * scale.z);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.3,
      roughness: 0.7,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { type: "object", id: obj.id };

    const label = this._makeTextSprite(obj.name, { color: "#94a3b8", size: 0.2 });
    label.position.set(pos.x, pos.y + 0.4, pos.z);

    const group = new THREE.Group();
    group.add(mesh, label);
    group.userData = { type: "object", id: obj.id };
    this.objectGroup.add(group);
    return group;
  }

  clearObjects() {
    this.objectGroup.clear();
  }

  // ---- COLMAP cameras ----

  addColmapCamera(image) {
    // Frustum representation
    const helper = new THREE.CameraHelper(
      new THREE.PerspectiveCamera(50, 1.33, 0.1, 0.5)
    );
    const pos = image.translation;
    helper.position.set(pos.x, pos.y, pos.z);
    helper.userData = { type: "colmap_image", id: image.id, name: image.name };

    // Simpler: small pyramid
    const geom = new THREE.ConeGeometry(0.12, 0.25, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, wireframe: true });
    const cone = new THREE.Mesh(geom, mat);
    cone.position.set(pos.x, pos.y, pos.z);
    cone.userData = { type: "colmap_image", id: image.id, name: image.name };

    const label = this._makeTextSprite(image.name, { color: "#a78bfa", size: 0.18 });
    label.position.set(pos.x, pos.y + 0.3, pos.z);

    const group = new THREE.Group();
    group.add(cone, label);
    group.userData = { type: "colmap_image", id: image.id };
    this.cameraGroup.add(group);
    return group;
  }

  clearColmapCameras() {
    this.cameraGroup.clear();
  }

  // ---- Placement mode ----

  enterPlacementMode(callback) {
    this._placementMode = true;
    this._placementCallback = callback;
    this.canvas.style.cursor = "crosshair";

    // Preview sphere
    const geom = new THREE.SphereGeometry(0.15, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4f8cff,
      opacity: 0.5,
      transparent: true,
    });
    this._placementPreview = new THREE.Mesh(geom, mat);
    this.scene.add(this._placementPreview);

    this._placementMoveHandler = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      // Intersect with y=0 plane
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pt = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(plane, pt);
      if (pt) this._placementPreview.position.copy(pt);
    };
    this.canvas.addEventListener("pointermove", this._placementMoveHandler);
  }

  exitPlacementMode() {
    this._placementMode = false;
    this._placementCallback = null;
    this.canvas.style.cursor = "";
    if (this._placementPreview) {
      this.scene.remove(this._placementPreview);
      this._placementPreview = null;
    }
    if (this._placementMoveHandler) {
      this.canvas.removeEventListener("pointermove", this._placementMoveHandler);
    }
  }

  // ---- Selection / raycasting ----

  _onPointerDown(e) {
    if (this._placementMode) {
      if (this._placementPreview && this._placementCallback) {
        const pos = this._placementPreview.position;
        this._placementCallback({ x: pos.x, y: pos.y, z: pos.z });
      }
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const targets = [
      ...this.sensorGroup.children,
      ...this.objectGroup.children,
      ...this.roomGroup.children,
    ];
    const allMeshes = [];
    targets.forEach((g) => g.traverse((c) => c.isMesh && allMeshes.push(c)));

    const hits = this.raycaster.intersectObjects(allMeshes, false);
    if (hits.length > 0) {
      let obj = hits[0].object;
      // Walk up to find userData
      while (obj && !obj.userData?.type) obj = obj.parent;
      if (obj?.userData?.type && this.onSelect) {
        this.onSelect(obj.userData.type, obj.userData.id);
      }
    }
  }

  // ---- Text sprites ----

  _makeTextSprite(text, { color = "#ffffff", size = 0.3 } = {}) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 512;
    canvas.height = 64;
    ctx.font = "bold 32px Inter, Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size * (canvas.width / canvas.height), size, 1);
    return sprite;
  }

  // ---- WebXR AR ----

  async enterAR() {
    if (!navigator.xr) {
      throw new Error("WebXR not supported in this browser");
    }
    const supported = await navigator.xr.isSessionSupported("immersive-ar");
    if (!supported) {
      throw new Error("Immersive AR not supported on this device");
    }

    this.renderer.xr.enabled = true;
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
    });
    this.renderer.xr.setSession(session);
    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ---- Focus camera on position ----

  focusOn(position, distance = 8) {
    const target = new THREE.Vector3(position.x, position.y, position.z);
    this.controls.target.copy(target);
    this.camera.position.copy(
      target.clone().add(new THREE.Vector3(distance, distance * 0.6, distance))
    );
  }
}
