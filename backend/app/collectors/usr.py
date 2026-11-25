"""USR IoT USR-G815 4G routers via /cgi-bin/webservice.fcgi.

The firmware exposes device and cellular status only: no client list and no
traffic counters, so per-PC usage is not available from these routers.
"""
import http.cookiejar
import json
import re
import urllib.request

from .base import AuthBackoff, RouterReading, tcp_response_ms, to_int


class UsrCollector:
    def __init__(self, ip: str, username: str, password: str):
        self.ip = ip
        self.base = f"http://{ip}"
        self.username = username or "admin"
        self.password = password
        self.backoff = AuthBackoff()
        self.opener = None
        self.model = None

    def _call(self, fn: str, body) -> dict:
        req = urllib.request.Request(f"{self.base}/cgi-bin/webservice.fcgi?so/{fn}",
                                     data=json.dumps(body).encode(), method="POST")
        with self.opener.open(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8", "replace"))

    def _login(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        res = self._call("login", [{"name": "username", "value": self.username},
                                   {"name": "password", "value": self.password}])
        if res.get("status") != 0:
            self.opener = None
            raise PermissionError("wrong password")

    def _status(self) -> dict:
        try:
            res = self._call("getDevStatus", "[]")
            if res.get("status") == 0:
                return res["data"]
        except Exception:
            pass
        self._login()  # session expired or never logged in
        res = self._call("getDevStatus", "[]")
        if res.get("status") != 0:
            raise RuntimeError(f"getDevStatus status {res.get('status')}")
        return res["data"]

    def poll(self) -> RouterReading:
        r = RouterReading(update_status="unsupported", clients_supported=False)
        r.response_ms = tcp_response_ms(self.ip)
        if r.response_ms is None:
            r.error = "unreachable"
            return r
        r.online = True
        if self.model is None:
            try:
                with urllib.request.urlopen(self.base + "/", timeout=5) as resp:
                    m = re.search(r"<title>\s*([^<]+?)\s*</title>", resp.read().decode("utf-8", "replace"))
                    self.model = m.group(1) if m else "USR"
            except Exception:
                pass
        r.model = self.model

        if not self.password:
            return r
        if self.backoff.blocked():
            r.auth_ok = False
            r.error = "login paused after a failed attempt (retrying in up to 15 min)"
            return r
        if self.opener is None:
            try:
                self._login()
            except PermissionError as e:
                self.backoff.trip()
                r.auth_ok = False
                r.error = f"login: {e}"
                return r
            except Exception as e:
                r.error = f"login: {e}"
                return r
        try:
            data = self._status()
        except PermissionError as e:
            self.backoff.trip()
            r.auth_ok, r.error = False, f"login: {e}"
            return r
        except Exception as e:
            self.opener = None
            r.error = f"status: {e}"
            return r

        r.auth_ok = True
        self.backoff.reset()
        dev, cell = data.get("dev_status") or {}, data.get("cell_status") or {}
        r.firmware = dev.get("version") or None
        r.carrier = cell.get("operator") or None
        r.network_type = cell.get("netmode") or None
        r.wan_ip = cell.get("ipaddr") or None
        csq = to_int(cell.get("csq"))
        if csq is not None and 0 <= csq <= 31:
            r.csq = csq
            r.signal_bars = 5 if csq >= 25 else 4 if csq >= 20 else 3 if csq >= 15 else 2 if csq >= 10 else 1
            r.extra["rssi_dbm"] = -113 + 2 * csq
        r.uptime_seconds = to_int(cell.get("uptime"))
        r.extra.update({"net_status": cell.get("net_status"), "run_time": dev.get("run_time"),
                        "hostname": dev.get("hostname"), "imei": dev.get("IMEI"), "iccid": dev.get("ICCID"),
                        "gateway": cell.get("ipgateway"), "dns": cell.get("ip_dns")})
        return r
