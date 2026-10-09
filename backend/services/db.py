import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Any

from services.stockfish_service import _estimate_elo, MAX_CP_LOSS_FOR_STATS

DB_PATH = os.getenv(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "chess_analyzer.db")
)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
ANALYSIS_CACHE_VERSION = 3


def normalize_engine(engine: str | None) -> str:
    if not engine:
        return "hybrid"
    e = engine.strip().lower()
    if e in ("sf", "stockfish", "stock fish"):
        return "stockfish"
    if e in ("nn", "human", "human_model", "humanized", "humanized model", "maia"):
        return "human_model"
    if e in ("hybrid", "coach"):
        return "hybrid"
    return e


def normalize_username(username: str | None) -> str:
    return username.strip().lower() if username else ""


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
        # Check existing table schema
        table_exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_cache'"
        ).fetchone()

        if table_exists:
            cols = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(analysis_cache)").fetchall()
            }
            pk_cols = [
                row["name"]
                for row in conn.execute("PRAGMA table_info(analysis_cache)").fetchall()
                if row["pk"] > 0
            ]
            needs_migration = (
                "username" not in cols
                or "engine" not in cols
                or pk_cols != ["pgn_hash", "username", "engine"]
            )
            if needs_migration:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS analysis_cache_new (
                        pgn_hash     TEXT NOT NULL,
                        username     TEXT NOT NULL DEFAULT '',
                        engine       TEXT NOT NULL DEFAULT 'hybrid',
                        pgn          TEXT NOT NULL,
                        player_color TEXT,
                        moves_json   TEXT NOT NULL,
                        summary_json TEXT NOT NULL,
                        version      INTEGER NOT NULL DEFAULT 3,
                        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (pgn_hash, username, engine)
                    )
                """)
                user_col = "username" if "username" in cols else "''"
                eng_col = "engine" if "engine" in cols else "'hybrid'"
                ver_col = "version" if "version" in cols else "3"
                conn.execute(f"""
                    INSERT OR IGNORE INTO analysis_cache_new
                      (pgn_hash, username, engine, pgn, player_color, moves_json, summary_json, version, created_at)
                    SELECT pgn_hash, {user_col}, {eng_col}, pgn, player_color, moves_json, summary_json, {ver_col}, created_at
                    FROM analysis_cache
                """)
                conn.execute("DROP TABLE analysis_cache")
                conn.execute("ALTER TABLE analysis_cache_new RENAME TO analysis_cache")
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analysis_cache (
                    pgn_hash     TEXT NOT NULL,
                    username     TEXT NOT NULL DEFAULT '',
                    engine       TEXT NOT NULL DEFAULT 'hybrid',
                    pgn          TEXT NOT NULL,
                    player_color TEXT,
                    moves_json   TEXT NOT NULL,
                    summary_json TEXT NOT NULL,
                    version      INTEGER NOT NULL DEFAULT 3,
                    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (pgn_hash, username, engine)
                )
            """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_analysis_user ON analysis_cache(username)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analysis_engine ON analysis_cache(engine)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analysis_hash ON analysis_cache(pgn_hash)")

        # Also import any legacy cached analyses from root chess_analyzer.db if it exists and differs
        root_db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "chess_analyzer.db"))
        curr_db_path = os.path.abspath(DB_PATH)
        if os.path.exists(root_db_path) and root_db_path != curr_db_path:
            try:
                root_conn = sqlite3.connect(root_db_path)
                root_conn.row_factory = sqlite3.Row
                root_table = root_conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_cache'"
                ).fetchone()
                if root_table:
                    root_rows = root_conn.execute("SELECT * FROM analysis_cache").fetchall()
                    for rr in root_rows:
                        r_cols = rr.keys()
                        r_user = rr["username"] if "username" in r_cols else ""
                        r_eng = rr["engine"] if "engine" in r_cols else "hybrid"
                        conn.execute("""
                            INSERT OR IGNORE INTO analysis_cache
                              (pgn_hash, username, engine, pgn, player_color, moves_json, summary_json, version, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            rr["pgn_hash"],
                            r_user,
                            r_eng,
                            rr["pgn"],
                            rr["player_color"],
                            rr["moves_json"],
                            rr["summary_json"],
                            ANALYSIS_CACHE_VERSION,
                            rr["created_at"],
                        ))
                root_conn.close()
            except Exception:
                pass

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
            CREATE TABLE IF NOT EXISTS game_overview_cache (
                pgn_hash      TEXT PRIMARY KEY,
                overview_json TEXT NOT NULL,
                version       INTEGER NOT NULL DEFAULT 1,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS explorer_cache (
                cache_key TEXT PRIMARY KEY,
                response_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS opening_progress (
                eco TEXT NOT NULL,
                opening_name TEXT NOT NULL,
                train_as TEXT NOT NULL,
                times_practiced INTEGER DEFAULT 0,
                times_correct INTEGER DEFAULT 0,
                total_attempts INTEGER DEFAULT 0,
                last_practiced_at TIMESTAMP,
                next_review_at TIMESTAMP,
                interval_days REAL DEFAULT 1.0,
                ease_factor REAL DEFAULT 2.5,
                streak INTEGER DEFAULT 0,
                comfort_level TEXT DEFAULT 'new',
                PRIMARY KEY (eco, opening_name, train_as)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS opening_explanations (
                eco TEXT NOT NULL,
                opening_name TEXT NOT NULL,
                move_index INTEGER NOT NULL,
                move_san TEXT NOT NULL,
                explanation_json TEXT NOT NULL,
                version INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (eco, opening_name, move_index)
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
        "estimated_elo": _estimate_elo(avg_capped_loss, summary.get("accuracy")),
    }


def save_analysis(
    pgn: str,
    player_color: str,
    moves: list[dict],
    summary: dict,
    username: str = "",
    engine: str = "hybrid",
) -> str:
    init_db()
    h = pgn_hash(pgn)
    norm_user = normalize_username(username)
    norm_engine = normalize_engine(engine)
    with _db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO analysis_cache
              (pgn_hash, username, engine, pgn, player_color, moves_json, summary_json, version, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                h,
                norm_user,
                norm_engine,
                pgn,
                player_color,
                json.dumps(moves),
                json.dumps(summary),
                ANALYSIS_CACHE_VERSION,
            ),
        )
    return h


def get_analysis(
    h: str,
    username: str | None = None,
    engine: str | None = None,
) -> dict[str, Any] | None:
    init_db()
    norm_user = normalize_username(username) if username else None
    norm_engine = normalize_engine(engine) if engine else None

    with _db() as conn:
        row = None
        if norm_engine is not None:
            # Caller requested a specific engine
            if norm_user is not None:
                row = conn.execute(
                    """
                    SELECT * FROM analysis_cache
                    WHERE pgn_hash = ? AND (username = ? OR username = '') AND engine = ?
                    ORDER BY (username = ?) DESC, created_at DESC LIMIT 1
                    """,
                    (h, norm_user, norm_engine, norm_user),
                ).fetchone()

            if row is None:
                row = conn.execute(
                    """
                    SELECT * FROM analysis_cache
                    WHERE pgn_hash = ? AND engine = ?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (h, norm_engine),
                ).fetchone()
        else:
            # No specific engine requested: match username if provided, else latest
            if norm_user is not None:
                row = conn.execute(
                    """
                    SELECT * FROM analysis_cache
                    WHERE pgn_hash = ? AND (username = ? OR username = '')
                    ORDER BY (username = ?) DESC, created_at DESC LIMIT 1
                    """,
                    (h, norm_user, norm_user),
                ).fetchone()

            if row is None:
                row = conn.execute(
                    """
                    SELECT * FROM analysis_cache
                    WHERE pgn_hash = ?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (h,),
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
        "username": row["username"],
        "engine": row["engine"],
        "pgn": row["pgn"],
        "player_color": row["player_color"],
        "moves": moves,
        "summary": summary,
        "created_at": row["created_at"],
    }


def list_cached(
    username: str | None = None,
    engine: str | None = None,
) -> list[dict[str, Any]]:
    init_db()
    norm_user = normalize_username(username) if username else None
    norm_engine = normalize_engine(engine) if engine else None

    query = "SELECT pgn_hash, username, engine, player_color, moves_json, summary_json, created_at FROM analysis_cache WHERE 1=1"
    params = []
    if norm_user:
        query += " AND (username = ? OR username = '')"
        params.append(norm_user)
    if norm_engine:
        query += " AND engine = ?"
        params.append(norm_engine)
    query += " ORDER BY created_at DESC"

    with _db() as conn:
        rows = conn.execute(query, params).fetchall()

    return [
        {
            "pgn_hash": r["pgn_hash"],
            "username": r["username"],
            "engine": r["engine"],
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


def get_cache_status_batch(
    hashes: list[str],
    username: str | None = None,
) -> dict[str, dict[str, Any]]:
    init_db()
    if not hashes:
        return {}

    norm_user = normalize_username(username) if username else None
    results: dict[str, dict[str, Any]] = {
        h: {"analyzed": False, "engines": [], "latest_engine": None, "created_at": None}
        for h in hashes
    }

    placeholders = ",".join("?" for _ in hashes)
    query = f"""
        SELECT pgn_hash, username, engine, created_at
        FROM analysis_cache
        WHERE pgn_hash IN ({placeholders})
        ORDER BY created_at DESC
    """
    with _db() as conn:
        rows = conn.execute(query, hashes).fetchall()

    for r in rows:
        h = r["pgn_hash"]
        eng = r["engine"]
        r_user = r["username"]
        # If a username is specified, only include matching user or global analyses
        if norm_user and r_user and r_user != norm_user:
            continue
        status = results.get(h)
        if status is None:
            continue
        status["analyzed"] = True
        if eng not in status["engines"]:
            status["engines"].append(eng)
        if not status["latest_engine"]:
            status["latest_engine"] = eng
            status["created_at"] = r["created_at"]

    return results


def delete_analysis(h: str, engine: str | None = None) -> bool:
    init_db()
    with _db() as conn:
        if engine:
            norm_engine = normalize_engine(engine)
            cur = conn.execute(
                "DELETE FROM analysis_cache WHERE pgn_hash = ? AND engine = ?",
                (h, norm_engine),
            )
        else:
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


def save_game_overview(pgn_hash: str, overview_payload: dict[str, Any], version: int = 1) -> None:
    with _db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO game_overview_cache (pgn_hash, overview_json, version)
            VALUES (?, ?, ?)
            """,
            (pgn_hash, json.dumps(overview_payload), version),
        )


def get_game_overview(pgn_hash: str, version: int = 1) -> dict[str, Any] | None:
    with _db() as conn:
        row = conn.execute(
            "SELECT overview_json FROM game_overview_cache WHERE pgn_hash = ? AND version = ?",
            (pgn_hash, version),
        ).fetchone()
    if row is None:
        return None
    return json.loads(row["overview_json"])


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

def get_explorer_cache(cache_key: str) -> str | None:
    init_db()
    with _db() as conn:
        row = conn.execute("SELECT response_json FROM explorer_cache WHERE cache_key = ?", (cache_key,)).fetchone()
    return row["response_json"] if row else None

def save_explorer_cache(cache_key: str, response_json: str) -> None:
    init_db()
    with _db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO explorer_cache (cache_key, response_json)
            VALUES (?, ?)
            """,
            (cache_key, response_json)
        )

def get_opening_progress(eco: str, name: str, train_as: str) -> dict | None:
    init_db()
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM opening_progress WHERE eco = ? AND opening_name = ? AND train_as = ?",
            (eco, name, train_as)
        ).fetchone()
    if not row:
        return None
    return dict(row)

def save_opening_progress(eco: str, name: str, train_as: str, data: dict) -> None:
    init_db()
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO opening_progress (
                eco, opening_name, train_as, times_practiced, times_correct, 
                total_attempts, last_practiced_at, next_review_at, interval_days, 
                ease_factor, streak, comfort_level
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(eco, opening_name, train_as) DO UPDATE SET
                times_practiced = excluded.times_practiced,
                times_correct = excluded.times_correct,
                total_attempts = excluded.total_attempts,
                last_practiced_at = excluded.last_practiced_at,
                next_review_at = excluded.next_review_at,
                interval_days = excluded.interval_days,
                ease_factor = excluded.ease_factor,
                streak = excluded.streak,
                comfort_level = excluded.comfort_level
            """,
            (
                eco, name, train_as,
                data.get("times_practiced", 0),
                data.get("times_correct", 0),
                data.get("total_attempts", 0),
                data.get("last_practiced_at"),
                data.get("next_review_at"),
                data.get("interval_days", 1.0),
                data.get("ease_factor", 2.5),
                data.get("streak", 0),
                data.get("comfort_level", "new")
            )
        )

def get_all_opening_progress() -> list[dict]:
    init_db()
    with _db() as conn:
        rows = conn.execute("SELECT * FROM opening_progress").fetchall()
    return [dict(r) for r in rows]

def get_opening_explanation(eco: str, name: str, move_index: int) -> dict | None:
    init_db()
    with _db() as conn:
        row = conn.execute(
            "SELECT explanation_json FROM opening_explanations WHERE eco = ? AND opening_name = ? AND move_index = ?",
            (eco, name, move_index)
        ).fetchone()
    if not row:
        return None
    return json.loads(row["explanation_json"])

def save_opening_explanation(eco: str, name: str, move_index: int, move_san: str, explanation: dict) -> None:
    init_db()
    with _db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO opening_explanations (eco, opening_name, move_index, move_san, explanation_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (eco, name, move_index, move_san, json.dumps(explanation))
        )

def get_all_opening_explanations(eco: str, name: str) -> list[dict]:
    init_db()
    with _db() as conn:
        rows = conn.execute(
            "SELECT move_index, move_san, explanation_json FROM opening_explanations WHERE eco = ? AND opening_name = ? ORDER BY move_index",
            (eco, name)
        ).fetchall()
    return [{"move_index": r["move_index"], "move_san": r["move_san"], "explanation": json.loads(r["explanation_json"])} for r in rows]
