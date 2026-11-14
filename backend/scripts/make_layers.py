"""Precompute south-pole suitability layers for the map.

For a grid of points around the pole we run the same physics as /api/analyze
(terrain skyline from LOLA + Sun/Earth positions from DE421) over 12 months and
store, per point: % of time sunlit, % with Earth in view, % with both, and the
terrain slope. Output goes to frontend/public/layers/:

  <layer>.webp  colour overlay in the map's polar-stereographic km frame
  layers.json   extent, legend and the raw values (base64 uint8) for hover

Sun and Earth vectors in the Moon-fixed frame are computed once and reused for
every grid point; only the site position (parallax) and skyline differ.

Usage: python -m scripts.make_layers           (~3 min on 10 cores)
       python -m scripts.make_layers --restyle # re-render images from layers.json
"""

from __future__ import annotations

import base64
import json
import sys
import time
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path

import numpy as np
from PIL import Image

from horizon404.dem import MOON_RADIUS_M, load_dem
from horizon404.ephem import SUN_ANGULAR_RADIUS_DEG, _context, time_grid
from horizon404.horizon import horizon_mask
from horizon404.visibility import DARK_THRESHOLD, analyze, disk_fraction

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "layers"
START = datetime(2026, 11, 14, tzinfo=timezone.utc)
DAYS = 365.0
STEP_MIN = 180.0
# grid in map km (x = r sin lon, y = r cos lon), matching the map's view
X_RANGE, Y_RANGE, DX = (-150.0, 150.0), (-90.0, 306.0), 3.0
SLOPE_DX = 1.0  # km, hover resolution of the slope layer
PX_PER_KM = 3  # overlay image resolution

_SUN = _EARTH = None


def body_vectors() -> tuple[np.ndarray, np.ndarray]:
    """Sun and Earth positions from the Moon's centre, Moon-fixed frame, km (3, N)."""
    ts, eph, _pc, frame = _context()
    t = ts.from_datetimes(time_grid(START, DAYS, STEP_MIN))
    moon = eph["moon"].at(t)
    sun = moon.observe(eph["sun"]).apparent().frame_xyz(frame).km
    earth = moon.observe(eph["earth"]).apparent().frame_xyz(frame).km
    return sun, earth


def topo_az_el(vec: np.ndarray, lat: float, lon: float, r_km: float):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.cross(up, east)
    v = vec - (r_km * up)[:, None]
    v /= np.linalg.norm(v, axis=0)
    el = np.degrees(np.arcsin(up @ v))
    az = np.degrees(np.arctan2(east @ v, north @ v)) % 360.0
    return az, el


def point_stats(lat: float, lon: float) -> tuple[float, float, float]:
    mask = horizon_mask(lat, lon)
    if not mask.terrain:
        return np.nan, np.nan, np.nan
    r_km = (MOON_RADIUS_M + mask.site_height_m + mask.observer_height_m) / 1000
    s_az, s_el = topo_az_el(_SUN, lat, lon, r_km)
    e_az, e_el = topo_az_el(_EARTH, lat, lon, r_km)
    sunlit = disk_fraction(s_el - mask.at(s_az), SUN_ANGULAR_RADIUS_DEG) > DARK_THRESHOLD
    earth = e_el > mask.at(e_az)
    return 100 * sunlit.mean(), 100 * earth.mean(), 100 * (sunlit & earth).mean()


def _init(sun, earth):
    global _SUN, _EARTH
    _SUN, _EARTH = sun, earth


def _row(args):
    ys, xs = args
    dem = load_dem()
    out = []
    for x in xs:
        lat, lon = dem.xy_to_latlon(x * 1000, ys * 1000)
        out.append(point_stats(float(lat), float(lon)))
    return out


# --- colour maps ----------------------------------------------------------
def ramp(stops):
    pos = np.array([s[0] for s in stops], float)
    col = np.array([s[1] for s in stops], float)

    def f(v):
        v = np.clip(v, pos[0], pos[-1])
        return np.stack([np.interp(v, pos, col[:, i]) for i in range(3)], -1)

    return f, [[p, "#%02x%02x%02x" % tuple(int(c) for c in rgb)] for p, rgb in stops]


# On a 3 km grid nothing exceeds ~60 % sunlit, so the warm end of the ramp sits there.
PCT = [(0, (12, 14, 40)), (10, (72, 30, 120)), (20, (150, 45, 120)), (30, (215, 75, 85)), (40, (245, 135, 50)), (50, (252, 200, 60)), (60, (255, 250, 200))]
EARTH = [(0, (12, 14, 40)), (25, (20, 60, 130)), (50, (40, 120, 200)), (75, (90, 180, 240)), (100, (210, 240, 255))]
SLOPE = [(0, (34, 160, 90)), (5, (120, 200, 80)), (10, (240, 210, 60)), (15, (240, 130, 50)), (25, (200, 40, 40)), (40, (110, 20, 30))]

LAYERS = {
    "both": ("Power + comms", "%", PCT),
    "sunlit": ("Sunlight", "%", PCT),
    "earth": ("Earth in view", "%", EARTH),
    "slope": ("Terrain slope", "°", SLOPE),
}


def to_png(values: np.ndarray, stops, name: str, alpha: int = 200) -> None:
    f, _ = ramp(stops)
    rgb = f(np.nan_to_num(values, nan=0.0))
    a = np.where(np.isfinite(values), alpha, 0)
    img = Image.fromarray(np.dstack([rgb, a]).astype(np.uint8), "RGBA")
    W = int((X_RANGE[1] - X_RANGE[0]) * PX_PER_KM)
    H = int((Y_RANGE[1] - Y_RANGE[0]) * PX_PER_KM)
    img.resize((W, H), Image.BILINEAR).save(OUT / f"{name}.webp", quality=82, method=6)


def b64(values: np.ndarray, scale: float) -> str:
    """uint8 per cell, 255 = no data."""
    q = np.where(np.isfinite(values), np.clip(np.round(values * scale), 0, 254), 255).astype(np.uint8)
    return base64.b64encode(q[::-1].tobytes()).decode()  # row 0 = bottom (y0)


def slope_layer(dem) -> np.ndarray:
    """Slope (deg) over the grid at 120 m baseline, sampled every SLOPE_DX km."""
    xs = np.arange(X_RANGE[0], X_RANGE[1] + 1e-9, SLOPE_DX)
    ys = np.arange(Y_RANGE[1], Y_RANGE[0] - 1e-9, -SLOPE_DX)  # top row first
    X, Y = np.meshgrid(xs * 1000, ys * 1000)
    s = dem.scale_m
    zx = (dem.height_at_xy(X + s, Y) - dem.height_at_xy(X - s, Y)) / (2 * s)
    zy = (dem.height_at_xy(X, Y + s) - dem.height_at_xy(X, Y - s)) / (2 * s)
    return np.degrees(np.arctan(np.hypot(zx, zy)))


def decode(layer: dict) -> np.ndarray:
    g = layer["grid"]
    q = np.frombuffer(base64.b64decode(g["data"]), np.uint8).reshape(g["ny"], g["nx"])[::-1]
    return np.where(q == 255, np.nan, q / g["scale"])


def write(values: dict, meta: dict) -> None:
    for key, (label, unit, stops) in LAYERS.items():
        v = values[key]
        dx = SLOPE_DX if key == "slope" else DX
        to_png(v, stops, key)
        scale = 5.0 if key == "slope" else 2.5  # 0.2° / 0.4 % resolution in uint8
        meta["layers"][key] = {
            "label": label, "unit": unit, "legend": ramp(stops)[1],
            "grid": {"x0": X_RANGE[0], "y0": Y_RANGE[0], "dx": dx, "nx": v.shape[1], "ny": v.shape[0],
                     "scale": scale, "data": b64(v, scale)},
        }
    (OUT / "layers.json").write_text(json.dumps(meta, separators=(",", ":")))
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}: {p.stat().st_size / 1e3:.0f} kB")


def restyle() -> None:
    meta = json.loads((OUT / "layers.json").read_text())
    values = {k: decode(v) for k, v in meta["layers"].items()}
    write(values, meta)


def main() -> None:
    if "--restyle" in sys.argv:
        return restyle()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    dem = load_dem()
    t0 = time.time()
    sun, earth = body_vectors()

    # sanity check against the full engine (same window and step)
    _init(sun, earth)
    for lat, lon in [(-89.45, 222.69), (-85.99, 2.1), (-84.666, 39.466)]:
        fast = point_stats(lat, lon)
        m = analyze(lat, lon, START, DAYS, STEP_MIN, include_track=False)["metrics"]
        full = (m["sunlit_pct"], m["earth_visible_pct"], m["power_and_comms_pct"])
        print(f"check {lat},{lon}: fast {np.round(fast, 1)} vs engine {full}")
        assert np.allclose(fast, full, atol=0.6), "fast path disagrees with engine"

    xs = np.arange(X_RANGE[0], X_RANGE[1] + 1e-9, DX)
    ys = np.arange(Y_RANGE[1], Y_RANGE[0] - 1e-9, -DX)  # top row first (image order)
    with get_context("spawn").Pool(initializer=_init, initargs=(sun, earth)) as pool:
        rows = pool.map(_row, [(y, xs) for y in ys], chunksize=2)
    grid = np.array(rows, dtype=float)  # (ny, nx, 3)
    print(f"{grid.shape[0]}x{grid.shape[1]} grid in {time.time() - t0:.0f} s")

    slope = slope_layer(dem)
    meta = {
        "window": {"start": START.date().isoformat(), "days": DAYS, "step_minutes": STEP_MIN},
        "image_extent": {"x": list(X_RANGE), "y": list(Y_RANGE)},
        "layers": {},
    }
    values = {"sunlit": grid[..., 0], "earth": grid[..., 1], "both": grid[..., 2], "slope": slope}
    write(values, meta)


if __name__ == "__main__":
    main()
