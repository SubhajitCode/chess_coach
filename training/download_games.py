#!/usr/bin/env python3
"""
Lichess Game Downloader & Filter for AI Chess Training

Streams or reads Lichess Open Database dumps (.pgn.zst) and extracts games 
filtered by Elo rating bracket, time control, and game quality metrics directly 
without needing to download or uncompress multi-gigabyte files to disk.

Usage:
  # Stream 10,000 games in 1400-1800 Elo bracket directly over HTTP
  python3 download_games.py --month 2024-01 --min-elo 1400 --max-elo 1800 --max-games 10000

  # Filter an existing local .pgn.zst file
  python3 download_games.py --input /path/to/lichess_db.pgn.zst --min-elo 1500 --max-elo 1700
"""

import argparse
import io
import os
import re
import sys
import time
import urllib.request
import zstandard as zstd

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None


# Regex patterns for fast PGN header parsing without full AST overhead
HEADER_PATTERNS = {
    "white_elo": re.compile(r'^\[WhiteElo\s+"(\d+)"\]'),
    "black_elo": re.compile(r'^\[BlackElo\s+"(\d+)"\]'),
    "event": re.compile(r'^\[Event\s+"([^"]+)"\]'),
    "variant": re.compile(r'^\[Variant\s+"([^"]+)"\]'),
    "result": re.compile(r'^\[Result\s+"([^"]+)"\]'),
    "termination": re.compile(r'^\[Termination\s+"([^"]+)"\]'),
}


def get_text_stream(month: str, input_path: str = None):
    """
    Returns an open TextIO line reader from either a local file or 
    a direct streaming HTTP connection with on-the-fly zstd decompression.
    """
    dctx = zstd.ZstdDecompressor()
    
    if input_path:
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
        print(f"Reading from local file: {input_path}")
        file_obj = open(input_path, "rb")
        if input_path.endswith(".zst"):
            stream_reader = dctx.stream_reader(file_obj)
            return io.TextIOWrapper(stream_reader, encoding="utf-8", errors="replace"), file_obj
        else:
            return io.TextIOWrapper(file_obj, encoding="utf-8", errors="replace"), file_obj
    else:
        url = f"https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"
        print(f"Streaming directly from Lichess Open Database:")
        print(f"  URL: {url}")
        print("  (Decompressing on the fly - no multi-GB download required)\n")
        req = urllib.request.Request(
            url, 
            headers={"User-Agent": "ChessAnalyzer-Training-Downloader/1.0 (Mac mini Apple Silicon)"}
        )
        response = urllib.request.urlopen(req, timeout=30)
        stream_reader = dctx.stream_reader(response)
        return io.TextIOWrapper(stream_reader, encoding="utf-8", errors="replace"), response


def match_criteria(
    headers: dict, 
    move_lines: list, 
    min_elo: int, 
    max_elo: int, 
    elo_mode: str, 
    allowed_events: list, 
    min_moves: int
) -> bool:
    """Fast check if game satisfies Elo, event, variant, and quality constraints."""
    try:
        w_elo = int(headers.get("white_elo", 0))
        b_elo = int(headers.get("black_elo", 0))
    except (ValueError, TypeError):
        return False
        
    if w_elo == 0 or b_elo == 0:
        return False
        
    # Elo filter
    if elo_mode == "both":
        if not (min_elo <= w_elo <= max_elo and min_elo <= b_elo <= max_elo):
            return False
    elif elo_mode == "average":
        avg_elo = (w_elo + b_elo) / 2.0
        if not (min_elo <= avg_elo <= max_elo):
            return False
    elif elo_mode == "either":
        if not ((min_elo <= w_elo <= max_elo) or (min_elo <= b_elo <= max_elo)):
            return False
            
    # Variant check (Standard chess only)
    variant = headers.get("variant", "Standard")
    if variant != "Standard":
        return False
        
    # Result check (ignore aborted games without decisive or draw result)
    result = headers.get("result", "*")
    if result not in ("1-0", "0-1", "1/2-1/2"):
        return False
        
    # Event filter (Blitz, Rapid, Classical)
    event = headers.get("event", "")
    if allowed_events:
        event_matched = any(ae.lower() in event.lower() for ae in allowed_events)
        if not event_matched:
            return False
            
    # Move count check (avoid short/abandoned games)
    full_text = " ".join(move_lines)
    if f"{min_moves}." not in full_text:
        return False
        
    return True


def stream_and_filter(
    text_stream,
    out_file,
    min_elo: int,
    max_elo: int,
    elo_mode: str,
    allowed_events: list,
    min_moves: int,
    max_games: int
):
    """Parses text stream line-by-line and extracts filtered games."""
    current_headers = {}
    current_lines = []
    current_move_lines = []
    in_moves = False
    
    games_scanned = 0
    games_matched = 0
    start_time = time.time()
    
    pbar = tqdm(total=max_games, unit="games", desc="Matched games") if tqdm else None
    
    try:
        for line in text_stream:
            line_stripped = line.strip()
            
            # Check for header tag line
            if line_stripped.startswith("["):
                # If we were previously parsing moves and now see a new '[', the previous game has ended
                if in_moves and current_lines:
                    games_scanned += 1
                    if match_criteria(current_headers, current_move_lines, min_elo, max_elo, elo_mode, allowed_events, min_moves):
                        out_file.write("".join(current_lines) + "\n\n")
                        games_matched += 1
                        if pbar:
                            pbar.update(1)
                        else:
                            if games_matched % 500 == 0:
                                elapsed = time.time() - start_time
                                print(f"Matched {games_matched}/{max_games} games ({games_scanned:,} scanned, {games_matched/elapsed:.1f} games/s)")
                        
                        if games_matched >= max_games:
                            break
                    
                    # Reset state for next game
                    current_headers = {}
                    current_lines = []
                    current_move_lines = []
                    in_moves = False
                    
                current_lines.append(line)
                for key, pattern in HEADER_PATTERNS.items():
                    m = pattern.match(line_stripped)
                    if m:
                        current_headers[key] = m.group(1)
                        break
                        
            elif line_stripped:
                # Move line
                in_moves = True
                current_lines.append(line)
                current_move_lines.append(line_stripped)
            else:
                # Empty separator line
                if current_lines:
                    current_lines.append(line)
                    
        # Check last game in stream
        if current_lines and games_matched < max_games:
            games_scanned += 1
            if match_criteria(current_headers, current_move_lines, min_elo, max_elo, elo_mode, allowed_events, min_moves):
                out_file.write("".join(current_lines) + "\n\n")
                games_matched += 1
                if pbar:
                    pbar.update(1)
                    
    except KeyboardInterrupt:
        print("\n\nProcess interrupted by user (Ctrl+C). Saving downloaded games...")
    finally:
        if pbar:
            pbar.close()
            
    return games_scanned, games_matched


def main():
    parser = argparse.ArgumentParser(
        description="Stream and filter Lichess games by Elo rating for AI model training."
    )
    parser.add_argument("--month", type=str, default="2024-01", 
                        help="Lichess dump month in YYYY-MM format (e.g. 2024-01).")
    parser.add_argument("--input", type=str, default=None, 
                        help="Optional local path to .pgn or .pgn.zst file instead of streaming.")
    parser.add_argument("--min-elo", type=int, default=1400, 
                        help="Minimum Elo rating (default: 1400).")
    parser.add_argument("--max-elo", type=int, default=1800, 
                        help="Maximum Elo rating (default: 1800).")
    parser.add_argument("--elo-mode", choices=["both", "average", "either"], default="both", 
                        help="Filter mode: 'both' (both players in band), 'average' (mean Elo in band), 'either'.")
    parser.add_argument("--time-controls", nargs="+", default=["Blitz", "Rapid", "Classical"], 
                        help="Allowed time control categories (default: Blitz Rapid Classical).")
    parser.add_argument("--min-moves", type=int, default=12, 
                        help="Minimum number of full moves per game (default: 12).")
    parser.add_argument("--max-games", type=int, default=50000, 
                        help="Target number of filtered games to extract (default: 50,000).")
    parser.add_argument("--output", type=str, default=None, 
                        help="Output .pgn file path (default: data/lichess_{min_elo}_{max_elo}_{month}.pgn).")
    
    args = parser.parse_args()
    
    # Configure output path
    if args.output is None:
        os.makedirs("data", exist_ok=True)
        args.output = f"data/lichess_{args.min_elo}_{args.max_elo}_{args.month}.pgn"
    else:
        out_dir = os.path.dirname(args.output)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
            
    print("=" * 65)
    print(" ♚ LICHESS STREAMING GAME EXTRACTOR & FILTER")
    print("=" * 65)
    print(f" Target Elo Bracket : {args.min_elo} - {args.max_elo} (mode: '{args.elo_mode}')")
    print(f" Time Controls      : {', '.join(args.time_controls)}")
    print(f" Min Full Moves     : {args.min_moves}")
    print(f" Target Games       : {args.max_games:,}")
    print(f" Output File        : {args.output}")
    print("=" * 65)
    
    text_stream, source_obj = get_text_stream(args.month, args.input)
    
    with open(args.output, "w", encoding="utf-8") as out_f:
        start_t = time.time()
        scanned, matched = stream_and_filter(
            text_stream=text_stream,
            out_file=out_f,
            min_elo=args.min_elo,
            max_elo=args.max_elo,
            elo_mode=args.elo_mode,
            allowed_events=args.time_controls,
            min_moves=args.min_moves,
            max_games=args.max_games
        )
        elapsed = time.time() - start_t
        
    try:
        source_obj.close()
    except Exception:
        pass
        
    file_size_mb = os.path.getsize(args.output) / (1024 * 1024) if os.path.exists(args.output) else 0
    print("\n" + "=" * 65)
    print(" Extraction Summary")
    print("=" * 65)
    print(f" Scanned Games  : {scanned:,}")
    print(f" Matched Games  : {matched:,}")
    print(f" Match Rate     : {matched / max(1, scanned) * 100:.2f}%")
    print(f" Elapsed Time   : {elapsed:.1f}s ({matched / max(0.1, elapsed):.1f} matched games/s)")
    print(f" Output Size    : {file_size_mb:.2f} MB")
    print(f" Saved to       : {args.output}")
    print("=" * 65)


if __name__ == "__main__":
    main()
