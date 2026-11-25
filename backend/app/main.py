import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import admin, auth, monitor
from .config import settings
from .db import init_db
from .poller import poller

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if settings.scheduler_enabled:
        poller.start()
    yield
    poller.shutdown()


app = FastAPI(title="innoRoutes API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(monitor.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"ok": True, "scheduler": poller.scheduler.running}
