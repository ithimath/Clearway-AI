# Clearway AI — Railway Block Planning & Maintenance Window Optimizer

> **Academic / Hackathon Decision-Support Prototype**  
> **DISCLAIMER:** Clearway AI is an academic decision-support prototype. It is **NOT** a certified railway signalling, interlocking, or vital safety-critical system. It must **NEVER** be used to control real-world trains or track circuits.

---

## 1. Overview & Problem Statement
Railway infrastructure requires periodic civil engineering, track tamping, and overhead electrification (OHE) maintenance, which necessitates temporary track possessions ("block closures"). Train planners must coordinate passenger express and freight schedules around these maintenance windows while minimizing passenger delays, respecting junction capacities, and preventing single-track head-on or headway collisions.

**Clearway AI** is an end-to-end decision-support prototype featuring:
1. **Delhi–Agra Indian Railways Corridor Model**: 10 stations (New Delhi `NDLS` through Agra Cantt `AGC`), double and single-track sections, passing loops, and automatic block signalling sections.
2. **Rule-Based Conflict Radar**: Real-time evaluation of:
   - Single-track head-on opposition conflicts
   - Block headway buffer violations
   - Junction clearance headway conflicts
   - Maintenance window vs train path collisions
3. **Google OR-Tools CP-SAT Schedule Optimizer**: Non-overlapping interval decision variable formulations minimizing weighted train delays and timetable disruptions.
4. **CP-SAT Maintenance Window Optimizer**: Mathematical allocation of maintenance possession time slots with zero train safety conflicts.
5. **Time-Distance Stringline (Marey) Diagram**: Interactive trajectory chart highlighting crossing conflicts and maintenance block-out periods.
6. **Time-Stepped Simulation Engine**: Deterministic minute-by-minute simulation clock (1x, 2x, 5x, 10x speed, Play/Pause/Step/Reset).
7. **What-If Perturbation Sandbox**: Synthetic scenario injection for train breakdowns, track fractures, and fog protocols.
8. **Explicit Data Provenance**: Every entity is labeled with scientific transparency (`[REAL DATA]`, `[DERIVED]`, `[ASSUMED]`, `[SIMULATED]`).

---

## 2. Architecture & Tech Stack

```
clearway-ai/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI routers (network, trains, blocks, conflicts,
│   │   │                    #  simulation, optimize, maintenance, scenarios, jobs, export)
│   │   ├── domain/          # Pure Python core logic (graph, conflict_rules, simulator,
│   │   │                    #  synthetic_network)
│   │   ├── optimization/    # OR-Tools CP-SAT interval models (cpsat_schedule, maintenance_planner)
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── services/        # Singleton simulation service, DB seeder, scenario runner
│   │   ├── config.py        # Settings (corridor, horizon, time limits)
│   │   └── main.py          # Application entrypoint & startup seeder
│   ├── tests/               # pytest suite (unit & integration tests)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/client.ts    # Typed fetch client
    │   ├── components/      # UI Views (CorridorMap, StringlineDiagram, ConflictRadar,
    │   │                    #  MaintenancePlanner, ScheduleOptimizer, ScenarioSandbox,
    │   │                    #  AnalyticsView, Header, Footer)
    │   ├── styles/index.css # Vanilla CSS design system (Dark mode, Glassmorphism, animations)
    │   ├── types/index.ts   # TypeScript interfaces
    │   └── App.tsx          # Master coordinator & polling loop
    └── package.json
```

---

## 3. Data Provenance Matrix

| Data Entity | Classification | Methodology & Source |
| :--- | :--- | :--- |
| **Station Coordinates** | `ASSUMED` | Geometrical approximation along Delhi–Agra corridor |
| **Running Times & Headways** | `ASSUMED` | Standard 5-minute safety headway, sectional running times |
| **Block Partitioning** | `ASSUMED` | 2 automatic signalling blocks per inter-station section |
| **Timetable Schedules** | `DERIVED` | Generated timetable for 12 express services |
| **Rule Violations** | `DERIVED` | Formally evaluated conflict rules engine |
| **Optimized Dispatches** | `DERIVED` | Exact mathematical solution from Google OR-Tools CP-SAT |
| **Simulation State** | `SIMULATED` | Deterministic time-stepped simulation runtime |

---

## 4. Running Locally

### Backend (FastAPI + OR-Tools)
```bash
cd backend
uv pip install -r requirements.txt
uv run python -m app.services.seed
uv run uvicorn app.main:app --port 8000 --host 127.0.0.1
```

### Frontend (React + TypeScript + Vite)
```bash
cd frontend
npm install
npm run dev
```

Visit the dashboard in your browser: **`http://127.0.0.1:5173`**

### Running Test Suite
```bash
cd backend
uv run pytest
```
