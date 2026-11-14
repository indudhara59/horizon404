# Horizon404: one container serving the FastAPI backend and the built React app.
# Listens on $PORT (Render, Cloud Run, ...) or 7860 by default. Build locally with:
#   docker build -t horizon404 . && docker run -p 7860:7860 horizon404

# ---- frontend build ----
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- backend + data ----
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 HORIZON404_STATIC=/app/frontend/dist
RUN useradd -m -u 1000 user
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# Download the JPL ephemeris / lunar frame kernels and the LOLA south-pole DEM at build time.
RUN python -c "from horizon404.ephem import _context; _context()" \
 && python -m scripts.download_dem \
 && chown -R user /app

COPY --from=web /web/dist /app/frontend/dist

USER user
EXPOSE 7860
CMD ["sh", "-c", "uvicorn horizon404.api:app --host 0.0.0.0 --port ${PORT:-7860}"]
