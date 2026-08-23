#!/usr/bin/env python3
"""
coach_eval.py - Evaluation and Tactical Diagnosis for Trained Chess AI Models.

Usage:
  python3 coach_eval.py --model models/best_chess_policy_model.pt
  python3 coach_eval.py --model models/best_chess_policy_model.pt --fen "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3"
"""

import argparse
import os
import chess
import numpy as np
import torch

from chess_encoder import NUM_ACTIONS, decode_move_index
from model import ChessDualResNet


def load_model(checkpoint_path: str, device: torch.device) -> ChessDualResNet:
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Model checkpoint not found: {checkpoint_path}")

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    config = checkpoint.get("model_config", {"in_channels": 18, "channels": 128, "num_blocks": 6, "num_actions": NUM_ACTIONS})
    
    model = ChessDualResNet(
        in_channels=config.get("in_channels", 18),
        channels=config.get("channels", 128),
        num_blocks=config.get("num_blocks", 6),
        num_actions=config.get("num_actions", NUM_ACTIONS)
    ).to(device)

    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    print(f"Loaded checkpoint from {checkpoint_path} (Epoch: {checkpoint.get('epoch', '?')}, Val Top-1: {checkpoint.get('val_top1', 0.0):.1f}%)")
    return model


def evaluate_single_position(model: ChessDualResNet, fen: str, device: torch.device, top_k: int = 5):
    board = chess.Board(fen)
    turn_str = "White" if board.turn == chess.WHITE else "Black"
    probs, val = model.evaluate_board(board, device)
    win_pct = (val + 1.0) / 2.0 * 100.0

    scored_moves = []
    for idx in np.where(probs > 0)[0]:
        move = decode_move_index(idx, board.turn)
        p = float(probs[idx])
        scored_moves.append((move, p))
    scored_moves.sort(key=lambda x: x[1], reverse=True)

    print("=" * 65)
    print(f" ♟️ POSITION EVALUATION ({turn_str} to move)")
    print("=" * 65)
    print(board.unicode(borders=True))
    print("-" * 65)
    print(f" FEN: {board.fen()}")
    print(f" Win Probability ({turn_str}) : {win_pct:.1f}% (Value Score: {val:+.3f})")
    print(f" Top {min(top_k, len(scored_moves))} Human Move Candidates:")
    for i, (m, p) in enumerate(scored_moves[:top_k], 1):
        san = board.san(m)
        bar = "█" * int(p * 30)
        print(f"   {i}. {san:<6} ({m.uci():<5}) : {p * 100:5.1f}%  {bar}")
    print("=" * 65 + "\n")


def run_standard_test_suite(model: ChessDualResNet, device: torch.device):
    test_positions = [
        ("Starting Position", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
        ("Italian Game (1. e4 e5 2. Nf3 Nc6 3. Bc4)", "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"),
        ("Defending Scholar's Mate (Qh5 threat on f7)", "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3"),
        ("Ruy Lopez Opening (1. e4 e5 2. Nf3 Nc6 3. Bb5 a6)", "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4"),
        ("Tactical Pin Position", "r1b1k2r/ppppqppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5"),
    ]
    for name, fen in test_positions:
        print(f"\n--- Benchmark Test: {name} ---")
        evaluate_single_position(model, fen, device, top_k=4)


def main():
    parser = argparse.ArgumentParser(description="Evaluate Chess AI Model on Positions")
    parser.add_argument("--model", type=str, default="models/best_chess_policy_model.pt", help="Path to model checkpoint")
    parser.add_argument("--fen", type=str, default=None, help="Optional FEN string to evaluate")
    parser.add_argument("--top-k", type=int, default=5, help="Number of candidate moves to display")

    args = parser.parse_args()
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    model = load_model(args.model, device)
    if args.fen:
        evaluate_single_position(model, args.fen, device, top_k=args.top_k)
    else:
        run_standard_test_suite(model, device)


if __name__ == "__main__":
    main()
