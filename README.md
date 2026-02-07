# AR Building Management System

A web-based building management system with 3D/AR visualization, point cloud rendering, sensor overlays, and COLMAP camera integration.

## Architecture

```
├── backend/           Python FastAPI backend
│   └── app/
│       ├── main.py           FastAPI application
│       ├── models/schemas.py Pydantic data models
│       ├── routes/           REST API endpoints
│       │   ├── buildings.py  Building/floor/room CRUD
│       │   ├── sensors.py    Sensor & object placement
│       │   └── pointclouds.py Point cloud & COLMAP
│       └── services/
│           ├── building_store.py  In-memory data store
│           ├── colmap_parser.py   COLMAP text format parser
│           └── point_cloud.py     Point cloud loading & streaming
├── frontend/          Vite + Three.js frontend
│   └── src/
│       ├── main.js        App entry, wiring & UI logic
│       ├── scene.js       Three.js 3D scene manager
│       ├── dashboard.js   Dashboard card rendering
│       ├── api.js         Backend API client
│       └── styles.css     Full UI stylesheet
├── data/
│   ├── point_clouds/  Upload .ply / .pcd / .xyz files here
│   ├── colmap/        COLMAP workspaces (cameras.txt, images.txt, points3D.txt)
│   ├── images/        Building photos
│   └── sensors/       Sensor config
└── run.sh             One-command startup
```

## Quick Start

```bash
chmod +x run.sh
./run.sh
# Open http://localhost:5173
```

Or start each part individually:

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Features

### 3D Building Viewer
- Three.js renderer with orbit controls
- Point cloud loading (PLY, PCD, XYZ formats)
- Room bounding boxes with labels
- Sensor markers with glow effects
- Click-to-select sensors, objects, and rooms

### Dashboard
- Building overview with floor/room hierarchy
- Live sensor grid with current readings
- Alert system (temperature, smoke, offline sensors)
- Interactive 2D floor map
- Room detail panel with sensor list
- COLMAP camera panel

### Sensor & Object Placement
- Click "Sensor" or "Object" button in the toolbar
- Choose type/name in the modal
- Click anywhere in the 3D view to place
- Inspector panel shows details on click
- Delete sensors/objects from the inspector

### AR Mode
- WebXR immersive-ar session (requires compatible device/browser)
- Falls back to 3D view if unsupported

### COLMAP Integration
- Load COLMAP text workspaces (cameras.txt, images.txt, points3D.txt)
- Visualize camera positions as 3D frustums
- Assign images to rooms
- Dashboard panel showing registered images

### Point Cloud Upload
- Click "Upload Point Cloud" in the sidebar
- Supports .ply, .pcd, .xyz formats
- Streams as compact binary to the 3D viewer
- Auto-centers camera on the cloud

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/buildings` | List buildings |
| GET | `/api/buildings/{id}/floors` | List floors |
| GET | `/api/buildings/floors/{id}/rooms` | List rooms on floor |
| GET | `/api/buildings/rooms/{id}/detail` | Room with sensors & objects |
| GET | `/api/sensors` | List sensors (optional `?room_id=`) |
| POST | `/api/sensors` | Place a new sensor |
| POST | `/api/sensors/{id}/reading` | Push a sensor reading |
| GET | `/api/sensors/{id}/history` | Reading history |
| DELETE | `/api/sensors/{id}` | Remove sensor |
| GET | `/api/objects` | List placed objects |
| POST | `/api/objects` | Place a new object |
| DELETE | `/api/objects/{id}` | Remove object |
| GET | `/api/pointclouds` | List available point clouds |
| GET | `/api/pointclouds/{file}/data` | Stream point cloud binary |
| POST | `/api/pointclouds/upload` | Upload a point cloud |
| POST | `/api/colmap/load` | Load COLMAP workspace |
| GET | `/api/colmap/cameras` | Get COLMAP cameras |
| GET | `/api/colmap/images` | Get COLMAP images |

## Adding Your Own Data

1. **Point clouds**: Drop `.ply` / `.pcd` / `.xyz` files into `data/point_clouds/`, or use the upload button
2. **COLMAP**: Place your COLMAP text output in `data/colmap/<workspace-name>/` with `cameras.txt`, `images.txt`, and `points3D.txt`
3. **Sensor data**: Push readings via `POST /api/sensors/{id}/reading` from any IoT gateway
