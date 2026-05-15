import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Any

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "chess_analyzer.db")


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _db():
    conn = _get_connection()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS analysis_cache (
                pgn_hash   TEXT PRIMARY KEY,
                pgn        TEXT NOT NULL,
                player_color TEXT,
                moves_json TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS move_coaching (
                pgn_hash   TEXT NOT NULL,
                move_index INTEGER NOT NULL,
                feedback   TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (pgn_hash, move_index)
            )
        """)


def pgn_hash(pgn: str) -> str:
    return hashlib.sha256(pgn.strip().encode()).hexdigest()[:24]


def save_analysis(pgn: str, player_color: str, moves: list[dict], summary: dict) -> str:
    h = pgn_hash(pgn)
    with _db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO analysis_cache
              (pgn_hash, pgn, player_color, moves_json, summary_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (h, pgn, player_color, json.dumps(moves), json.dumps(summary)),
        )
    return h


def get_analysis(h: str) -> dict[str, Any] | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM analysis_cache WHERE pgn_hash = ?", (h,)
        ).fetchone()
    if row is None:
        return None
    return {
        "pgn_hash": row["pgn_hash"],
        "player_color": row["player_color"],
        "moves": json.loads(row["moves_json"]),
        "summary": json.loads(row["summary_json"]),
        "created_at": row["created_at"],
    }


def list_cached() -> list[dict[str, Any]]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT pgn_hash, player_color, summary_json, created_at FROM analysis_cache ORDER BY created_at DESC"
        ).fetchall()
    return [
        {
            "pgn_hash": r["pgn_hash"],
            "player_color": r["player_color"],
            "summary": json.loads(r["summary_json"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def delete_analysis(h: str) -> bool:
    with _db() as conn:
        cur = conn.execute("DELETE FROM analysis_cache WHERE pgn_hash = ?", (h,))
    return cur.rowcount > 0


def save_move_coaching(pgn_hash: str, coaching: list[dict]) -> None:
    """Save per-move coaching feedback. Each dict must have move_index and feedback."""
    with _db() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO move_coaching (pgn_hash, move_index, feedback)
            VALUES (?, ?, ?)
            """,
            [(pgn_hash, item["move_index"], item["feedback"]) for item in coaching],
        )


def get_move_coaching(pgn_hash: str) -> list[dict] | None:
    """Return per-move coaching for a game, or None if not cached."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT move_index, feedback FROM move_coaching WHERE pgn_hash = ? ORDER BY move_index",
            (pgn_hash,),
        ).fetchall()
    if not rows:
        return None
    return [{"move_index": r["move_index"], "feedback": r["feedback"]} for r in rows]
