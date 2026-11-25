"""Brovi / Huawei 5G CPE routers (H153-381, H155-381, ...) via the HiLink web API."""
import gzip
import hashlib
import hmac
import http.cookiejar
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET

from .base import (AuthBackoff, HostReading, RouterReading, bars_from_rsrp, tcp_response_ms,
                   to_int)

SESSION_ERRORS = {"100003", "125002"}
LOGIN_ERRORS = {
    "108006": "wrong password",
    "108007": "too many failed logins, router locked temporarily",
    "108003": "user busy / logged in elsewhere",
}
# 3GPP access technology (current-plmn <Rat>) and Huawei CurrentNetworkType codes
RAT_NAMES = {"0": "2G", "2": "3G", "7": "4G LTE", "10": "4G LTE", "11": "5G", "12": "5G", "13": "5G NSA"}
NETWORK_TYPE_NAMES = {"19": "4G LTE", "20": "5G", "101": "4G LTE", "111": "5G"}
CARRIERS = {  # MCC+MNC -> English name (the router reports local-language names)
    "46000": "China Mobile", "46002": "China Mobile", "46004": "China Mobile", "46007": "China Mobile",
    "46008": "China Mobile", "46001": "China Unicom", "46006": "China Unicom", "46009": "China Unicom",
    "46003": "China Telecom", "46005": "China Telecom", "46011": "China Telecom", "46015": "China Broadnet",
}
# HostInfo counters are named from the router's point of view, verify with live traffic.
HOST_TX_IS_UPLOAD = True


class RouterError(Exception):
    def __init__(self, code: str, path: str):
        self.code = code
        super().__init__(f"{path}: error {code} {LOGIN_ERRORS.get(code, '')}".strip())


def _num(text):
    if text is None:
        return None
    m = re.search(r"-?\d+(\.\d+)?", text)
    return float(m.group(0)) if m else None


class HuaweiClient:
    def __init__(self, host: str, username: str = "admin", password: str = ""):
        self.host = host
        self.base = f"http://{host}"
        self.username = username or "admin"
        self.password = password
        self.token = None
        self.opener = None
        self.logged_in = False

    def _request(self, path: str, data: str | None = None) -> str:
        headers = {"X-Requested-With": "XMLHttpRequest", "Referer": self.base + "/html/index.html"}
        if self.token:
            headers["__RequestVerificationToken"] = self.token
        body = None
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            body = f'<?xml version="1.0" encoding="UTF-8"?><request>{data}</request>'.encode()
        req = urllib.request.Request(self.base + path, data=body, headers=headers)
        with self.opener.open(req, timeout=8) as r:
            raw = r.read()
            new = r.headers.get("__RequestVerificationToken")
            if new:
                self.token = new.split("#")[0]
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8", "replace")

    @staticmethod
    def _parse(text: str, path: str):
        stripped = text.lstrip()
        if stripped.startswith("<"):
            root = ET.fromstring(stripped)
            if root.tag == "error":
                raise RouterError(root.findtext("code") or "?", path)
            return root
        return json.loads(stripped)

    def open_session(self):
        """Anonymous session: cookie + CSRF token, enough for the public endpoints."""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.logged_in = False
        self._request("/")
        self.token = ET.fromstring(self._request("/api/webserver/SesTokInfo")).findtext("TokInfo")

    def login(self):
        self.open_session()
        first_nonce = os.urandom(32).hex()
        r = self._parse(self._request(
            "/api/user/challenge_login",
            f"<username>{self.username}</username><firstnonce>{first_nonce}</firstnonce><mode>1</mode>"),
            "challenge_login")
        salt = bytes.fromhex(r.findtext("salt"))
        iterations = int(r.findtext("iterations"))
        server_nonce = r.findtext("servernonce")

        salted = hashlib.pbkdf2_hmac("sha256", self.password.encode(), salt, iterations)
        client_key = hmac.new(b"Client Key", salted, hashlib.sha256).digest()
        stored_key = hashlib.sha256(client_key).digest()
        auth_msg = f"{first_nonce},{server_nonce},{server_nonce}".encode()
        signature = hmac.new(auth_msg, stored_key, hashlib.sha256).digest()
        proof = bytes(a ^ b for a, b in zip(client_key, signature)).hex()

        self._parse(self._request(
            "/api/user/authentication_login",
            f"<clientproof>{proof}</clientproof><finalnonce>{server_nonce}</finalnonce>"),
            "authentication_login")
        self.logged_in = True

    def get(self, path: str, auth: bool = False):
        if self.opener is None:
            self.open_session()
        try:
            return self._parse(self._request(path), path)
        except RouterError as e:
            if e.code not in SESSION_ERRORS:
                raise
            # Session or token expired: start over once.
            self.login() if (auth or self.logged_in) else self.open_session()
            return self._parse(self._request(path), path)

    def get_dict(self, path: str, auth: bool = False) -> dict:
        root = self.get(path, auth)
        return {child.tag: (child.text or "") for child in root}


class HuaweiCollector:
    def __init__(self, ip: str, username: str, password: str):
        self.ip = ip
        self.client = HuaweiClient(ip, username, password)
        self.backoff = AuthBackoff()
        self.model = None

    def poll(self) -> RouterReading:
        r = RouterReading(clients_supported=True)
        r.response_ms = tcp_response_ms(self.ip)
        if r.response_ms is None:
            r.error = "unreachable"
            return r
        c = self.client
        try:
            if self.model is None:
                self.model = c.get_dict("/api/device/basic_information").get("devicename")
            r.model = self.model

            t = c.get_dict("/api/monitoring/traffic-statistics")
            t.update(c.get_dict("/api/monitoring/month_statistics"))
            r.down_rate = to_int(t.get("CurrentDownloadRate"))
            r.up_rate = to_int(t.get("CurrentUploadRate"))
            r.today_bytes = to_int(t.get("CurrentDayUsed"))
            r.month_down = to_int(t.get("CurrentMonthDownload"))
            r.month_up = to_int(t.get("CurrentMonthUpload"))
            r.uptime_seconds = to_int(t.get("CurrentConnectTime"))
            r.extra["month_reset_date"] = t.get("MonthLastClearTime")
            r.extra["session_download"] = to_int(t.get("CurrentDownload"))
            r.extra["session_upload"] = to_int(t.get("CurrentUpload"))
            r.online = True
        except Exception as e:
            r.error = f"status: {e}"
            c.opener = None  # force a fresh session next poll
            return r

        self._optional(r, self._public_extras)
        if c.password and not self.backoff.blocked():
            try:
                if not c.logged_in:
                    c.login()
                r.auth_ok = True
                self.backoff.reset()
                self._optional(r, self._private_extras)
            except RouterError as e:
                if e.code in LOGIN_ERRORS:
                    self.backoff.trip()
                r.auth_ok = False
                r.error = f"login: {e}"
            except Exception as e:
                r.error = f"login: {e}"
        elif c.password:
            r.auth_ok = False
            r.error = "login paused after a failed attempt (retrying in up to 15 min)"
        return r

    @staticmethod
    def _optional(r: RouterReading, fn):
        try:
            fn(r)
        except Exception as e:  # extras must never fail the whole poll
            r.extra.setdefault("warnings", []).append(f"{fn.__name__}: {e}")

    def _public_extras(self, r: RouterReading):
        c = self.client
        plmn = c.get_dict("/api/net/current-plmn")
        r.carrier = CARRIERS.get(plmn.get("Numeric", "")) or plmn.get("FullName") or plmn.get("ShortName") or None
        r.network_type = RAT_NAMES.get(plmn.get("Rat", ""), None)

        notes = c.get_dict("/api/monitoring/check-notifications")
        r.unread_sms = to_int(notes.get("UnreadMessage"), 0)

        upd = c.get_dict("/api/online-update/status")
        progress = to_int(upd.get("DownloadProgress"), 0)
        if 0 < progress < 100:
            r.update_status = "downloading"
        elif to_int(upd.get("TotalComponents"), 0) > 0:
            r.update_status = "available"
        elif upd.get("CurrentComponentStatus") == "14":
            r.update_status = "up_to_date"
        r.extra["update_code"] = upd.get("CurrentComponentStatus")

        st = c.get_dict("/api/monitoring/status")
        r.network_type = NETWORK_TYPE_NAMES.get(st.get("CurrentNetworkType", ""), r.network_type)
        r.extra["connection_status"] = st.get("ConnectionStatus")
        r.extra["dns"] = [d for d in (st.get("PrimaryDns"), st.get("SecondaryDns")) if d]
        icon = to_int(st.get("SignalIcon"))
        if icon:
            r.signal_bars = icon

    def _private_extras(self, r: RouterReading):
        c = self.client
        sig = c.get_dict("/api/device/signal", auth=True)
        nr = _num(sig.get("nrrsrp"))
        r.rsrp = nr if nr is not None else _num(sig.get("rsrp"))
        r.sinr = _num(sig.get("nrsinr")) if nr is not None else _num(sig.get("sinr"))
        r.rsrq = _num(sig.get("nrrsrq")) if nr is not None else _num(sig.get("rsrq"))
        r.extra["signal"] = {k: v for k, v in sig.items() if v}
        st = c.get_dict("/api/monitoring/status", auth=True)
        r.signal_bars = to_int(st.get("SignalIcon")) or bars_from_rsrp(r.rsrp)

        info = c.get_dict("/api/device/information", auth=True)
        r.firmware = info.get("SoftwareVersion") or None
        r.wan_ip = info.get("WanIPAddress") or None
        r.extra["device"] = {k: info.get(k) for k in ("SerialNumber", "HardwareVersion", "WebUIVersion",
                                                       "MacAddress1", "Imei", "Iccid") if info.get(k)}

        hosts = c.get("/api/system/HostInfo", auth=True)
        r.hosts = []
        for h in hosts if isinstance(hosts, list) else []:
            tx, rx = to_int(h.get("TxKBytes"), 0), to_int(h.get("RxKBytes"), 0)
            if not HOST_TX_IS_UPLOAD:
                tx, rx = rx, tx
            r.hosts.append(HostReading(
                mac=(h.get("MACAddress") or "").upper(),
                ip=h.get("IPAddress") or "",
                hostname=h.get("ActualName") or h.get("HostName") or "",
                interface=h.get("InterfaceType") or "",
                active=bool(h.get("Active")),
                tx_kb=tx, rx_kb=rx))
