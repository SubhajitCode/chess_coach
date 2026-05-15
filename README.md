# Chess Analyzer ♛

A full-stack AI-powered chess coaching app. Import games from Chess.com or Lichess, analyze them with Stockfish, and get personalized coaching from an LLM.

## Features
- 📥 Fetch games from **Chess.com** or **Lichess**
- 🔍 Move-by-move analysis with **Stockfish 18** (local)
- 📊 Evaluation bar, eval chart, and move classifications (best/excellent/good/inaccuracy/mistake/blunder)
- 🎓 AI coaching feedback via **OpenRouter** or **Google AI Studio**
- ⌨️ Keyboard navigation (← → arrow keys)

## Prerequisites
- Stockfish: `brew install stockfish`
- Python 3.11 or 3.12 (not 3.14+)
- Node.js 18+
- A provider key for **OpenRouter** or **Google AI Studio**

## Setup

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env: choose LLM_PROVIDER and add the matching API key
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Backend runs at: http://localhost:8000

### VS Code debugging
Open the repository root in VS Code and use the included Run and Debug profile:

1. Select **Python: FastAPI backend**
2. Start debugging to launch `uvicorn main:app --reload` from `backend/`
3. Set breakpoints anywhere under `backend/` and call the API from the frontend or browser

The workspace is configured to use `backend/venv/bin/python` and load environment variables from `backend/.env`.

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
LLM_PROVIDER=openrouter
LLM_MODEL=meta-llama/llama-3.3-8b-instruct:free
OPENROUTER_API_KEY=your_openrouter_key_here
```

Or switch to Google AI Studio:

```env
STOCKFISH_PATH=/opt/homebrew/bin/stockfish
LLM_PROVIDER=google_ai_studio
LLM_MODEL=gemini-3-flash-preview
GOOGLE_AI_STUDIO_API_KEY=your_google_ai_studio_key_here
# or GEMINI_API_KEY=your_google_ai_studio_key_here
```

Optional overrides:

```env
LLM_BASE_URL=
OPENROUTER_BASE_URL=
GOOGLE_AI_STUDIO_BASE_URL=
```

## Usage
1. Open http://localhost:5173
2. Select Chess.com or Lichess, enter your username
3. Pick a month (Chess.com) and click **Fetch Games**
4. Click any game to open the Analysis view
5. Click **▶ Analyze** to run Stockfish (takes ~30–60s for a full game)
6. Step through moves with ← → keys or click the move table
7. Click **Get Coaching** for AI coaching feedback

## Example LLM Models
**OpenRouter:** `meta-llama/llama-3.3-8b-instruct:free`, `google/gemma-3-4b-it:free`, `mistralai/mistral-7b-instruct:free`

**Google AI Studio:** `gemini-3-flash-preview`, `gemini-2.5-flash`
