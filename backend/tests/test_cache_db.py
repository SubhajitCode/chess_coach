import pytest
from services.db import (
    init_db,
    save_analysis,
    get_analysis,
    get_cache_status_batch,
    list_cached,
    delete_analysis,
    pgn_hash,
    _db,
)


@pytest.fixture(autouse=True)
def clean_db():
    init_db()
    test_pgn = "1. e4 e5 2. Nf3 Nc6"
    h = pgn_hash(test_pgn)
    with _db() as conn:
        conn.execute("DELETE FROM analysis_cache WHERE pgn_hash = ?", (h,))
    yield
    with _db() as conn:
        conn.execute("DELETE FROM analysis_cache WHERE pgn_hash = ?", (h,))


def test_save_and_retrieve_by_engine_and_user():
    pgn = "1. e4 e5 2. Nf3 Nc6"
    h = pgn_hash(pgn)

    moves_sf = [{"move_number": 1, "color": "white", "move_san": "e4", "cp_loss": 0}]
    summary_sf = {"accuracy": 88.0, "total_moves": 1}

    moves_hy = [{"move_number": 1, "color": "white", "move_san": "e4", "cp_loss": 5}]
    summary_hy = {"accuracy": 94.0, "total_moves": 1}

    # Save for user 'magnus' with stockfish
    h_saved = save_analysis(pgn, "white", moves_sf, summary_sf, username="magnus", engine="stockfish")
    assert h_saved == h

    # Save for user 'magnus' with hybrid
    save_analysis(pgn, "white", moves_hy, summary_hy, username="magnus", engine="hybrid")

    # Save for user 'hikaru' with human_model
    save_analysis(pgn, "white", moves_sf, summary_sf, username="hikaru", engine="human_model")

    # Fetch magnus stockfish
    sf_cached = get_analysis(h, username="magnus", engine="stockfish")
    assert sf_cached is not None
    assert sf_cached["engine"] == "stockfish"
    assert sf_cached["summary"]["accuracy"] == 88.0

    # Fetch magnus hybrid
    hy_cached = get_analysis(h, username="magnus", engine="hybrid")
    assert hy_cached is not None
    assert hy_cached["engine"] == "hybrid"
    assert hy_cached["summary"]["accuracy"] == 94.0

    # Batch status for magnus
    batch_magnus = get_cache_status_batch([h], username="magnus")
    assert h in batch_magnus
    assert batch_magnus[h]["analyzed"] is True
    assert set(batch_magnus[h]["engines"]) == {"stockfish", "hybrid"}

    # Batch status for hikaru
    batch_hikaru = get_cache_status_batch([h], username="hikaru")
    assert batch_hikaru[h]["analyzed"] is True
    assert batch_hikaru[h]["engines"] == ["human_model"]

    # Delete specific engine
    assert delete_analysis(h, engine="stockfish") is True
    assert get_analysis(h, username="magnus", engine="stockfish") is None
    # Hybrid should still exist
    assert get_analysis(h, username="magnus", engine="hybrid") is not None
