import pytest
from fastapi.testclient import TestClient
from main import app
from services.llm_service import _build_ask_coach_prompt, _build_critical_line

client = TestClient(app)


def test_build_ask_coach_prompt():
    prompt = _build_ask_coach_prompt(
        fen="r1bqk2r/pppp1ppp/2n2n2/2b1p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R b KQkq - 0 1",
        question="Why is Nxe4 not a good idea here?",
        candidate_san="Nxe4",
        candidate_summary="knight captures pawn on e4",
        candidate_eval=-250.0,
        cp_loss=250.0,
        classification="blunder",
        best_move_san="d6",
        best_line_san=["d6", "O-O", "Be6"],
        deviation_best_line_san=["Bxd8", "Nxd2", "Nxd2"],
        motifs=["enemy_pin:relative:knight_f6_to_queen"],
        threat_summary="Opponent threatens Bxd8 capturing your queen on d8",
        player_color="black",
    )

    assert "Why is Nxe4 not a good idea here?" in prompt
    assert "enemy_pin:relative:knight_f6_to_queen" in prompt
    assert "Opponent threatens Bxd8" in prompt
    assert "Nxe4" in prompt


def test_build_critical_line_with_motifs():
    move = {
        "move_number": 12,
        "move_san": "Nxe4",
        "classification": "blunder",
        "cp_loss": 350.0,
        "move_summary": "knight captures pawn on e4",
        "threat_summary": "Opponent threatens Bxd8 capturing your queen",
        "motifs": ["enemy_pin:relative:knight_f6_to_queen"],
        "best_move_san": "d6",
        "best_line_san": ["d6", "O-O"],
    }
    line = _build_critical_line(move, "black", 1)
    assert "Threat: Opponent threatens Bxd8" in line
    assert "Tactical motifs: enemy_pin" in line
    assert "Best was d6" in line


def test_ask_coach_endpoint_validation():
    # Missing fen and question
    response = client.post("/api/coach/ask", json={})
    assert response.status_code == 422 or response.status_code == 400
