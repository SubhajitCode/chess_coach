"""
test_openings_trainer.py - Unit and integration tests for the Openings Trainer system.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from services.openings_db import get_openings_db
from services.opening_trainer import calculate_srs_update

client = TestClient(app)


def test_openings_db_load_and_catalog():
    db = get_openings_db()
    assert len(db._entries) > 3000, "Should load thousands of TSV openings"
    catalog = db.get_catalog()
    assert len(catalog) >= 6, "Should contain at least 6 opening categories"
    
    total_openings = sum(len(c["openings"]) for c in catalog)
    assert total_openings >= 30, "Should contain curated openings across categories"

    # Test line parsing for Italian Game
    italian = db.find_opening("C50", "Italian Game")
    assert italian is not None
    assert italian.eco == "C50"
    moves = db.get_line_moves(italian)
    assert len(moves) == 5
    assert [m["san"] for m in moves] == ["e4", "e5", "Nf3", "Nc6", "Bc4"]


def test_calculate_srs_update():
    # Initial session with high accuracy
    initial_prog = {
        "times_practiced": 0,
        "interval_days": 1.0,
        "ease_factor": 2.5,
        "streak": 0,
    }
    update = calculate_srs_update(initial_prog, session_accuracy=1.0)
    assert update["times_practiced"] == 1
    assert update["streak"] == 1
    assert update["interval_days"] == 1.0
    assert update["comfort_level"] == "learning"

    # Second practice with high accuracy
    update2 = calculate_srs_update(update, session_accuracy=1.0)
    assert update2["times_practiced"] == 2
    assert update2["interval_days"] == 6.0
    assert update2["streak"] == 2

    # Poor accuracy resets interval and streak
    failed = calculate_srs_update(update2, session_accuracy=0.4)
    assert failed["streak"] == 0
    assert failed["interval_days"] == 1.0


def test_catalog_endpoint():
    response = client.get("/api/openings/catalog")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert len(data["categories"]) >= 6

    # Verify each opening has progress structure
    first_opening = data["categories"][0]["openings"][0]
    assert "progress" in first_opening
    assert "white" in first_opening["progress"]
    assert "black" in first_opening["progress"]


def test_line_endpoint():
    response = client.get("/api/openings/line/C50/Italian%20Game")
    assert response.status_code == 200
    data = response.json()
    assert "opening" in data
    assert "moves" in data
    assert data["opening"]["name"] == "Italian Game"
    assert len(data["moves"]) == 5
    assert data["moves"][0]["san"] == "e4"
    assert "fen_before" in data["moves"][0]
    assert "fen_after" in data["moves"][0]


def test_search_endpoint():
    response = client.get("/api/openings/search?q=sicilian")
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) > 0
    assert any("sicilian" in r["name"].lower() for r in data["results"])


def test_list_endpoint_pagination_and_sorting():
    # 1. Base pagination
    r = client.get("/api/openings/list?page=1&page_size=15")
    assert r.status_code == 200
    d = r.json()
    assert d["page"] == 1
    assert d["page_size"] == 15
    assert d["total"] > 3000
    assert len(d["items"]) == 15
    assert d["total_pages"] > 200

    # 2. Search filtering
    r_search = client.get("/api/openings/list?q=french&page=1&page_size=10")
    assert r_search.status_code == 200
    d_search = r_search.json()
    assert d_search["total"] > 0
    assert any("french" in item["name"].lower() for item in d_search["items"])

    # 3. Category & side filter
    r_filter = client.get("/api/openings/list?category=open_games&side=white&page=1&page_size=10")
    assert r_filter.status_code == 200
    d_filter = r_filter.json()
    assert d_filter["total"] > 0
    for item in d_filter["items"]:
        assert item["side"] == "white"
        assert item["eco"].startswith("C")

    # 4. Sorting by name
    r_sort = client.get("/api/openings/list?sort_by=name&sort_order=asc&page=1&page_size=5")
    assert r_sort.status_code == 200
    d_sort = r_sort.json()
    names = [i["name"].lower() for i in d_sort["items"]]
    assert names == sorted(names)


def test_training_flow_white():
    # 1. Start session as White
    start_resp = client.post("/api/openings/train/start", json={
        "eco": "C50",
        "opening_name": "Italian Game",
        "train_as": "white",
    })
    assert start_resp.status_code == 200
    session_data = start_resp.json()
    session_id = session_data["session_id"]
    state = session_data["state"]

    assert state["is_user_turn"] is True
    assert state["move_index"] == 0
    assert state["completed"] is False
    assert "scenario_pgn" in state and len(state["scenario_pgn"]) > 0
    assert "target_moves" in state and len(state["target_moves"]) >= 5
    assert state["target_moves"][0]["san"] == "e4"
    assert state["target_moves"][0]["side"] == "white"

    # 2. Request hint
    hint_resp = client.post("/api/openings/train/hint", json={"session_id": session_id})
    assert hint_resp.status_code == 200
    hint_data = hint_resp.json()
    assert hint_data["from_square"] == "e2"
    assert hint_data["target_square"] == "e4"

    # 3. Wrong move
    wrong_resp = client.post("/api/openings/train/move", json={
        "session_id": session_id,
        "uci": "d2d4",
    })
    assert wrong_resp.status_code == 200
    wrong_data = wrong_resp.json()
    assert wrong_data["result"]["correct"] is False
    assert wrong_data["result"]["expected_san"] == "e4"
    assert wrong_data["result"]["played_san"] == "d4"
    assert wrong_data["state"]["is_user_turn"] is True

    # 4. Correct first move (e2e4) -> should auto-advance Black's reply e7e5
    correct_resp = client.post("/api/openings/train/move", json={
        "session_id": session_id,
        "uci": "e2e4",
    })
    assert correct_resp.status_code == 200
    correct_data = correct_resp.json()
    assert correct_data["result"]["correct"] is True
    assert correct_data["state"]["move_index"] == 2  # e4 + e5
    assert correct_data["state"]["is_user_turn"] is True

    # 5. Play second white move (g1f3) -> auto-advances Black's Nc6 (b8c6)
    m2_resp = client.post("/api/openings/train/move", json={
        "session_id": session_id,
        "uci": "g1f3",
    })
    assert m2_resp.status_code == 200
    m2_data = m2_resp.json()
    assert m2_data["result"]["correct"] is True
    assert m2_data["state"]["move_index"] == 4  # Nf3 + Nc6

    # 6. Play third white move (f1c4) -> deep scenario auto-advances Black's 3...Bc5
    m3_resp = client.post("/api/openings/train/move", json={
        "session_id": session_id,
        "uci": "f1c4",
    })
    assert m3_resp.status_code == 200
    m3_data = m3_resp.json()
    assert m3_data["result"]["correct"] is True
    assert m3_data["state"]["move_index"] == 6  # Bc4 played + Black replied Bc5
    assert m3_data["state"]["total_moves"] >= 20  # Deep pedagogical scenario!
    assert m3_data["state"]["completed"] is False

    # 7. Test skip to advance through remaining moves
    skip_resp = client.post("/api/openings/train/move", json={
        "session_id": session_id,
        "uci": "skip",
    })
    assert skip_resp.status_code == 200
    assert skip_resp.json()["state"]["move_index"] > 6

    # 8. Complete session
    comp_resp = client.post("/api/openings/train/complete", json={"session_id": session_id})
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert "accuracy" in comp_data
    assert "progress" in comp_data
    assert comp_data["progress"]["times_practiced"] >= 1


def test_training_flow_black():
    # Start session as Black: White 1.e4 should be auto-played immediately
    start_resp = client.post("/api/openings/train/start", json={
        "eco": "C50",
        "opening_name": "Italian Game",
        "train_as": "black",
    })
    assert start_resp.status_code == 200
    session_data = start_resp.json()
    session_id = session_data["session_id"]
    state = session_data["state"]

    # Move index should already be 1 (White played 1.e4)
    assert state["move_index"] == 1
    assert state["is_user_turn"] is True

    # Black responds with 1... e5 (e7e5) -> White should auto-advance with 2. Nf3
    move_resp = client.post("/api/openings/train/move", json={
        "session_id": session_id,
        "uci": "e7e5",
    })
    assert move_resp.status_code == 200
    move_data = move_resp.json()
    assert move_data["result"]["correct"] is True
    assert move_data["state"]["move_index"] == 3  # e5 played, then Nf3 auto-played
    assert move_data["state"]["is_user_turn"] is True


def test_scenarios_endpoint():
    # Verify scenarios endpoint returns curated + deep lines
    resp = client.get("/api/openings/scenarios?eco=C50&name=Italian%20Game")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data
    assert len(data["scenarios"]) >= 5
    first_scenario = data["scenarios"][0]
    assert "id" in first_scenario
    assert "name" in first_scenario
    assert "pgn" in first_scenario
    assert first_scenario["move_count"] >= 18
    assert "description" in first_scenario
    assert "key_ideas" in first_scenario


def test_switch_scenario_and_adaptive_mode():
    # 1. Start with adaptive mode
    start_resp = client.post("/api/openings/train/start", json={
        "eco": "C50",
        "opening_name": "Italian Game",
        "train_as": "white",
        "adaptive": True,
    })
    assert start_resp.status_code == 200
    session_data = start_resp.json()
    session_id = session_data["session_id"]
    state = session_data["state"]
    assert state["is_adaptive"] is True
    assert len(state["available_scenarios"]) >= 5

    # 2. Switch to Evans Gambit scenario
    switch_resp = client.post("/api/openings/train/switch-scenario", json={
        "session_id": session_id,
        "scenario_id": "italian-evans-gambit",
    })
    assert switch_resp.status_code == 200
    switch_data = switch_resp.json()
    new_state = switch_data["state"]
    assert new_state["scenario_id"] == "italian-evans-gambit"
    assert "Evans Gambit" in new_state["scenario_name"]
    assert new_state["move_index"] == 0
    assert new_state["total_moves"] == 22
