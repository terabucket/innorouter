from sqlalchemy.orm import Session

from .config import settings
from .models import Setting

DEFAULTS = {
    "poll_interval": str(settings.default_poll_interval),
    "auto_discover": "true",
}


def get_setting(db: Session, key: str) -> str:
    row = db.get(Setting, key)
    return row.value if row else DEFAULTS[key]


def set_setting(db: Session, key: str, value: str):
    row = db.get(Setting, key)
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))


def poll_interval(db: Session) -> int:
    return max(5, int(get_setting(db, "poll_interval")))


def auto_discover(db: Session) -> bool:
    return get_setting(db, "auto_discover").lower() == "true"
