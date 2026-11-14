"""Pack a downloaded LOLA DEM into lossless row-delta + zlib parts.

The raw ldem_75s_120m.img is 116 MB (over GitHub's file limit); the packed
copy is ~59 MB in 4 parts and is what serverless deployments load.

Usage: python -m scripts.pack_dem [ldem_75s_120m]
"""

import shutil
import sys
import zlib

import numpy as np

from horizon404.dem import DEM_DIR, PACKED_DIR, unpack

PARTS = 4


def main(name: str = "ldem_75s_120m") -> None:
    a = np.fromfile(DEM_DIR / f"{name}.img", dtype="<i2")
    n = int(round(a.size**0.5))
    a = a.reshape(n, n)
    d = np.diff(a, axis=1, prepend=0).astype("<i2")
    PACKED_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy(DEM_DIR / f"{name}.lbl", PACKED_DIR / f"{name}.lbl")
    paths = []
    for i, chunk in enumerate(np.array_split(d, PARTS, axis=0)):
        p = PACKED_DIR / f"{name}.{i}.zlib"
        p.write_bytes(zlib.compress(chunk.tobytes(), 9))
        paths.append(p)
        print(p.name, f"{p.stat().st_size / 1e6:.1f} MB")
    assert np.array_equal(unpack(paths, n), a), "round-trip failed"
    print("ok, lossless")


if __name__ == "__main__":
    main(*sys.argv[1:])
