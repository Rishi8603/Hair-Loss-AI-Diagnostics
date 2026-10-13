"""
Phase II — Measured scalp-zone density.

For each photo angle we:
  1. segment HAIR pixels (MediaPipe hair segmenter if the model is available,
     otherwise a dark-pixel threshold fallback),
  2. segment SKIN pixels (YCrCb colour thresholds),
  3. find the head region (largest hair+skin blob),
  4. cut the head box into anatomical zone ROIs for that view,
  5. density = hair / (hair + skin) inside each ROI   (1.0 = full cover, 0.0 = bald).

Output zone keys match Head3DViewer.js:
  frontal, temporal_left, temporal_right, mid_scalp, vertex, occipital

All ROI fractions live in ZONE_LAYOUT so they can be tuned on real photos.
This is a photo-based coverage estimate, not a clinical trichoscopy measurement.
"""

import base64
import os
import urllib.request

import cv2
import numpy as np

ZONE_KEYS = ["frontal", "temporal_left", "temporal_right", "mid_scalp", "vertex", "occipital"]

# ── Tunable constants ──────────────────────────────────────────────
MAX_SIDE = 512                    # working resolution
SKIN_CR = (133, 173)              # YCrCb skin range
SKIN_CB = (77, 127)
SKIN_REL_LUMA = 0.55             # skin must be >= 55% as bright as typical skin in the photo
SKIN_MIN_LUMA = 70               # ...and never darker than this (Y channel, 0-255)
MIN_ROI_PIXELS = 400              # fewer hair+skin pixels than this -> zone not measured
HAIR_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/image_segmenter/"
                  "hair_segmenter/float32/latest/hair_segmenter.tflite")
HAIR_MODEL_PATH = os.environ.get(
    "HAIR_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "models", "hair_segmenter.tflite"),
)

# ROI boxes as fractions of the head bounding box: (x0, y0, x1, y1).
# "anterior": image-left is the patient's RIGHT (normal, non-mirrored photo).
# "vertex":   assumes the forehead is at the TOP of the image (flip with vertex_front="bottom").
# "lateral":  one side; which temporal it feeds is chosen by lateral_side.
ZONE_LAYOUT = {
    "anterior": {
        "temporal_right": (0.00, 0.00, 0.30, 0.30),
        "frontal":        (0.30, 0.00, 0.70, 0.30),
        "temporal_left":  (0.70, 0.00, 1.00, 0.30),
    },
    "lateral": {
        "temporal_side":  (0.25, 0.05, 0.75, 0.40),
    },
    "vertex": {
        "mid_scalp":      (0.20, 0.15, 0.80, 0.50),
        "vertex":         (0.20, 0.50, 0.80, 0.85),
    },
    "posterior": {
        "occipital":      (0.20, 0.35, 0.80, 0.75),
    },
}

ZONE_LABELS = {
    "frontal": "Frontal", "temporal_left": "Temporal L", "temporal_right": "Temporal R",
    "mid_scalp": "Mid-Scalp", "vertex": "Vertex", "occipital": "Occipital",
    "temporal_side": "Temporal",
}


# ── Hair segmenter (MediaPipe) with graceful fallback ──────────────
_segmenter = None
_segmenter_tried = False


def _get_segmenter():
    """Load MediaPipe hair segmenter once. Returns None if unavailable."""
    global _segmenter, _segmenter_tried
    if _segmenter_tried:
        return _segmenter
    _segmenter_tried = True
    try:
        if not os.path.exists(HAIR_MODEL_PATH):
            os.makedirs(os.path.dirname(HAIR_MODEL_PATH), exist_ok=True)
            urllib.request.urlretrieve(HAIR_MODEL_URL, HAIR_MODEL_PATH)
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
        options = vision.ImageSegmenterOptions(
            base_options=mp_python.BaseOptions(model_asset_path=HAIR_MODEL_PATH),
            output_category_mask=True,
        )
        _segmenter = vision.ImageSegmenter.create_from_options(options)
    except Exception as e:  # no network, no mediapipe, bad model...
        print(f"[zone_measure] MediaPipe hair segmenter unavailable, using threshold fallback: {e}")
        _segmenter = None
    return _segmenter


def segmentation_mode() -> str:
    return "mediapipe_hair_segmenter" if _get_segmenter() is not None else "threshold_fallback"


# ── Masks ──────────────────────────────────────────────────────────
def _resize(img_rgb: np.ndarray) -> np.ndarray:
    h, w = img_rgb.shape[:2]
    s = MAX_SIDE / max(h, w)
    if s < 1:
        img_rgb = cv2.resize(img_rgb, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img_rgb


def _clean(mask: np.ndarray, k: int = 5) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
    return m.astype(bool)


def skin_mask(img_rgb: np.ndarray) -> np.ndarray:
    ycrcb = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2YCrCb)
    y, cr, cb = ycrcb[..., 0], ycrcb[..., 1], ycrcb[..., 2]
    m = (cr >= SKIN_CR[0]) & (cr <= SKIN_CR[1]) & (cb >= SKIN_CB[0]) & (cb <= SKIN_CB[1])
    # Dark brown/black hair also falls in the Cr/Cb skin box -> require skin-level brightness.
    if m.sum() > 200:
        m &= y > SKIN_REL_LUMA * np.percentile(y[m], 75)
    m &= y > SKIN_MIN_LUMA
    return _clean(m)


def _hair_mask_mediapipe(img_rgb: np.ndarray, segmenter) -> np.ndarray:
    import mediapipe as mp
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img_rgb))
    res = segmenter.segment(mp_img)
    cat = res.category_mask.numpy_view()
    return cat.squeeze() > 0          # hair segmenter: 0 = background, 1 = hair


def _hair_mask_threshold(img_rgb: np.ndarray, skin: np.ndarray) -> np.ndarray:
    """Fallback: hair = pixels clearly darker than the visible skin, not skin-coloured."""
    hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
    v = hsv[..., 2].astype(np.float32)
    if skin.sum() > 200:
        skin_v = np.median(v[skin])
        thr = min(skin_v * 0.70, 150.0)
    else:
        thr, _ = cv2.threshold(hsv[..., 2], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = ((v < thr) & ~skin).astype(np.uint8)
    # close only: opening would erase 1-2 px hair strands
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    return m.astype(bool)


def foreground_mask(img_rgb: np.ndarray) -> np.ndarray:
    """GrabCut foreground, seeded with a centred box (photos are framed on the head)."""
    H, W = img_rgb.shape[:2]
    small = cv2.resize(img_rgb, (W // 2, H // 2), interpolation=cv2.INTER_AREA)  # 4x faster
    h, w = small.shape[:2]
    rect = (int(0.06 * w), int(0.04 * h), int(0.88 * w), int(0.92 * h))
    mask = np.zeros((h, w), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), mask, rect, bgd, fgd, 4,
                    cv2.GC_INIT_WITH_RECT)
        fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
        fg = cv2.resize(fg, (W, H), interpolation=cv2.INTER_NEAREST).astype(bool)
    except cv2.error:
        fg = np.ones((H, W), bool)
    return fg


def head_mask(hair: np.ndarray, skin: np.ndarray) -> np.ndarray:
    """Largest connected hair+skin blob, holes filled."""
    both = (hair | skin).astype(np.uint8)
    both = cv2.morphologyEx(both, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(both, 8)
    if n <= 1:
        return np.zeros_like(hair)
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    blob = (labels == biggest).astype(np.uint8)
    contours, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(blob)
    cv2.drawContours(filled, contours, -1, 1, thickness=cv2.FILLED)
    return filled.astype(bool)


# ── Per-view measurement ───────────────────────────────────────────
def measure_view(img_rgb: np.ndarray, view: str, vertex_front: str = "top"):
    """
    Returns (zone_values, overlay_rgb, info).
    zone_values: {roi_name: {"density": float|None, "pixels": int}}
    """
    img = _resize(img_rgb)
    fg = foreground_mask(img)
    skin = skin_mask(img) & fg
    seg = _get_segmenter()
    hair = _hair_mask_mediapipe(img, seg) if seg is not None else _hair_mask_threshold(img, skin)
    hair &= fg
    skin = skin & ~hair
    head = head_mask(hair, skin)

    info = {"head_found": bool(head.sum() > 0.02 * head.size)}
    brightness = float(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).mean())
    info["brightness"] = round(brightness, 1)
    warnings = []
    if brightness < 60:
        warnings.append("Photo is too dark - retake in better light.")
    if brightness > 220:
        warnings.append("Photo is overexposed - avoid direct flash.")
    if not info["head_found"]:
        warnings.append("Could not find the head in this photo.")
    info["warnings"] = warnings

    overlay = _overlay(img, hair & head, skin & head)
    results = {}
    if not info["head_found"]:
        return results, overlay, info

    ys, xs = np.where(head)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    for name, (fx0, fy0, fx1, fy1) in ZONE_LAYOUT[view].items():
        if view == "vertex" and vertex_front == "bottom":
            fy0, fy1 = 1 - fy1, 1 - fy0
        rx0, rx1 = int(x0 + fx0 * bw), int(x0 + fx1 * bw)
        ry0, ry1 = int(y0 + fy0 * bh), int(y0 + fy1 * bh)
        roi = np.zeros_like(head)
        roi[ry0:ry1, rx0:rx1] = True
        roi &= head
        h_px = int((hair & roi).sum())
        s_px = int((skin & roi).sum())
        total = h_px + s_px
        density = round(h_px / total, 3) if total >= MIN_ROI_PIXELS else None
        results[name] = {"density": density, "pixels": total}
        _draw_roi(overlay, rx0, ry0, rx1, ry1, ZONE_LABELS.get(name, name), density)

    return results, overlay, info


# ── Overlay drawing ────────────────────────────────────────────────
def _overlay(img, hair, scalp, alpha=0.45):
    out = img.copy().astype(np.float32)
    green = np.array([40, 200, 90], np.float32)
    red = np.array([230, 50, 50], np.float32)
    out[hair] = out[hair] * (1 - alpha) + green * alpha
    out[scalp] = out[scalp] * (1 - alpha) + red * alpha
    return out.clip(0, 255).astype(np.uint8)


def _draw_roi(img, x0, y0, x1, y1, label, density):
    cv2.rectangle(img, (x0, y0), (x1, y1), (255, 255, 255), 2)
    text = f"{label} {int(round(density * 100))}%" if density is not None else f"{label} n/a"
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    ty = max(y0, th + 6)
    cv2.rectangle(img, (x0, ty - th - 6), (x0 + tw + 6, ty), (20, 20, 20), -1)
    cv2.putText(img, text, (x0 + 3, ty - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (255, 255, 255), 1, cv2.LINE_AA)


def to_base64_png(img_rgb: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


# ── Combine all views into the 6 viewer zones ──────────────────────
def measure_zones(images: dict, prior: dict | None = None,
                  lateral_side: str = "left", vertex_front: str = "top") -> dict:
    """
    images: {"anterior"|"lateral"|"vertex"|"posterior": RGB np.ndarray}
    prior:  fallback values for zones no photo covers (e.g. from the CNN stage)
    """
    acc = {k: [] for k in ZONE_KEYS}            # (density, pixels) samples per zone
    overlays, view_info = {}, {}

    for view, img in images.items():
        if img is None or view not in ZONE_LAYOUT:
            continue
        vals, overlay, info = measure_view(img, view, vertex_front=vertex_front)
        overlays[view] = to_base64_png(overlay)
        view_info[view] = info
        for name, v in vals.items():
            if v["density"] is None:
                continue
            target = name
            if name == "temporal_side":
                target = "temporal_left" if lateral_side == "left" else "temporal_right"
            acc[target].append((v["density"], v["pixels"]))

    zones, source = {}, {}
    for k in ZONE_KEYS:
        if acc[k]:
            w = sum(p for _, p in acc[k])
            zones[k] = round(sum(d * p for d, p in acc[k]) / w, 3)
            source[k] = "measured"
        elif prior and prior.get(k) is not None:
            zones[k] = float(prior[k])
            source[k] = "prior"
        else:
            zones[k] = 0.5
            source[k] = "unknown"

    measured = [z for z in ZONE_KEYS if source[z] == "measured"]
    return {
        "zones": zones,
        "zone_source": source,
        "measured_zones": measured,
        "overall_coverage": round(float(np.mean([zones[z] for z in measured])), 3) if measured else None,
        "overlays": overlays,
        "views_used": list(overlays.keys()),
        "view_info": view_info,
        "segmentation": segmentation_mode(),
        "analysis_mode": "segmentation_measured",
    }
