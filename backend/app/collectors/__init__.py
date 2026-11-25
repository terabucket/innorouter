from .base import HostReading, RouterReading
from .huawei import HuaweiCollector
from .usr import UsrCollector

KINDS = {"huawei": HuaweiCollector, "usr": UsrCollector}


def make_collector(kind: str, ip: str, username: str, password: str):
    return KINDS[kind](ip, username, password)


__all__ = ["HostReading", "RouterReading", "KINDS", "make_collector"]
