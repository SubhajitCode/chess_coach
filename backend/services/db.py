import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Any

from services.stockfish_service import _estimate_elo, MAX_CP_LOSS_FOR_STATS

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "chess_analyzer.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
ANALYSIS_CACHE_VERSION = 3


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
        analysis_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(analysis_cache)").fetchall()
        }
        if "version" not in analysis_columns:
            conn.execute(
                "ALTER TABLE analysis_cache ADD COLUMN version INTEGER NOT NULL DEFAULT 1"
            )
        conn.execute("UPDATE analysis_cache SET version = 1 WHERE version IS NULL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS move_coaching (
                pgn_hash   TEXT NOT NULL,
                move_index INTEGER NOT NULL,
                feedback   TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (pgn_hash, move_index)
            )
        """)
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(move_coaching)").fetchall()
        }
        if "version" not in columns:
            conn.execute(
                "ALTER TABLE move_coaching ADD COLUMN version INTEGER NOT NULL DEFAULT 1"
            )
        conn.execute("UPDATE move_coaching SET version = 1 WHERE version IS NULL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS player_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                username TEXT,
                platform TEXT NOT NULL DEFAULT 'chesscom',
                main_time_control TEXT,
                improvement_goal TEXT,
                focus_area TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def pgn_hash(pgn: str) -> str:
    return hashlib.sha256(pgn.strip().encode()).hexdigest()[:24]


def _refresh_summary_estimate(summary: dict[str, Any], moves: list[dict], player_color: str | None) -> dict[str, Any]:
    if not summary or not player_color:
        return summary

    player_moves = [move for move in moves if move.get("color") == player_color]
    if not player_moves:
        return summary

    avg_capped_loss = sum(min(move.get("cp_loss") or 0, MAX_CP_LOSS_FOR_STATS) for move in player_moves) / len(player_moves)
    return {
        **summary,
        "avg_cp_loss": round(avg_capped_loss, 1),
        "estimated_elo": _estimate_elo(avg_capped_loss),
    }


def save_analysis(pgn: str, player_color: str, moves: list[dict], summary: dict) -> str:
    h = pgn_hash(pgn)
    with _db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO analysis_cache
              (pgn_hash, pgn, player_color, moves_json, summary_json, version)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (h, pgn, player_color, json.dumps(moves), json.dumps(summary), ANALYSIS_CACHE_VERSION),
        )
    return h


def get_analysis(h: str) -> dict[str, Any] | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM analysis_cache WHERE pgn_hash = ? AND version = ?", (h, ANALYSIS_CACHE_VERSION)
        ).fetchone()
    if row is None:
        return None
    moves = json.loads(row["moves_json"])
    summary = _refresh_summary_estimate(
        json.loads(row["summary_json"]),
        moves,
        row["player_color"],
    )
    return {
        "pgn_hash": row["pgn_hash"],
        "pgn": row["pgn"],
        "player_color": row["player_color"],
        "moves": moves,
        "summary": summary,
        "created_at": row["created_at"],
    }


def list_cached() -> list[dict[str, Any]]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT pgn_hash, player_color, moves_json, summary_json, created_at FROM analysis_cache WHERE version = ? ORDER BY created_at DESC",
            (ANALYSIS_CACHE_VERSION,),
        ).fetchall()
    return [
        {
            "pgn_hash": r["pgn_hash"],
            "player_color": r["player_color"],
            "summary": _refresh_summary_estimate(
                json.loads(r["summary_json"]),
                json.loads(r["moves_json"]),
                r["player_color"],
            ),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def delete_analysis(h: str) -> bool:
    with _db() as conn:
        cur = conn.execute("DELETE FROM analysis_cache WHERE pgn_hash = ?", (h,))
    return cur.rowcount > 0


def save_move_coaching(pgn_hash: str, coaching: list[dict], version: int = 1) -> None:
    """Save per-move coaching feedback. Each dict must have move_index and feedback."""
    with _db() as conn:
        conn.executemany(
            """
            INSERT OR REPLACE INTO move_coaching (pgn_hash, move_index, feedback, version)
            VALUES (?, ?, ?, ?)
            """,
            [(pgn_hash, item["move_index"], item["feedback"], version) for item in coaching],
        )


def clear_move_coaching() -> None:
    with _db() as conn:
        conn.execute("DELETE FROM move_coaching")


def get_move_coaching(pgn_hash: str, version: int = 1) -> list[dict] | None:
    """Return per-move coaching for a game, or None if not cached."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT move_index, feedback FROM move_coaching WHERE pgn_hash = ? AND version = ? ORDER BY move_index",
            (pgn_hash, version),
        ).fetchall()
    if not rows:
        return None
    return [{"move_index": r["move_index"], "feedback": r["feedback"]} for r in rows]


def get_player_profile() -> dict[str, Any] | None:
    init_db()
    with _db() as conn:
        row = conn.execute("SELECT * FROM player_profile WHERE id = 1").fetchone()
    if row is None:
        return None
    return {
        "username": row["username"],
        "platform": row["platform"],
        "main_time_control": row["main_time_control"],
        "improvement_goal": row["improvement_goal"],
        "focus_area": row["focus_area"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def save_player_profile(profile: dict[str, Any]) -> dict[str, Any]:
    init_db()
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO player_profile (
                id,
                username,
                platform,
                main_time_control,
                improvement_goal,
                focus_area,
                updated_at
            )
            VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                platform = excluded.platform,
                main_time_control = excluded.main_time_control,
                improvement_goal = excluded.improvement_goal,
                focus_area = excluded.focus_area,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                profile.get("username"),
                profile.get("platform") or "chesscom",
                profile.get("main_time_control"),
                profile.get("improvement_goal"),
                profile.get("focus_area"),
            ),
        )
    return get_player_profile()
