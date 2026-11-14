"""Sun and Earth positions as seen from a point on the lunar surface.

Uses Skyfield with the JPL DE421 planetary ephemeris and the NAIF lunar
orientation kernels, so lunar libration is included. Coordinates are
selenographic latitude / east longitude in the Moon Mean-Earth (ME) frame,
which is the frame landing-site coordinates are normally published in.

Elevation is measured from the local spherical horizon (no atmosphere, no
refraction). Terrain blocking is handled separately by the horizon mask.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np
from skyfield.api import Loader, PlanetaryConstants

KERNEL_DIR = Path(__file__).resolve().parent.parent / "data" / "kernels"

# Angular radii (degrees) at mean distance, used for partial-disk visibility.
SUN_ANGULAR_RADIUS_DEG = 0.2666
EARTH_ANGULAR_RADIUS_DEG = 0.95


@dataclass(frozen=True)
class SkyTrack:
    """Time series of Sun and Earth topocentric positions for one site."""

    times: list[datetime]
    sun_az: np.ndarray
    sun_el: np.ndarray
    earth_az: np.ndarray
    earth_el: np.ndarray

    def to_dict(self) -> dict:
        r = lambda a: np.round(a, 3).tolist()  # noqa: E731
        return {
            "times": [t.isoformat().replace("+00:00", "Z") for t in self.times],
            "sun_az": r(self.sun_az),
            "sun_el": r(self.sun_el),
            "earth_az": r(self.earth_az),
            "earth_el": r(self.earth_el),
        }


@lru_cache(maxsize=1)
def _context():
    """Load (and download once) the ephemeris and lunar frame kernels."""
    if not KERNEL_DIR.exists():  # read-only filesystems (serverless) ship the kernels
        KERNEL_DIR.mkdir(parents=True)
    load = Loader(str(KERNEL_DIR), verbose=False)
    ts = load.timescale()
    eph = load("de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("pck00008.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    frame = pc.build_frame_named("MOON_ME_DE421")
    return ts, eph, pc, frame


def time_grid(start: datetime, days: float, step_minutes: float) -> list[datetime]:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    n = int(round(days * 24 * 60 / step_minutes)) + 1
    return [start + timedelta(minutes=step_minutes * i) for i in range(n)]


def sky_track(
    lat_deg: float,
    lon_deg: float,
    start: datetime,
    days: float = 29.53,
    step_minutes: float = 60.0,
) -> SkyTrack:
    """Azimuth/elevation (degrees) of the Sun and Earth from a lunar site.

    Azimuth is measured clockwise from lunar north (0 = N, 90 = E).
    """
    ts, eph, pc, frame = _context()
    times = time_grid(start, days, step_minutes)
    t = ts.from_datetimes(times)

    site = eph["moon"] + pc.build_latlon_degrees(frame, lat_deg, lon_deg)

    sun_alt, sun_az, _ = site.at(t).observe(eph["sun"]).apparent().altaz()
    earth_alt, earth_az, _ = site.at(t).observe(eph["earth"]).apparent().altaz()

    return SkyTrack(
        times=times,
        sun_az=sun_az.degrees,
        sun_el=sun_alt.degrees,
        earth_az=earth_az.degrees,
        earth_el=earth_alt.degrees,
    )
