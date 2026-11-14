# Horizon404 — Lunar Landing Site Navigator

> *Will my lander have sunlight and a line to Earth — and for how long?*

**NASA Space Apps Challenge 2026 · Team Orbit404 · Challenge: Lunar Landing Site Navigator**

**Live demo: https://horizon404.vercel.app**

Horizon404 lets mission planners, educators and the public compare lunar landing sites and dates
in a few clicks. For any site and date range it shows where the **Sun** and **Earth** sit relative to the
**real terrain horizon**, and turns that into the numbers that decide a mission:

- time until **sunset** and **Earthset**
- **solar elevation** and share of time in sunlight (power)
- share of time with **Earth in view** (direct-to-Earth communication)
- share of time with **power + comms together**, and the longest dark period

Tools like Quickmap, Moon Trek and JPL Horizons hold this information but are built for specialists.
Horizon404 aims for **Horizons-grade answers in three clicks**.

## Features

- **Explore:** pick a curated site (south-pole Artemis regions, IM-1, Apollo, Chandrayaan-3, Chang'e-4 and more),
  type coordinates, or click anywhere on a shaded-relief LOLA map of the south pole.
- **Sky view from the lander:** a 360° panorama of the real terrain skyline with the Sun's and Earth's paths and a
  play/scrub timeline, so you can *see* the Sun skimming the ridge line and Earth bobbing behind hills.
- **Mission metrics:** power + comms %, sunlight %, Earth-in-view %, time to sunset/sunrise and Earthset/Earthrise,
  longest night, longest comms blackout, solar power index.
- **Operational windows:** Gantt bands for sunlight, Earth visibility and both together.
- **Best landing dates:** power + comms for a 14-day mission starting on every day of the next 12 months; click a bar
  to load that date.
- **Compare:** up to four site/date scenarios side by side on a common "days after landing" axis, which answers
  "our launch slipped two weeks, is the site still OK?" directly.
- **Learn:** why the south pole is so hard, in plain language, plus the method.

### Results for 2026 (one year, 2 m mast)

| Site | Sunlit | Earth in view | Power + comms |
|---|---|---|---|
| Shackleton connecting ridge | 86.6 % | 51.8 % | 45.8 % |
| Malapert Massif summit | 71.0 % | 73.2 % | 47.6 % |
| Mons Mouton summit | 59.6 % | 100 % | 59.6 % |
| Geographic south pole | 36.2 % | 39.3 % | 14.2 % |
| Shackleton crater floor | 0 % | 0 % | 0 % |
| Apollo 11 (reference) | 51.5 % | 100 % | 51.5 % |
| Chang'e-4, far side (reference) | 49.6 % | 0 % | 0 % |

## How it works

1. **Ephemeris:** Sun and Earth azimuth/elevation from any selenographic lat/lon, computed with
   [Skyfield](https://rhodesmill.org/skyfield/) using the JPL DE421 ephemeris and the NAIF lunar
   Mean-Earth frame (libration included). Validated against **JPL Horizons**: max difference
   **0.00001°** (see `backend/scripts/validate_horizons.py`).
2. **Terrain horizon:** a skyline mask built from the LOLA `LDEM_75S_120M` south-pole elevation
   model (75°S–pole, 120 m/px). 720 great-circle rays out to 200 km, exact elevation angles on a
   spherical Moon (curvature included, no atmosphere), max per 1° azimuth bin. ~0.1 s per site.
   Sanity checks: Shackleton crater floor is permanently shadowed (walls ~21° high), and the
   Shackleton connecting ridge is sunlit **82 %** of 2026, in line with published ~80–90 %.
3. **Visibility & metrics:** the visible fraction of the solar disk above the skyline drives power; Earth's
   centre above the skyline means direct-to-Earth comms. Durations, longest gaps and windows are derived
   from the time series. A full lunar day takes ~0.2 s; ranking 365 landing dates takes ~0.05 s.

## Architecture

```
backend/   Python · Skyfield · NumPy · FastAPI
  horizon404/ephem.py       Sun & Earth az/el from a lunar site (DE421 + lunar ME frame)
  horizon404/dem.py         LOLA polar-stereographic DEM reader
  horizon404/horizon.py     terrain skyline ray caster
  horizon404/visibility.py  metrics, windows, best-date finder
  horizon404/api.py         /api/sites · /api/analyze · /api/horizon · /api/best-dates
frontend/  React · TypeScript · Vite · Plotly
```

## Run locally

```bash
# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q tests            # JPL kernels + packed LOLA DEM ship in backend/data
uvicorn horizon404.api:app --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5173 (set VITE_API_URL to point elsewhere)
```

Deployment: `vercel.json` deploys the frontend and the FastAPI backend as two Vercel services on one
domain (`/` and `/api`). The `Dockerfile` builds the same app as a single container for any other host.

The raw LOLA DEM (116 MB) is too big for git, so `backend/data/dem_packed/` holds a lossless
row-delta + zlib copy (59 MB, unpacks in 0.3 s); `python -m scripts.download_dem` fetches the
original from PDS and `python -m scripts.pack_dem` rebuilds the packed copy.

Optional: `python -m scripts.validate_horizons` re-checks the ephemeris against JPL Horizons, and
`python -m scripts.make_basemap` regenerates the shaded-relief map from the DEM.

## Data sources

- JPL DE421 planetary ephemeris and NAIF lunar frame kernels (`moon_080317.tf`, `moon_pa_de421_1900-2050.bpc`)
- JPL Horizons System — validation
- LRO LOLA digital elevation models (NASA PGDA / PDS) — terrain horizon
- LROC Quickmap / NASA Moon Trek — reference imagery

## Team

Orbit404 — Hamburg local event (virtual), NASA Space Apps Challenge 2026.
