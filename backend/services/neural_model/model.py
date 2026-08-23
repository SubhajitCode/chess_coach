"""
model.py - Dual-Head Residual Neural Network for Policy & Value Estimation.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import torch
import torch.nn as nn
import chess

from services.neural_model.chess_encoder import (
    NUM_ACTIONS,
    encode_board,
    get_legal_move_mask,
    decode_move_index,
    INDEX_TO_MOVE,
    MOVE_TO_INDEX,
    flip_move,
)


class ResBlock(nn.Module):
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

        self.conv_in = nn.Conv2d(in_channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn_in = nn.BatchNorm2d(channels)
        self.relu = nn.ReLU(inplace=True)

        self.res_blocks = nn.ModuleList([ResBlock(channels) for _ in range(num_blocks)])

        self.p_conv = nn.Conv2d(channels, 32, kernel_size=1, bias=False)
        self.p_bn = nn.BatchNorm2d(32)
        self.p_fc = nn.Linear(32 * 8 * 8, num_actions)

        self.v_conv = nn.Conv2d(channels, 1, kernel_size=1, bias=False)
        self.v_bn = nn.BatchNorm2d(1)
        self.v_fc1 = nn.Linear(1 * 8 * 8, 128)
        self.v_fc2 = nn.Linear(128, 1)
        self.tanh = nn.Tanh()

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        out = self.relu(self.bn_in(self.conv_in(x)))
        for block in self.res_blocks:
            out = block(out)

        p = self.relu(self.p_bn(self.p_conv(out)))
        p = p.flatten(start_dim=1)
        policy_logits = self.p_fc(p)

        v = self.relu(self.v_bn(self.v_conv(out)))
        v = v.flatten(start_dim=1)
        v = self.relu(self.v_fc1(v))
        value = self.tanh(self.v_fc2(v))

        return policy_logits, value

    @torch.no_grad()
    def evaluate_board(self, board: chess.Board, device: torch.device) -> Tuple[np.ndarray, float]:
        self.eval()
        tensor = encode_board(board)
        x = torch.from_numpy(tensor).unsqueeze(0).to(device)
        policy_logits, value = self.forward(x)
        logits = policy_logits.squeeze(0).cpu().numpy()
        val = value.item()

        legal_mask = get_legal_move_mask(board)
        masked_logits = np.where(legal_mask > 0, logits, -1e9)
        exp_logits = np.exp(masked_logits - np.max(masked_logits))
        sum_exp = np.sum(exp_logits)
        probs = exp_logits / sum_exp if sum_exp > 0 else legal_mask / max(1.0, np.sum(legal_mask))
        return probs, val
