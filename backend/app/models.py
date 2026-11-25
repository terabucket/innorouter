from datetime import datetime, timezone

from sqlalchemy import (BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, String,
                        Text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128), default="")
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="viewer")  # admin | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pcs: Mapped[list["PC"]] = relationship(back_populates="user")


class Router(Base):
    __tablename__ = "routers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    kind: Mapped[str] = mapped_column(String(16), default="huawei")  # huawei | usr
    username: Mapped[str] = mapped_column(String(64), default="admin")
    password_enc: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pcs: Mapped[list["PC"]] = relationship(back_populates="router")
    status: Mapped["RouterStatus | None"] = relationship(
        back_populates="router", cascade="all, delete-orphan", uselist=False)


class RouterStatus(Base):
    """Latest reading per router (one row per router, overwritten every poll)."""
    __tablename__ = "router_status"

    router_id: Mapped[int] = mapped_column(ForeignKey("routers.id", ondelete="CASCADE"), primary_key=True)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    response_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    firmware: Mapped[str | None] = mapped_column(String(128), nullable=True)
    carrier: Mapped[str | None] = mapped_column(String(64), nullable=True)
    network_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    wan_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signal_bars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rsrp: Mapped[float | None] = mapped_column(Float, nullable=True)
    rsrq: Mapped[float | None] = mapped_column(Float, nullable=True)
    sinr: Mapped[float | None] = mapped_column(Float, nullable=True)
    csq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unread_sms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    update_status: Mapped[str] = mapped_column(String(16), default="unknown")
    down_rate: Mapped[float | None] = mapped_column(Float, nullable=True)  # bytes/s
    up_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    today_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    month_down: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    month_up: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    uptime_seconds: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    clients_supported: Mapped[bool] = mapped_column(Boolean, default=False)
    auth_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra: Mapped[str] = mapped_column(Text, default="{}")  # JSON of model-specific fields
    polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    router: Mapped[Router] = relationship(back_populates="status")


class PC(Base):
    __tablename__ = "pcs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    mac: Mapped[str] = mapped_column(String(17), unique=True, index=True)
    ip: Mapped[str] = mapped_column(String(64), default="")
    router_id: Mapped[int | None] = mapped_column(ForeignKey("routers.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    auto_discovered: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Latest reading
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    hostname: Mapped[str] = mapped_column(String(128), default="")
    interface: Mapped[str] = mapped_column(String(32), default="")
    down_rate: Mapped[float] = mapped_column(Float, default=0)  # bytes/s
    up_rate: Mapped[float] = mapped_column(Float, default=0)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    router: Mapped[Router | None] = relationship(back_populates="pcs")
    user: Mapped[User | None] = relationship(back_populates="pcs")


class RouterSample(Base):
    __tablename__ = "router_samples"
    __table_args__ = (Index("ix_router_samples_router_ts", "router_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    router_id: Mapped[int] = mapped_column(ForeignKey("routers.id", ondelete="CASCADE"))
    ts: Mapped[int] = mapped_column(BigInteger, index=True)  # unix seconds
    online: Mapped[bool] = mapped_column(Boolean)
    response_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    down_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    up_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    rx_delta: Mapped[int] = mapped_column(BigInteger, default=0)  # bytes since previous sample
    tx_delta: Mapped[int] = mapped_column(BigInteger, default=0)
    signal_bars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rsrp: Mapped[float | None] = mapped_column(Float, nullable=True)
    sinr: Mapped[float | None] = mapped_column(Float, nullable=True)


class PcSample(Base):
    __tablename__ = "pc_samples"
    __table_args__ = (Index("ix_pc_samples_pc_ts", "pc_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pc_id: Mapped[int] = mapped_column(ForeignKey("pcs.id", ondelete="CASCADE"))
    router_id: Mapped[int | None] = mapped_column(ForeignKey("routers.id", ondelete="SET NULL"), nullable=True)
    ts: Mapped[int] = mapped_column(BigInteger, index=True)
    active: Mapped[bool] = mapped_column(Boolean)
    down_rate: Mapped[float] = mapped_column(Float, default=0)
    up_rate: Mapped[float] = mapped_column(Float, default=0)
    rx_delta: Mapped[int] = mapped_column(BigInteger, default=0)  # downloaded bytes since previous sample
    tx_delta: Mapped[int] = mapped_column(BigInteger, default=0)  # uploaded bytes since previous sample
    rx_counter: Mapped[int] = mapped_column(BigInteger, default=0)  # raw router counters (KB)
    tx_counter: Mapped[int] = mapped_column(BigInteger, default=0)


class UsageHourly(Base):
    """Per-PC traffic rolled up per hour; feeds the hourly / daily / weekly charts."""
    __tablename__ = "usage_hourly"

    pc_id: Mapped[int] = mapped_column(ForeignKey("pcs.id", ondelete="CASCADE"), primary_key=True)
    hour_ts: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    rx_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    tx_bytes: Mapped[int] = mapped_column(BigInteger, default=0)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
