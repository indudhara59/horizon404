"""Our ephemeris must match JPL Horizons (saved reference) to within 0.01 deg."""

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pytest

from horizon404.ephem import sky_track

REF = json.loads((Path(__file__).parent / "horizons_reference.json").read_text())
TOL_DEG = 0.01


@pytest.mark.parametrize("name", list(REF["sites"]))
def test_matches_horizons(name):
    site = REF["sites"][name]
    track = sky_track(
        site["lat"],
        site["lon"],
        datetime.fromisoformat(REF["start"]),
        days=REF["days"],
        step_minutes=REF["step_hours"] * 60,
    )
    for body, az, el in [
        ("sun", track.sun_az, track.sun_el),
        ("earth", track.earth_az, track.earth_el),
    ]:
        assert np.abs(el - np.array(site[body]["el"])).max() < TOL_DEG
        d_az = np.abs((az - np.array(site[body]["az"]) + 180) % 360 - 180)
        assert (d_az * np.cos(np.radians(site[body]["el"]))).max() < TOL_DEG


def test_far_side_never_sees_earth():
    track = sky_track(-45.444, 177.599, datetime(2026, 11, 14), days=29.53, step_minutes=360)
    assert track.earth_el.max() < 0
