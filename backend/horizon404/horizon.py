"""Terrain horizon mask: the elevation angle of the skyline in every direction.

For a site at (lat, lon) we cast great-circle rays outwards at fine azimuth
steps, sample LOLA terrain heights along each ray and compute the exact
elevation angle of every sample on a spherical Moon:

    elevation = atan2(Rt cos θ - Ro, Rt sin θ)

where θ is the central angle to the sample, Rt the sample's radius and Ro the
observer's radius (terrain + mast height). Lunar curvature is therefore built
in, and there is no atmosphere / refraction to correct for. The horizon in
each 1° azimuth bin is the maximum elevation over all samples in that bin.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from .dem import MOON_RADIUS_M, load_dem

AZ_BINS = 360  # 1° resolution
RAYS_PER_BIN = 2  # 0.5° ray spacing
MAX_RANGE_M = 200_000.0  # far enough for a 5 km massif seen from 0 m


@dataclass(frozen=True)
class HorizonMask:
    lat: float
    lon: float
    site_height_m: float  # terrain height above 1737.4 km sphere
    observer_height_m: float  # mast / panel height above terrain
    elevation_deg: np.ndarray  # shape (360,), skyline elevation per azimuth bin
    terrain: bool  # False when site is outside DEM coverage (flat horizon)
    complete: bool  # False if some rays left the DEM before MAX_RANGE

    def at(self, az_deg) -> np.ndarray:
        """Horizon elevation at arbitrary azimuths (linear, wraps 360°)."""
        az = np.asarray(az_deg, float) % 360.0
        centres = np.arange(AZ_BINS) + 0.5
        return np.interp(
            az,
            np.concatenate([[centres[-1] - 360], centres, [centres[0] + 360]]),
            np.concatenate(
                [[self.elevation_deg[-1]], self.elevation_deg, [self.elevation_deg[0]]]
            ),
        )

    def to_dict(self) -> dict:
        return {
            "lat": self.lat,
            "lon": self.lon,
            "site_height_m": round(self.site_height_m, 1),
            "observer_height_m": self.observer_height_m,
            "terrain": self.terrain,
            "complete": self.complete,
            "azimuth_deg": (np.arange(AZ_BINS) + 0.5).tolist(),
            "elevation_deg": np.round(self.elevation_deg, 3).tolist(),
        }


def _distances(scale_m: float) -> np.ndarray:
    """Fine steps near the site (1 px to 20 km), then ~0.5% growth."""
    near = np.arange(scale_m, 20_000.0, scale_m)
    far = np.geomspace(20_000.0, MAX_RANGE_M, 470)
    return np.concatenate([near, far])


def _destination(lat0, lon0, az, dist):
    """Great-circle destination; az/lat/lon in radians, dist as central angle."""
    sin_lat = np.sin(lat0) * np.cos(dist) + np.cos(lat0) * np.sin(dist) * np.cos(az)
    lat = np.arcsin(np.clip(sin_lat, -1, 1))
    lon = lon0 + np.arctan2(
        np.sin(az) * np.sin(dist) * np.cos(lat0),
        np.cos(dist) - np.sin(lat0) * sin_lat,
    )
    return lat, lon


@lru_cache(maxsize=256)
def horizon_mask(
    lat: float, lon: float, observer_height_m: float = 2.0
) -> HorizonMask:
    lat, lon = round(float(lat), 5), round(float(lon) % 360.0, 5)
    dem = load_dem()

    if not dem.covers(lat):
        # No terrain data: smooth sphere, skyline is (just below) 0°.
        return HorizonMask(lat, lon, 0.0, observer_height_m,
                           np.zeros(AZ_BINS), terrain=False, complete=False)

    h_site = float(dem.height_at(lat, lon))
    r_obs = MOON_RADIUS_M + h_site + observer_height_m

    n_rays = AZ_BINS * RAYS_PER_BIN
    az = np.radians((np.arange(n_rays) + 0.5) * 360.0 / n_rays)
    dist_m = _distances(dem.scale_m)
    theta = dist_m / MOON_RADIUS_M  # central angle

    A, T = np.meshgrid(az, theta, indexing="ij")  # (rays, samples)
    plat, plon = _destination(np.radians(lat), np.radians(lon), A, T)
    h = dem.height_at(np.degrees(plat), np.degrees(plon))

    r_t = MOON_RADIUS_M + h
    elev = np.degrees(np.arctan2(r_t * np.cos(T) - r_obs, r_t * np.sin(T)))
    complete = not np.isnan(elev).any()
    elev = np.where(np.isnan(elev), -90.0, elev)

    per_ray = elev.max(axis=1)
    per_bin = per_ray.reshape(AZ_BINS, RAYS_PER_BIN).max(axis=1)

    return HorizonMask(lat, lon, h_site, observer_height_m, per_bin,
                       terrain=True, complete=complete)
