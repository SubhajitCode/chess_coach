"""
opening_scenarios.py - Deep multi-scenario opening definitions and dynamic branching.
Provides curated, pedagogical deep master lines (12-26 moves) for all major openings,
plus dynamic scenario discovery from the full ECO database.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional
import logging
import chess

logger = logging.getLogger(__name__)


@dataclass
class OpeningScenario:
    id: str
    name: str
    eco: str
    family: str
    variation: str
    side: str  # "white", "black", or "both"
    pgn: str
    description: str
    key_ideas: list[str] = field(default_factory=list)
    drawbacks: list[str] = field(default_factory=list)
    difficulty: str = "Intermediate"  # "Beginner", "Intermediate", "Advanced"
    move_count: int = 0

    def __post_init__(self):
        if not self.move_count and self.pgn:
            # Count half-moves
            tokens = [
                t for t in self.pgn.split()
                if not t.endswith(".") and not (t[0].isdigit() and "." in t)
            ]
            self.move_count = len(tokens)


# Curated high-pedagogy scenarios (all 100% legal moves verified with python-chess)
CURATED_SCENARIOS: list[OpeningScenario] = [
    # -------------------------------------------------------------
    # ITALIAN GAME
    # -------------------------------------------------------------
    OpeningScenario(
        id="italian-giuoco-piano-center",
        name="Giuoco Piano: Classical Center Attack",
        eco="C54",
        family="Italian Game",
        variation="Giuoco Piano Classical Center Attack",
        side="white",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Nce7 11. O-O O-O",
        description="Black plays 3...Bc5. White strikes immediately in the center with 4.c3 and 5.d4 to build an imposing pawn duo, trading dark-squared bishops and pressuring Black's pinned center.",
        key_ideas=[
            "Seize the full pawn center with 4.c3 and 5.d4",
            "Exchange the dangerous dark-squared bishop with 7.Bd2",
            "Target d5 knight with 10.Qb3 battery",
            "Complete castling and dominate open e-file and c-file",
        ],
        drawbacks=[
            "White isolates or liquidates central pawns after 8...d5",
            "Requires precise tactical calculation against 6...Bb4+",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="italian-giuoco-pianissimo",
        name="Giuoco Pianissimo: Modern Quiet Positional",
        eco="C50",
        family="Italian Game",
        variation="Giuoco Pianissimo Modern Quiet",
        side="white",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. c3 a6 6. Bb3 Ba7 7. O-O d6 8. Nbd2 O-O 9. Re1 h6 10. Nf1 Be6",
        description="The modern Grandmaster choice! White avoids early liquidation, preserves the light-squared bishop on b3, and maneuvers the knight via Nbd2-f1-g3 for a kingside offensive.",
        key_ideas=[
            "Tuck the prized Italian bishop safely on b3",
            "Knight maneuver Nbd2-f1-g3 to eye f5 and h5 outposts",
            "Prepare timely central thrust d3-d4 or queenside expansion a2-a4",
            "Solid, risk-free long-term positional pressure",
        ],
        drawbacks=[
            "Slower pace gives Black time to complete harmonious development",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="italian-two-knights-fried-liver",
        name="Two Knights Defense: Fried Liver / Polerio Attack",
        eco="C59",
        family="Italian Game",
        variation="Two Knights Defense Polerio Attack",
        side="white",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Be2 h6 9. Nf3 e4 10. Ne5 Bd6 11. d4 exd3 12. Nxd3 Qc7",
        description="Black counters aggressively with 3...Nf6. White unleashes the notorious 4.Ng5 assault on f7. Black sacrifices a pawn with 5...Na5 to push White back and gain tremendous dynamic compensation.",
        key_ideas=[
            "Attack the vulnerable f7 square with 4.Ng5",
            "Safely retreat bishop to e2 after Black sacrifices a pawn with ...c6",
            "Weather Black's kingside initiative with an extra pawn in the bank",
            "Counterpunch in the center with 11.d4",
        ],
        drawbacks=[
            "White's pieces are temporarily pushed back by Black's pawn advances",
            "Black has rapid piece activity and open lines against White's king",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="italian-two-knights-center",
        name="Two Knights Defense: Modern 4.d4 Center Strike",
        eco="C56",
        family="Italian Game",
        variation="Two Knights Defense Modern 4.d4",
        side="white",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d4 exd4 5. e5 d5 6. Bb5 Ne4 7. Nxd4 Bd7 8. Bxc6 bxc6 9. O-O Bc5 10. f3 Ng5 11. Be3 O-O",
        description="Instead of 4.Ng5, White strikes the center with 4.d4! When Black plays 4...exd4, 5.e5 launches a sharp clash where White pins and damages Black's pawn structure.",
        key_ideas=[
            "Open center immediately with 4.d4",
            "Dislodge Black's knight with 5.e5",
            "Pin and double Black's c-pawns with 6.Bb5 and 8.Bxc6",
            "Fortify central control with f3 and Be3",
        ],
        drawbacks=[
            "Black retains the bishop pair after 8.Bxc6 bxc6",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="italian-evans-gambit",
        name="Evans Gambit: Accepted Main Line",
        eco="C51",
        family="Italian Game",
        variation="Evans Gambit Accepted",
        side="white",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d6 8. cxd4 Bb6 9. Nc3 Bg4 10. Bb5 Bd7 11. Re1 Nge7",
        description="The romantic master's attacking weapon! White sacrifices the b-pawn to seize total central control with c3 and d4, opening lethal diagonals for rapid kingside demolition.",
        key_ideas=[
            "Sacrifice the b4 pawn to gain rapid development tempos",
            "Build unstoppable center pawn duo with c3 and d4",
            "Open diagonal lines toward Black's uncastled king",
            "Pin the knight with Bb5 and build relentless pressure",
        ],
        drawbacks=[
            "Down a pawn; if Black defends accurately, endgame can be difficult",
        ],
        difficulty="Advanced",
    ),

    # -------------------------------------------------------------
    # SICILIAN DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="sicilian-najdorf-english",
        name="Sicilian Najdorf: English Attack",
        eco="B90",
        family="Sicilian Defense",
        variation="Najdorf English Attack",
        side="both",
        pgn="1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8",
        description="The ultimate modern battleground. White castles queenside and charges pawns forward (f3, g4, g5) to break Black's king, while Black launches a devastating queenside countercharge with ...b5-b4.",
        key_ideas=[
            "Opposite-side castling pawn storms (g4-g5 vs ...b5-b4)",
            "Control d5 outpost with knight and bishop battery",
            "Black counterpunches on the semi-open c-file",
            "Sharp tactical race where every single tempo matters",
        ],
        drawbacks=[
            "Any slip by either side leads to immediate checkmate or lost material",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="sicilian-dragon-yugoslav",
        name="Sicilian Dragon: Yugoslav Attack",
        eco="B79",
        family="Sicilian Defense",
        variation="Dragon Yugoslav Attack",
        side="both",
        pgn="1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Qa5 11. h4 Rfc8 12. Bb3 h5",
        description="The fiercest opening in chess. Black's dragon bishop on g7 breathes down the long diagonal, while White aims for mate by opening the h-file with h4-h5 and trading bishops with Bh6.",
        key_ideas=[
            "White forms Yugoslav battery (Be3 + Qd2 + Bc4)",
            "H-file breakthrough via h4-h5 pawn sacrifice",
            "Black prepares exchange sacrifice ...Rxc3 for a winning counterattack",
            "Black's queen and rooks infiltrate along the c-file",
        ],
        drawbacks=[
            "Extremely sharp theoretical razor's edge; requires exact memory",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="sicilian-sveshnikov",
        name="Sicilian Sveshnikov: Main Line (9.Bxf6)",
        eco="B33",
        family="Sicilian Defense",
        variation="Sveshnikov Main Line",
        side="both",
        pgn="1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5 9. Bxf6 gxf6 10. Nd5 f5 11. Bd3 Be6 12. O-O Bxd5 13. exd5 Ne7",
        description="Magnus Carlsen's World Championship choice! Black accepts a backward d6-pawn and doubled f-pawns in exchange for immense piece activity, the bishop pair, and dynamic central counterattacks.",
        key_ideas=[
            "White occupies dominant d5 outpost with 10.Nd5",
            "Black expands with queenside pawns (...b5) and central break (...f5)",
            "Dynamic bishop pair compensation for pawn structure weaknesses",
        ],
        drawbacks=[
            "Black has permanent structural concessions on d5 and d6",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="sicilian-alapin",
        name="Sicilian Alapin: Main Line (2.c3)",
        eco="B22",
        family="Sicilian Defense",
        variation="Alapin Variation Main Line",
        side="white",
        pgn="1. e4 c5 2. c3 d5 3. exd5 Qxd5 4. d4 Nf6 5. Nf3 e6 6. Be2 Be7 7. O-O O-O 8. c4 Qd8 9. Nc3 cxd4 10. Nxd4 Bd7 11. Bf4 Nc6",
        description="The premier Anti-Sicilian! White plays 2.c3 to establish a full d4 pawn center, completely depriving Black of their favorite open Sicilian tactical territory.",
        key_ideas=[
            "Establish solid central dominance with c3 and d4",
            "Smooth piece coordination without allowing tactical dragon attacks",
            "Gain tempo on Black's queen with 8.c4",
            "Pressure d7-c6 squares with 11.Bf4",
        ],
        drawbacks=[
            "Takes away c3 square from knight on move 2",
        ],
        difficulty="Beginner",
    ),
    OpeningScenario(
        id="sicilian-closed",
        name="Closed Sicilian: Grand Prix Attack",
        eco="B23",
        family="Sicilian Defense",
        variation="Grand Prix Attack",
        side="white",
        pgn="1. e4 c5 2. Nc3 Nc6 3. f4 g6 4. Nf3 Bg7 5. Bc4 e6 6. f5 Nge7 7. fxe6 fxe6 8. d3 d5 9. Bb3 O-O 10. O-O Nd4",
        description="White sidesteps open center lines with 2.Nc3 and launches a fast kingside assault with 3.f4 and 6.f5 to tear open Black's kingside defenses.",
        key_ideas=[
            "Aggressive f4 and f5 push to undermine Black's pawn front",
            "Clear f-file for White's rook and queen",
            "Black counters by striking in the center with ...d5",
        ],
        drawbacks=[
            "Leaves e4 pawn sensitive and c3 square committed",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # FRENCH DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="french-winawer",
        name="French Winawer: Main Line Advance",
        eco="C18",
        family="French Defense",
        variation="Winawer Advance Main Line",
        side="both",
        pgn="1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Qg4 Qc7 8. Qxg7 Rg8 9. Qxh7 cxd4 10. Ne2 Nbc6 11. f4 Bd7",
        description="The most uncompromising French variation. Black pins the knight with 3...Bb4 and trades bishops, while White goes pawn-hunting on the kingside with Qg4 and Qxh7.",
        key_ideas=[
            "White exploits Black's missing dark bishop via Qg4 and attacks g7/h7",
            "White gains outside passed h-pawn",
            "Black ravages White's doubled c-pawns and pressures e5/c2",
            "Uncompromising double-edged tactical frenzy",
        ],
        drawbacks=[
            "Both sides' kings remain vulnerable in the center",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="french-advance",
        name="French Advance: Modern 6.a3 System",
        eco="C02",
        family="French Defense",
        variation="Advance Variation Modern 6.a3",
        side="both",
        pgn="1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 Nh6 7. b4 cxd4 8. cxd4 Nf5 9. Bb2 Bd7 10. g4 Nfe7 11. Nc3 Na5",
        description="White locks the center with 3.e5, forming the classic French pawn chain. Black relentlessly hammers the d4 pawn base, while White expands on the queenside with b4 and kingside with g4.",
        key_ideas=[
            "White cements the central wedge e5/d4",
            "Black piles pressure on d4 base via ...Qb6, ...Nc6, and ...Nh6-f5",
            "White expands queenside space with a3 and b4",
            "Aggressive g4 thrust dislodges Black's f5 knight",
        ],
        drawbacks=[
            "Overextended pawns can become vulnerable if Black breaks with ...f6",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="french-tarrasch",
        name="French Tarrasch: Open System (3.Nd2 c5)",
        eco="C07",
        family="French Defense",
        variation="Tarrasch Open System",
        side="white",
        pgn="1. e4 e6 2. d4 d5 3. Nd2 c5 4. exd5 exd5 5. Ngf3 Nc6 6. Bb5 Bd6 7. dxc5 Bxc5 8. O-O Nge7 9. Nb3 Bd6 10. Re1 O-O 11. Bg5 Bg4",
        description="Anatoly Karpov's favorite weapon against the French. White avoids the Winawer pin by playing 3.Nd2, saddling Black with an Isolated Queen's Pawn (IQP) to blockade.",
        key_ideas=[
            "Avoid 3...Bb4 pin with flexible 3.Nd2",
            "Inflict Isolated Queen Pawn (IQP) on Black with 4.exd5 exd5",
            "Blockade d4 outpost with knights and bishops",
            "Pressure Black's pinned minor pieces with Bg5 and Re1",
        ],
        drawbacks=[
            "Black gets free piece activity and open central files",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # CARO-KANN DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="caro-kann-classical",
        name="Caro-Kann Classical: Capablanca Variation",
        eco="B18",
        family="Caro-Kann Defense",
        variation="Classical Capablanca Variation",
        side="both",
        pgn="1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6 11. Bd2 Ngf6 12. O-O-O Be7",
        description="The rock of Gibraltar. Black develops the light bishop outside the pawn chain before locking it with ...e6. White castles queenside and seeks an initiative.",
        key_ideas=[
            "Black activates problem light bishop before playing ...e6",
            "White pushes h4-h5 to gain space and fix Black's bishop on h7",
            "Trade off bishops with Bd3 and castle queenside",
            "Safe, fortress-like structure for Black; enduring central control for White",
        ],
        drawbacks=[
            "Passive position requires patient maneuvering from Black",
        ],
        difficulty="Beginner",
    ),
    OpeningScenario(
        id="caro-kann-advance",
        name="Caro-Kann Advance: Short Variation",
        eco="B12",
        family="Caro-Kann Defense",
        variation="Advance Short Variation",
        side="both",
        pgn="1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 5. Be2 c5 6. Be3 Qb6 7. Nc3 Nc6 8. O-O Qxb2 9. Qe1 cxd4 10. Bxd4 Nxd4 11. Nxd4 Bb4 12. Ndb5 Ba5",
        description="Nigel Short's refined positional recipe. White locks the center with 3.e5, develops harmoniously, and lets Black grab the poison b2-pawn to trap and exploit the Black queen.",
        key_ideas=[
            "Lock the center with 3.e5 and develop flexibly with Be2 and Be3",
            "Entice Black into grabbing b2 pawn, leaving their king stranded",
            "Infiltrate with knights to b5 and d4 outposts",
        ],
        drawbacks=[
            "Queenside pawns are compromised if tactics misfire",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # QUEEN'S GAMBIT
    # -------------------------------------------------------------
    OpeningScenario(
        id="qgd-tartakower",
        name="Queen's Gambit Declined: Tartakower Defense",
        eco="D58",
        family="Queen's Gambit",
        variation="Tartakower Defense",
        side="both",
        pgn="1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5",
        description="Kasparov and Spassky's World Championship weapon. Black solves the problem light bishop by fianchettoing it on b7 after 7...b6, liquidating the center with ...c5.",
        key_ideas=[
            "Solve the French/QGD bad bishop with ...b6 and ...Bb7",
            "Trade minor pieces to ease defensive congestion",
            "Strike in the center with ...c5 to generate queenside counterplay",
            "White targets hanging pawns on c5 and d5",
        ],
        drawbacks=[
            "Black's c5 and d5 pawns can become targets in the endgame",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="slav-classical",
        name="Slav Defense: Classical Main Line",
        eco="D15",
        family="Queen's Gambit",
        variation="Slav Defense Classical Main Line",
        side="both",
        pgn="1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O O-O 9. Qe2 Nbd7 10. e4 Bg6 11. Bd3 Bh5",
        description="Solid as granite. Black supports d5 with ...c6 without blocking the c8 bishop, captures on c4, and pins White's knight with ...Bh5.",
        key_ideas=[
            "White halts Black's ...b5 expansion with 5.a4",
            "White regains pawn with Bxc4 and prepares e4 central breakthrough",
            "Black pins White's kingside knight and controls central dark squares",
        ],
        drawbacks=[
            "Black concedes central space to White's e4/d4 pawn duo",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="semi-slav-meran",
        name="Semi-Slav Defense: Meran Variation",
        eco="D47",
        family="Queen's Gambit",
        variation="Semi-Slav Meran Variation",
        side="both",
        pgn="1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7 6. Bd3 dxc4 7. Bxc4 b5 8. Bd3 a6 9. e4 c5 10. e5 cxd4 11. Nxb5 Nxe5 12. Nxe5 axb5",
        description="One of the richest, most explosive battlegrounds in chess history. Black surrenders the center momentarily to blast open lines with ...b5 and ...c5.",
        key_ideas=[
            "White pushes e4 and e5 to pierce Black's center",
            "Black counters with immediate ...b5 and ...c5 to mobilize queenside",
            "Tremendous tactical fireworks and piece sacrifices",
        ],
        drawbacks=[
            "High theoretical demands; small errors are fatal",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="qga-classical",
        name="Queen's Gambit Accepted: Classical Main Line",
        eco="D27",
        family="Queen's Gambit",
        variation="Queen's Gambit Accepted Classical",
        side="both",
        pgn="1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3 e6 5. Bxc4 c5 6. O-O a6 7. Qe2 b5 8. Bb3 Bb7 9. Rd1 Nbd7 10. Nc3 Qb8 11. h3 Bd6",
        description="Black surrenders the center temporarily with 2...dxc4, only to strike back with ...c5 and ...b5, developing harmoniously with the bishop on b7.",
        key_ideas=[
            "Recapture pawn with tempo via 5.Bxc4",
            "Black expands queenside with ...a6 and ...b5",
            "Active pieces contest d4 and e4 central files",
        ],
        drawbacks=[
            "White enjoys open center lines and easy piece coordination",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # RUY LOPEZ
    # -------------------------------------------------------------
    OpeningScenario(
        id="ruy-lopez-chigorin",
        name="Ruy Lopez: Closed Defense, Chigorin Variation",
        eco="C97",
        family="Ruy Lopez",
        variation="Closed Defense Chigorin Variation",
        side="both",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6",
        description="The classical cornerstone of grandmaster chess. Black drives the Spanish bishop back with ...a6 and ...b5, then establishes queenside space with ...c5 and ...Qc7.",
        key_ideas=[
            "Prevent ...Bg4 pin with prophylactic 9.h3",
            "Maneuver knight Nbd2-f1-g3 toward kingside outposts",
            "Black fights for space on the queenside and pressure on d4",
            "Deep, strategic game with maneuvering on both flanks",
        ],
        drawbacks=[
            "Very long theoretical maneuvering requiring patience",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="ruy-lopez-berlin",
        name="Ruy Lopez: Berlin Defense, Endgame Setup",
        eco="C67",
        family="Ruy Lopez",
        variation="Berlin Defense Main Line",
        side="both",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. Nc3 h6 10. h3 Ke8 11. Bf4 Be6",
        description="The legendary 'Berlin Wall' used by Vladimir Kramnik to dethrone Garry Kasparov. Black trades queens on move 8 and erects an unbreachable endgame fortress.",
        key_ideas=[
            "Early queen trade leads straight into a master-level endgame",
            "Black possesses the bishop pair and solid pawn structure",
            "White seeks to exploit the kingside 4 vs 3 pawn majority",
        ],
        drawbacks=[
            "Black loses castling rights; king remains on e8/d8",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="ruy-lopez-marshall",
        name="Ruy Lopez: Marshall Attack",
        eco="C89",
        family="Ruy Lopez",
        variation="Marshall Attack",
        side="black",
        pgn="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. c3 d5 9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 c6 12. d4 Bd6 13. Re1 Qh4",
        description="Frank Marshall kept this gambit secret for 10 years! Black sacrifices a pawn on d5 to launch an irresistible kingside attack with ...Bd6 and ...Qh4.",
        key_ideas=[
            "Black sacrifices the e5 pawn for devastating kingside initiative",
            "Mating threats on h2 with bishop and queen battery",
            "White must defend resourcefully with g3 and Re4/Qf3",
        ],
        drawbacks=[
            "White can steer into quiet anti-Marshall sidelines (8.a4 or 8.h3)",
        ],
        difficulty="Advanced",
    ),

    # -------------------------------------------------------------
    # KING'S INDIAN DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="kid-classical-mar-del-plata",
        name="King's Indian Defense: Classical Mar del Plata",
        eco="E99",
        family="King's Indian Defense",
        variation="Classical Mar del Plata Variation",
        side="both",
        pgn="1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Be3 f5 11. f3 f4 12. Bf2 g5 13. Nd3 Ng6",
        description="The ultimate mutual race! Black locks the center with ...Ne7 and unleashes an all-out pawn storm (...f5, ...g5, ...h5) straight at White's king, while White storms the queenside with c5.",
        key_ideas=[
            "Locked center creates opposite-wing attacking race",
            "Black marches kingside pawns (...f4, ...g5, ...h5) to mate White",
            "White breaks through on queenside with c5, attacking b7 and c7",
        ],
        drawbacks=[
            "Black's king position is weakened; queenside is ceded to White",
        ],
        difficulty="Advanced",
    ),
    OpeningScenario(
        id="kid-samisch",
        name="King's Indian Defense: Sämisch Variation",
        eco="E81",
        family="King's Indian Defense",
        variation="Sämisch Variation",
        side="white",
        pgn="1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f3 O-O 6. Be3 e5 7. d5 c6 8. Qd2 cxd5 9. cxd5 a6 10. O-O-O Nbd7 11. Kb1 b5",
        description="White blunts Black's piece play with 5.f3, cements e4, and prepares opposite-side castling with Be3, Qd2, and a kingside pawn offensive.",
        key_ideas=[
            "Blunt Black's knight with 5.f3 and construct solid central foundation",
            "Castle queenside and prepare g4-h4 pawn storm against Black's king",
            "Black strikes back with ...c6 and ...b5 queenside counterplay",
        ],
        drawbacks=[
            "Deprives the g1 knight of its natural f3 square",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # LONDON SYSTEM
    # -------------------------------------------------------------
    OpeningScenario(
        id="london-classical",
        name="London System: Classical Main Line vs 1...d5",
        eco="D02",
        family="London System",
        variation="Classical vs 1...d5",
        side="white",
        pgn="1. d4 d5 2. Bf4 Nf6 3. e3 c5 4. c3 Nc6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3 O-O 8. Bd3 b6 9. Ne5 Bb7 10. f4 Ne7 11. Qf3 Nf5",
        description="The modern chess player's most dependable weapon. White constructs an unbreakable pawn pyramid on c3-d4-e3 with the dark-squared bishop dominating from f4.",
        key_ideas=[
            "Form rock-solid c3/d4/e3 central pawn pyramid",
            "Anchor knight on e5 outpost supported by f4 (Pillsbury attack)",
            "Retreat bishop to g3 when challenged to open h-file if taken",
            "Harmonious piece coordination with virtually zero opening risk",
        ],
        drawbacks=[
            "Less ambitious than the Queen's Gambit; Black equalizes with solid play",
        ],
        difficulty="Beginner",
    ),
    OpeningScenario(
        id="london-vs-kings-indian",
        name="London System: vs King's Indian Setup",
        eco="A48",
        family="London System",
        variation="vs King's Indian Setup",
        side="white",
        pgn="1. d4 Nf6 2. Bf4 g6 3. e3 Bg7 4. Nf3 O-O 5. Be2 d6 6. h3 Nbd7 7. O-O Qe8 8. Bh2 e5 9. c4 Qe7 10. Nc3 c6 11. b4 Re8",
        description="How to wield the London against hypermodern setups. White maintains central composure and queenside expansion (c4, b4) while blunting Black's ...e5 break.",
        key_ideas=[
            "Tuck bishop safely on h2 after Black pushes ...e5",
            "Expand on queenside with c4 and b4 to control space",
            "Neutralize Black's kingside initiative with calm prophylactic play",
        ],
        drawbacks=[
            "Allows Black easy development and freedom in the center",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # ENGLISH OPENING
    # -------------------------------------------------------------
    OpeningScenario(
        id="english-symmetrical",
        name="English Opening: Symmetrical Variation",
        eco="A34",
        family="English Opening",
        variation="Symmetrical Variation",
        side="both",
        pgn="1. c4 c5 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 5. Nf3 Nf6 6. O-O O-O 7. d4 cxd4 8. Nxd4 Nxd4 9. Qxd4 d6 10. Qd3 a6 11. Bd2 Rb8",
        description="Positional masterclass. Both players fianchetto king's bishops and contest the central light squares in a battle of maneuvering and pawn structure nuance.",
        key_ideas=[
            "Dominant bishop on g2 controlling central diagonal",
            "Break open center with timely d4 strike",
            "Queenside piece pressure along semi-open c-file",
        ],
        drawbacks=[
            "High drawing tendency if White fails to create imbalances",
        ],
        difficulty="Intermediate",
    ),
    OpeningScenario(
        id="english-four-knights",
        name="English Opening: Four Knights Reversed Sicilian",
        eco="A28",
        family="English Opening",
        variation="Four Knights Reversed Sicilian",
        side="white",
        pgn="1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 Bb4 5. Bg2 O-O 6. O-O e4 7. Ng5 Bxc3 8. bxc3 Re8 9. f3 exf3 10. Nxf3 d5 11. cxd5 Qxd5",
        description="White plays a Sicilian Defense with an extra tempo! Black tries 4...Bb4 and 6...e4 to seize immediate space, while White chips away with f3.",
        key_ideas=[
            "Undermine Black's e4 spearhead with 9.f3",
            "Fianchetto bishop on g2 exerts long-range pressure",
            "Control semi-open f-file and central squares with knights",
        ],
        drawbacks=[
            "Doubled c-pawns require active piece play to defend",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # SCOTCH GAME
    # -------------------------------------------------------------
    OpeningScenario(
        id="scotch-classical",
        name="Scotch Game: Classical Variation (4...Bc5)",
        eco="C45",
        family="Scotch Game",
        variation="Classical Variation 4...Bc5",
        side="both",
        pgn="1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6 6. c3 Nge7 7. Bc4 Ne5 8. Be2 Qg6 9. O-O d6 10. f3 O-O 11. Kh1 Bb6",
        description="Garry Kasparov revived the Scotch Game with devastating effect. White blows the center open with 3.d4 and reinforces the d4 knight with Be3 and c3.",
        key_ideas=[
            "Open center immediately on move 3 to avoid slow Italian maneuvering",
            "Maintain strong central outpost on d4 with 6.c3",
            "Control active diagonals and target Black's queen",
        ],
        drawbacks=[
            "Early liquidation can lead to quick simplifications if White isn't ambitious",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # PETROV DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="petrov-classical",
        name="Petrov Defense: Classical Attack (3.Nxe5)",
        eco="C42",
        family="Petrov Defense",
        variation="Classical Attack 3.Nxe5",
        side="both",
        pgn="1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4 d5 6. Bd3 Be7 7. O-O Nc6 8. c4 Nb4 9. Be2 O-O 10. Nc3 Bf5 11. a3 Nxc3 12. bxc3 Nc6",
        description="The ultimate drawing weapon against 1.e4. Black counters 2.Nf3 by mirroring with 2...Nf6, creating symmetrical, resilient center defenses.",
        key_ideas=[
            "White occupies d4 and drives Black's knight with 8.c4 and 11.a3",
            "Black maintains rock-solid central outpost on d5",
            "Precision piece maneuvering in symmetrical pawn structures",
        ],
        drawbacks=[
            "Symmetrical nature requires patience to generate winning chances",
        ],
        difficulty="Intermediate",
    ),

    # -------------------------------------------------------------
    # SCANDINAVIAN DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="scandinavian-main",
        name="Scandinavian Defense: Main Line (2...Qxd5 3.Nc3 Qa5)",
        eco="B01",
        family="Scandinavian Defense",
        variation="Main Line 3...Qa5",
        side="both",
        pgn="1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6 6. Bc4 Bf5 7. Bd2 e6 8. Nd5 Qd8 9. Nxf6+ Qxf6 10. Qe2 Bg4 11. O-O-O Nd7",
        description="Black challenges White's e4 pawn on move 1! White develops rapidly with tempo against Black's queen, while Black aims for a solid Caro-Kann-like pawn structure.",
        key_ideas=[
            "Gain development tempo against Black's early queen with 3.Nc3",
            "Pin and pressure with Bc4 and Bd2 discovery batteries",
            "Castle queenside with 11.O-O-O for rapid attacking play",
        ],
        drawbacks=[
            "Black's queen moves repeatedly in the opening",
        ],
        difficulty="Beginner",
    ),

    # -------------------------------------------------------------
    # GRUNFELD DEFENSE
    # -------------------------------------------------------------
    OpeningScenario(
        id="grunfeld-exchange",
        name="Grünfeld Defense: Exchange Variation",
        eco="D85",
        family="Grünfeld Defense",
        variation="Exchange Variation",
        side="both",
        pgn="1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7 7. Bc4 c5 8. Ne2 O-O 9. O-O Nc6 10. Be3 Bg4 11. f3 Na5 12. Bd3 cxd4 13. cxd4 Be6",
        description="Peter Svidler and Garry Kasparov's favorite hypermodern defense. Black allows White a massive e4/d4 pawn center, only to systematically bombard it with ...c5 and ...Bg7.",
        key_ideas=[
            "White builds massive classical pawn center with e4 and c3/d4",
            "Black relentlessly bombards d4 pawn base with ...c5, ...Nc6, and ...Bg7",
            "Sharp, modern tactical battle over central pawn integrity",
        ],
        drawbacks=[
            "White's center can roll forward if Black's pressure slackens",
        ],
        difficulty="Advanced",
    ),
]


def get_curated_scenarios() -> list[OpeningScenario]:
    """Return all curated deep scenarios."""
    return list(CURATED_SCENARIOS)


def get_scenario_by_id(scenario_id: str) -> Optional[OpeningScenario]:
    """Find a curated scenario by unique id."""
    for s in CURATED_SCENARIOS:
        if s.id == scenario_id:
            return s
    return None


def get_scenarios_for_opening(
    eco: str,
    opening_name: str,
    family: str = "",
    min_moves: int = 10,
    max_results: int = 8,
) -> list[OpeningScenario]:
    """
    Find all matching scenarios for an opening.
    Combines high-pedagogy curated scenarios with deep master lines from the database.
    """
    from services.openings_db import get_openings_db

    db = get_openings_db()
    db.ensure_loaded()

    name_clean = opening_name.lower().strip()
    eco_clean = eco.upper().strip()
    fam_clean = (family or opening_name.split(":")[0]).lower().strip()

    matched_scenarios: list[OpeningScenario] = []
    seen_ids = set()

    # 1. Match from curated scenarios first (highest priority and pedagogy)
    for s in CURATED_SCENARIOS:
        s_fam = s.family.lower()
        s_name = s.name.lower()
        # Direct match on eco or family or name
        if (
            s.eco == eco_clean
            or s_fam == fam_clean
            or fam_clean in s_fam
            or s_fam in fam_clean
            or name_clean in s_name
            or s_name in name_clean
        ):
            if s.id not in seen_ids:
                matched_scenarios.append(s)
                seen_ids.add(s.id)

    # 2. If we need more scenarios or no curated scenario matched, find deep siblings from database
    if len(matched_scenarios) < max_results:
        # Search db for matching deep lines (move_count >= min_moves)
        candidates = []
        for e in db._entries:
            if e.move_count < min_moves:
                continue
            e_fam = e.family.lower()
            e_name = e.name.lower()

            # Match family or root name
            is_match = False
            if fam_clean and (fam_clean == e_fam or fam_clean in e_fam or e_fam in fam_clean):
                is_match = True
            elif eco_clean and e.eco == eco_clean:
                is_match = True
            elif name_clean and name_clean in e_name:
                is_match = True

            if is_match:
                candidates.append(e)

        # Sort candidates by move_count descending (deepest lines first)
        candidates.sort(key=lambda x: -x.move_count)

        for c in candidates:
            if len(matched_scenarios) >= max_results:
                break
            scenario_id = f"{c.eco.lower()}-{c.name.lower().replace(' ', '-').replace(':', '').replace(',', '').replace('/', '-')[:40]}"
            if scenario_id in seen_ids:
                continue

            # Synthesize an OpeningScenario from DB entry
            sc = OpeningScenario(
                id=scenario_id,
                name=c.name,
                eco=c.eco,
                family=c.family,
                variation=c.variation or c.name,
                side=c.side,
                pgn=c.pgn,
                description=f"Deep master continuation ({c.move_count} moves). Reaches the critical middlegame tabiya for {c.name}.",
                key_ideas=[
                    "Follow established grandmaster move orders into the middlegame",
                    f"Master the pawn structure and piece placement for {c.name}",
                ],
                difficulty="Intermediate" if c.move_count < 18 else "Advanced",
                move_count=c.move_count,
            )
            matched_scenarios.append(sc)
            seen_ids.add(scenario_id)

    # 3. If still empty, create at least one scenario from the opening itself
    if not matched_scenarios:
        op = db.find_opening(eco, opening_name)
        if op:
            fallback = OpeningScenario(
                id=f"{op.eco.lower()}-{op.name.lower().replace(' ', '-')[:30]}",
                name=op.name,
                eco=op.eco,
                family=op.family,
                variation=op.variation,
                side=op.side,
                pgn=op.pgn,
                description=f"Main theoretical continuation for {op.name}.",
                key_ideas=["Follow standard opening principles", "Control the center"],
                difficulty="Beginner" if op.move_count < 8 else "Intermediate",
                move_count=op.move_count,
            )
            matched_scenarios.append(fallback)

    return matched_scenarios


def parse_scenario_moves(scenario: OpeningScenario) -> list[dict]:
    """Parse scenario PGN into a sequence of move dicts with FENs."""
    board = chess.Board()
    moves = []
    tokens = scenario.pgn.split()
    for token in tokens:
        if token.endswith(".") or (token[0].isdigit() and "." in token):
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
            logger.warning(f"Failed to parse scenario move '{token}': {e}")
            break
    return moves
