"""
model.py - Dual-Head Residual Neural Network (Policy & Value) for Chess.

Architecture:
  - Input: (B, 18, 8, 8) Board Tensor
  - Shared Convolutional Trunk: Initial Conv + N Residual Blocks (128 channels)
  - Policy Head: Predicts move probabilities pi(a|s) over 1,880 canonical actions
  - Value Head: Predicts position evaluation v(s) in [-1.0, +1.0]
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import chess

from chess_encoder import (
    NUM_ACTIONS,
    encode_board,
    get_legal_move_mask,
    decode_move_index,
    INDEX_TO_MOVE,
    MOVE_TO_INDEX,
    flip_move,
)


class ResBlock(nn.Module):
    """
    Standard Residual Block with two 3x3 convolutions, batch normalization,
    and a skip-connection.
    """
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += residual
        return self.relu(out)


class ChessDualResNet(nn.Module):
    """
    Dual-Head ResNet for chess policy and value estimation.
    
    Parameters:
      - in_channels: 18 (board bitboard planes + castling + ep + halfmove clock)
      - channels: 128 feature maps in residual trunk
      - num_blocks: Number of residual blocks (default: 6 for high speed / quality trade-off)
      - num_actions: 1880 canonical UCI actions
    """
    def __init__(
        self,
        in_channels: int = 18,
        channels: int = 128,
        num_blocks: int = 6,
        num_actions: int = NUM_ACTIONS
    ):
        super().__init__()
        self.in_channels = in_channels
        self.channels = channels
        self.num_blocks = num_blocks
        self.num_actions = num_actions

        # 1. Initial Convolutional Block
        self.conv_in = nn.Conv2d(in_channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn_in = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

        # 2. Residual Tower
        self.res_blocks = nn.ModuleList([ResBlock(channels) for _ in range(num_blocks)])

        # 3. Policy Head (predicts human move distribution)
        self.p_conv = nn.Conv2d(channels, 32, kernel_size=1, bias=False)
        self.p_bn = nn.BatchNorm2d(32)
        self.p_fc = nn.Linear(32 * 8 * 8, num_actions)

        # 4. Value Head (predicts game outcome from active player's perspective)
        self.v_conv = nn.Conv2d(channels, 1, kernel_size=1, bias=False)
        self.v_bn = nn.BatchNorm2d(1)
        self.v_fc1 = nn.Linear(1 * 8 * 8, 128)
        self.v_fc2 = nn.Linear(128, 1)
        self.tanh = nn.Tanh()

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass.
        Args:
          x: (B, 18, 8, 8) float tensor of canonical board states.
        Returns:
          policy_logits: (B, num_actions) unnormalized log-probabilities.
          value: (B, 1) expected score in [-1.0, +1.0].
        """
        out = self.relu(self.bn_in(self.conv_in(x)))
        for block in self.res_blocks:
            out = block(out)

        # Policy head
        p = self.relu(self.p_bn(self.p_conv(out)))
        p = p.flatten(start_dim=1)
        policy_logits = self.p_fc(p)

        # Value head
        v = self.relu(self.v_bn(self.v_conv(out)))
        v = v.flatten(start_dim=1)
        v = self.relu(self.v_fc1(v))
        value = self.tanh(self.v_fc2(v))

        return policy_logits, value

    @torch.no_grad()
    def evaluate_board(
        self,
        board: chess.Board,
        device: torch.device
    ) -> Tuple[np.ndarray, float]:
        """
        Evaluates a single chess position.
        Returns:
          masked_policy_probs: (num_actions,) normalized probability distribution over legal moves
          value_score: float evaluation in [-1.0, 1.0] from active player's perspective
        """
        self.eval()
        tensor = encode_board(board)
        x = torch.from_numpy(tensor).unsqueeze(0).to(device)  # (1, 18, 8, 8)
        
        policy_logits, value = self.forward(x)
        logits = policy_logits.squeeze(0).cpu().numpy()
        val = value.item()

        # Apply legal move mask
        legal_mask = get_legal_move_mask(board)
        # Set illegal move logits to -infinity
        masked_logits = np.where(legal_mask > 0, logits, -1e9)
        
        # Softmax over legal moves
        exp_logits = np.exp(masked_logits - np.max(masked_logits))
        sum_exp = np.sum(exp_logits)
        if sum_exp > 0:
            probs = exp_logits / sum_exp
        else:
            probs = legal_mask / np.sum(legal_mask)

        return probs, val

    @torch.no_grad()
    def suggest_move(
        self,
        board: chess.Board,
        device: torch.device,
        top_k: int = 3,
        temperature: float = 0.0
    ) -> Dict:
        """
        Recommends human-aligned moves with candidate ranking and probability metrics.
        """
        if board.is_game_over():
            return {"error": "Game is over", "move": None, "candidates": []}

        probs, val = self.evaluate_board(board, device)
        turn = board.turn

        # Gather legal moves with non-zero probability
        legal_indices = np.where(probs > 0)[0]
        scored_moves = []
        for idx in legal_indices:
            move = decode_move_index(idx, turn)
            p = float(probs[idx])
            scored_moves.append((move, p))

        scored_moves.sort(key=lambda x: x[1], reverse=True)

        if temperature <= 0.0 or len(scored_moves) == 1:
            best_move = scored_moves[0][0]
        else:
            # Sample with temperature
            p_values = np.array([m[1] for m in scored_moves])
            p_values = p_values ** (1.0 / max(0.01, temperature))
            p_values = p_values / np.sum(p_values)
            chosen_idx = np.random.choice(len(scored_moves), p=p_values)
            best_move = scored_moves[chosen_idx][0]

        candidates = [
            {
                "move_uci": m.uci(),
                "move_san": board.san(m),
                "probability": round(p * 100, 2)
            }
            for m, p in scored_moves[:top_k]
        ]

        return {
            "selected_move": best_move.uci(),
            "selected_san": board.san(best_move),
            "value_evaluation": round(val, 4),
            "win_probability_pct": round((val + 1.0) / 2.0 * 100, 1),
            "candidates": candidates
        }

    @torch.no_grad()
    def search_best_move(
        self,
        board: chess.Board,
        device: torch.device,
        depth: int = 2,
        top_candidates: int = 4
    ) -> Tuple[Optional[chess.Move], float, List[chess.Move]]:
        """
        Performs shallow minimax beam search using policy candidate pruning
        and value head leaf evaluations to calculate tactical refutations.
        
        Returns:
          (best_move, best_score, pv_moves)
        """
        if board.is_game_over() or depth <= 0:
            if board.is_checkmate():
                return None, -1.0, []
            if board.is_stalemate() or board.is_insufficient_material():
                return None, 0.0, []
            _, v = self.evaluate_board(board, device)
            return None, v, []

        probs, val = self.evaluate_board(board, device)
        legal_indices = np.where(probs > 0)[0]
        if len(legal_indices) == 0:
            return None, val, []

        candidates = []
        for idx in legal_indices:
            m = decode_move_index(idx, board.turn)
            if m in board.legal_moves:
                candidates.append((m, float(probs[idx])))
        candidates.sort(key=lambda x: x[1], reverse=True)
        candidates = candidates[:top_candidates]

        best_score = -999.0
        best_move = candidates[0][0] if candidates else None
        best_pv = [best_move] if best_move else []

        for m, p in candidates:
            board.push(m)
            if board.is_checkmate():
                score = 1.0
                pv = [m]
            elif depth == 1:
                _, opp_val = self.evaluate_board(board, device)
                score = -opp_val
                pv = [m]
            else:
                _, opp_score, opp_pv = self.search_best_move(board, device, depth=depth - 1, top_candidates=top_candidates)
                score = -opp_score
                pv = [m] + opp_pv
            board.pop()

            if score > best_score:
                best_score = score
                best_move = m
                best_pv = pv

        return best_move, best_score, best_pv
