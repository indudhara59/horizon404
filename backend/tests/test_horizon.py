"""Terrain horizon checks against well-known south-pole features (needs the LOLA DEM)."""

from datetime import datetime

import numpy as np
import pytest

from horizon404.dem import DEM_DIR, PACKED_DIR, load_dem
from horizon404.ephem import sky_track
from horizon404.horizon import horizon_mask

pytestmark = pytest.mark.skipif(
    not (DEM_DIR / "ldem_75s_120m.img").exists()
    and not list(PACKED_DIR.glob("ldem_75s_120m.*.zlib")),
    reason="LOLA DEM not downloaded (python -m scripts.download_dem)",
)


def sunlit_fraction(lat, lon, days=365, step_minutes=360):
    m = horizon_mask(lat, lon)
    tr = sky_track(lat, lon, datetime(2026, 1, 1), days=days, step_minutes=step_minutes)
    return (tr.sun_el > m.at(tr.sun_az)).mean()


def test_projection_round_trip():
    dem = load_dem()
    lat, lon = dem.xy_to_latlon(*dem.latlon_to_xy(-88.0, 45.0))
    assert lat == pytest.approx(-88.0) and lon == pytest.approx(45.0)


def test_shackleton_floor_is_deep():
    # Shackleton crater floor lies ~4 km below its rim
    dem = load_dem()
    assert dem.height_at(-89.66, 129.2) < -2000
    assert dem.height_at(-89.45, 222.69) > 1000


def test_shackleton_floor_is_permanently_shadowed():
    m = horizon_mask(-89.66, 129.2)
    assert m.elevation_deg.min() > 10  # crater walls tower over the floor
    assert sunlit_fraction(-89.66, 129.2) == 0.0


def test_connecting_ridge_is_mostly_lit():
    # published illumination for the Shackleton connecting ridge is ~80-90 %
    assert 0.70 < sunlit_fraction(-89.45, 222.69) < 0.95


def test_mask_wraps_around_north():
    m = horizon_mask(-89.45, 222.69)
    assert np.isclose(m.at(0.0), m.at(360.0))


def test_outside_dem_is_flat():
    m = horizon_mask(0.674, 23.473)  # Apollo 11
    assert not m.terrain and np.all(m.elevation_deg == 0)


def test_exact_pole_matches_nearby_point():
    from horizon404.visibility import analyze

    t0 = datetime(2026, 11, 14)
    a = analyze(-90.0, 0.0, t0, days=14, include_track=False)["metrics"]
    b = analyze(-89.999, 0.0, t0, days=14, include_track=False)["metrics"]
    assert a["power_and_comms_pct"] == b["power_and_comms_pct"]
    assert a["earth_visible_pct"] == b["earth_visible_pct"]


def test_slope_flat_floor_vs_crater_wall():
    dem = load_dem()
    assert dem.slope_at(-89.66, 129.2) < 10  # Shackleton floor is flat
    assert dem.slope_at(-89.9, 129.2) > 20  # inner wall is steep
