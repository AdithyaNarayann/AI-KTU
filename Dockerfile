# ==============================================================================
# Stage 1: Build React/TypeScript Frontend
# ==============================================================================
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Production Python Runtime
# ==============================================================================
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code and datasets
COPY app/ ./app/
COPY data/ ./data/

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose application port
EXPOSE 8000

# Run Uvicorn binding to dynamic $PORT (required by Render/Railway/Cloud Run) or 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
