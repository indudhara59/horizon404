"""Reader for LOLA polar-stereographic gridded DEMs (PDS LDEM_*S_*M.IMG).

Default product: LDEM_75S_120M — south pole to 75°S at 120 m/pixel,
16-bit signed integers, HEIGHT = DN * 0.5 m above the 1737.4 km sphere.

Projection follows the PDS DSMAP_POLAR definition (spherical, true at pole):
    r   = 2 R tan((90° + lat) / 2)        (south pole)
    x   = r sin(lon),  y = r cos(lon)
    col = x / scale + S0,  row = L0 - y / scale      (0-based)
"""

from __future__ import annotations

import zlib

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

DEM_DIR = Path(__file__).resolve().parent.parent / "data" / "dem"
# Lossless compressed copy (row-delta + zlib, split in parts) small enough for git
# and serverless bundles; see scripts/pack_dem.py.
PACKED_DIR = DEM_DIR.parent / "dem_packed"
MOON_RADIUS_M = 1_737_400.0
PDS_URL = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
    "lrolol_1xxx/data/lola_gdr/polar/img/"
)


@dataclass(frozen=True)
class PolarDEM:
    heights: np.ndarray  # int16 memmap, DN
    scale_m: float  # metres per pixel
    offset_px: float  # LINE/SAMPLE_PROJECTION_OFFSET (0-based centre)
    dn_scale: float = 0.5
    min_lat: float = -75.0  # northern edge of coverage

    @property
    def size(self) -> int:
        return self.heights.shape[0]

    # --- coordinate transforms -------------------------------------------
    def latlon_to_xy(self, lat, lon):
        lat = np.asarray(lat, dtype=float)
        lon = np.radians(np.asarray(lon, dtype=float))
        r = 2 * MOON_RADIUS_M * np.tan(np.radians(90.0 + lat) / 2)
        return r * np.sin(lon), r * np.cos(lon)

    def xy_to_latlon(self, x, y):
        r = np.hypot(x, y)
        lat = -90.0 + np.degrees(2 * np.arctan(r / (2 * MOON_RADIUS_M)))
        lon = np.degrees(np.arctan2(x, y)) % 360.0
        return lat, lon

    def xy_to_pix(self, x, y):
        return self.offset_px - y / self.scale_m, x / self.scale_m + self.offset_px

    def covers(self, lat: float) -> bool:
        return lat <= self.min_lat + 0.5  # keep a margin from the edge

    # --- sampling ----------------------------------------------------------
    def height_at_xy(self, x, y):
        """Bilinear height (m above 1737.4 km sphere); NaN outside the grid."""
        row, col = self.xy_to_pix(np.asarray(x, float), np.asarray(y, float))
        r0, c0 = np.floor(row).astype(np.int64), np.floor(col).astype(np.int64)
        fr, fc = row - r0, col - c0
        n = self.size
        ok = (r0 >= 0) & (c0 >= 0) & (r0 < n - 1) & (c0 < n - 1)
        r0c, c0c = np.where(ok, r0, 0), np.where(ok, c0, 0)
        h = self.heights
        z = (
            h[r0c, c0c] * (1 - fr) * (1 - fc)
            + h[r0c, c0c + 1] * (1 - fr) * fc
            + h[r0c + 1, c0c] * fr * (1 - fc)
            + h[r0c + 1, c0c + 1] * fr * fc
        ) * self.dn_scale
        return np.where(ok, z, np.nan)

    def height_at(self, lat, lon):
        return self.height_at_xy(*self.latlon_to_xy(lat, lon))


@lru_cache(maxsize=2)
def load_dem(name: str = "ldem_75s_120m") -> PolarDEM:
    img = DEM_DIR / f"{name}.img"
    packed = sorted(PACKED_DIR.glob(f"{name}.*.zlib"))
    if not img.exists() and not packed:
        raise FileNotFoundError(
            f"{img} missing — run: python -m scripts.download_dem {name}"
        )
    lbl_path = DEM_DIR / f"{name}.lbl"
    lbl = (lbl_path if lbl_path.exists() else PACKED_DIR / f"{name}.lbl").read_text()

    def field(key: str) -> float:
        for line in lbl.splitlines():
            if line.strip().startswith(key):
                return float(line.split("=")[1].split("<")[0].strip().strip('"'))
        raise KeyError(key)

    n = int(field("LINES"))
    if img.exists():
        heights = np.memmap(img, dtype="<i2", mode="r", shape=(n, n))
    else:
        heights = unpack(packed, n)
    return PolarDEM(
        heights=heights,
        scale_m=field("MAP_SCALE"),
        offset_px=field("LINE_PROJECTION_OFFSET"),
        dn_scale=field("SCALING_FACTOR"),
        min_lat=field("MAXIMUM_LATITUDE"),
    )


def unpack(parts: list[Path], n: int) -> np.ndarray:
    """Rebuild the int16 DEM from row-delta zlib parts (~0.3 s)."""
    rows = [
        np.frombuffer(zlib.decompress(p.read_bytes()), dtype="<i2").reshape(-1, n)
        for p in parts
    ]
    return np.cumsum(np.vstack(rows), axis=1, dtype=np.int16)
