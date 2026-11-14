"""Render a shaded-relief PNG of the lunar south pole from the LOLA DEM.

Output: frontend/public/southpole.jpg (+ southpole.json with the extent in km).
Image top = 0°E direction, polar stereographic, same projection as the DEM.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

from horizon404.dem import load_dem

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public"
PX = 1200


def main() -> None:
    dem = load_dem()
    step = dem.size // PX
    z = np.asarray(dem.heights[::step, ::step], dtype=np.float32) * dem.dn_scale
    cell = dem.scale_m * step

    dzdy, dzdx = np.gradient(z, cell)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)
    sun_az, sun_alt = np.radians(315), np.radians(35)
    shade = np.sin(sun_alt) * np.cos(slope) + np.cos(sun_alt) * np.sin(slope) * np.cos(sun_az - aspect)
    shade = np.clip(shade, 0, 1)

    zn = (z - np.percentile(z, 1)) / (np.percentile(z, 99) - np.percentile(z, 1))
    zn = np.clip(zn, 0, 1)
    # cool dark-blue lows to warm grey highs, modulated by hillshade
    low, high = np.array([24, 32, 58]), np.array([214, 206, 190])
    rgb = (low + (high - low) * zn[..., None]) * (0.35 + 0.75 * shade[..., None])
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))

    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "southpole.jpg", quality=82)
    half_km = (dem.offset_px + 0.5) * dem.scale_m / 1000
    (OUT / "southpole.json").write_text(json.dumps({"half_extent_km": half_km, "min_lat": dem.min_lat}))
    print(f"saved {img.size} image, half extent {half_km:.1f} km")


if __name__ == "__main__":
    main()
