import socket
import time
from dataclasses import dataclass, field


@dataclass
class HostReading:
    mac: str
    ip: str = ""
    hostname: str = ""
    interface: str = ""
    active: bool = False
    tx_kb: int = 0  # uploaded by the client, KB (router counter)
    rx_kb: int = 0  # downloaded by the client, KB (router counter)


@dataclass
class RouterReading:
    online: bool = False
    response_ms: float | None = None
    model: str | None = None
    firmware: str | None = None
    carrier: str | None = None
    network_type: str | None = None
    wan_ip: str | None = None
    signal_bars: int | None = None
    rsrp: float | None = None
    rsrq: float | None = None
    sinr: float | None = None
    csq: int | None = None
    unread_sms: int | None = None
    update_status: str = "unknown"  # up_to_date | available | downloading | unsupported | unknown
    down_rate: float | None = None  # bytes/s
    up_rate: float | None = None
    today_bytes: int | None = None
    month_down: int | None = None
    month_up: int | None = None
    uptime_seconds: int | None = None
    auth_ok: bool | None = None  # None = no password configured
    error: str | None = None
    clients_supported: bool = False
    hosts: list[HostReading] | None = None  # None = not available this poll
    extra: dict = field(default_factory=dict)


def tcp_response_ms(host: str, port: int = 80, timeout: float = 3) -> float | None:
    """Time to open a TCP connection to the router's web port (no root needed, unlike ping)."""
    start = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return round((time.perf_counter() - start) * 1000, 2)
    except OSError:
        return None


def bars_from_rsrp(rsrp: float | None) -> int | None:
    if rsrp is None:
        return None
    for threshold, bars in ((-80, 5), (-90, 4), (-100, 3), (-110, 2)):
        if rsrp >= threshold:
            return bars
    return 1


def to_int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


class AuthBackoff:
    """Avoid hammering a router with a wrong password (routers lock the account)."""

    def __init__(self, seconds: int = 900):
        self.seconds = seconds
        self.until = 0.0

    def blocked(self) -> bool:
        return time.time() < self.until

    def trip(self):
        self.until = time.time() + self.seconds

    def reset(self):
        self.until = 0.0
