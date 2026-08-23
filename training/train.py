#!/usr/bin/env python3
"""
train.py - Command-line Trainer for Human-Aligned Chess Policy & Value Model.

Usage:
  # Quick training with default parameters:
  python3 train.py --pgn data/lichess_1400_1800_2024-01.pgn --epochs 5 --batch-size 256

  # Full training on 300,000 positions with Apple Silicon MPS acceleration:
  python3 train.py --pgn data/lichess_1400_1800_2024-01.pgn --max-positions 300000 --epochs 10 --blocks 6 --channels 128
"""

import argparse
import os
import time
from typing import Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm.auto import tqdm

from chess_encoder import NUM_ACTIONS
from dataset import ChessHDF5Dataset, preprocess_pgn_to_h5
from model import ChessDualResNet


def get_device() -> Tuple[torch.device, str]:
    if torch.backends.mps.is_available():
        return torch.device("mps"), "Apple Silicon GPU (Metal Performance Shaders / MPS)"
    elif torch.cuda.is_available():
        return torch.device("cuda"), f"NVIDIA GPU: {torch.cuda.get_device_name(0)}"
    return torch.device("cpu"), "Standard CPU"


def compute_accuracies(policy_logits: torch.Tensor, targets: torch.Tensor) -> Tuple[float, float]:
    """Computes Top-1 and Top-3 accuracy for human move predictions."""
    with torch.no_grad():
        preds = torch.argmax(policy_logits, dim=1)
        top1 = (preds == targets).float().sum().item()
        
        _, top3_preds = torch.topk(policy_logits, k=3, dim=1)
        targets_expanded = targets.unsqueeze(1).expand_as(top3_preds)
        top3 = (top3_preds == targets_expanded).any(dim=1).float().sum().item()
        
        total = targets.size(0)
        return (top1 / total) * 100.0, (top3 / total) * 100.0


def main():
    parser = argparse.ArgumentParser(description="Train Human-Aligned Chess Policy & Value Network")
    parser.add_argument("--pgn", type=str, default="data/lichess_1400_1800_2024-01.pgn", help="Path to input PGN file")
    parser.add_argument("--h5", type=str, default="data/chess_positions_1400_1800.h5", help="Path to cached HDF5 dataset")
    parser.add_argument("--max-positions", type=int, default=150000, help="Maximum positions to extract from PGN")
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=256, help="Batch size for DataLoader")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate (AdamW)")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="Weight decay for regularization")
    parser.add_argument("--value-weight", type=float, default=0.5, help="Loss weight lambda for value head MSE")
    parser.add_argument("--blocks", type=int, default=6, help="Number of residual blocks")
    parser.add_argument("--channels", type=int, default=128, help="Number of convolutional channels")
    parser.add_argument("--val-ratio", type=float, default=0.1, help="Validation set fraction")
    parser.add_argument("--output-dir", type=str, default="models", help="Directory to save model checkpoints")

    args = parser.parse_args()
    device, device_name = get_device()

    print("=" * 65)
    print(" ♚ HUMAN-ALIGNED CHESS AI POLICY & VALUE NETWORK TRAINER")
    print("=" * 65)
    print(f" Hardware Device : {device_name}")
    print(f" Input PGN       : {args.pgn}")
    print(f" Cached HDF5     : {args.h5}")
    print(f" Max Positions   : {args.max_positions:,}")
    print(f" Architecture    : {args.blocks} ResBlocks, {args.channels} Channels ({NUM_ACTIONS} Actions)")
    print(f" Hyperparameters : Batch Size={args.batch_size}, LR={args.lr}, Epochs={args.epochs}")
    print("=" * 65)

    # 1. Preprocess or verify HDF5 cache
    if not os.path.exists(args.h5):
        if not os.path.exists(args.pgn):
            raise FileNotFoundError(f"Neither {args.h5} nor {args.pgn} found! Please provide a valid dataset.")
        print(f"\n⚙️ HDF5 dataset not found. Extracting from PGN: {args.pgn}...")
        preprocess_pgn_to_h5(args.pgn, args.h5, max_positions=args.max_positions)
    else:
        print(f"\n⚡ Using existing preprocessed dataset: {args.h5}")

    # 2. Datasets & Loaders
    train_dset = ChessHDF5Dataset(args.h5, split="train", val_ratio=args.val_ratio)
    val_dset = ChessHDF5Dataset(args.h5, split="val", val_ratio=args.val_ratio)

    train_loader = DataLoader(train_dset, batch_size=args.batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_dset, batch_size=args.batch_size, shuffle=False)

    print(f"📦 Train Positions: {len(train_dset):,} ({len(train_loader)} batches of {args.batch_size})")
    print(f"📦 Val Positions  : {len(val_dset):,} ({len(val_loader)} batches of {args.batch_size})\n")

    # 3. Model & Optimizer
    model = ChessDualResNet(
        in_channels=18,
        channels=args.channels,
        num_blocks=args.blocks,
        num_actions=NUM_ACTIONS
    ).to(device)

    criterion_policy = nn.CrossEntropyLoss()
    criterion_value = nn.MSELoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    os.makedirs(args.output_dir, exist_ok=True)
    best_val_loss = float("inf")

    # 4. Training Loop
    start_total_t = time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss, running_p_loss, running_v_loss = 0.0, 0.0, 0.0
        train_top1_list, train_top3_list = [], []

        pbar = tqdm(train_loader, desc=f"Epoch {epoch:02d}/{args.epochs:02d} [Train]", unit="batch")
        for boards, moves, values in pbar:
            boards = boards.to(device, non_blocking=True)
            moves = moves.to(device, non_blocking=True)
            values = values.to(device, non_blocking=True)

            optimizer.zero_grad()
            p_logits, v_preds = model(boards)

            loss_p = criterion_policy(p_logits, moves)
            loss_v = criterion_value(v_preds, values)
            loss = loss_p + args.value_weight * loss_v

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=2.0)
            optimizer.step()

            t1, t3 = compute_accuracies(p_logits, moves)
            train_top1_list.append(t1)
            train_top3_list.append(t3)

            running_loss += loss.item()
            running_p_loss += loss_p.item()
            running_v_loss += loss_v.item()

            pbar.set_postfix({
                "Loss": f"{loss.item():.3f}",
                "P_Loss": f"{loss_p.item():.3f}",
                "Top1": f"{np.mean(train_top1_list[-20:]):.1f}%"
            })

        scheduler.step()
        avg_train_loss = running_loss / len(train_loader)
        avg_train_p_loss = running_p_loss / len(train_loader)
        avg_train_v_loss = running_v_loss / len(train_loader)

        # Validation
        model.eval()
        val_running_loss, val_running_p_loss, val_running_v_loss = 0.0, 0.0, 0.0
        val_top1_list, val_top3_list = [], []

        with torch.no_grad():
            for boards, moves, values in val_loader:
                boards = boards.to(device, non_blocking=True)
                moves = moves.to(device, non_blocking=True)
                values = values.to(device, non_blocking=True)

                p_logits, v_preds = model(boards)
                loss_p = criterion_policy(p_logits, moves)
                loss_v = criterion_value(v_preds, values)
                loss = loss_p + args.value_weight * loss_v

                t1, t3 = compute_accuracies(p_logits, moves)
                val_top1_list.append(t1)
                val_top3_list.append(t3)

                val_running_loss += loss.item()
                val_running_p_loss += loss_p.item()
                val_running_v_loss += loss_v.item()

        avg_val_loss = val_running_loss / len(val_loader)
        avg_val_p_loss = val_running_p_loss / len(val_loader)
        avg_val_v_loss = val_running_v_loss / len(val_loader)
        val_top1 = np.mean(val_top1_list)
        val_top3 = np.mean(val_top3_list)

        print(f"\n🌟 [Epoch {epoch:02d}/{args.epochs:02d} Summary]")
        print(f"   Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f}")
        print(f"   Policy Val Loss: {avg_val_p_loss:.4f} | Value Val Loss: {avg_val_v_loss:.4f}")
        print(f"   🎯 Val Human Move Top-1 Match: {val_top1:.2f}% | Top-3 Match: {val_top3:.2f}%")

        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            ckpt_path = os.path.join(args.output_dir, "best_chess_policy_model.pt")
            torch.save({
                "epoch": int(epoch),
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": float(avg_val_loss),
                "val_top1": float(val_top1),
                "val_top3": float(val_top3),
                "model_config": {
                    "in_channels": 18,
                    "channels": int(args.channels),
                    "num_blocks": int(args.blocks),
                    "num_actions": NUM_ACTIONS
                }
            }, ckpt_path)
            print(f"   💾 Saved New Best Model Checkpoint to {ckpt_path}\n")

    total_time = time.time() - start_total_t
    print("=" * 65)
    print(" TRAINING COMPLETE")
    print("=" * 65)
    print(f" Total Duration : {total_time / 60:.2f} minutes")
    print(f" Best Val Loss  : {best_val_loss:.4f}")
    print(f" Model Checkpoint: {os.path.join(args.output_dir, 'best_chess_policy_model.pt')}")
    print("=" * 65)


if __name__ == "__main__":
    main()
