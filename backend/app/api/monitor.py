"""Read-only monitoring endpoints used by the dashboard, router and PC pages."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import stats
from ..db import get_db
from ..deps import current_user
from ..models import PC, Router
from ..poller import poller
from ..serializers import ip_key, pc_out, router_out
from ..settings_store import poll_interval

router = APIRouter(prefix="/api", tags=["monitor"], dependencies=[Depends(current_user)])

RangeKey = Query("1h", pattern="^(1h|6h|24h|7d)$")


def _router_or_404(db: Session, router_id: int) -> Router:
    r = db.scalar(select(Router).options(selectinload(Router.status), selectinload(Router.pcs))
                  .where(Router.id == router_id))
    if not r:
        raise HTTPException(404, "Router not found")
    return r


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    routers = sorted(db.scalars(select(Router).options(selectinload(Router.status), selectinload(Router.pcs))).all(),
                     key=lambda r: ip_key(r.ip))
    return {
        "routers": [router_out(r) for r in routers],
        "poll_interval": poll_interval(db),
        "last_poll": poller.last_poll.isoformat() if poller.last_poll else None,
    }


@router.get("/dashboard/chart")
def dashboard_chart(range: str = RangeKey, db: Session = Depends(get_db)):
    routers = sorted(db.scalars(select(Router)).all(), key=lambda r: ip_key(r.ip))
    data = stats.router_chart(db, [r.id for r in routers], range)
    data["labels"] = {str(r.id): r.name or r.ip for r in routers}
    return data


def _pcs_with_usage(db: Session, pcs: list[PC]) -> list[dict]:
    usage = stats.pc_usage(db, [p.id for p in pcs])
    return [pc_out(p, usage[p.id]) for p in pcs]


@router.get("/routers/{router_id}")
def router_detail(router_id: int, db: Session = Depends(get_db)):
    r = _router_or_404(db, router_id)
    pcs = db.scalars(select(PC).options(selectinload(PC.user), selectinload(PC.router))
                     .where(PC.router_id == router_id).order_by(PC.name)).all()
    return {"router": router_out(r), "pcs": _pcs_with_usage(db, pcs), "poll_interval": poll_interval(db)}


@router.get("/routers/{router_id}/chart")
def router_chart(router_id: int, range: str = RangeKey, db: Session = Depends(get_db)):
    _router_or_404(db, router_id)
    pcs = db.scalars(select(PC).where(PC.router_id == router_id)).all()
    data = stats.pc_chart(db, [p.id for p in pcs], range)
    data["labels"] = {str(p.id): p.name for p in pcs}
    return data


@router.get("/pcs/{pc_id}")
def pc_detail(pc_id: int, db: Session = Depends(get_db)):
    pc = db.scalar(select(PC).options(selectinload(PC.user), selectinload(PC.router)).where(PC.id == pc_id))
    if not pc:
        raise HTTPException(404, "PC not found")
    siblings = []
    if pc.user_id:
        siblings = db.scalars(select(PC).where(PC.user_id == pc.user_id).order_by(PC.name)).all()
    return {
        "pc": _pcs_with_usage(db, [pc])[0],
        "owner_pcs": [{"id": s.id, "name": s.name, "online": s.online} for s in siblings],
        "poll_interval": poll_interval(db),
    }


@router.get("/pcs/{pc_id}/history")
def pc_history(pc_id: int, view: str = Query("hourly", pattern="^(hourly|daily|weekly)$"),
               db: Session = Depends(get_db)):
    if not db.get(PC, pc_id):
        raise HTTPException(404, "PC not found")
    return {"view": view, "points": stats.pc_history(db, pc_id, view)}
