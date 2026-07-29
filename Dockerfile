# Production single-container image: API + built Arabic PWA + downloads.
# Build: docker build -t motman .
# Run:   docker run -p 8000:8000 -e PUBLIC_BASE_URL=https://your.host motman
FROM node:22-bookworm AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/ /app/backend/
COPY docs/ /app/docs/
COPY --from=web /web/dist /app/frontend/dist
RUN mkdir -p /app/frontend/public/downloads /data
ENV PYTHONPATH=/app/backend
ENV CLOUD_DATABASE_URL=sqlite:////data/motman_cloud.db
ENV DATABASE_URL=sqlite+aiosqlite:////data/motman.db
ENV PUBLIC_BASE_URL=
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -sf http://127.0.0.1:8000/healthz || exit 1
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
