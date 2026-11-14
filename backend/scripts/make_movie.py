"""Render an animated light-and-shadow movie of the lunar south pole.

For every point of a 0.5 km grid within 40 km of the pole we compute the
visible fraction of the solar disk (terrain skyline from LOLA, Sun from DE421)
every 6 hours over one lunar day. Frames are stored 2 bits per point:
0 = dark, 1 = < 50 % of the disk, 2 = < 99 %, 3 = full Sun.

Outputs in frontend/public/movie/:
  frames.bin   packed frames (frame-major, row 0 = north edge / top of map)
  relief.webp  shaded relief of the same area (map orientation: up = 0°E)
  movie.json   grid, timing and the sites inside the frame

Usage: python -m scripts.make_movie      (~2-3 min on 10 cores)
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path

import numpy as np
from PIL import Image

from horizon404.dem import MOON_RADIUS_M, load_dem
from horizon404.ephem import SUN_ANGULAR_RADIUS_DEG, _context, time_grid
from horizon404.horizon import horizon_mask
from horizon404.sites import SITES
from horizon404.visibility import disk_fraction

from .make_layers import topo_az_el

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "movie"
START = datetime(2026, 11, 14, tzinfo=timezone.utc)
DAYS = 29.53
STEP_MIN = 360.0
HALF_KM = 40.0
DX_KM = 0.5

_SUN = None


def sun_vectors() -> np.ndarray:
    ts, eph, _pc, frame = _context()
    t = ts.from_datetimes(time_grid(START, DAYS, STEP_MIN))
    return eph["moon"].at(t).observe(eph["sun"]).apparent().frame_xyz(frame).km


def _init(sun):
    global _SUN
    _SUN = sun


def _row(args):
    y_km, xs = args
    dem = load_dem()
    out = np.zeros((len(xs), _SUN.shape[1]), np.uint8)
    for i, x in enumerate(xs):
        lat, lon = dem.xy_to_latlon(x * 1000, y_km * 1000)
        mask = horizon_mask(float(lat), float(lon))
        if not mask.terrain:
            continue
        r_km = (MOON_RADIUS_M + mask.site_height_m + mask.observer_height_m) / 1000
        az, el = topo_az_el(_SUN, float(lat), float(lon), r_km)
        f = disk_fraction(el - mask.at(az), SUN_ANGULAR_RADIUS_DEG)
        out[i] = np.digitize(f, [0.01, 0.5, 0.99])
    return out


def relief(dem, px: int = 800) -> Image.Image:
    xs = np.linspace(-HALF_KM, HALF_KM, px) * 1000
    X, Y = np.meshgrid(xs, xs[::-1])
    z = dem.height_at_xy(X, Y)
    cell = 2 * HALF_KM * 1000 / (px - 1)
    dzdy, dzdx = np.gradient(z, cell)
    dzdy = -dzdy  # rows go north -> south
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)
    # soft, high-sun shading so the animated shadows dominate
    alt, az = np.radians(55), np.radians(315)
    shade = np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    zn = np.clip((z - np.nanpercentile(z, 2)) / (np.nanpercentile(z, 98) - np.nanpercentile(z, 2)), 0, 1)
    g = (70 + 120 * zn) * (0.45 + 0.6 * shade)
    rgb = np.stack([g * 1.02, g, g * 0.96], -1)
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    dem = load_dem()
    t0 = time.time()
    sun = sun_vectors()
    n = int(round(2 * HALF_KM / DX_KM)) + 1
    axis = np.linspace(-HALF_KM, HALF_KM, n)
    with get_context("spawn").Pool(initializer=_init, initargs=(sun,)) as pool:
        rows = pool.map(_row, [(y, axis) for y in axis[::-1]], chunksize=4)
    cube = np.stack(rows)  # (ny, nx, frames), row 0 = north edge
    frames = cube.transpose(2, 0, 1).reshape(cube.shape[2], -1)  # (frames, ny*nx)
    print(f"{n}x{n} grid, {frames.shape[0]} frames in {time.time() - t0:.0f} s")

    pad = (-frames.shape[1]) % 4
    f = np.pad(frames, ((0, 0), (0, pad)))
    packed = (f[:, 0::4] | (f[:, 1::4] << 2) | (f[:, 2::4] << 4) | (f[:, 3::4] << 6)).astype(np.uint8)
    (OUT / "frames.bin").write_bytes(packed.tobytes())

    relief(dem).save(OUT / "relief.webp", quality=85)
    sites = []
    for s in SITES:
        x, y = dem.latlon_to_xy(s["lat"], s["lon"])
        if abs(x) < HALF_KM * 1000 and abs(y) < HALF_KM * 1000:
            sites.append({"id": s["id"], "name": s["name"], "x_km": round(x / 1000, 2), "y_km": round(y / 1000, 2)})
    times = time_grid(START, DAYS, STEP_MIN)
    meta = {
        "start": times[0].isoformat().replace("+00:00", "Z"),
        "step_hours": STEP_MIN / 60,
        "frames": int(frames.shape[0]),
        "n": n,
        "half_km": HALF_KM,
        "bytes_per_frame": int(packed.shape[1]),
        "lit_pct": np.round((frames == 3).mean(axis=1) * 100, 1).tolist(),
        "sites": sites,
    }
    (OUT / "movie.json").write_text(json.dumps(meta, separators=(",", ":")))
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}: {p.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
