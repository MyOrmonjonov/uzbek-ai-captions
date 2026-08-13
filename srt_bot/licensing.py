"""SQLite-backed license storage: pending activation requests, issued tokens,
and the bot's own daily free-usage quota. This module is the single source of
truth other machines' backends check against (via licensing_server.py), so a
token is only ever considered valid here — never trusted purely on the client.
"""

import secrets
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from datetime import date, datetime

import config

DB_PATH = config.BASE_DIR / "licenses.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS licenses (
            device_code TEXT PRIMARY KEY,
            token TEXT NOT NULL,
            telegram_user_id INTEGER NOT NULL,
            issued_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_requests (
            device_code TEXT PRIMARY KEY,
            telegram_user_id INTEGER NOT NULL,
            requested_at REAL NOT NULL,
            tariff_days INTEGER NOT NULL DEFAULT 30,
            tariff_label TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS free_usage (
            telegram_user_id INTEGER PRIMARY KEY,
            last_used_date TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            telegram_user_id INTEGER PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            registered_at REAL NOT NULL
        )
        """
    )
    # CREATE TABLE IF NOT EXISTS above is a no-op against a pending_requests table that already
    # existed before tariff_days/tariff_label were added, so an existing licenses.db (like the
    # one already deployed) needs these columns bolted on explicitly. Safe to run every startup —
    # SQLite errors out on a duplicate column, which is exactly the "already migrated" case.
    for column_sql in (
        "ALTER TABLE pending_requests ADD COLUMN tariff_days INTEGER NOT NULL DEFAULT 30",
        "ALTER TABLE pending_requests ADD COLUMN tariff_label TEXT NOT NULL DEFAULT ''",
    ):
        try:
            conn.execute(column_sql)
        except sqlite3.OperationalError:
            pass
    return conn


@dataclass
class VerifyResult:
    valid: bool
    days_left: float
    reason: str


@dataclass
class PendingRequest:
    telegram_user_id: int
    tariff_days: int
    tariff_label: str


def create_pending_request(device_code: str, telegram_user_id: int, tariff_days: int, tariff_label: str) -> None:
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT INTO pending_requests (device_code, telegram_user_id, requested_at, tariff_days, tariff_label) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(device_code) DO UPDATE SET telegram_user_id=excluded.telegram_user_id, "
            "requested_at=excluded.requested_at, tariff_days=excluded.tariff_days, "
            "tariff_label=excluded.tariff_label",
            (device_code, telegram_user_id, time.time(), tariff_days, tariff_label),
        )
        conn.commit()


def get_pending_request(device_code: str) -> PendingRequest | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT telegram_user_id, tariff_days, tariff_label FROM pending_requests WHERE device_code = ?",
            (device_code,),
        ).fetchone()
        return PendingRequest(*row) if row else None


def approve(device_code: str, telegram_user_id: int, days: int) -> str:
    """Issues a fresh token for device_code, valid `days` from now, and clears
    the pending request. Re-approving an already-licensed device (renewal)
    just extends/replaces its token rather than erroring."""
    token = secrets.token_urlsafe(24)
    now = time.time()
    expires_at = now + days * 86400
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT INTO licenses (device_code, token, telegram_user_id, issued_at, expires_at, revoked) "
            "VALUES (?, ?, ?, ?, ?, 0) "
            "ON CONFLICT(device_code) DO UPDATE SET token=excluded.token, "
            "telegram_user_id=excluded.telegram_user_id, issued_at=excluded.issued_at, "
            "expires_at=excluded.expires_at, revoked=0",
            (device_code, token, telegram_user_id, now, expires_at),
        )
        conn.execute("DELETE FROM pending_requests WHERE device_code = ?", (device_code,))
        conn.commit()
    return token


def reject(device_code: str) -> None:
    with closing(_connect()) as conn:
        conn.execute("DELETE FROM pending_requests WHERE device_code = ?", (device_code,))
        conn.commit()


def revoke(device_code: str) -> bool:
    with closing(_connect()) as conn:
        cur = conn.execute("UPDATE licenses SET revoked = 1 WHERE device_code = ?", (device_code,))
        conn.commit()
        return cur.rowcount > 0


def verify(device_code: str, token: str) -> VerifyResult:
    if not device_code or not token:
        return VerifyResult(False, 0.0, "missing_fields")
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT token, expires_at, revoked FROM licenses WHERE device_code = ?",
            (device_code,),
        ).fetchone()
    if row is None:
        return VerifyResult(False, 0.0, "not_found")
    stored_token, expires_at, revoked = row
    if revoked:
        return VerifyResult(False, 0.0, "revoked")
    if not secrets.compare_digest(stored_token, token):
        return VerifyResult(False, 0.0, "device_mismatch")
    days_left = (expires_at - time.time()) / 86400
    if days_left <= 0:
        return VerifyResult(False, 0.0, "expired")
    return VerifyResult(True, days_left, "ok")


def has_free_quota_today(telegram_user_id: int) -> bool:
    """Read-only check, used to reject early (before downloading/processing anything)
    if today's free bot conversion is already used. Does not record anything — call
    record_free_usage() only once generation actually succeeds, otherwise a user who
    hits a transient error (bad file, transcription hiccup, API error) would lose
    their one daily try for nothing."""
    today = date.today().isoformat()
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT last_used_date FROM free_usage WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        return row is None or row[0] != today


def record_free_usage(telegram_user_id: int) -> None:
    today = date.today().isoformat()
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT INTO free_usage (telegram_user_id, last_used_date) VALUES (?, ?) "
            "ON CONFLICT(telegram_user_id) DO UPDATE SET last_used_date=excluded.last_used_date",
            (telegram_user_id, today),
        )
        conn.commit()


@dataclass
class UserProfile:
    telegram_user_id: int
    first_name: str
    last_name: str
    phone_number: str
    registered_at: float


def is_registered(telegram_user_id: int) -> bool:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT 1 FROM users WHERE telegram_user_id = ?", (telegram_user_id,)
        ).fetchone()
        return row is not None


def register_user(telegram_user_id: int, first_name: str, last_name: str, phone_number: str) -> None:
    with closing(_connect()) as conn:
        conn.execute(
            "INSERT INTO users (telegram_user_id, first_name, last_name, phone_number, registered_at) "
            "VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(telegram_user_id) DO UPDATE SET first_name=excluded.first_name, "
            "last_name=excluded.last_name, phone_number=excluded.phone_number",
            (telegram_user_id, first_name, last_name, phone_number, time.time()),
        )
        conn.commit()


def get_user(telegram_user_id: int) -> UserProfile | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT telegram_user_id, first_name, last_name, phone_number, registered_at "
            "FROM users WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        return UserProfile(*row) if row else None


def days_since_registration(telegram_user_id: int) -> int | None:
    profile = get_user(telegram_user_id)
    if profile is None:
        return None
    # timedelta.days floors toward -inf, so a few-microsecond-negative delta (registered
    # a moment ago, clock jitter between the write and this read) comes out as -1 rather
    # than 0 -- clamp instead of showing a user "-1 kun oldin" right after they register.
    seconds = (datetime.now() - datetime.fromtimestamp(profile.registered_at)).total_seconds()
    return max(0, int(seconds // 86400))


def get_active_licenses_for_user(telegram_user_id: int) -> list[tuple[str, float]]:
    """Returns (device_code, days_left) for every non-revoked, unexpired license
    bound to this Telegram user -- used for the bot's "Statistikam" view."""
    now = time.time()
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT device_code, expires_at FROM licenses "
            "WHERE telegram_user_id = ? AND revoked = 0 AND expires_at > ?",
            (telegram_user_id, now),
        ).fetchall()
    return [(device_code, (expires_at - now) / 86400) for device_code, expires_at in rows]