import os
import csv
import logging
from dataclasses import dataclass, asdict
import chess

logger = logging.getLogger(__name__)


@dataclass
class OpeningEntry:
    eco: str
    name: str
    pgn: str
    uci: str
    epd: str
    family: str
    variation: str
    move_count: int
    side: str  # "white" or "black" — which side "owns" this opening


class OpeningsDB:
    def __init__(self):
        self._entries: list[OpeningEntry] = []
        self._by_eco: dict[str, list[OpeningEntry]] = {}
        self._by_epd: dict[str, OpeningEntry] = {}
        self._loaded = False
        self.data_dir = self._resolve_data_dir()

    def _resolve_data_dir(self) -> str:
        """Find the best existing openings directory across local and container environments."""
        env_dir = os.getenv("OPENINGS_DATA_DIR")
        base_dir = os.path.dirname(os.path.dirname(__file__))
        candidates = [
            env_dir,
            os.path.join(base_dir, "openings_data"),
            os.path.join(base_dir, "data", "openings"),
            "/app/openings_data",
            "/app/data/openings",
        ]
        for c in candidates:
            if c and os.path.isdir(c):
                tsvs = [f for f in os.listdir(c) if f.endswith(".tsv")]
                if len(tsvs) >= 3:
                    return c
        return env_dir or os.path.join(base_dir, "openings_data")

    def ensure_loaded(self):
        if self._loaded:
            return
        self._load_all_tsvs()
        self._loaded = True

    def _ensure_data_files(self):
        """Ensure all TSV files exist; automatically download if missing."""
        os.makedirs(self.data_dir, exist_ok=True)
        missing = [
            letter for letter in ['a', 'b', 'c', 'd', 'e']
            if not os.path.exists(os.path.join(self.data_dir, f"{letter}.tsv"))
            or os.path.getsize(os.path.join(self.data_dir, f"{letter}.tsv")) == 0
        ]
        if missing:
            base_url = "https://raw.githubusercontent.com/lichess-org/chess-openings/master"
            for letter in missing:
                url = f"{base_url}/{letter}.tsv"
                target_path = os.path.join(self.data_dir, f"{letter}.tsv")
                try:
                    import urllib.request
                    logger.info(f"Downloading missing opening dataset: {url} -> {target_path}")
                    urllib.request.urlretrieve(url, target_path)
                    logger.info(f"Auto-downloaded {letter}.tsv successfully ({os.path.getsize(target_path)} bytes)")
                except Exception as e:
                    logger.warning(f"Could not auto-download {letter}.tsv: {e}")

    def _load_all_tsvs(self):
        self._ensure_data_files()
        for letter in ['a', 'b', 'c', 'd', 'e']:
            path = os.path.join(self.data_dir, f"{letter}.tsv")
            if not os.path.exists(path):
                logger.warning(f"Opening TSV not found: {path}")
                continue
            with open(path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f, delimiter='\t')
                for row in reader:
                    entry = self._parse_entry(row)
                    self._entries.append(entry)
                    self._by_eco.setdefault(entry.eco, []).append(entry)
                    if entry.epd:
                        self._by_epd[entry.epd] = entry
        logger.info(f"Loaded {len(self._entries)} openings from {self.data_dir}")

    def _parse_entry(self, row: dict) -> OpeningEntry:
        name = row["name"]
        parts = name.split(": ", 1)
        family = parts[0]
        variation = parts[1] if len(parts) > 1 else ""
        pgn = row["pgn"]

        # Compute uci and epd from PGN if not in TSV
        uci_str = row.get("uci", "")
        epd_str = row.get("epd", "")

        if not uci_str or not epd_str:
            try:
                board = chess.Board()
                uci_parts = []
                for token in pgn.split():
                    if token.endswith(".") or (token[0].isdigit() and "." in token):
                        continue
                    move = board.push_san(token)
                    uci_parts.append(move.uci())
                uci_str = uci_str or " ".join(uci_parts)
                epd_str = epd_str or board.epd()
            except Exception:
                pass

        uci_moves = uci_str.split() if uci_str else []
        move_count = len(uci_moves)
        # Determine side: if last move is Black's (even number of half-moves), it's a Black defense
        side = "black" if move_count % 2 == 0 else "white"
        return OpeningEntry(
            eco=row["eco"],
            name=name,
            pgn=pgn,
            uci=uci_str,
            epd=epd_str,
            family=family,
            variation=variation,
            move_count=move_count,
            side=side,
        )

    def get_catalog(self) -> list[dict]:
        """Return curated opening categories for the training catalog."""
        self.ensure_loaded()
        categories = [
            {
                "name": "King's Pawn: Open Games",
                "description": "Classical openings after 1.e4 e5",
                "keywords": [
                    "Italian Game", "Ruy Lopez", "Scotch Game", "King's Gambit",
                    "Petrov", "Vienna Game", "Giuoco Piano", "Evans Gambit",
                    "Two Knights", "Bishop's Opening", "Philidor Defense",
                ]
            },
            {
                "name": "Sicilian Defense",
                "description": "The most popular response to 1.e4",
                "keywords": [
                    "Sicilian Defense: Najdorf", "Sicilian Defense: Dragon",
                    "Sicilian Defense: Classical", "Sicilian Defense: Scheveningen",
                    "Sicilian Defense: Sveshnikov", "Sicilian Defense: Kan",
                    "Sicilian Defense: Alapin", "Sicilian Defense: Accelerated Dragon",
                    "Sicilian Defense: Open", "Sicilian Defense: Taimanov",
                ]
            },
            {
                "name": "Semi-Open Games",
                "description": "Asymmetric responses to 1.e4",
                "keywords": [
                    "French Defense", "Caro-Kann Defense", "Pirc Defense",
                    "Alekhine Defense", "Scandinavian Defense", "Modern Defense",
                ]
            },
            {
                "name": "Queen's Pawn Openings",
                "description": "Openings starting with 1.d4",
                "keywords": [
                    "Queen's Gambit Declined", "Queen's Gambit Accepted",
                    "Slav Defense", "Semi-Slav Defense", "Catalan Opening",
                    "London System", "Grunfeld Defense", "Tarrasch Defense",
                    "Torre Attack",
                ]
            },
            {
                "name": "Indian Defenses",
                "description": "Hypermodern defenses against 1.d4",
                "keywords": [
                    "King's Indian Defense", "Nimzo-Indian Defense",
                    "Queen's Indian Defense", "Bogo-Indian Defense",
                    "Benoni Defense", "Dutch Defense",
                ]
            },
            {
                "name": "Flank Openings",
                "description": "Non-central pawn openings",
                "keywords": [
                    "English Opening", "Reti Opening", "Bird Opening",
                    "King's Indian Attack",
                ]
            },
        ]

        catalog = []
        for cat_def in categories:
            matched = []
            seen_names = set()
            for keyword in cat_def["keywords"]:
                for entry in self._entries:
                    if keyword.lower() in entry.name.lower() and entry.name not in seen_names:
                        matched.append(entry)
                        seen_names.add(entry.name)
                        # Take the first match per keyword to keep catalog concise
                        break
            catalog.append({
                "name": cat_def["name"],
                "description": cat_def["description"],
                "openings": [asdict(e) for e in matched],
            })
        return catalog

    def find_opening_by_name(self, name: str) -> OpeningEntry | None:
        """Find an opening by partial name match."""
        self.ensure_loaded()
        name_lower = name.lower()
        # Exact match first
        for entry in self._entries:
            if entry.name.lower() == name_lower:
                return entry
        # Partial match
        for entry in self._entries:
            if name_lower in entry.name.lower():
                return entry
        return None

    def get_opening_by_eco(self, eco: str) -> list[OpeningEntry]:
        """Get all openings for an ECO code."""
        self.ensure_loaded()
        return self._by_eco.get(eco.upper(), [])

    def find_opening(self, eco: str, name: str) -> OpeningEntry | None:
        """Find opening by ECO code and name (partial match)."""
        self.ensure_loaded()
        name_lower = name.lower()
        # Try ECO-scoped first
        for entry in self.get_opening_by_eco(eco):
            if name_lower in entry.name.lower():
                return entry
        # Fallback to full search
        return self.find_opening_by_name(name)

    def identify_opening(self, board: chess.Board) -> OpeningEntry | None:
        """Identify the opening for the current board position by EPD."""
        self.ensure_loaded()
        epd = board.epd()
        return self._by_epd.get(epd)

    def get_line_moves(self, opening: OpeningEntry) -> list[dict]:
        """Parse an opening's PGN into individual move dicts with FEN positions."""
        board = chess.Board()
        moves = []
        tokens = opening.pgn.split()
        for token in tokens:
            # Skip move numbers like "1.", "2.", "1..."
            if token.endswith(".") or token[0].isdigit() and "." in token:
                continue
            try:
                fen_before = board.fen()
                side = "white" if board.turn == chess.WHITE else "black"
                move = board.push_san(token)
                fen_after = board.fen()
                moves.append({
                    "index": len(moves),
                    "move_index": len(moves),
                    "san": token,
                    "uci": move.uci(),
                    "fen_before": fen_before,
                    "fen_after": fen_after,
                    "side": side,
                })
            except Exception as e:
                logger.warning(f"Failed to parse move '{token}' in {opening.name}: {e}")
                break
        return moves

    def _get_curated_names(self) -> set[tuple[str, str]]:
        """Return set of (eco, name) for curated catalog openings."""
        if not hasattr(self, "_curated_cache"):
            catalog = self.get_catalog()
            self._curated_cache = {
                (op["eco"], op["name"])
                for cat in catalog
                for op in cat["openings"]
            }
        return self._curated_cache

    def list_openings(
        self,
        query: str = "",
        category: str = "",
        side: str = "",
        scope: str = "all",
        sort_by: str = "relevance",
        sort_order: str = "asc",
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[OpeningEntry], int]:
        """
        Filter, search, order, and paginate openings.
        Returns: (items, total_count)
        """
        self.ensure_loaded()
        q = query.strip().lower()
        cat = category.strip().lower()
        side = side.strip().lower()
        scope = scope.strip().lower()
        curated_set = self._get_curated_names()

        candidates: list[tuple[float, OpeningEntry]] = []

        for entry in self._entries:
            # Scope filter: curated vs all
            if scope == "curated" and (entry.eco, entry.name) not in curated_set:
                continue

            # Side filter
            if side in ("white", "black") and entry.side != side:
                continue

            # Category filter
            if cat:
                eco_letter = entry.eco[0].upper() if entry.eco else ""
                name_l = entry.name.lower()
                fam_l = entry.family.lower()
                if cat in ("a", "flank") and eco_letter != "A":
                    continue
                elif cat in ("b", "semi_open") and (eco_letter != "B" or "sicilian" in fam_l):
                    continue
                elif cat == "sicilian" and "sicilian" not in fam_l:
                    continue
                elif cat in ("c", "open_games", "kings_pawn") and eco_letter != "C":
                    continue
                elif cat in ("d", "queens_pawn") and eco_letter != "D":
                    continue
                elif cat in ("e", "indian") and eco_letter != "E":
                    continue
                elif cat not in ("a", "b", "c", "d", "e", "flank", "semi_open", "sicilian", "open_games", "kings_pawn", "queens_pawn", "indian"):
                    if cat not in fam_l and cat not in name_l:
                        continue

            # Search query matching & relevance scoring
            if q:
                score = 0.0
                eco_l = entry.eco.lower()
                name_l = entry.name.lower()
                fam_l = entry.family.lower()
                var_l = entry.variation.lower()
                pgn_l = entry.pgn.lower()

                if eco_l == q:
                    score += 150.0
                elif eco_l.startswith(q):
                    score += 100.0
                elif q in eco_l:
                    score += 80.0

                if name_l == q:
                    score += 120.0
                elif name_l.startswith(q):
                    score += 90.0
                elif fam_l.startswith(q):
                    score += 70.0
                elif q in fam_l:
                    score += 50.0
                elif q in var_l:
                    score += 40.0
                elif q in name_l:
                    score += 35.0
                elif q in pgn_l:
                    score += 15.0

                # If no match across fields, skip
                if score <= 0.0:
                    continue

                # Small bonus for curated repertoire openings and shorter main lines
                if (entry.eco, entry.name) in curated_set:
                    score += 10.0
                score += max(0.0, 10.0 - (entry.move_count * 0.5))

                candidates.append((score, entry))
            else:
                # Default score: prioritize curated entries
                base_score = 50.0 if (entry.eco, entry.name) in curated_set else 0.0
                candidates.append((base_score, entry))

        # Sorting
        rev = (sort_order.lower() == "desc")
        if q and sort_by == "relevance":
            # Sort by relevance score descending
            candidates.sort(key=lambda x: x[0], reverse=True)
        elif sort_by == "name":
            candidates.sort(key=lambda x: x[1].name.lower(), reverse=rev)
        elif sort_by == "eco":
            candidates.sort(key=lambda x: x[1].eco, reverse=rev)
        elif sort_by == "move_count":
            candidates.sort(key=lambda x: x[1].move_count, reverse=rev)
        else:
            # Default order: score first, then ECO, then name
            candidates.sort(key=lambda x: (-x[0], x[1].eco, x[1].name.lower()))

        total = len(candidates)
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        start = (page - 1) * page_size
        end = start + page_size

        page_items = [entry for _, entry in candidates[start:end]]
        return page_items, total

    def search_openings(self, query: str) -> list[OpeningEntry]:
        """Search openings by name or ECO code."""
        items, _ = self.list_openings(query=query, page=1, page_size=50)
        return items


_db_instance = None


def get_openings_db() -> OpeningsDB:
    global _db_instance
    if _db_instance is None:
        _db_instance = OpeningsDB()
        _db_instance.ensure_loaded()
    return _db_instance
