"""Persistence and database layer for SwasthiQ EOD Billing & Analytics Agent.

Provides SQLite persistence with strict atomic transaction guarantees,
ensuring data consistency upon log updates and re-ingestions.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import threading
from typing import Any, Dict, List, Optional, Tuple

from .deterministic import (
    compute_analytics,
    compute_eod_reconciliation,
    parse_and_validate_billing_log,
)
from .schemas import TransactionRow

DEFAULT_DB_PATH = os.getenv(
    "SWASTHIQ_DB_PATH",
    str(Path(__file__).resolve().parent.parent / "swasthiq.db"),
)


class DatabaseManager:
    """
    Manages SQLite database storage for clinics and daily billing logs.
    Thread-safe connection handling with strict ACID transaction guarantees.
    """

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._local = threading.local()
        self.init_db()

    def get_connection(self) -> sqlite3.Connection:
        """Returns a thread-local SQLite connection with foreign keys enabled."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                detect_types=sqlite3.PARSE_DECLTYPES,
            )
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA journal_mode = WAL;")
            self._local.conn = conn
        return self._local.conn

    def init_db(self) -> None:
        """Initializes database schema with clinics and billing_logs tables."""
        conn = self.get_connection()
        with conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS clinics (
                    clinic_id TEXT PRIMARY KEY,
                    name TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS billing_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    clinic_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    raw_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (clinic_id) REFERENCES clinics(clinic_id) ON DELETE CASCADE,
                    UNIQUE(clinic_id, date)
                );
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_billing_logs_clinic_date
                ON billing_logs(clinic_id, date);
                """
            )

    def save_billing_log(
        self,
        clinic_id: str,
        date_str: str,
        raw_records: List[Dict[str, Any]],
        clinic_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Atomically saves or updates a daily billing log for a clinic.
        """
        valid_txs, rejected_errors = parse_and_validate_billing_log(raw_records, strict=False)

        reconciliation = compute_eod_reconciliation(valid_txs)
        analytics = compute_analytics(valid_txs)

        now_iso = datetime.now(timezone.utc).isoformat()
        raw_json_str = json.dumps(raw_records)

        conn = self.get_connection()
        with conn:
            conn.execute(
                """
                INSERT INTO clinics (clinic_id, name, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(clinic_id) DO UPDATE SET
                    name = COALESCE(excluded.name, clinics.name);
                """,
                (clinic_id, clinic_name or clinic_id, now_iso),
            )

            cursor = conn.execute(
                """
                INSERT INTO billing_logs (clinic_id, date, raw_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(clinic_id, date) DO UPDATE SET
                    raw_json = excluded.raw_json,
                    updated_at = excluded.updated_at
                RETURNING id, created_at, updated_at;
                """,
                (clinic_id, date_str, raw_json_str, now_iso, now_iso),
            )
            row = cursor.fetchone()
            log_id = row["id"]
            created_at = row["created_at"]
            updated_at = row["updated_at"]

        return {
            "id": log_id,
            "clinic_id": clinic_id,
            "date": date_str,
            "created_at": created_at,
            "updated_at": updated_at,
            "total_records": len(raw_records),
            "valid_records_count": len(valid_txs),
            "rejected_records_count": len(rejected_errors),
            "rejected_errors": rejected_errors,
            "reconciliation": reconciliation,
            "analytics": analytics,
        }

    def get_billing_log(self, clinic_id: str, date_str: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves stored daily billing log and computes current deterministic outputs.
        """
        conn = self.get_connection()
        cursor = conn.execute(
            """
            SELECT id, clinic_id, date, raw_json, created_at, updated_at
            FROM billing_logs
            WHERE clinic_id = ? AND date = ?;
            """,
            (clinic_id, date_str),
        )
        row = cursor.fetchone()
        if not row:
            return None

        raw_records = json.loads(row["raw_json"])
        valid_txs, rejected_errors = parse_and_validate_billing_log(raw_records, strict=False)

        reconciliation = compute_eod_reconciliation(valid_txs)
        analytics = compute_analytics(valid_txs)

        return {
            "id": row["id"],
            "clinic_id": row["clinic_id"],
            "date": row["date"],
            "raw_records": raw_records,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "valid_records_count": len(valid_txs),
            "rejected_records_count": len(rejected_errors),
            "rejected_errors": rejected_errors,
            "reconciliation": reconciliation,
            "analytics": analytics,
        }

    def list_clinics(self) -> List[Dict[str, Any]]:
        """Lists all registered clinics."""
        conn = self.get_connection()
        cursor = conn.execute(
            "SELECT clinic_id, name, created_at FROM clinics ORDER BY clinic_id ASC;"
        )
        return [dict(r) for r in cursor.fetchall()]

    def list_dates_for_clinic(self, clinic_id: str) -> List[str]:
        """Lists all ingested dates for a specific clinic."""
        conn = self.get_connection()
        cursor = conn.execute(
            """
            SELECT date FROM billing_logs
            WHERE clinic_id = ?
            ORDER BY date DESC;
            """,
            (clinic_id,),
        )
        return [r["date"] for r in cursor.fetchall()]

    def delete_billing_log(self, clinic_id: str, date_str: str) -> bool:
        """Deletes a billing log entry for a clinic on a specific date."""
        conn = self.get_connection()
        with conn:
            cursor = conn.execute(
                "DELETE FROM billing_logs WHERE clinic_id = ? AND date = ?;",
                (clinic_id, date_str),
            )
            return cursor.rowcount > 0

    def close(self) -> None:
        """Closes thread-local connection."""
        if hasattr(self._local, "conn") and self._local.conn is not None:
            self._local.conn.close()
            self._local.conn = None


db_manager = DatabaseManager()
