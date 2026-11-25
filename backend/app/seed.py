"""Seed the database.

    python -m app.seed            # admin user + the six gateways (idempotent)
    python -m app.seed --demo     # also demo users, PCs and 4 weeks of synthetic history

Passwords come from backend/.env: SEED_ADMIN_PASSWORD, SEED_USR_PASSWORD (USR-G815
gateways .4/.5/.6) and SEED_HUAWEI_PASSWORD (Brovi/Huawei gateways .14/.15/.16).
Use --demo only on a throwaway database, e.g.
    DATABASE_URL=sqlite:///./demo.db SCHEDULER_ENABLED=false python -m app.seed --demo
"""
import json
import math
import random
import secrets
import sys
import time
from datetime import datetime, timezone

from sqlalchemy import select

from .config import settings
from .db import SessionLocal, init_db
from .models import PC, PcSample, Router, RouterSample, RouterStatus, Setting, UsageHourly, User
from .security import encrypt_secret, hash_password
from .settings_store import DEFAULTS, set_setting

GATEWAYS = [
    # ip, name, kind, model
    ("192.168.9.4", "Gateway 4", "usr", "USR-G815"),
    ("192.168.9.5", "Gateway 5", "usr", "USR-G815"),
    ("192.168.9.6", "Gateway 6", "usr", "USR-G815"),
    ("192.168.9.14", "Gateway 14", "huawei", "H153-381"),
    ("192.168.9.15", "Gateway 15", "huawei", "H155-381"),
    ("192.168.9.16", "Gateway 16", "huawei", "H153-381"),
]


def seed_base(db):
    admin = db.scalar(select(User).where(User.username == settings.seed_admin_username))
    if admin is None:
        password = settings.seed_admin_password or secrets.token_urlsafe(12)
        db.add(User(username=settings.seed_admin_username, full_name="Router Manager", role="admin",
                    password_hash=hash_password(password)))
        if settings.seed_admin_password:
            print(f"Created admin user '{settings.seed_admin_username}' (password from SEED_ADMIN_PASSWORD)")
        else:
            print(f"Created admin user '{settings.seed_admin_username}' with generated password: {password}")
    else:
        print(f"Admin user '{admin.username}' already exists, left unchanged")

    for ip, name, kind, _model in GATEWAYS:
        password = settings.seed_usr_password if kind == "usr" else settings.seed_huawei_password
        r = db.scalar(select(Router).where(Router.ip == ip))
        if r is None:
            r = Router(ip=ip, name=name, kind=kind, username="admin")
            db.add(r)
            print(f"Added router {ip} ({kind})")
        else:
            r.kind = kind
            print(f"Updated router {ip} ({kind})")
        if password:
            r.password_enc = encrypt_secret(password)
        elif not r.password_enc:
            print(f"  note: no password for {ip} - set SEED_{kind.upper()}_PASSWORD in .env "
                  f"or in Settings > Routers (only public data is collected until then)")

    for key, value in DEFAULTS.items():
        if db.get(Setting, key) is None:
            set_setting(db, key, value)
    db.commit()


DEMO_USERS = [("alice", "Alice Wong"), ("bob", "Bob Li"), ("carol", "Carol Zhang")]
DEMO_PCS = [
    # name, owner, router ip, base Mbps
    ("ALICE-DESKTOP", "alice", "192.168.9.14", 18), ("ALICE-LAPTOP", "alice", "192.168.9.16", 6),
    ("BOB-WORKSTATION", "bob", "192.168.9.14", 30), ("CAROL-PC", "carol", "192.168.9.15", 12),
    ("RENDER-NODE", None, "192.168.9.15", 45), ("MEETING-ROOM", None, "192.168.9.16", 4),
]


def seed_demo(db):
    rnd = random.Random(42)
    users = {}
    for username, full in DEMO_USERS:
        u = db.scalar(select(User).where(User.username == username))
        if u is None:
            u = User(username=username, full_name=full, role="viewer", password_hash=hash_password(secrets.token_urlsafe(9)))
            db.add(u)
        users[username] = u
    db.flush()
    routers = {r.ip: r for r in db.scalars(select(Router))}

    now = int(time.time())
    pcs = []
    for i, (name, owner, rip, mbps) in enumerate(DEMO_PCS):
        mac = f"02:DE:30:00:00:{i + 1:02X}"
        pc = db.scalar(select(PC).where(PC.mac == mac))
        if pc is None:
            pc = PC(name=name, mac=mac, ip=f"192.168.9.{101 + i}", router_id=routers[rip].id,
                    user_id=users[owner].id if owner else None, hostname=name, interface="Ethernet")
            db.add(pc)
        pcs.append((pc, mbps))
    db.flush()

    def load(ts, base):  # office-hours shaped traffic in bytes/s
        hour = datetime.fromtimestamp(ts).hour
        day = 1.0 if datetime.fromtimestamp(ts).weekday() < 5 else 0.35
        shape = 0.15 + 0.85 * max(0.0, math.sin((hour - 7) / 12 * math.pi)) if 7 <= hour <= 19 else 0.08
        return base * 125_000 * shape * day * rnd.uniform(0.6, 1.4)

    # 28 days hourly roll-up + 24 h of 5-minute raw samples per PC
    for pc, mbps in pcs:
        db.query(UsageHourly).filter(UsageHourly.pc_id == pc.id).delete()
        db.query(PcSample).filter(PcSample.pc_id == pc.id).delete()
        for h in range(28 * 24, 0, -1):
            hour = (now - h * 3600) - (now - h * 3600) % 3600
            down = int(load(hour, mbps) * 3600)
            db.add(UsageHourly(pc_id=pc.id, hour_ts=hour, rx_bytes=down, tx_bytes=int(down * rnd.uniform(0.1, 0.3))))
        for k in range(1440, 0, -1):  # one sample per minute
            ts = now - k * 60
            down = load(ts, mbps)
            up = down * rnd.uniform(0.1, 0.3)
            db.add(PcSample(pc_id=pc.id, router_id=pc.router_id, ts=ts, active=True, down_rate=down, up_rate=up,
                            rx_delta=int(down * 60), tx_delta=int(up * 60)))
        pc.online, pc.down_rate, pc.up_rate = True, load(now, mbps), load(now, mbps) * 0.2
        pc.last_seen = datetime.now(timezone.utc)

    # Router samples and a current status for every gateway
    for ip, _name, kind, model in GATEWAYS:
        r = routers[ip]
        db.query(RouterSample).filter(RouterSample.router_id == r.id).delete()
        base = sum(m for _n, _o, rip, m in DEMO_PCS if rip == ip) or 10
        # 5-minute samples for the past week, then one per minute for the last 24 h
        for ts in [*range(now - 7 * 86400, now - 86400, 300), *range(now - 86400, now, 60)]:
            gap = 300 if ts < now - 86400 else 60
            down = load(ts, base) if kind == "huawei" else None
            db.add(RouterSample(router_id=r.id, ts=ts, online=True, response_ms=round(rnd.uniform(0.5, 3.5), 2),
                                down_rate=down, up_rate=down * 0.2 if down else None,
                                rx_delta=int(down * gap) if down else 0, tx_delta=int(down * gap * 0.2) if down else 0,
                                signal_bars=rnd.choice([3, 4, 4, 5]), rsrp=rnd.uniform(-105, -80),
                                sinr=rnd.uniform(3, 25)))
        st = db.get(RouterStatus, r.id) or RouterStatus(router_id=r.id)
        huawei = kind == "huawei"
        st.online, st.response_ms, st.model = True, round(rnd.uniform(0.5, 2), 2), model
        st.firmware = "4.0.0.5(H6623SP2C233)" if huawei else "V1.0.11"
        st.carrier = rnd.choice(["China Unicom", "China Telecom"])
        st.network_type = "5G" if huawei else "4G LTE"
        st.signal_bars, st.rsrp, st.sinr = rnd.choice([3, 4, 5]), -92.0, 14.0
        st.unread_sms = rnd.choice([0, 0, 2, 5]) if huawei else None
        st.update_status = rnd.choice(["up_to_date", "available"]) if huawei else "unsupported"
        st.down_rate = load(now, base) if huawei else None
        st.up_rate = st.down_rate * 0.2 if st.down_rate else None
        st.today_bytes = int(base * 125_000 * 3600 * 4) if huawei else None
        st.month_down = int(base * 125_000 * 3600 * 20) if huawei else None
        st.month_up = int(base * 125_000 * 3600 * 5) if huawei else None
        st.uptime_seconds = rnd.randint(3600, 400_000)
        st.clients_supported, st.auth_ok, st.last_error = huawei, True, None
        st.extra, st.polled_at = json.dumps({"demo": True}), datetime.now(timezone.utc)
        db.merge(st)
    db.commit()
    print(f"Demo data: {len(DEMO_USERS)} users, {len(DEMO_PCS)} PCs, 28 days of history")


def main():
    init_db()
    with SessionLocal() as db:
        seed_base(db)
        if "--demo" in sys.argv:
            seed_demo(db)


if __name__ == "__main__":
    main()
