# Chess AI Training: Human-Aligned Policy & Value Model

## 1. Project Objective & Vision

This subproject implements a **Human-Aligned Chess Policy & Value Network** (inspired by the Maia Chess architecture) optimized for training on **Apple Silicon (Mac mini MPS)**.

Unlike Stockfish (which evaluates deep calculation trees with superhuman moves) or pure AlphaZero self-play (which invents esoteric tactics), this model is trained via **supervised behavioral cloning on human games within specific rating brackets** (e.g., 1400–1800 Elo).

### Key Goals for AI Coaching
1. **Human-Calibrated Move Suggestions**: Suggest moves that a skilled human (+200 to +400 Elo above the user) would naturally play.
2. **Blunder & Blindspot Diagnosis**: Distinguish between natural human mistakes and unforced tactical blunders by measuring divergence between predicted human move probability $\pi(a|s)$ and value drop $\Delta v(s)$.
3. **Sparring Partner**: Serve as a realistic sparring opponent that plays natural chess without artificial handicap artifacts or random blunder injection.

---

## 2. Model Architecture

```
Board State (8×8×18 Tensor)
            │
            ▼
┌───────────────────────────────┐
│     Convolutional Trunk       │
│  Conv2d(18, 128, 3x3) + BN    │
│  8x Residual Blocks (128 ch)  │
└───────────────┬───────────────┘
                ├───────────────────────────────┐
                ▼                               ▼
  ┌───────────────────────────┐   ┌───────────────────────────┐
  │        Policy Head        │   │        Value Head         │
  │  Conv2d(128, 32, 1x1)     │   │  Conv2d(128, 1, 1x1)      │
  │  Linear(2048, 1968)       │   │  Linear(64, 128) + ReLU   │
  │  Softmax Output π(a|s)    │   │  Linear(128, 1) + Tanh    │
  └───────────────────────────┘   └───────────────────────────┘
```

* **Parameters**: $\approx 2.4 \text{ Million}$
* **Inference Speed**: $< 1.5 \text{ ms/position}$ on Apple Silicon GPU (MPS)

---

## 3. Data Representation & Encodings

### 3.1 Board Input Tensor (`8 × 8 × 18`)
Oriented always from the **perspective of the active player** (board flipped if Black to move):
* `Planes 0–5`: Active player's pieces (`P, N, B, R, Q, K`)
* `Planes 6–11`: Opponent's pieces (`p, n, b, r, q, k`)
* `Planes 12–15`: Castling rights (`Active_OO`, `Active_OOO`, `Opp_OO`, `Opp_OOO`)
* `Plane 16`: En-passant target square
* `Plane 17`: Normalized 50-move rule counter (`halfmove_clock / 100.0`)

### 3.2 Move Encoding (`1,968` UCI Actions)
Fixed mapping of all physically valid UCI moves (from-square $\to$ to-square + pawn promotions) to a 1D index $[0 \dots 1967]$.

---

## 4. Mac mini (Apple Silicon / MPS) Training Strategy

### Avoiding the CPU Bottleneck
* **Problem**: Decompressing `.pgn.zst` games and parsing moves with `python-chess` on the CPU during the training loop starves the Apple GPU ($< 10\%$ MPS utilization).
* **Solution**: **Two-Stage Pipeline**
  1. **Offline Preprocessing**: Multiprocess PGN extraction into serialized binary tensors stored in **HDF5 (`.h5`)** or **Memory-Mapped NumPy (`.npy`)** chunks.
  2. **Unified Memory Streaming**: PyTorch `DataLoader` streams pre-encoded tensors directly to MPS with `pin_memory=False` for sustained 100% GPU saturation.

### Hyperparameters & Loss
$$\mathcal{L}_{total} = \mathcal{L}_{policy}(\mathbf{y}_\pi, \hat{\mathbf{y}}_\pi) + \lambda_v (y_v - \hat{v})^2 + c \|\theta\|^2_2$$

* **Batch Size**: 256 or 512
* **Optimizer**: AdamW ($\beta_1=0.9, \beta_2=0.999$, weight decay $10^{-4}$)
* **Learning Rate**: $10^{-3} \to 10^{-5}$ (Cosine Annealing)
* **Dataset Target**: 500,000 games ($\approx 5\text{M}$ to $25\text{M}$ positions) from Lichess Open Database filtered to target Elo band.

---

## 5. File Structure & Implementation Roadmap

```
training/
├── README.md               # [This File] Memory & Project Objective
├── requirements.txt        # Training dependencies (torch, python-chess, zstandard, h5py)
├── chess_encoder.py        # Board-to-tensor and move-to-index encoding logic
├── download_games.py       # Lichess PGN downloader & filter (Elo rating, time control)
├── preprocess.py           # Multi-worker PGN parser -> HDF5/MMap binary datasets
├── model.py                # ResNet Dual-Head PyTorch architecture
├── dataset.py              # PyTorch Dataset & DataLoader for HDF5 / MMap streaming
├── train.py                # Training loop with MPS acceleration, metrics, & checkpoints
└── coach_eval.py           # Evaluation script: Top-1/Top-3 human accuracy & blunder test
```

### Phase Milestones

- [x] **Phase 1: Environment & Encoders**
  - Install dependencies (`python-chess`, `torch`, `zstandard`, `h5py`, `matplotlib`).
  - Implement `chess_encoder.py` (canonical bitboard conversion & 1,880 canonical UCI move lookup with mirror-invariance).
- [x] **Phase 2: Data Ingestion & Preprocessing**
  - Implement `download_games.py` to stream & filter Lichess database dumps by Elo rating.
  - Implement `dataset.py` with fast HDF5 binary tensor extraction for 100% GPU saturation.
- [x] **Phase 3: Network Architecture, Notebook & Trainer**
  - Implement `model.py` (Dual-head ResNet with policy & value heads).
  - Implement `train_reinforcement_learning_model.ipynb` with interactive step-by-step training, visualizations, evaluation, and sparring.
  - Implement `train.py` (CLI trainer with MPS acceleration and checkpointing).
  - Implement `coach_eval.py` (Tactical puzzle test suite & move diagnostic tool).
- [ ] **Phase 4: Integration into Chess Analyzer App**
  - Export trained model weights to `backend/models/`.
  - Expose API endpoints in FastAPI backend for human-calibrated move analysis and coaching tips.
