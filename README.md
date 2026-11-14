# Horizon404 — Lunar Landing Site Navigator

> *Will my lander have sunlight and a line to Earth — and for how long?*

**NASA Space Apps Challenge 2026 · Team Orbit404 · Challenge: Lunar Landing Site Navigator**

Horizon404 lets mission planners, educators and the public compare lunar landing sites and dates
in a few clicks. For any site and date range it shows where the **Sun** and **Earth** sit relative to the
**real terrain horizon**, and turns that into the numbers that decide a mission:

- time until **sunset** and **Earthset**
- **solar elevation** and share of time in sunlight (power)
- share of time with **Earth in view** (direct-to-Earth communication)
- share of time with **power + comms together**, and the longest dark period

Tools like Quickmap, Moon Trek and JPL Horizons hold this information but are built for specialists.
Horizon404 aims for **Horizons-grade answers in three clicks**.

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
3. **Visibility & metrics** *(in progress)*: Sun/Earth are "up" only when above the terrain horizon.

## Run locally

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.download_dem     # LOLA south-pole DEM, ~116 MB
python -m pytest -q tests          # downloads ~17 MB of JPL kernels on first run
python -m scripts.validate_horizons  # optional: re-check against JPL Horizons
```

## Data sources

- JPL DE421 planetary ephemeris and NAIF lunar frame kernels (`moon_080317.tf`, `moon_pa_de421_1900-2050.bpc`)
- JPL Horizons System — validation
- LRO LOLA digital elevation models (NASA PGDA / PDS) — terrain horizon
- LROC Quickmap / NASA Moon Trek — reference imagery

## Team

Orbit404 — Hamburg local event (virtual), NASA Space Apps Challenge 2026.
