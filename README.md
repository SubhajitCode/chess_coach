# Chess Analyzer ♛

A full-stack AI-powered chess coaching app. Import games from Chess.com or Lichess, analyze them with Stockfish, and get personalized coaching from an LLM.

## Features
- 📥 Fetch games from **Chess.com** or **Lichess**
- 🔍 Move-by-move analysis with **Stockfish 18** (local)
- 📊 Evaluation bar, eval chart, and move classifications (best/excellent/good/inaccuracy/mistake/blunder)
- 🎓 AI coaching feedback via **OpenRouter** (free LLM models)
- ⌨️ Keyboard navigation (← → arrow keys)

## Prerequisites
- Stockfish: `brew install stockfish`
- Python 3.11 or 3.12 (not 3.14+)
- Node.js 18+
- [OpenRouter API key](https://openrouter.ai) (free tier available)

## Setup

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env: add your OPENROUTER_API_KEY
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Backend runs at: http://localhost:8000

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at: http://localhost:5173

## Environment Variables (`backend/.env`)
```
STOCKFISH_PATH=/opt/homebrew/bin/stockfish
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=meta-llama/llama-3.3-8b-instruct:free
```

## Usage
1. Open http://localhost:5173
2. Select Chess.com or Lichess, enter your username
3. Pick a month (Chess.com) and click **Fetch Games**
4. Click any game to open the Analysis view
5. Click **▶ Analyze** to run Stockfish (takes ~30–60s for a full game)
6. Step through moves with ← → keys or click the move table
7. Click **Get Coaching** for AI coaching feedback

## Free LLM Models (OpenRouter)
- `meta-llama/llama-3.3-8b-instruct:free`
- `google/gemma-3-4b-it:free`
- `mistralai/mistral-7b-instruct:free`
