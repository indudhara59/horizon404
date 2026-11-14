"""Download a LOLA polar DEM (label + image) from the PDS Geosciences Node.

Usage: python -m scripts.download_dem [ldem_75s_120m]
"""

import sys

import requests

from horizon404.dem import DEM_DIR, PDS_URL


def main(name: str = "ldem_75s_120m") -> None:
    DEM_DIR.mkdir(parents=True, exist_ok=True)
    for ext in ("lbl", "img"):
        dest = DEM_DIR / f"{name}.{ext}"
        if dest.exists() and ext == "lbl":
            continue
        url = f"{PDS_URL}{name}.{ext}"
        print(f"downloading {url}")
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            tmp = dest.with_suffix(dest.suffix + ".part")
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
            tmp.rename(dest)
    print("done")


if __name__ == "__main__":
    main(*sys.argv[1:])
