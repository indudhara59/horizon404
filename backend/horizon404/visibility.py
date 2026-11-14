"""Combine ephemeris + terrain horizon into mission-planning metrics.

For a site and date window we compute, at every time step:
  * fraction of the solar disk above the local skyline (0..1)
  * whether Earth's centre is above the skyline (direct-to-Earth comms)
  * a relative solar power index for a vertical, sun-tracking array
and summarise them into the numbers a planner needs.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from .ephem import SUN_ANGULAR_RADIUS_DEG, sky_track
from .dem import load_dem
from .horizon import horizon_mask

DARK_THRESHOLD = 0.01  # less than 1 % of the solar disk visible = dark


def disk_fraction(el_minus_horizon: np.ndarray, radius_deg: float) -> np.ndarray:
    """Visible area fraction of a disk cut by a straight horizon."""
    h = np.clip(el_minus_horizon / radius_deg, -1.0, 1.0)
    return (np.arccos(-h) + h * np.sqrt(1 - h * h)) / np.pi


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Index ranges [i, j) where mask is True."""
    if mask.size == 0:
        return []
    m = np.concatenate([[False], mask, [False]]).astype(np.int8)
    d = np.diff(m)
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def _longest_run_hours(mask: np.ndarray, step_h: float) -> float:
    runs = _runs(mask)
    return max((j - i for i, j in runs), default=0) * step_h


def _hours_until_change(mask: np.ndarray, step_h: float) -> float | None:
    """Hours from t0 until mask flips state; None if it never flips in window."""
    flips = np.flatnonzero(mask != mask[0])
    return None if flips.size == 0 else float(flips[0] * step_h)


def _windows(mask: np.ndarray, times: list[datetime]) -> list[list[str]]:
    iso = lambda t: t.isoformat().replace("+00:00", "Z")  # noqa: E731
    return [[iso(times[i]), iso(times[min(j, len(times) - 1)])] for i, j in _runs(mask)]


def _slope(lat: float, lon: float) -> float | None:
    v = load_dem().slope_at(lat, lon)
    return round(v, 1) if np.isfinite(v) else None


def rating(both_pct: float) -> str:
    return "good" if both_pct >= 50 else "marginal" if both_pct >= 25 else "poor"


def analyze(
    lat: float,
    lon: float,
    start: datetime,
    days: float = 29.53,
    step_minutes: float = 60.0,
    observer_height_m: float = 2.0,
    include_track: bool = True,
) -> dict:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    step_h = step_minutes / 60.0

    mask = horizon_mask(lat, lon, observer_height_m)
    tr = sky_track(lat, lon, start, days, step_minutes)

    sun_hz = mask.at(tr.sun_az)
    earth_hz = mask.at(tr.earth_az)
    sun_frac = disk_fraction(tr.sun_el - sun_hz, SUN_ANGULAR_RADIUS_DEG)
    sunlit = sun_frac > DARK_THRESHOLD
    earth_up = tr.earth_el > earth_hz
    both = sunlit & earth_up
    # vertical sun-tracking array: output ~ visible disk * cos(sun elevation)
    power = sun_frac * np.cos(np.radians(np.clip(tr.sun_el, -90, 90)))

    metrics = {
        "now": {
            "sun_elevation_deg": round(float(tr.sun_el[0]), 2),
            "sun_azimuth_deg": round(float(tr.sun_az[0]), 2),
            "sun_clearance_deg": round(float(tr.sun_el[0] - sun_hz[0]), 2),
            "sun_visible_fraction": round(float(sun_frac[0]), 3),
            "earth_elevation_deg": round(float(tr.earth_el[0]), 2),
            "earth_azimuth_deg": round(float(tr.earth_az[0]), 2),
            "earth_clearance_deg": round(float(tr.earth_el[0] - earth_hz[0]), 2),
            "sunlit": bool(sunlit[0]),
            "earth_visible": bool(earth_up[0]),
        },
        # time until the current state flips (sunset if lit, sunrise if dark)
        "hours_to_sun_change": _hours_until_change(sunlit, step_h),
        "hours_to_earth_change": _hours_until_change(earth_up, step_h),
        "sunlit_pct": round(float(sunlit.mean() * 100), 1),
        "earth_visible_pct": round(float(earth_up.mean() * 100), 1),
        "power_and_comms_pct": round(float(both.mean() * 100), 1),
        "mean_power_index": round(float(power.mean()), 3),
        "max_sun_elevation_deg": round(float(tr.sun_el.max()), 2),
        "longest_dark_hours": _longest_run_hours(~sunlit, step_h),
        "longest_comms_gap_hours": _longest_run_hours(~earth_up, step_h),
        "longest_power_and_comms_hours": _longest_run_hours(both, step_h),
    }
    metrics["rating"] = rating(metrics["power_and_comms_pct"])

    out = {
        "site": {"lat": lat, "lon": lon % 360.0, "observer_height_m": observer_height_m},
        "window": {"start": tr.to_dict()["times"][0], "days": days, "step_minutes": step_minutes},
        "terrain": mask.terrain,
        "site_height_m": round(mask.site_height_m, 1),
        "slope_deg": _slope(lat, lon) if mask.terrain else None,
        "metrics": metrics,
        "windows": {
            "sunlit": _windows(sunlit, tr.times),
            "earth": _windows(earth_up, tr.times),
            "both": _windows(both, tr.times),
        },
        "horizon": mask.to_dict(),
    }
    if include_track:
        t = tr.to_dict()
        t.update(
            sun_horizon=np.round(sun_hz, 3).tolist(),
            earth_horizon=np.round(earth_hz, 3).tolist(),
            sun_fraction=np.round(sun_frac, 3).tolist(),
            earth_visible=earth_up.tolist(),
            power_index=np.round(power, 3).tolist(),
        )
        out["track"] = t
    return out


def best_dates(
    lat: float,
    lon: float,
    start: datetime,
    months: int = 12,
    mission_days: float = 14.0,
    step_hours: float = 3.0,
    observer_height_m: float = 2.0,
) -> list[dict]:
    """Rank landing dates (one per day) by power+comms % over a mission length."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    total_days = months * 30.44 + mission_days
    mask = horizon_mask(lat, lon, observer_height_m)
    tr = sky_track(lat, lon, start, total_days, step_hours * 60)
    sunlit = disk_fraction(tr.sun_el - mask.at(tr.sun_az), SUN_ANGULAR_RADIUS_DEG) > DARK_THRESHOLD
    both = (sunlit & (tr.earth_el > mask.at(tr.earth_az))).astype(float)

    per_day = int(round(24 / step_hours))
    win = int(round(mission_days * 24 / step_hours))
    csum = np.concatenate([[0.0], np.cumsum(both)])
    sun_csum = np.concatenate([[0.0], np.cumsum(sunlit)])
    results = []
    for d in range(int(months * 30.44)):
        i = d * per_day
        if i + win > both.size:
            break
        results.append({
            "date": tr.times[i].date().isoformat(),
            "power_and_comms_pct": round(float(csum[i + win] - csum[i]) / win * 100, 1),
            "sunlit_pct": round(float(sun_csum[i + win] - sun_csum[i]) / win * 100, 1),
        })
    return results
