"""Configuration endpoints (admin only): routers, PCs, users and polling settings."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import admin_user
from ..models import PC, Router, User
from ..poller import poller
from ..schemas import PcIn, RouterIn, SettingsIn, UserIn
from ..security import encrypt_secret, hash_password
from ..serializers import ip_key, pc_out, router_out, user_out
from ..settings_store import auto_discover, poll_interval, set_setting

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_user)])


def _commit(db: Session, what: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"{what} already exists")


def _get(db: Session, model, obj_id: int):
    obj = db.get(model, obj_id)
    if not obj:
        raise HTTPException(404, f"{model.__name__} not found")
    return obj


# ---- routers --------------------------------------------------------------
@router.get("/routers")
def list_routers(db: Session = Depends(get_db)):
    rows = db.scalars(select(Router).options(selectinload(Router.pcs), selectinload(Router.status))).all()
    return [router_out(r, with_status=False) for r in sorted(rows, key=lambda r: ip_key(r.ip))]


def _apply_router(r: Router, body: RouterIn):
    r.ip, r.name, r.kind, r.username = body.ip.strip(), body.name, body.kind, body.username or "admin"
    r.enabled, r.notes = body.enabled, body.notes
    if body.password is not None:
        r.password_enc = encrypt_secret(body.password)


@router.post("/routers", status_code=201)
def create_router(body: RouterIn, db: Session = Depends(get_db)):
    r = Router()
    _apply_router(r, body)
    db.add(r)
    _commit(db, "A router with this IP")
    return router_out(r, with_status=False)


@router.put("/routers/{router_id}")
def update_router(router_id: int, body: RouterIn, db: Session = Depends(get_db)):
    r = _get(db, Router, router_id)
    _apply_router(r, body)
    _commit(db, "A router with this IP")
    return router_out(r, with_status=False)


@router.delete("/routers/{router_id}", status_code=204)
def delete_router(router_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, Router, router_id))
    db.commit()
    poller.collectors.pop(router_id, None)


# ---- PCs ------------------------------------------------------------------
@router.get("/pcs")
def list_pcs(db: Session = Depends(get_db)):
    rows = db.scalars(select(PC).options(selectinload(PC.user), selectinload(PC.router)).order_by(PC.name)).all()
    return [pc_out(p) for p in rows]


def _apply_pc(db: Session, p: PC, body: PcIn):
    if body.router_id is not None:
        _get(db, Router, body.router_id)
    if body.user_id is not None:
        _get(db, User, body.user_id)
    p.name, p.mac, p.ip, p.router_id, p.user_id, p.notes = (
        body.name, body.mac, body.ip, body.router_id, body.user_id, body.notes)
    p.auto_discovered = False  # edited by a person: keep the configured gateway


@router.post("/pcs", status_code=201)
def create_pc(body: PcIn, db: Session = Depends(get_db)):
    p = PC()
    _apply_pc(db, p, body)
    db.add(p)
    _commit(db, "A PC with this MAC address")
    return {"id": p.id}


@router.put("/pcs/{pc_id}")
def update_pc(pc_id: int, body: PcIn, db: Session = Depends(get_db)):
    p = _get(db, PC, pc_id)
    _apply_pc(db, p, body)
    _commit(db, "A PC with this MAC address")
    return {"id": p.id}


@router.delete("/pcs/{pc_id}", status_code=204)
def delete_pc(pc_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, PC, pc_id))
    db.commit()


# ---- users ----------------------------------------------------------------
@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    rows = db.scalars(select(User).options(selectinload(User.pcs)).order_by(User.username)).all()
    return [user_out(u) | {"pc_count": len(u.pcs)} for u in rows]


@router.post("/users", status_code=201)
def create_user(body: UserIn, db: Session = Depends(get_db)):
    if not body.password:
        raise HTTPException(422, "Password is required for a new user")
    u = User(username=body.username, full_name=body.full_name, role=body.role, is_active=body.is_active,
             password_hash=hash_password(body.password))
    db.add(u)
    _commit(db, "This username")
    return user_out(u)


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UserIn, me: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _get(db, User, user_id)
    if u.id == me.id and (body.role != "admin" or not body.is_active):
        raise HTTPException(400, "You cannot remove your own admin access")
    u.username, u.full_name, u.role, u.is_active = body.username, body.full_name, body.role, body.is_active
    if body.password:
        u.password_hash = hash_password(body.password)
    _commit(db, "This username")
    return user_out(u)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, me: User = Depends(admin_user), db: Session = Depends(get_db)):
    if user_id == me.id:
        raise HTTPException(400, "You cannot delete yourself")
    db.delete(_get(db, User, user_id))
    db.commit()


# ---- settings -------------------------------------------------------------
@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return {"poll_interval": poll_interval(db), "auto_discover": auto_discover(db)}


@router.put("/settings")
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    set_setting(db, "poll_interval", str(body.poll_interval))
    set_setting(db, "auto_discover", "true" if body.auto_discover else "false")
    db.commit()
    poller.reschedule(body.poll_interval)
    return get_settings(db)


@router.post("/poll-now")
async def poll_now():
    await poller.poll_all()
    return {"ok": True, "last_poll": poller.last_poll.isoformat() if poller.last_poll else None}
