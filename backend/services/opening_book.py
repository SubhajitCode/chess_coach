"""Opening book recognition module.

Provides master-level opening book lookup using Polyglot binary opening databases (.bin)
via python-chess, with automated downloading and an embedded classical theory fallback.
"""

from __future__ import annotations

import logging
import os
import urllib.request
from typing import Any

import chess
import chess.polyglot

logger = logging.getLogger(__name__)

DEFAULT_BOOK_URL = os.getenv(
    "OPENING_BOOK_URL",
    "https://raw.githubusercontent.com/michaeldv/donna_opening_books/master/gm2001.bin",
)

DEFAULT_BOOK_PATH = os.getenv(
    "OPENING_BOOK_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "opening_book.bin"),
)

_reader: chess.polyglot.MemoryMappedReader | None = None
_reader_loaded_path: str | None = None

# Collection of standard opening lines (SAN format) used as resilient fallback
BOOK_LINES: list[str] = [
    # --- 1. e4 e5: Ruy Lopez ---
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5",
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6",
    "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5",
    "e4 e5 Nf3 Nc6 Bb5 d6 d4 Bd7 Nc3 Nf6",
    "e4 e5 Nf3 Nc6 Bb5 Bc5 c3 Nf6 d4",
    # --- 1. e4 e5: Italian Game ---
    "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O",
    "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5",
    "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3 O-O",
    "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6",
    "e4 e5 Nf3 Nc6 Bc4 Be7 d4 d6",
    # --- 1. e4 e5: Scotch, Four Knights, Petrov, King's Gambit ---
    "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nc3 Bb4 Nxc6 bxc6 Bd3 d5",
    "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7",
    "e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6",
    "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Be7 O-O Nc6",
    "e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7",
    "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6",
    "e4 e5 f4 d5 exd5 e4 d3 Nf6",
    "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3",
    "e4 e5 Bc4 Nf6 d3 c6 Nf3 d5",
    # --- 1. e4 c5: Sicilian Najdorf, Dragon, Classical, Sveshnikov ---
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7 O-O-O Nbd7",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5 e6 Qd2 a6 O-O-O Bd7",
    "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5 Be7 Bxf6 Bxf6 c3",
    "e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 e5 c3 Nge7",
    "e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Bc5 Nb3 Be7 O-O d6",
    "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2 Nf6 O-O-O",
    "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6 Be2 Be7 O-O O-O",
    "e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3 e5",
    "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6",
    # --- 1. e4 e6: French Defense ---
    "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5",
    "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O Bd3",
    "e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4",
    "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 Nh6",
    "e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O",
    # --- 1. e4 c6: Caro-Kann Defense ---
    "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3",
    "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Ng3 e6 Bd3 c5",
    "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Qb6 Nc3 Nc6 O-O",
    "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3",
    "e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5 Ng3 Bg6",
    # --- 1. e4 Other Defenses ---
    "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6",
    "e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Na6",
    "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5",
    "e4 d5 exd5 Nf6 d4 Nxd5 Nf3 Bg4 Be2 e6 O-O Be7",
    "e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7",
    "e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2 b5",
    # --- 1. d4 d5: Queen's Gambit Declined, Slav, London ---
    "d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bg5 O-O e3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5",
    "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3 Nbd7",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 Bb7",
    "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3 Bb7",
    "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3",
    "d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4",
    "d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O dxc4 Qc2 a6 Qxc4 b5",
    # --- 1. d4 Nf6: Indian Defenses ---
    "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3",
    "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7",
    "d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7 Bg2 c6",
    "d4 Nf6 c4 e6 Nf3 Bb4+ Bd2 Qe7 g3 Nc6 Nc3 Bxc3 Bxc3",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 c6 Nge2 cxd5",
    "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3 Qa5",
    "d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 g6 Nc3 Bxa6",
    "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7",
    "d4 Nf6 Bg5 d5 Bxf6 exf6 e3 c6 c4 dxc4 Bxc4 Bd6",
    # --- 1. d4 f5: Dutch Defense ---
    "d4 f5 c4 Nf6 g3 g6 Bg2 Bg7 Nf3 O-O O-O d6 Nc3",
    "d4 f5 c4 Nf6 g3 e6 Bg2 d5 Nf3 c6 O-O Bd6 b3",
    # --- 1. c4: English Opening ---
    "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 a3 O-O",
    "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O",
    "c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7 Bg5 O-O",
    "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7",
    # --- 1. Nf3: Reti / King's Indian Attack ---
    "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bf5 d3 e6 Nbd2 h6",
    "Nf3 Nf6 c4 g6 g3 Bg7 Bg2 O-O O-O d6 Nc3 c5",
    "Nf3 d5 c4 d4 b4 g6 Bb2 Bg7 d3",
    # --- Other standard single-move opening anchors ---
    "b3 e5 Bb2 Nc6 e3 Nf6",
    "g3 d5 Bg2 Nf6 Nf3 c6 O-O",
    "f4 d5 Nf3 Nf6 e3 g6 Be2 Bg7",
    "Nc3 d5 d4 Nf6 Bf4 c6 e3",
]

# Set of (epd, uci) pairs that constitute fallback book moves
_BOOK_TRANSITIONS: set[tuple[str, str]] = set()


def _init_fallback_book():
    for line in BOOK_LINES:
        board = chess.Board()
        for token in line.split():
            try:
                move = board.parse_san(token)
            except Exception:
                break
            epd = board.epd()
            _BOOK_TRANSITIONS.add((epd, move.uci()))
            board.push(move)

    # Explicitly ensure all standard 1st moves for White are present
    start_board = chess.Board()
    start_epd = start_board.epd()
    for san in ("e4", "d4", "c4", "Nf3", "g3", "b3", "f4", "Nc3", "d3", "e3"):
        try:
            m = start_board.parse_san(san)
            _BOOK_TRANSITIONS.add((start_epd, m.uci()))
        except Exception:
            pass

    # Standard replies to 1. e4
    board_e4 = chess.Board()
    board_e4.push_san("e4")
    epd_e4 = board_e4.epd()
    for san in ("e5", "c5", "e6", "c6", "d6", "d5", "Nf6", "g6", "b6", "Nc6"):
        try:
            m = board_e4.parse_san(san)
            _BOOK_TRANSITIONS.add((epd_e4, m.uci()))
        except Exception:
            pass

    # Standard replies to 1. d4
    board_d4 = chess.Board()
    board_d4.push_san("d4")
    epd_d4 = board_d4.epd()
    for san in ("d5", "Nf6", "e6", "d6", "c5", "f5", "g6", "c6", "e5"):
        try:
            m = board_d4.parse_san(san)
            _BOOK_TRANSITIONS.add((epd_d4, m.uci()))
        except Exception:
            pass

    # Standard replies to 1. c4
    board_c4 = chess.Board()
    board_c4.push_san("c4")
    epd_c4 = board_c4.epd()
    for san in ("e5", "c5", "Nf6", "e6", "c6", "g6", "d5"):
        try:
            m = board_c4.parse_san(san)
            _BOOK_TRANSITIONS.add((epd_c4, m.uci()))
        except Exception:
            pass

    # Standard replies to 1. Nf3
    board_nf3 = chess.Board()
    board_nf3.push_san("Nf3")
    epd_nf3 = board_nf3.epd()
    for san in ("d5", "Nf6", "c5", "g6", "e6", "d6", "c6"):
        try:
            m = board_nf3.parse_san(san)
            _BOOK_TRANSITIONS.add((epd_nf3, m.uci()))
        except Exception:
            pass


_init_fallback_book()


def ensure_opening_book_downloaded(
    target_path: str = DEFAULT_BOOK_PATH,
    url: str = DEFAULT_BOOK_URL,
) -> str | None:
    """Download the Polyglot opening database if not already present.

    Returns the absolute path to the .bin file, or None if download failed.
    """
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1000:
        return target_path

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    temp_path = f"{target_path}.tmp"
    logger.info("Downloading opening book from %s to %s", url, target_path)

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (ChessAnalyzer/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp, open(temp_path, "wb") as f:
            while chunk := resp.read(65536):
                f.write(chunk)

        if os.path.exists(temp_path) and os.path.getsize(temp_path) > 1000:
            os.replace(temp_path, target_path)
            logger.info(
                "Opening book successfully downloaded (%d bytes)",
                os.path.getsize(target_path),
            )
            return target_path
    except Exception as exc:
        logger.warning("Could not download opening book: %s. Using embedded fallback.", exc)
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

    return target_path if os.path.exists(target_path) else None


def _get_reader() -> chess.polyglot.MemoryMappedReader | None:
    """Return a cached MemoryMappedReader for the Polyglot opening book."""
    global _reader, _reader_loaded_path
    book_path = ensure_opening_book_downloaded()

    if not book_path or not os.path.exists(book_path):
        return None

    if _reader is not None and _reader_loaded_path == book_path:
        return _reader

    try:
        _reader = chess.polyglot.open_reader(book_path)
        _reader_loaded_path = book_path
        logger.info("Successfully opened Polyglot opening book from %s", book_path)
        return _reader
    except Exception as exc:
        logger.warning("Failed to open Polyglot opening book %s: %s", book_path, exc)
        _reader = None
        return None


def is_book_move(board_before: chess.Board, move: chess.Move, cp_loss: float = 0.0) -> bool:
    """Return True if move from board_before is in the opening book with low cp_loss."""
    # Never classify a high-loss blunder as a book move
    if cp_loss > 25.0:
        return False

    reader = _get_reader()
    if reader is not None:
        try:
            for entry in reader.find_all(board_before):
                if entry.move == move:
                    return True
        except Exception:
            pass

    # Fallback check against embedded positions
    epd = board_before.epd()
    return (epd, move.uci()) in _BOOK_TRANSITIONS


def get_book_move_details(
    board_before: chess.Board,
    move: chess.Move,
    cp_loss: float = 0.0,
) -> dict[str, Any]:
    """Return rich book information including played move weight and candidate book alternatives."""
    is_book = is_book_move(board_before, move, cp_loss)
    reader = _get_reader()

    if reader is None:
        return {
            "is_book": is_book,
            "book_weight": None,
            "book_candidates": [],
        }

    try:
        entries = list(reader.find_all(board_before))
        if not entries:
            return {
                "is_book": is_book,
                "book_weight": None,
                "book_candidates": [],
            }

        total_weight = sum(e.weight for e in entries) or 1
        candidates: list[dict[str, Any]] = []
        played_weight: int | None = None

        # Sort candidate moves by master weight descending
        entries.sort(key=lambda e: e.weight, reverse=True)

        for entry in entries:
            if entry.move in board_before.legal_moves:
                san = board_before.san(entry.move)
            else:
                san = entry.move.uci()

            pct = round((entry.weight / total_weight) * 100, 1)
            candidates.append({
                "san": san,
                "uci": entry.move.uci(),
                "weight": entry.weight,
                "percentage": pct,
            })

            if entry.move == move:
                played_weight = entry.weight

        return {
            "is_book": is_book,
            "book_weight": played_weight,
            "book_candidates": candidates[:5],
        }
    except Exception as exc:
        logger.debug("Error querying polyglot reader for details: %s", exc)
        return {
            "is_book": is_book,
            "book_weight": None,
            "book_candidates": [],
        }
