FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.4 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_CREATE=false \
    STOCKFISH_PATH=/usr/games/stockfish \
    CHESS_MODEL_PATH=/app/models/best_chess_policy_model.pt

# Install system dependencies (stockfish engine, curl for poetry)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 -
ENV PATH="$POETRY_HOME/bin:$PATH"

# Set working directory
WORKDIR /app

# Create directories for persistent database and neural model checkpoints
RUN mkdir -p /app/data /app/models

# Install lightweight CPU-optimized PyTorch first
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Copy dependency files
COPY pyproject.toml ./

# Install remaining dependencies via Poetry
RUN poetry install --no-interaction --no-ansi --no-root

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
