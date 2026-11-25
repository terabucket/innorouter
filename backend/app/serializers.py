import ipaddress
import json

from .models import PC, Router, User


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role,
            "is_active": u.is_active, "display_name": u.full_name or u.username}


def status_out(r: Router) -> dict:
    s = r.status
    if s is None:
        return {"online": False, "polled_at": None, "update_status": "unknown"}
    return {
        "online": s.online, "response_ms": s.response_ms, "model": s.model, "firmware": s.firmware,
        "carrier": s.carrier, "network_type": s.network_type, "wan_ip": s.wan_ip,
        "signal_bars": s.signal_bars, "rsrp": s.rsrp, "rsrq": s.rsrq, "sinr": s.sinr, "csq": s.csq,
        "unread_sms": s.unread_sms, "update_status": s.update_status,
        "down_rate": s.down_rate, "up_rate": s.up_rate, "today_bytes": s.today_bytes,
        "month_down": s.month_down, "month_up": s.month_up, "uptime_seconds": s.uptime_seconds,
        "clients_supported": s.clients_supported, "auth_ok": s.auth_ok, "last_error": s.last_error,
        "extra": json.loads(s.extra or "{}"), "polled_at": s.polled_at.isoformat() if s.polled_at else None,
    }


def router_out(r: Router, with_status: bool = True) -> dict:
    out = {"id": r.id, "ip": r.ip, "name": r.name, "kind": r.kind, "username": r.username,
           "has_password": bool(r.password_enc), "enabled": r.enabled, "notes": r.notes,
           "pc_count": len(r.pcs)}
    if with_status:
        out["status"] = status_out(r)
    return out


def pc_out(p: PC, usage: dict | None = None) -> dict:
    out = {
        "id": p.id, "name": p.name, "mac": p.mac, "ip": p.ip, "notes": p.notes,
        "router_id": p.router_id, "router_ip": p.router.ip if p.router else None,
        "user_id": p.user_id, "owner": (p.user.full_name or p.user.username) if p.user else None,
        "auto_discovered": p.auto_discovered, "online": p.online, "hostname": p.hostname,
        "interface": p.interface, "down_rate": p.down_rate, "up_rate": p.up_rate,
        "last_seen": p.last_seen.isoformat() if p.last_seen else None,
    }
    if usage is not None:
        out["usage"] = usage
    return out


def ip_key(ip: str):
    try:
        return (0, int(ipaddress.ip_address(ip.strip())))
    except ValueError:
        return (1, ip)
