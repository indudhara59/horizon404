"""Local terrain patch around a site for the 3D view.

Heights are sampled on a regular east/north grid in the site's local tangent
plane (metres), relative to the site, with the Moon's curvature drop applied,
so a renderer can light it directly with the Sun's azimuth/elevation.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from .dem import MOON_RADIUS_M, load_dem
from .ephem import clamp_lat
from .horizon import _destination


@lru_cache(maxsize=64)
def local_terrain(lat: float, lon: float, half_km: float = 20.0, n: int = 161) -> dict | None:
    lat = clamp_lat(lat)
    dem = load_dem()
    if not dem.covers(lat):
        return None
    h0 = float(dem.height_at(lat, lon))
    if not np.isfinite(h0):
        return None

    axis = np.linspace(-half_km * 1000, half_km * 1000, n)
    E, N = np.meshgrid(axis, axis[::-1])  # row 0 = north edge
    dist = np.hypot(E, N)
    az = np.arctan2(E, N)
    la, lo = _destination(np.radians(lat), np.radians(lon), az, dist / MOON_RADIUS_M)
    h = dem.height_at(np.degrees(la), np.degrees(lo) % 360.0)
    z = h - h0 - dist**2 / (2 * MOON_RADIUS_M)  # curvature drop
    if not np.isfinite(z).all():
        z = np.where(np.isfinite(z), z, np.nanmin(z))
    return {
        "lat": lat,
        "lon": lon % 360.0,
        "half_km": half_km,
        "n": n,
        "site_height_m": round(h0, 1),
        "min_m": round(float(z.min()), 1),
        "max_m": round(float(z.max()), 1),
        "heights": np.round(z).astype(int).ravel().tolist(),
    }
