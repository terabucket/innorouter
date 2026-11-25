"""Usage windows and chart series, computed with portable SQL (SQLite / MySQL / PostgreSQL)."""
import time
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .models import PcSample, RouterSample, UsageHourly

RANGES = {"1h": 3600, "6h": 6 * 3600, "24h": 86400, "7d": 7 * 86400}
WINDOWS = {"h1": 3600, "h24": 86400, "d7": 7 * 86400, "d28": 28 * 86400}


def pc_usage(db: Session, pc_ids: list[int], now: int | None = None) -> dict[int, dict]:
    """{pc_id: {"h1": {"rx": .., "tx": ..}, "h24": .., "d7": .., "d28": ..}} in bytes."""
    now = now or int(time.time())
    result = {pid: {w: {"rx": 0, "tx": 0} for w in WINDOWS} for pid in pc_ids}
    if not pc_ids:
        return result

    # Last hour comes from raw samples (rolling), longer windows from the hourly roll-up.
    rows = db.execute(
        select(PcSample.pc_id, func.sum(PcSample.rx_delta), func.sum(PcSample.tx_delta))
        .where(PcSample.pc_id.in_(pc_ids), PcSample.ts >= now - 3600)
        .group_by(PcSample.pc_id)).all()
    for pid, rx, tx in rows:
        result[pid]["h1"] = {"rx": int(rx or 0), "tx": int(tx or 0)}

    cols = []
    for w in ("h24", "d7", "d28"):
        since = now - WINDOWS[w]
        cols += [func.sum(case((UsageHourly.hour_ts >= since, UsageHourly.rx_bytes), else_=0)),
                 func.sum(case((UsageHourly.hour_ts >= since, UsageHourly.tx_bytes), else_=0))]
    rows = db.execute(
        select(UsageHourly.pc_id, *cols)
        .where(UsageHourly.pc_id.in_(pc_ids), UsageHourly.hour_ts >= now - WINDOWS["d28"])
        .group_by(UsageHourly.pc_id)).all()
    for pid, *vals in rows:
        for i, w in enumerate(("h24", "d7", "d28")):
            result[pid][w] = {"rx": int(vals[2 * i] or 0), "tx": int(vals[2 * i + 1] or 0)}
    return result


def _buckets(range_key: str, now: int) -> tuple[int, int, list[int]]:
    span = RANGES.get(range_key, RANGES["1h"])
    step = max(span // 120, 60)
    start = now - span
    start -= start % step
    return start, step, list(range(start, now + 1, step))


def _bucketize(rows, start: int, step: int, buckets: list[int], avg_fields, sum_fields):
    """rows: (series_id, ts, {field: value}) -> {series_id: {field: [value per bucket]}}"""
    acc = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for sid, ts, values in rows:
        idx = (ts - start) // step
        if 0 <= idx < len(buckets):
            for f, v in values.items():
                if v is not None:
                    acc[sid][f][idx].append(v)
    out = {}
    for sid, fields in acc.items():
        out[sid] = {}
        for f in avg_fields:
            out[sid][f] = [round(sum(v) / len(v), 2) if (v := fields[f].get(i)) else None for i in range(len(buckets))]
        for f in sum_fields:
            out[sid][f] = [sum(fields[f][i]) if fields[f].get(i) else 0 for i in range(len(buckets))]
    return out


def router_chart(db: Session, router_ids: list[int], range_key: str) -> dict:
    now = int(time.time())
    start, step, buckets = _buckets(range_key, now)
    q = (select(RouterSample).where(RouterSample.router_id.in_(router_ids), RouterSample.ts >= start)
         .order_by(RouterSample.ts))
    rows = [(s.router_id, s.ts, {
        "down_rate": s.down_rate, "up_rate": s.up_rate, "response_ms": s.response_ms,
        "signal_bars": s.signal_bars, "rsrp": s.rsrp, "sinr": s.sinr,
        "usage": (s.rx_delta or 0) + (s.tx_delta or 0)}) for s in db.scalars(q)]
    series = _bucketize(rows, start, step, buckets,
                        ["down_rate", "up_rate", "response_ms", "signal_bars", "rsrp", "sinr"], ["usage"])
    return {"buckets": buckets, "step": step, "series": {str(k): v for k, v in series.items()}}


def pc_chart(db: Session, pc_ids: list[int], range_key: str) -> dict:
    now = int(time.time())
    start, step, buckets = _buckets(range_key, now)
    q = select(PcSample).where(PcSample.pc_id.in_(pc_ids), PcSample.ts >= start).order_by(PcSample.ts)
    rows = [(s.pc_id, s.ts, {"down_rate": s.down_rate, "up_rate": s.up_rate,
                             "usage": s.rx_delta + s.tx_delta}) for s in db.scalars(q)]
    series = _bucketize(rows, start, step, buckets, ["down_rate", "up_rate"], ["usage"])
    return {"buckets": buckets, "step": step, "series": {str(k): v for k, v in series.items()}}


def pc_history(db: Session, pc_id: int, view: str) -> list[dict]:
    """Hourly (24 h), daily (7 days) or weekly (4 weeks) download/upload totals, local time."""
    now = datetime.now().astimezone()
    if view == "daily":
        first = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
        edges = [first + timedelta(days=i) for i in range(8)]
        label = lambda d: d.strftime("%a %m/%d")
    elif view == "weekly":
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        first = today - timedelta(days=27)
        edges = [first + timedelta(days=7 * i) for i in range(5)]
        label = lambda d: f"{d.strftime('%m/%d')}–{(d + timedelta(days=6)).strftime('%m/%d')}"
    else:
        first = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23)
        edges = [first + timedelta(hours=i) for i in range(25)]
        label = lambda d: d.strftime("%H:00")

    ts_edges = [int(e.timestamp()) for e in edges]
    rows = db.execute(select(UsageHourly.hour_ts, UsageHourly.rx_bytes, UsageHourly.tx_bytes)
                      .where(UsageHourly.pc_id == pc_id, UsageHourly.hour_ts >= ts_edges[0],
                             UsageHourly.hour_ts < ts_edges[-1])).all()
    points = [{"t": ts_edges[i], "label": label(edges[i]), "rx": 0, "tx": 0} for i in range(len(edges) - 1)]
    for hour_ts, rx, tx in rows:
        for i in range(len(points)):
            if ts_edges[i] <= hour_ts < ts_edges[i + 1]:
                points[i]["rx"] += rx
                points[i]["tx"] += tx
                break
    return points
