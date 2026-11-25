# innoRoutes

Web app for monitoring the office 4G/5G gateways and the network usage of every client PC.

```
innoRoutes/
├── backend/    FastAPI + SQLAlchemy + APScheduler (polls the routers every 30 s into SQLite)
└── frontend/   React Router v8 framework mode (the successor of Remix) + Tailwind + shadcn/ui + Recharts
```

## What each router type provides

| Gateway | Model | Without password | With admin password |
|---|---|---|---|
| 192.168.9.14 / .16 | Brovi H153-381 (Huawei 5G CPE 5s) | live speed, today / month usage, carrier, network type, unread SMS, firmware update status, response time | + signal (RSRP/SINR/bars), firmware version, WAN IP, **per-PC traffic** |
| 192.168.9.15 | Huawei H155-381 (5G CPE 5) | same as above | same as above |
| 192.168.9.4 / .5 / .6 | USR-G815 (4G) | response time, model | + signal (CSQ), carrier, network mode, WAN IP, firmware version. No per-PC or traffic data: the firmware does not expose it |

## First run

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then edit .env (see below)
.venv/bin/python -m app.seed  # admin user + the six gateways (safe to re-run)
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In `backend/.env`:

- `SECRET_KEY`: long random string (signs logins and encrypts stored router passwords).
- `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`: the first web login (leave the password empty to have one generated and printed).
- `SEED_USR_PASSWORD`: admin password of gateways .4 / .5 / .6.
- `SEED_HUAWEI_PASSWORD`: admin password of gateways .14 / .15 / .16.
- `DATABASE_URL`: SQLite by default; MySQL and PostgreSQL examples are in the comments (install the matching driver from `requirements.txt`).

Router passwords can also be entered or changed later in **Settings → Routers**. They are stored encrypted.

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # API_URL (backend address) and SESSION_SECRET
npm run dev            # http://localhost:5173
```

Production: `npm run build && npm start` (serves on port 3000; set `PORT` to change). When serving over plain HTTP inside the LAN, set `INSECURE_COOKIES=true` in `frontend/.env` so the login cookie is accepted.

## Demo data

To try the UI with four weeks of synthetic history, without touching the real database:

```bash
cd backend
DATABASE_URL=sqlite:///./demo.db SCHEDULER_ENABLED=false .venv/bin/python -m app.seed --demo
DATABASE_URL=sqlite:///./demo.db SCHEDULER_ENABLED=false .venv/bin/uvicorn app.main:app --port 8001
# then in frontend/: API_URL=http://127.0.0.1:8001 npm run dev
```

## How usage is measured

- Every poll stores a sample per router and per PC. Routers only expose running byte counters, so the poller stores the **increase since the previous poll** (a counter that drops is treated as a reset).
- 1 h usage comes from the raw samples, 24 h / 1 week / 4 weeks from an hourly roll-up (`usage_hourly`), which also feeds the hourly / daily / weekly charts on the PC page.
- Raw samples are kept for `RAW_RETENTION_DAYS` (8), hourly totals for `HOURLY_RETENTION_DAYS` (400).
- History starts when the backend starts polling: the routers keep no per-PC history themselves.
- PCs are matched by MAC address. A router also lists idle LAN neighbours, so a device is only auto-added when it is active or has traffic (toggle in **Settings → Polling**).
- Huawei per-device counters (`TxKBytes`/`RxKBytes`) are mapped to upload/download in `backend/app/collectors/huawei.py` (`HOST_TX_IS_UPLOAD`). Verify the direction once with a real download and flip the constant if needed.

## Roles

- **admin**: everything, including Settings (routers, PCs, users, polling interval).
- **viewer**: dashboards only.
