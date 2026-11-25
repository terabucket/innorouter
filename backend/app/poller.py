"""Scheduled polling of every enabled router into the database."""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import delete, select

from .collectors import RouterReading, make_collector
from .config import settings
from .db import SessionLocal
from .models import PC, PcSample, Router, RouterSample, RouterStatus, UsageHourly
from .security import decrypt_secret
from .settings_store import auto_discover, poll_interval

log = logging.getLogger("poller")


def counter_delta(prev: int | None, cur: int | None) -> int:
    """Increase of a running counter; a drop means the counter was reset."""
    if cur is None or prev is None:
        return 0
    return cur - prev if cur >= prev else cur


class Poller:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.collectors: dict[int, tuple[tuple, object]] = {}
        self.last_counters: dict[tuple[int, int], tuple[int, int, int]] = {}  # (pc, router) -> (ts, tx, rx)
        self.last_poll: datetime | None = None
        self._lock = asyncio.Lock()

    # ---- scheduling -------------------------------------------------------
    def start(self):
        with SessionLocal() as db:
            interval = poll_interval(db)
        self.scheduler.add_job(self.poll_all, IntervalTrigger(seconds=interval), id="poll",
                               max_instances=1, coalesce=True, next_run_time=datetime.now(timezone.utc))
        self.scheduler.add_job(self.cleanup, IntervalTrigger(hours=1), id="cleanup")
        self.scheduler.start()
        log.info("poller started, interval %ss", interval)

    def reschedule(self, seconds: int):
        if self.scheduler.running:
            self.scheduler.reschedule_job("poll", trigger=IntervalTrigger(seconds=seconds))

    def shutdown(self):
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    # ---- polling ----------------------------------------------------------
    def _collector(self, router: Router):
        sig = (router.ip, router.kind, router.username, router.password_enc)
        cached = self.collectors.get(router.id)
        if not cached or cached[0] != sig:
            cached = (sig, make_collector(router.kind, router.ip, router.username,
                                          decrypt_secret(router.password_enc)))
            self.collectors[router.id] = cached
        return cached[1]

    async def poll_all(self):
        async with self._lock:
            with SessionLocal() as db:
                routers = db.scalars(select(Router).where(Router.enabled)).all()
                jobs = [(r.id, self._collector(r)) for r in routers]
            results = await asyncio.gather(*(asyncio.to_thread(c.poll) for _, c in jobs),
                                           return_exceptions=True)
            ts = int(time.time())
            with SessionLocal() as db:
                discover = auto_discover(db)
                for (router_id, _), result in zip(jobs, results):
                    if isinstance(result, BaseException):
                        result = RouterReading(error=f"collector crashed: {result}")
                    try:
                        self._save(db, router_id, result, ts, discover)
                        db.commit()
                    except Exception:
                        db.rollback()
                        log.exception("saving router %s failed", router_id)
            self.last_poll = datetime.now(timezone.utc)

    def _save(self, db, router_id: int, r: RouterReading, ts: int, discover: bool):
        st = db.get(RouterStatus, router_id)
        if st is None:
            st = RouterStatus(router_id=router_id)
            db.add(st)
        prev_down, prev_up = st.month_down, st.month_up

        st.online, st.response_ms, st.polled_at = r.online, r.response_ms, datetime.now(timezone.utc)
        st.last_error, st.auth_ok, st.clients_supported = r.error, r.auth_ok, r.clients_supported
        if r.online:
            for field in ("model", "firmware", "carrier", "network_type", "wan_ip", "signal_bars", "rsrp",
                          "rsrq", "sinr", "csq", "unread_sms", "down_rate", "up_rate", "today_bytes",
                          "month_down", "month_up", "uptime_seconds"):
                value = getattr(r, field)
                if value is not None or field in ("down_rate", "up_rate"):
                    setattr(st, field, value)
            st.update_status = r.update_status
            st.extra = json.dumps(r.extra, default=str)
        else:
            st.down_rate = st.up_rate = None

        db.add(RouterSample(
            router_id=router_id, ts=ts, online=r.online, response_ms=r.response_ms,
            down_rate=r.down_rate, up_rate=r.up_rate,
            rx_delta=counter_delta(prev_down, r.month_down), tx_delta=counter_delta(prev_up, r.month_up),
            signal_bars=r.signal_bars, rsrp=r.rsrp, sinr=r.sinr))

        seen = self._save_hosts(db, router_id, r, ts, discover) if r.hosts is not None else set()
        if r.hosts is not None or not r.online:
            # PCs on this gateway that the router no longer reports are offline.
            for pc in db.scalars(select(PC).where(PC.router_id == router_id, PC.online)):
                if pc.mac not in seen:
                    pc.online, pc.up_rate, pc.down_rate = False, 0.0, 0.0

    def _save_hosts(self, db, router_id: int, r: RouterReading, ts: int, discover: bool):
        now = datetime.now(timezone.utc)
        seen = set()
        for h in r.hosts:
            if not h.mac or h.mac in seen:
                continue
            seen.add(h.mac)
            pc = db.scalar(select(PC).where(PC.mac == h.mac))
            if pc is None:
                # The router also lists idle LAN neighbours; only add devices that use it.
                if not discover or not (h.active or h.tx_kb or h.rx_kb):
                    continue
                pc = PC(name=h.hostname or h.mac, mac=h.mac, ip=h.ip, router_id=router_id, auto_discovered=True)
                db.add(pc)
                db.flush()

            key = (pc.id, router_id)
            prev = self.last_counters.get(key)
            if prev is None:
                last = db.scalars(select(PcSample).where(PcSample.pc_id == pc.id, PcSample.router_id == router_id)
                                  .order_by(PcSample.ts.desc()).limit(1)).first()
                prev = (last.ts, last.tx_counter, last.rx_counter) if last else None
            self.last_counters[key] = (ts, h.tx_kb, h.rx_kb)

            tx_delta = counter_delta(prev[1], h.tx_kb) * 1024 if prev else 0
            rx_delta = counter_delta(prev[2], h.rx_kb) * 1024 if prev else 0
            dt = max(ts - prev[0], 1) if prev else 0
            up_rate = tx_delta / dt if dt else 0.0
            down_rate = rx_delta / dt if dt else 0.0

            if h.active or tx_delta or rx_delta:
                db.add(PcSample(pc_id=pc.id, router_id=router_id, ts=ts, active=h.active,
                                down_rate=down_rate, up_rate=up_rate, rx_delta=rx_delta, tx_delta=tx_delta,
                                rx_counter=h.rx_kb, tx_counter=h.tx_kb))
            if tx_delta or rx_delta:
                hour = ts - ts % 3600
                row = db.get(UsageHourly, (pc.id, hour))
                if row is None:
                    db.add(UsageHourly(pc_id=pc.id, hour_ts=hour, rx_bytes=rx_delta, tx_bytes=tx_delta))
                else:
                    row.rx_bytes += rx_delta
                    row.tx_bytes += tx_delta
                if pc.auto_discovered:
                    pc.router_id = router_id  # follow the gateway the PC actually uses

            if pc.router_id in (None, router_id):
                pc.online, pc.up_rate, pc.down_rate = h.active, up_rate, down_rate
                pc.ip, pc.hostname, pc.interface = h.ip or pc.ip, h.hostname or pc.hostname, h.interface
                if h.active:
                    pc.last_seen = now
        return seen

    def cleanup(self):
        now = int(time.time())
        with SessionLocal() as db:
            raw_cutoff = now - settings.raw_retention_days * 86400
            db.execute(delete(RouterSample).where(RouterSample.ts < raw_cutoff))
            db.execute(delete(PcSample).where(PcSample.ts < raw_cutoff))
            db.execute(delete(UsageHourly).where(UsageHourly.hour_ts < now - settings.hourly_retention_days * 86400))
            db.commit()


poller = Poller()
