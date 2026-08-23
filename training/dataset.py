"""
dataset.py - High-Performance Chess Dataset and PGN Preprocessor for PyTorch.

Supports:
  1. Multi-game PGN extraction to fast HDF5 (.h5) binary format.
  2. Zero-copy / On-demand PyTorch Dataset streaming for sustained GPU saturation.
  3. In-memory and streaming Dataset fallbacks.
"""

import os
from typing import Optional, Tuple
import numpy as np
import h5py
import chess
import chess.pgn
import torch
from torch.utils.data import Dataset

from chess_encoder import encode_board, encode_move


def parse_game_result(result_str: str, turn: chess.Color) -> float:
    """
    Computes value target v in {-1.0, 0.0, +1.0} from the active player's perspective.
    """
    if result_str == "1-0":
        # White won
        return 1.0 if turn == chess.WHITE else -1.0
    elif result_str == "0-1":
        # Black won
        return -1.0 if turn == chess.WHITE else 1.0
    elif result_str == "1/2-1/2":
        # Draw
        return 0.0
    return 0.0


def preprocess_pgn_to_h5(
    pgn_path: str,
    h5_output_path: str,
    max_positions: int = 300000,
    max_games: Optional[int] = None,
    chunk_size: int = 5000,
    skip_first_n_moves: int = 4  # Skip very early opening book moves for richer tactical variance
) -> int:
    """
    Parses a PGN file and stores canonical board tensors, move targets, and game results
    into an HDF5 (.h5) binary database.
    
    Returns:
      total_positions_saved (int)
    """
    os.makedirs(os.path.dirname(h5_output_path) if os.path.dirname(h5_output_path) else ".", exist_ok=True)
    
    print(f"Preprocessing PGN: {pgn_path}")
    print(f"Target HDF5 Output: {h5_output_path}")
    print(f"Target Capacity: {max_positions:,} positions")

    with h5py.File(h5_output_path, "w") as h5f:
        # Create resizable datasets
        dset_boards = h5f.create_dataset(
            "boards",
            shape=(0, 18, 8, 8),
            maxshape=(max_positions, 18, 8, 8),
            dtype="float32",
            chunks=(min(chunk_size, 1024), 18, 8, 8)
        )
        dset_moves = h5f.create_dataset(
            "moves",
            shape=(0,),
            maxshape=(max_positions,),
            dtype="int64",
            chunks=(min(chunk_size, 1024),)
        )
        dset_values = h5f.create_dataset(
            "values",
            shape=(0, 1),
            maxshape=(max_positions, 1),
            dtype="float32",
            chunks=(min(chunk_size, 1024), 1)
        )

        buffer_boards = []
        buffer_moves = []
        buffer_values = []
        
        total_positions = 0
        games_processed = 0

        with open(pgn_path, "r", encoding="utf-8", errors="replace") as pgn_file:
            while total_positions < max_positions:
                if max_games and games_processed >= max_games:
                    break

                game = chess.pgn.read_game(pgn_file)
                if game is None:
                    break

                games_processed += 1
                result_str = game.headers.get("Result", "*")
                if result_str not in ("1-0", "0-1", "1/2-1/2"):
                    continue

                board = game.board()
                move_count = 0

                for move in game.mainline_moves():
                    move_count += 1
                    
                    # Optional: skip first few book opening plies to emphasize midgame/endgame tactics
                    if move_count > skip_first_n_moves:
                        try:
                            # 1. Encode board from active player's canonical perspective
                            b_tensor = encode_board(board)
                            # 2. Encode target move
                            m_idx = encode_move(move, board.turn)
                            # 3. Compute game outcome value target
                            v_target = parse_game_result(result_str, board.turn)

                            buffer_boards.append(b_tensor)
                            buffer_moves.append(m_idx)
                            buffer_values.append([v_target])
                            total_positions += 1

                            # Flush buffer to HDF5
                            if len(buffer_boards) >= chunk_size or total_positions >= max_positions:
                                cur_len = dset_boards.shape[0]
                                new_len = cur_len + len(buffer_boards)
                                
                                dset_boards.resize(new_len, axis=0)
                                dset_moves.resize(new_len, axis=0)
                                dset_values.resize(new_len, axis=0)

                                dset_boards[cur_len:new_len] = np.array(buffer_boards, dtype=np.float32)
                                dset_moves[cur_len:new_len] = np.array(buffer_moves, dtype=np.int64)
                                dset_values[cur_len:new_len] = np.array(buffer_values, dtype=np.float32)

                                buffer_boards.clear()
                                buffer_moves.clear()
                                buffer_values.clear()

                                if total_positions % 20000 == 0 or total_positions >= max_positions:
                                    print(f"Extracted {total_positions:,} positions from {games_processed:,} games...")

                            if total_positions >= max_positions:
                                break
                        except Exception:
                            pass

                    board.push(move)

        # Flush any remaining buffer items
        if buffer_boards:
            cur_len = dset_boards.shape[0]
            new_len = cur_len + len(buffer_boards)
            dset_boards.resize(new_len, axis=0)
            dset_moves.resize(new_len, axis=0)
            dset_values.resize(new_len, axis=0)
            dset_boards[cur_len:new_len] = np.array(buffer_boards, dtype=np.float32)
            dset_moves[cur_len:new_len] = np.array(buffer_moves, dtype=np.int64)
            dset_values[cur_len:new_len] = np.array(buffer_values, dtype=np.float32)

    print(f"Successfully finished preprocessing!")
    print(f"Total positions saved: {total_positions:,} from {games_processed:,} games.")
    return total_positions


class ChessHDF5Dataset(Dataset):
    """
    PyTorch Dataset for HDF5 position archives.
    Loads data on demand directly from disk with minimal memory footprint.
    """
    def __init__(self, h5_path: str, split: str = "train", val_ratio: float = 0.1):
        super().__init__()
        self.h5_path = h5_path
        self.split = split
        self.val_ratio = val_ratio
        
        with h5py.File(h5_path, "r") as f:
            total_len = len(f["moves"])
            
        num_val = int(total_len * val_ratio)
        num_train = total_len - num_val
        
        if split == "train":
            self.start_idx = 0
            self.end_idx = num_train
        elif split == "val":
            self.start_idx = num_train
            self.end_idx = total_len
        else:
            self.start_idx = 0
            self.end_idx = total_len
            
        self.length = self.end_idx - self.start_idx
        self.h5_file = None

    def _open_file(self):
        if self.h5_file is None:
            self.h5_file = h5py.File(self.h5_path, "r")

    def __len__(self) -> int:
        return self.length

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, float]:
        self._open_file()
        actual_idx = self.start_idx + idx
        
        board = self.h5_file["boards"][actual_idx]
        move = self.h5_file["moves"][actual_idx]
        value = self.h5_file["values"][actual_idx]
        
        return (
            torch.from_numpy(board).float(),
            torch.tensor(move, dtype=torch.long),
            torch.from_numpy(value).float()
        )

    def __del__(self):
        if self.h5_file is not None:
            try:
                self.h5_file.close()
            except Exception:
                pass


class ChessMemoryDataset(Dataset):
    """
    Fast in-memory dataset for small-to-medium experiments.
    Loads all tensors into RAM for maximum throughput.
    """
    def __init__(self, boards: np.ndarray, moves: np.ndarray, values: np.ndarray):
        self.boards = torch.from_numpy(boards).float()
        self.moves = torch.from_numpy(moves).long()
        self.values = torch.from_numpy(values).float()

    def __len__(self) -> int:
        return len(self.moves)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        return self.boards[idx], self.moves[idx], self.values[idx]
