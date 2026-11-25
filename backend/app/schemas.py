from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAC_RE = r"^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$"


class LoginIn(BaseModel):
    username: str
    password: str


class RouterIn(BaseModel):
    ip: str = Field(min_length=3, max_length=64)
    name: str = ""
    kind: Literal["huawei", "usr"] = "huawei"
    username: str = "admin"
    password: str | None = None  # None = keep the current password, "" = clear it
    enabled: bool = True
    notes: str = ""


class PcIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    mac: str = Field(pattern=MAC_RE)
    ip: str = ""
    router_id: int | None = None
    user_id: int | None = None
    notes: str = ""

    @field_validator("mac")
    @classmethod
    def normalize_mac(cls, v: str) -> str:
        return v.upper().replace("-", ":")


class UserIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    full_name: str = ""
    password: str | None = None  # required on create; None on update = keep
    role: Literal["admin", "viewer"] = "viewer"
    is_active: bool = True


class SettingsIn(BaseModel):
    poll_interval: int = Field(ge=5, le=3600)
    auto_discover: bool = True
