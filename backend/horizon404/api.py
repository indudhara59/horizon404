"""Horizon404 HTTP API.

Run:  uvicorn horizon404.api:app --reload --port 8000
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .horizon import horizon_mask
from .sites import BY_ID, SITES
from .terrain import local_terrain
from .visibility import analyze, best_dates, year_codes

app = FastAPI(title="Horizon404 API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"]
)

Lat = Query(..., ge=-90, le=90, description="Selenographic latitude (deg)")
Lon = Query(..., ge=-360, le=360, description="East longitude (deg)")


def _parse_start(start: str | None) -> datetime:
    if not start:
        return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    try:
        dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(400, f"bad start time: {start}") from e
    if not (1900 <= dt.year <= 2049):
        raise HTTPException(400, "start must be between 1900 and 2049 (ephemeris range)")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/sites")
def sites():
    return SITES


@app.get("/api/horizon")
def horizon(lat: float = Lat, lon: float = Lon, height: float = Query(2.0, ge=0, le=100)):
    return horizon_mask(lat, lon, height).to_dict()


@app.get("/api/year")
def year(lat: float = Lat, lon: float = Lon, start: str | None = None,
         height: float = Query(2.0, ge=0, le=100)):
    return year_codes(lat, lon, _parse_start(start), 365.0, height)


@app.get("/api/terrain")
def terrain(lat: float = Lat, lon: float = Lon, half_km: float = Query(20, ge=2, le=40)):
    t = local_terrain(round(lat, 5), round(lon % 360, 5), half_km)
    if t is None:
        raise HTTPException(404, "3D terrain is available for south-pole sites (75°S to the pole)")
    return t


@app.get("/api/analyze")
def analyze_site(
    lat: float = Lat,
    lon: float = Lon,
    start: str | None = None,
    days: float = Query(29.53, gt=0, le=366),
    step: float = Query(60, ge=10, le=1440, description="step in minutes"),
    height: float = Query(2.0, ge=0, le=100, description="observer height above terrain (m)"),
    track: bool = True,
):
    if days * 24 * 60 / step > 20000:
        raise HTTPException(400, "too many samples; increase step or shorten days")
    return analyze(lat, lon, _parse_start(start), days, step, height, include_track=track)


@app.get("/api/sites/{site_id}/analyze")
def analyze_named(site_id: str, start: str | None = None, days: float = 29.53, step: float = 60):
    s = BY_ID.get(site_id)
    if not s:
        raise HTTPException(404, "unknown site")
    return {"site_info": s, **analyze_site(s["lat"], s["lon"], start, days, step, 2.0, True)}


@app.get("/api/best-dates")
def best(
    lat: float = Lat,
    lon: float = Lon,
    start: str | None = None,
    months: int = Query(12, ge=1, le=24),
    mission_days: float = Query(14, gt=0, le=60),
    height: float = Query(2.0, ge=0, le=100, description="observer height above terrain (m)"),
):
    return best_dates(lat, lon, _parse_start(start), months, mission_days, observer_height_m=height)


# Serve the built React app from the same origin when it is present (Docker / Hugging Face Space).
STATIC_DIR = Path(os.environ.get("HORIZON404_STATIC", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
