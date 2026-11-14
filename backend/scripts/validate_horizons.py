"""Compare our Sun/Earth az/el against JPL Horizons for a few lunar sites.

Usage:  python -m scripts.validate_horizons
Writes the Horizons reference values to tests/horizons_reference.json so the
unit test can run offline.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests

from horizon404.ephem import sky_track

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parent.parent / "tests" / "horizons_reference.json"

SITES = {
    "apollo11": (0.674, 23.473),
    "change4": (-45.444, 177.599),
    "south_pole_ridge": (-89.45, 222.69),
}
START = datetime(2026, 11, 14, tzinfo=timezone.utc)
DAYS = 2
STEP_H = 6


def horizons_azel(body: str, lat: float, lon: float) -> list[tuple[float, float]]:
    params = {
        "format": "json",
        "COMMAND": f"'{body}'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360:.4f},{lat:.4f},0'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "START_TIME": f"'{START:%Y-%m-%d %H:%M}'",
        "STOP_TIME": f"'{START.replace(day=START.day + DAYS):%Y-%m-%d %H:%M}'",
        "STEP_SIZE": f"'{STEP_H} h'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
    }
    text = requests.get(API, params=params, timeout=60).json()["result"]
    block = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in block.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        nums = [c for c in cols[1:] if re.fullmatch(r"-?\d+(\.\d+)?", c)]
        rows.append((float(nums[0]), float(nums[1])))  # azimuth, elevation
    return rows


def ang_diff(a, b):
    return np.abs((np.asarray(a) - np.asarray(b) + 180) % 360 - 180)


def main() -> None:
    ref = {"start": START.isoformat(), "days": DAYS, "step_hours": STEP_H, "sites": {}}
    worst = 0.0
    for name, (lat, lon) in SITES.items():
        ours = sky_track(lat, lon, START, days=DAYS, step_minutes=STEP_H * 60)
        site_ref = {"lat": lat, "lon": lon}
        for body, code, az, el in [
            ("sun", "10", ours.sun_az, ours.sun_el),
            ("earth", "399", ours.earth_az, ours.earth_el),
        ]:
            hz = horizons_azel(code, lat, lon)
            h_az = np.array([r[0] for r in hz])
            h_el = np.array([r[1] for r in hz])
            d_el = np.abs(el - h_el).max()
            # azimuth is ill-defined near the zenith, so weight it by cos(el)
            d_az = (ang_diff(az, h_az) * np.cos(np.radians(h_el))).max()
            worst = max(worst, d_el, d_az)
            print(f"{name:18s} {body:5s}  max |d_el| = {d_el:.6f} deg   max |d_az|cos(el) = {d_az:.6f} deg")
            site_ref[body] = {"az": h_az.tolist(), "el": h_el.tolist()}
        ref["sites"][name] = site_ref
    OUT.write_text(json.dumps(ref, indent=1))
    print(f"\nworst difference: {worst:.6f} deg  ->  reference saved to {OUT.name}")


if __name__ == "__main__":
    main()
