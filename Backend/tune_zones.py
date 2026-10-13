"""
Quick tuning loop for /measure-zones/ on real photos (no server needed).

Put photos in a folder, named by angle prefix:
    anterior_*.jpg   lateral_*.jpg   vertex_*.jpg   posterior_*.jpg
(front_/side_/top_/back_ also work)

Run from Backend/:
    python tune_zones.py path/to/photos            # writes overlays to path/to/photos/_overlays
    python tune_zones.py path/to/photos --vertex-front bottom

Look at each overlay: GREEN = hair, RED = exposed scalp, white boxes = zone ROIs.
If boxes sit in the wrong place  -> edit ZONE_LAYOUT in zone_measure.py
If dark hair shows red           -> raise SKIN_MIN_LUMA / SKIN_REL_LUMA
If scalp shows green             -> segmentation issue; check `segmentation` mode printed below
"""
import argparse
import base64
import os
import sys

import numpy as np
from PIL import Image, ImageOps

import zone_measure as zm

ALIASES = {"front": "anterior", "side": "lateral", "top": "vertex", "crown": "vertex", "back": "posterior"}


def view_of(name: str):
    p = name.lower().split("_")[0]
    p = ALIASES.get(p, p)
    return p if p in zm.ZONE_LAYOUT else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--vertex-front", default="top", choices=["top", "bottom"])
    ap.add_argument("--lateral-side", default="left", choices=["left", "right"])
    a = ap.parse_args()

    out_dir = os.path.join(a.folder, "_overlays")
    os.makedirs(out_dir, exist_ok=True)
    print("segmentation:", zm.segmentation_mode())
    print(f"{'file':32} {'view':10} zones")

    for f in sorted(os.listdir(a.folder)):
        view = view_of(f)
        if not view or not f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        img = np.array(ImageOps.exif_transpose(Image.open(os.path.join(a.folder, f))).convert("RGB"))
        r = zm.measure_zones({view: img}, lateral_side=a.lateral_side, vertex_front=a.vertex_front)
        measured = {k: r["zones"][k] for k in r["measured_zones"]}
        warn = r["view_info"][view]["warnings"]
        print(f"{f:32} {view:10} {measured} {'  ! ' + '; '.join(warn) if warn else ''}")
        png = base64.b64decode(r["overlays"][view].split(",", 1)[1])
        with open(os.path.join(out_dir, os.path.splitext(f)[0] + "_overlay.png"), "wb") as fh:
            fh.write(png)

    print(f"\noverlays written to {out_dir}")


if __name__ == "__main__":
    sys.exit(main())
