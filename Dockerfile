# ==========================================
# Stage 1: Build React Frontend Single Page App
# ==========================================
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Python Backend & SPA Host
# ==========================================
FROM python:3.12-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STOCKFISH_PATH=/usr/games/stockfish \
    CHESS_MODEL_PATH=/app/models/best_chess_policy_model.pt \
    DB_PATH=/app/data/chess_analyzer.db \
    PORT=8000

# Install Stockfish engine and curl for diagnostics
RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ensure directories for SQLite data, neural models, and static SPA exist
RUN mkdir -p /app/data /app/models /app/static

# Install CPU PyTorch wheel first to optimize Docker layer caching
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source code (secrets strictly excluded via .dockerignore)
COPY backend/ ./

# Copy built frontend assets from Stage 1 into the backend static directory
COPY --from=frontend-builder /app/frontend/dist ./static

# Copy model directory (includes .gitkeep and optionally trained checkpoint)
COPY training/models/ /app/models/

EXPOSE 8000

# Start Uvicorn listening on dynamic $PORT (fallback to 8000 locally/OCI)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
