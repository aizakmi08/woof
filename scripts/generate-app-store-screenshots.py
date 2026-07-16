#!/usr/bin/env python3
"""Generate premium App Store screenshot composites for Woof.

ImageGen owns only the non-critical scene polish. All captions, UI, scores,
claims, device frames, dimensions, filenames, and review metadata are rendered
deterministically here.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RUN_ID = "2026-06-30-premium"
DEFAULT_OUT = ROOT / "outputs" / "app-store" / "screenshots" / RUN_ID
DEFAULT_POLISH_SOURCES = [
    ROOT / "inputs" / "app-store-screenshots" / "2026-06-30" / "polish" / "store-aisle.png",
    ROOT / "inputs" / "app-store-screenshots" / "2026-06-30" / "polish" / "nutrition-kitchen.png",
    ROOT / "inputs" / "app-store-screenshots" / "2026-06-30" / "polish" / "ingredient-review.png",
    ROOT / "inputs" / "app-store-screenshots" / "2026-06-30" / "polish" / "human-food.png",
]
REVIEW_RENDERER = (
    Path.home()
    / ".codex"
    / "plugins"
    / "cache"
    / "openai-curated-remote"
    / "creative-production"
    / "0.1.23"
    / "scripts"
    / "review_renderer.py"
)

FONT_REGULAR = "/System/Library/Fonts/SFNS.ttf"
FONT_ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ICON_PATH = ROOT / "assets" / "icon.png"

INK = "#17221c"
MUTED = "#66736b"
GREEN = "#16a34a"
DEEP_GREEN = "#0f3d2d"
MINT = "#c9f4dc"
CREAM = "#fff9ec"
WHITE = "#ffffff"
AMBER = "#f0aa35"
CORAL = "#e46350"
BLUE = "#2367b0"
NAVY = "#102b36"
VIOLET = "#7457b7"


@dataclass(frozen=True)
class ScreenSpec:
    slug: str
    caption: str
    eyebrow: str
    headline: str
    subhead: str
    mode: str
    accent: str
    text_theme: str
    scene_index: int
    focus: tuple[float, float]
    layout: str


SCREENS = [
    ScreenSpec(
        "scan-before-you-buy",
        "Scan before you buy",
        "Pet aisle ready",
        "Scan before you buy",
        "Point Woof at dog or cat food labels and get a cleaner read in seconds.",
        "scan",
        GREEN,
        "light",
        0,
        (0.58, 0.44),
        "right",
    ),
    ScreenSpec(
        "food-score-in-seconds",
        "Score food in seconds",
        "Fast food score",
        "Score food in seconds",
        "See nutrition, ingredients, and quality signals in one simple result.",
        "score",
        BLUE,
        "light",
        1,
        (0.40, 0.50),
        "center",
    ),
    ScreenSpec(
        "spot-ingredient-flags",
        "Spot ingredient flags",
        "Ingredient clarity",
        "Spot ingredient flags",
        "Review fillers, additives, and nutrition notes without decoding the whole bag.",
        "ingredients",
        VIOLET,
        "light",
        2,
        (0.45, 0.40),
        "left",
    ),
    ScreenSpec(
        "can-my-dog-eat-this",
        "Can my dog eat this?",
        "Snack questions",
        "Can my dog eat this?",
        "Get plain-language safety and portion context for everyday snack questions.",
        "human_food",
        CORAL,
        "light",
        3,
        (0.48, 0.44),
        "center",
    ),
    ScreenSpec(
        "try-three-scans-free",
        "Try 3 scans free",
        "Guest friendly",
        "Try 3 scans free",
        "Try Woof without an account, then save your history when you are ready.",
        "guest",
        "#1f7a4c",
        "light",
        0,
        (0.42, 0.44),
        "right",
    ),
    ScreenSpec(
        "unlimited-label-checks",
        "Unlimited label checks",
        "Woof Pro",
        "Unlimited label checks",
        "Unlock deeper reports, saved history, and repeat label checks.",
        "pro",
        "#243f8f",
        "light",
        1,
        (0.54, 0.44),
        "center",
    ),
]


SIZES = {
    "iphone-69": (1320, 2868),
    "iphone-67": (1290, 2796),
    "ipad-13": (2064, 2752),
}


def font(size: int, bold: bool = False, rounded: bool = False) -> ImageFont.FreeTypeFont:
    paths = [FONT_BOLD if bold else FONT_ROUNDED if rounded else FONT_REGULAR, FONT_REGULAR]
    for path in paths:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def rgba(value: str, alpha: int) -> tuple[int, int, int, int]:
    return (*hex_to_rgb(value), alpha)


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        probe = word if not current else f"{current} {word}"
        if text_size(draw, probe, fnt)[0] <= max_width:
            current = probe
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: str | tuple[int, int, int, int],
    max_width: int,
    line_gap: int = 10,
    align: str = "left",
) -> int:
    x, y = xy
    total = 0
    for line in wrap_text(draw, text, fnt, max_width):
        line_w, line_h = text_size(draw, line, fnt)
        line_x = x if align == "left" else x + (max_width - line_w) // 2
        draw.text((line_x, y + total), line, font=fnt, fill=fill)
        total += line_h + line_gap
    return total


def cover_crop(img: Image.Image, size: tuple[int, int], focus_x: float, focus_y: float) -> Image.Image:
    src = img.convert("RGB")
    sw, sh = src.size
    tw, th = size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, min(nw - tw, int((nw - tw) * focus_x)))
    top = max(0, min(nh - th, int((nh - th) * focus_y)))
    return src.crop((left, top, left + tw, top + th))


def rounded_shadow(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    blur: int,
    color: tuple[int, int, int, int] = (9, 18, 14, 96),
    offset_y: int = 18,
) -> None:
    mask = Image.new("L", canvas.size, 0)
    md = ImageDraw.Draw(mask)
    x1, y1, x2, y2 = box
    md.rounded_rectangle((x1, y1 + offset_y, x2, y2 + offset_y), radius=radius, fill=190)
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(Image.composite(Image.new("RGBA", canvas.size, color), Image.new("RGBA", canvas.size), mask))


def draw_soft_gradient(
    canvas: Image.Image,
    top: str,
    bottom: str,
    alpha_top: int,
    alpha_bottom: int,
) -> None:
    w, h = canvas.size
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    top_rgb = hex_to_rgb(top)
    bottom_rgb = hex_to_rgb(bottom)
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(int(top_rgb[i] * (1 - t) + bottom_rgb[i] * t) for i in range(3))
        alpha = int(alpha_top * (1 - t) + alpha_bottom * t)
        draw.line((0, y, w, y), fill=(*color, alpha))
    canvas.alpha_composite(overlay)


def create_fallback_source(index: int) -> Image.Image:
    palettes = [
        ("#eaf7ef", "#184934"),
        ("#f8f0dd", "#2367b0"),
        ("#eef5ff", "#6c4eb2"),
        ("#fff4e8", "#0b3d48"),
    ]
    top, bottom = palettes[index % len(palettes)]
    img = Image.new("RGBA", (900, 1900), WHITE)
    draw_soft_gradient(img, top, bottom, 255, 255)
    return img.convert("RGB")


def collect_polish_sources(out_dir: Path, explicit_sources: list[Path]) -> tuple[list[Image.Image], list[Path], list[str]]:
    source_dir = out_dir / "source"
    source_dir.mkdir(parents=True, exist_ok=True)

    candidates = explicit_sources or DEFAULT_POLISH_SOURCES

    copied_paths: list[Path] = []
    provenance: list[str] = []
    for index, source in enumerate(candidates, start=1):
        if not source.exists():
            continue
        destination = source_dir / f"premium-polish-{index:02d}.png"
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
        copied_paths.append(destination)
        provenance.append(f"Generated no-text ImageGen polish layer copied from {source}")

    if not copied_paths:
        for index in range(4):
            destination = source_dir / f"premium-polish-{index + 1:02d}.png"
            create_fallback_source(index).save(destination)
            copied_paths.append(destination)
            provenance.append("Procedural fallback polish layer; no ImageGen source found.")

    images = [Image.open(path).convert("RGB") for path in copied_paths]
    return images, copied_paths, provenance


def workspace_path(path: Path) -> str:
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def draw_logo_tile(canvas: Image.Image, x: int, y: int, size: int) -> None:
    draw = ImageDraw.Draw(canvas)
    if ICON_PATH.exists():
        icon = Image.open(ICON_PATH).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=size // 4, fill=255)
        clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        clipped.alpha_composite(icon)
        clipped.putalpha(mask)
        canvas.alpha_composite(clipped, (x, y))
        return

    draw.rounded_rectangle((x, y, x + size, y + size), radius=size // 4, fill=GREEN)
    cx, cy = x + size // 2, y + size // 2 + size // 12
    r = max(5, size // 12)
    draw.ellipse((cx - r * 2, cy - r, cx + r * 2, cy + r * 2), fill=CREAM)
    for dx, dy in [(-18, -19), (0, -25), (18, -19), (-31, 1), (31, 1)]:
        rr = max(5, size // 13)
        draw.ellipse((cx + dx - rr, cy + dy - rr, cx + dx + rr, cy + dy + rr), fill=CREAM)


def draw_pill(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: str | tuple[int, int, int, int],
    label: str,
    text_fill: str | tuple[int, int, int, int],
    size: int,
    outline: str | tuple[int, int, int, int] | None = None,
) -> None:
    radius = (box[3] - box[1]) // 2
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline)
    fnt = font(size, bold=True, rounded=True)
    tw, th = text_size(draw, label, fnt)
    draw.text((box[0] + (box[2] - box[0] - tw) // 2, box[1] + (box[3] - box[1] - th) // 2 - 1), label, font=fnt, fill=text_fill)


def create_background(source: Image.Image, spec: ScreenSpec, size: tuple[int, int]) -> Image.Image:
    base = cover_crop(source, size, spec.focus[0], spec.focus[1]).filter(ImageFilter.GaussianBlur(0.45))
    canvas = base.convert("RGBA")
    w, h = size
    draw_soft_gradient(canvas, "#061d19", spec.accent, 216, 56)

    wash = Image.new("RGBA", size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.rectangle((0, 0, w, int(h * 0.38)), fill=(5, 16, 13, 128))
    wd.rectangle((0, int(h * 0.38), w, int(h * 0.58)), fill=(5, 16, 13, 46))
    wd.rectangle((0, int(h * 0.70), w, h), fill=(255, 255, 255, 34))
    wd.polygon(
        [
            (0, int(h * 0.64)),
            (w, int(h * 0.50)),
            (w, h),
            (0, h),
        ],
        fill=(*hex_to_rgb(spec.accent), 54),
    )
    wd.polygon(
        [
            (0, int(h * 0.79)),
            (w, int(h * 0.69)),
            (w, h),
            (0, h),
        ],
        fill=(255, 255, 255, 36),
    )
    canvas.alpha_composite(wash)
    return canvas


def draw_marketing_header(canvas: Image.Image, spec: ScreenSpec, scale: float, ipad: bool = False) -> None:
    draw = ImageDraw.Draw(canvas)
    w, _ = canvas.size
    margin = int((84 if not ipad else 116) * scale)
    top = int((88 if not ipad else 78) * scale)
    max_width = int((1010 if not ipad else 1320) * scale)
    x = margin
    if ipad:
        max_width = int(min(max_width, w - margin * 2))

    text = WHITE
    soft = (255, 255, 255, 226)
    pill_w = int((330 if not ipad else 390) * scale)
    pill_h = int((58 if not ipad else 62) * scale)
    draw_pill(
        draw,
        (x, top, x + pill_w, top + pill_h),
        rgba(spec.accent, 230),
        spec.eyebrow,
        WHITE,
        int((22 if not ipad else 24) * scale),
        rgba(WHITE, 86),
    )

    headline_font = font(int((86 if not ipad else 78) * scale), bold=True, rounded=True)
    sub_font = font(int((31 if not ipad else 29) * scale), rounded=True)
    headline_top = top + int((90 if not ipad else 92) * scale)
    headline_height = draw_wrapped(draw, (x, headline_top), spec.headline, headline_font, text, max_width, int(12 * scale), "left")
    draw_wrapped(draw, (x, headline_top + headline_height + int(22 * scale)), spec.subhead, sub_font, soft, int(max_width * 0.82), int(8 * scale), "left")


def draw_phone(canvas: Image.Image, x: int, y: int, w: int, h: int, spec: ScreenSpec) -> None:
    draw = ImageDraw.Draw(canvas)
    radius = int(w * 0.13)
    rounded_shadow(canvas, (x, y, x + w, y + h), radius, int(w * 0.09), (0, 0, 0, 112), int(w * 0.04))
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill="#0b0f0d")
    inset = int(w * 0.034)
    sx, sy = x + inset, y + inset
    sw, sh = w - inset * 2, h - inset * 2
    draw.rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=radius - inset, fill="#f8fbf6")
    island_w, island_h = int(w * 0.28), int(w * 0.047)
    draw.rounded_rectangle(
        (x + (w - island_w) // 2, y + int(w * 0.056), x + (w + island_w) // 2, y + int(w * 0.056) + island_h),
        radius=island_h // 2,
        fill="#080b09",
    )
    draw_app_ui(canvas, (sx, sy, sw, sh), spec, tablet=False)


def draw_tablet(canvas: Image.Image, x: int, y: int, w: int, h: int, spec: ScreenSpec) -> None:
    draw = ImageDraw.Draw(canvas)
    radius = int(w * 0.055)
    rounded_shadow(canvas, (x, y, x + w, y + h), radius, int(w * 0.052), (0, 0, 0, 112), int(w * 0.03))
    draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill="#0b0f0d")
    inset = int(w * 0.024)
    sx, sy = x + inset, y + inset
    sw, sh = w - inset * 2, h - inset * 2
    draw.rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=radius - inset, fill="#f8fbf6")
    draw_app_ui(canvas, (sx, sy, sw, sh), spec, tablet=True)


def draw_status_bar(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, scale: float) -> int:
    draw.text((x, y), "9:41", font=font(int(17 * scale), bold=True), fill=INK)
    right = x + w
    bar_w = int(4 * scale)
    for index, height in enumerate([7, 10, 13]):
        bx = right - int(80 * scale) + index * int(8 * scale)
        draw.rounded_rectangle((bx, y + int((17 - height) * scale), bx + bar_w, y + int(17 * scale)), radius=bar_w // 2, fill=INK)
    draw.rounded_rectangle((right - int(48 * scale), y + int(4 * scale), right - int(14 * scale), y + int(18 * scale)), radius=int(5 * scale), outline=INK, width=max(1, int(1.5 * scale)))
    draw.rounded_rectangle((right - int(44 * scale), y + int(7 * scale), right - int(20 * scale), y + int(15 * scale)), radius=int(3 * scale), fill=INK)
    return y + int(38 * scale)


def draw_app_chrome(canvas: Image.Image, box: tuple[int, int, int, int], scale: float) -> tuple[int, int, int, int]:
    draw = ImageDraw.Draw(canvas)
    x, y, w, h = box
    pad = int(34 * scale)
    top = y + int(42 * scale)
    draw_status_bar(draw, x + pad, top, w - pad * 2, scale)
    header_y = top + int(46 * scale)
    icon_size = int(50 * scale)
    draw_logo_tile(canvas, x + pad, header_y, icon_size)
    draw.text((x + pad + int(66 * scale), header_y + int(1 * scale)), "Woof", font=font(int(28 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x + pad + int(66 * scale), header_y + int(34 * scale)), "Pet food scanner", font=font(int(15 * scale), rounded=True), fill=MUTED)
    draw_pill(
        draw,
        (x + w - pad - int(110 * scale), header_y + int(7 * scale), x + w - pad, header_y + int(43 * scale)),
        "#edf8f1",
        "Dog + Cat",
        GREEN,
        int(13 * scale),
        "#d6eadc",
    )
    return (x + pad, header_y + int(86 * scale), w - pad * 2, h - (header_y + int(86 * scale) - y) - int(92 * scale))


def draw_bottom_nav(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, scale: float, active: str) -> None:
    nav_h = int(74 * scale)
    nav_y = y + h - nav_h - int(10 * scale)
    draw.rounded_rectangle((x + int(26 * scale), nav_y, x + w - int(26 * scale), nav_y + nav_h), radius=int(28 * scale), fill="#ffffff", outline="#dce7dd")
    items = [("Scan", "scan"), ("History", "history"), ("Foods", "foods"), ("Pro", "pro")]
    for index, (label, key) in enumerate(items):
        cx = x + int(72 * scale) + index * ((w - int(144 * scale)) // 3)
        color = GREEN if key == active else "#91a096"
        draw.ellipse((cx - int(10 * scale), nav_y + int(16 * scale), cx + int(10 * scale), nav_y + int(36 * scale)), fill=color)
        tw, _ = text_size(draw, label, font(int(11 * scale), bold=key == active, rounded=True))
        draw.text((cx - tw // 2, nav_y + int(43 * scale)), label, font=font(int(11 * scale), bold=key == active, rounded=True), fill=color)


def metric_card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], label: str, value: str, color: str, scale: float) -> None:
    draw.rounded_rectangle(box, radius=int(22 * scale), fill="#ffffff", outline="#dce8df", width=max(1, int(1.5 * scale)))
    draw.text((box[0] + int(18 * scale), box[1] + int(14 * scale)), label, font=font(int(14 * scale), rounded=True), fill=MUTED)
    draw.text((box[0] + int(18 * scale), box[1] + int(40 * scale)), value, font=font(int(25 * scale), bold=True, rounded=True), fill=color)


def draw_score_ring(draw: ImageDraw.ImageDraw, center: tuple[int, int], radius: int, score: str, scale: float) -> None:
    x, y = center
    box = (x - radius, y - radius, x + radius, y + radius)
    draw.ellipse(box, fill="#eef7ee")
    draw.arc(box, start=-92, end=238, fill=GREEN, width=max(8, int(18 * scale)))
    draw.arc(box, start=238, end=268, fill=AMBER, width=max(8, int(18 * scale)))
    tw, th = text_size(draw, score, font(int(72 * scale), bold=True, rounded=True))
    draw.text((x - tw // 2, y - int(55 * scale)), score, font=font(int(72 * scale), bold=True, rounded=True), fill=GREEN)
    draw.text((x - int(44 * scale), y + int(34 * scale)), "score", font=font(int(18 * scale), rounded=True), fill=MUTED)


def draw_app_ui(canvas: Image.Image, box: tuple[int, int, int, int], spec: ScreenSpec, tablet: bool) -> None:
    draw = ImageDraw.Draw(canvas)
    x, y, w, h = box
    scale = w / (840 if tablet else 610)
    content = draw_app_chrome(canvas, box, scale)
    if spec.mode == "scan":
        draw_scan_ui(draw, content, scale)
        active = "scan"
    elif spec.mode == "score":
        draw_score_ui(draw, content, scale)
        active = "history"
    elif spec.mode == "ingredients":
        draw_ingredients_ui(draw, content, scale)
        active = "history"
    elif spec.mode == "human_food":
        draw_human_food_ui(draw, content, scale)
        active = "foods"
    elif spec.mode == "guest":
        draw_guest_ui(draw, content, scale)
        active = "scan"
    else:
        draw_pro_ui(draw, content, scale)
        active = "pro"
    draw_bottom_nav(draw, x, y, w, h, scale, active)


def draw_scan_ui(draw: ImageDraw.ImageDraw, content: tuple[int, int, int, int], scale: float) -> None:
    x, y, w, _ = content
    scan_h = int(594 * scale)
    draw.rounded_rectangle((x, y, x + w, y + scan_h), radius=int(34 * scale), fill="#0f1c16")
    label_box = (x + int(64 * scale), y + int(74 * scale), x + w - int(64 * scale), y + int(424 * scale))
    draw.rounded_rectangle(label_box, radius=int(20 * scale), fill="#fff2d8")
    for index in range(8):
        yy = label_box[1] + int((34 + index * 34) * scale)
        line_w = int((0.72 if index % 3 else 0.92) * (label_box[2] - label_box[0]))
        draw.rounded_rectangle((label_box[0] + int(32 * scale), yy, label_box[0] + int(32 * scale) + line_w, yy + int(7 * scale)), radius=int(3 * scale), fill="#8d7758")
    frame = (x + int(42 * scale), y + int(46 * scale), x + w - int(42 * scale), y + int(468 * scale))
    draw.rounded_rectangle(frame, radius=int(28 * scale), outline=MINT, width=max(3, int(6 * scale)))
    draw_pill(draw, (x + int(76 * scale), y + int(503 * scale), x + w - int(76 * scale), y + int(558 * scale)), MINT, "Ingredient label detected", GREEN, int(18 * scale))
    card = (x, y + scan_h + int(24 * scale), x + w, y + scan_h + int(142 * scale))
    draw.rounded_rectangle(card, radius=int(26 * scale), fill="#ffffff", outline="#dce8df")
    draw.text((x + int(24 * scale), card[1] + int(24 * scale)), "Ready to analyze", font=font(int(24 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x + int(24 * scale), card[1] + int(62 * scale)), "Works from photos of dog or cat food labels", font=font(int(16 * scale), rounded=True), fill=MUTED)


def draw_score_ui(draw: ImageDraw.ImageDraw, content: tuple[int, int, int, int], scale: float) -> None:
    x, y, w, _ = content
    draw.text((x, y), "Salmon & Brown Rice", font=font(int(31 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x, y + int(43 * scale)), "Dog food result", font=font(int(17 * scale), rounded=True), fill=MUTED)
    draw_score_ring(draw, (x + w // 2, y + int(220 * scale)), int(122 * scale), "91", scale)
    row_top = y + int(390 * scale)
    gap = int(13 * scale)
    card_w = (w - gap * 2) // 3
    metric_card(draw, (x, row_top, x + card_w, row_top + int(108 * scale)), "Protein", "26%", GREEN, scale)
    metric_card(draw, (x + card_w + gap, row_top, x + card_w * 2 + gap, row_top + int(108 * scale)), "Fiber", "4%", BLUE, scale)
    metric_card(draw, (x + (card_w + gap) * 2, row_top, x + w, row_top + int(108 * scale)), "Fat", "14%", "#a85e16", scale)
    summary = (x, row_top + int(137 * scale), x + w, row_top + int(321 * scale))
    draw.rounded_rectangle(summary, radius=int(26 * scale), fill="#ffffff", outline="#dce8df")
    draw.text((x + int(24 * scale), summary[1] + int(24 * scale)), "Quick take", font=font(int(22 * scale), bold=True, rounded=True), fill=INK)
    draw_wrapped(draw, (x + int(24 * scale), summary[1] + int(63 * scale)), "Strong protein profile with a few ingredients worth reviewing.", font(int(17 * scale), rounded=True), MUTED, w - int(48 * scale), int(6 * scale))


def ingredient_row(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    label: str,
    note: str,
    color: str,
    tag: str,
    scale: float,
) -> None:
    draw.rounded_rectangle((x, y, x + w, y + int(88 * scale)), radius=int(20 * scale), fill="#ffffff", outline="#dce8df")
    draw.ellipse((x + int(18 * scale), y + int(28 * scale), x + int(46 * scale), y + int(56 * scale)), fill=color)
    draw.text((x + int(60 * scale), y + int(17 * scale)), label, font=font(int(19 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x + int(60 * scale), y + int(49 * scale)), note, font=font(int(14 * scale), rounded=True), fill=MUTED)
    draw_pill(draw, (x + w - int(124 * scale), y + int(26 * scale), x + w - int(18 * scale), y + int(58 * scale)), rgba(color, 42), tag, color, int(13 * scale))


def draw_ingredients_ui(draw: ImageDraw.ImageDraw, content: tuple[int, int, int, int], scale: float) -> None:
    x, y, w, _ = content
    draw.text((x, y), "Ingredient review", font=font(int(31 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x, y + int(42 * scale)), "Informational flags for easier comparison", font=font(int(15 * scale), rounded=True), fill=MUTED)
    rows = [
        ("Chicken meal", "Named animal protein source", GREEN, "good"),
        ("Pea protein", "Compare across formulas", AMBER, "review"),
        ("Natural flavor", "Ask source if sensitive", AMBER, "review"),
        ("Fish oil", "Omega fat source", GREEN, "good"),
        ("Artificial color", "Usually unnecessary", CORAL, "flag"),
    ]
    top = y + int(100 * scale)
    for index, row in enumerate(rows):
        ingredient_row(draw, x, top + index * int(103 * scale), w, *row, scale)
    note = (x, top + int(536 * scale), x + w, top + int(652 * scale))
    draw.rounded_rectangle(note, radius=int(24 * scale), fill="#f2fbf4", outline="#d1ead8")
    draw.text((x + int(24 * scale), note[1] + int(22 * scale)), "Compare formulas faster", font=font(int(21 * scale), bold=True, rounded=True), fill=GREEN)
    draw.text((x + int(24 * scale), note[1] + int(59 * scale)), "Use notes to decide what to review next.", font=font(int(15 * scale), rounded=True), fill=MUTED)


def draw_human_food_ui(draw: ImageDraw.ImageDraw, content: tuple[int, int, int, int], scale: float) -> None:
    x, y, w, _ = content
    search = (x, y, x + w, y + int(70 * scale))
    draw.rounded_rectangle(search, radius=int(24 * scale), fill="#ffffff", outline="#dce8df")
    draw.text((x + int(24 * scale), y + int(20 * scale)), "Apple slice", font=font(int(22 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x + w - int(110 * scale), y + int(22 * scale)), "Search", font=font(int(16 * scale), bold=True, rounded=True), fill=GREEN)
    card = (x, y + int(96 * scale), x + w, y + int(388 * scale))
    draw.rounded_rectangle(card, radius=int(30 * scale), fill="#fff3e5", outline="#f0cf9f")
    draw.ellipse((x + int(34 * scale), card[1] + int(48 * scale), x + int(184 * scale), card[1] + int(198 * scale)), fill=CORAL)
    draw.polygon(
        [(x + int(120 * scale), card[1] + int(42 * scale)), (x + int(169 * scale), card[1] + int(14 * scale)), (x + int(153 * scale), card[1] + int(62 * scale))],
        fill=GREEN,
    )
    draw_pill(draw, (x + int(220 * scale), card[1] + int(54 * scale), x + int(392 * scale), card[1] + int(106 * scale)), GREEN, "Usually OK", WHITE, int(18 * scale))
    draw_wrapped(draw, (x + int(220 * scale), card[1] + int(132 * scale)), "Small plain pieces can be fine. Avoid seeds and core.", font(int(18 * scale), rounded=True), INK, int(270 * scale), int(7 * scale))
    top = card[3] + int(26 * scale)
    for index, (label, value, color) in enumerate([("Portion", "Small bites", GREEN), ("Avoid", "Seeds and core", CORAL), ("Watch", "Upset stomach", AMBER)]):
        yy = top + index * int(93 * scale)
        metric_card(draw, (x, yy, x + w, yy + int(76 * scale)), label, value, color, scale)
    draw.text((x, top + int(310 * scale)), "Informational only. Ask your vet about diets or symptoms.", font=font(int(14 * scale), rounded=True), fill=MUTED)


def draw_guest_ui(draw: ImageDraw.ImageDraw, content: tuple[int, int, int, int], scale: float) -> None:
    x, y, w, _ = content
    card = (x, y, x + w, y + int(548 * scale))
    draw.rounded_rectangle(card, radius=int(34 * scale), fill="#eefbf2", outline="#cfe8d7")
    draw.text((x + int(34 * scale), y + int(40 * scale)), "Start scanning", font=font(int(38 * scale), bold=True, rounded=True), fill=INK)
    draw_wrapped(draw, (x + int(34 * scale), y + int(100 * scale)), "No sign-in wall. Use your first free scans as a guest.", font(int(20 * scale), rounded=True), MUTED, w - int(68 * scale), int(8 * scale))
    steps = ["Scan labels", "Get a food score", "Save account later"]
    for index, label in enumerate(steps):
        yy = y + int((224 + index * 74) * scale)
        draw.ellipse((x + int(38 * scale), yy, x + int(68 * scale), yy + int(30 * scale)), fill=GREEN)
        draw.line((x + int(46 * scale), yy + int(15 * scale), x + int(54 * scale), yy + int(23 * scale)), fill=WHITE, width=max(2, int(3 * scale)))
        draw.line((x + int(54 * scale), yy + int(23 * scale), x + int(63 * scale), yy + int(8 * scale)), fill=WHITE, width=max(2, int(3 * scale)))
        draw.text((x + int(86 * scale), yy - int(2 * scale)), label, font=font(int(21 * scale), bold=True, rounded=True), fill=INK)
    draw_pill(draw, (x + int(34 * scale), y + int(445 * scale), x + w - int(34 * scale), y + int(506 * scale)), GREEN, "Start free scan", WHITE, int(21 * scale))
    draw.text((x + int(34 * scale), y + int(574 * scale)), "Save with Apple or Google when ready", font=font(int(16 * scale), rounded=True), fill=MUTED)


def draw_pro_ui(draw: ImageDraw.ImageDraw, content: tuple[int, int, int, int], scale: float) -> None:
    x, y, w, _ = content
    draw.text((x, y), "Woof Pro", font=font(int(38 * scale), bold=True, rounded=True), fill=INK)
    draw_wrapped(draw, (x, y + int(54 * scale)), "Unlimited scans, deeper reports, and saved history.", font(int(20 * scale), rounded=True), MUTED, w, int(7 * scale))
    plan_top = y + int(148 * scale)
    plans = [("Weekly", "Flexible"), ("Monthly", "Popular"), ("Annual", "Best value")]
    for index, (name, badge) in enumerate(plans):
        yy = plan_top + index * int(126 * scale)
        selected = index == 1
        draw.rounded_rectangle(
            (x, yy, x + w, yy + int(104 * scale)),
            radius=int(24 * scale),
            fill="#edf6ff" if selected else "#ffffff",
            outline="#cfe3ff" if selected else "#dce8df",
            width=max(1, int(2 * scale)),
        )
        draw.text((x + int(24 * scale), yy + int(22 * scale)), name, font=font(int(22 * scale), bold=True, rounded=True), fill=INK)
        draw.text((x + int(24 * scale), yy + int(58 * scale)), "Unlock all Pro features", font=font(int(14 * scale), rounded=True), fill=MUTED)
        draw_pill(draw, (x + w - int(154 * scale), yy + int(28 * scale), x + w - int(22 * scale), yy + int(64 * scale)), GREEN if selected else "#edf3ed", badge, WHITE if selected else GREEN, int(13 * scale))
    perks = (x, plan_top + int(416 * scale), x + w, plan_top + int(574 * scale))
    draw.rounded_rectangle(perks, radius=int(24 * scale), fill="#fff8ec", outline="#ecd7ae")
    draw.text((x + int(24 * scale), perks[1] + int(24 * scale)), "Built for repeat shops", font=font(int(21 * scale), bold=True, rounded=True), fill=INK)
    draw_wrapped(draw, (x + int(24 * scale), perks[1] + int(61 * scale)), "Scan every bag, compare results, and keep useful picks in history.", font(int(15 * scale), rounded=True), MUTED, w - int(48 * scale), int(5 * scale))


def draw_floating_proof(canvas: Image.Image, spec: ScreenSpec, scale: float, ipad: bool = False) -> None:
    draw = ImageDraw.Draw(canvas)
    w, h = canvas.size
    if ipad:
        return
    if spec.layout == "center":
        return
    proof = {
        "scan": ("0-100 score", "after the scan"),
        "score": ("Protein 26%", "nutrition at a glance"),
        "ingredients": ("Flagged", "review before buying"),
        "human_food": ("Plain guidance", "for common foods"),
        "guest": ("3 free scans", "no account needed"),
        "pro": ("Saved history", "for repeat shoppers"),
    }[spec.mode]
    card_w, card_h = int(338 * scale), int(118 * scale)
    if spec.layout == "left":
        x = int(w - card_w - 86 * scale)
    elif spec.layout == "right":
        x = int(86 * scale)
    else:
        x = int(w - card_w - 76 * scale)
    y = int(h * 0.78)
    rounded_shadow(canvas, (x, y, x + card_w, y + card_h), int(28 * scale), int(26 * scale), (0, 0, 0, 72), int(10 * scale))
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=int(28 * scale), fill=(255, 255, 255, 232), outline=(255, 255, 255, 180))
    draw.ellipse((x + int(20 * scale), y + int(33 * scale), x + int(66 * scale), y + int(79 * scale)), fill=rgba(spec.accent, 226))
    draw.text((x + int(84 * scale), y + int(26 * scale)), proof[0], font=font(int(22 * scale), bold=True, rounded=True), fill=INK)
    draw.text((x + int(84 * scale), y + int(62 * scale)), proof[1], font=font(int(16 * scale), rounded=True), fill=MUTED)


def draw_product_stage(
    canvas: Image.Image,
    spec: ScreenSpec,
    phone_box: tuple[int, int, int, int],
    scale: float,
    ipad: bool = False,
) -> None:
    draw = ImageDraw.Draw(canvas)
    x, y, w, h = phone_box
    pad_x = int((54 if not ipad else 70) * scale)
    pad_y = int((54 if not ipad else 62) * scale)
    stage = (x - pad_x, y + int(34 * scale), x + w + pad_x, y + h - int(20 * scale))
    rounded_shadow(canvas, stage, int((74 if not ipad else 82) * scale), int((40 if not ipad else 54) * scale), (0, 0, 0, 82), int(18 * scale))
    draw.rounded_rectangle(
        stage,
        radius=int((74 if not ipad else 82) * scale),
        fill=(255, 255, 255, 68),
        outline=(255, 255, 255, 92),
        width=max(1, int(2 * scale)),
    )
    draw.line(
        (stage[0] + int(40 * scale), stage[1] + int(54 * scale), stage[2] - int(40 * scale), stage[1] + int(22 * scale)),
        fill=rgba(spec.accent, 132),
        width=max(4, int(7 * scale)),
    )


def render_iphone(sources: list[Image.Image], spec: ScreenSpec, size: tuple[int, int]) -> Image.Image:
    w, h = size
    scale = w / 1320
    source = sources[spec.scene_index % len(sources)]
    canvas = create_background(source, spec, size)
    draw_marketing_header(canvas, spec, scale)

    phone_w = int((900 if spec.layout != "left" else 874) * scale)
    phone_h = int(phone_w * 2.165)
    if spec.layout == "right":
        phone_x = int(w - phone_w - 72 * scale)
    elif spec.layout == "left":
        phone_x = int(64 * scale)
    else:
        phone_x = (w - phone_w) // 2
    phone_y = int(h - phone_h - 76 * scale)
    draw_product_stage(canvas, spec, (phone_x, phone_y, phone_w, phone_h), scale)
    draw_phone(canvas, phone_x, phone_y, phone_w, phone_h, spec)
    return canvas.convert("RGB")


def render_ipad(sources: list[Image.Image], spec: ScreenSpec, size: tuple[int, int]) -> Image.Image:
    w, h = size
    scale = w / 2064
    source = sources[spec.scene_index % len(sources)]
    canvas = create_background(source, spec, size)
    draw_marketing_header(canvas, spec, scale * 0.98, ipad=True)
    tablet_w = int(1370 * scale)
    tablet_h = int(1864 * scale)
    tablet_x = (w - tablet_w) // 2
    tablet_y = int(h - tablet_h - 76 * scale)
    draw_product_stage(canvas, spec, (tablet_x, tablet_y, tablet_w, tablet_h), scale, ipad=True)
    draw_tablet(canvas, tablet_x, tablet_y, tablet_w, tablet_h, spec)
    return canvas.convert("RGB")


def run_review_renderer(out_dir: Path, families: list[dict]) -> None:
    if not REVIEW_RENDERER.exists():
        raise SystemExit(f"Missing Creative Production review renderer: {REVIEW_RENDERER}")

    renderer_items = []
    item_index = 1
    short_family_labels = {
        "iphone-69": "iPhone 6.9",
        "iphone-67": "iPhone 6.7",
        "ipad-13": "iPad 13",
    }
    for family in families:
        for item in family["screenshots"]:
            source = (ROOT / item["path"]).resolve()
            rel = source.relative_to(out_dir.resolve()).as_posix()
            short_family = short_family_labels.get(family["id"], family["label"])
            renderer_items.append(
                {
                    "id": f"{family['id']}-{item['slug']}",
                    "index": item_index,
                    "title": f"{short_family} - {item['caption']}",
                    "label": item["caption"],
                    "caption": f"{family['label']} / {item['width']} x {item['height']}",
                    "src": rel,
                    "href": rel,
                    "output": rel,
                    "familyTitle": family["label"],
                    "routeName": item["mode"],
                }
            )
            item_index += 1

    renderer_manifest = out_dir / "review-manifest.json"
    renderer_manifest.write_text(json.dumps(renderer_items, indent=2), encoding="utf-8")
    review_options = {
        "title": "Woof premium App Store screenshot pack",
        "summary": "Premium product-proof App Store composites with deterministic copy, claim-safe UI, exact export sizes, and generated no-text polish layers.",
        "output": "review-board.html",
        "preset": "image-wall",
        "showCaptions": True,
        "minTileWidth": 220,
        "contactSheetColumns": 3,
        "contactSheetThumb": 360,
    }
    review_options_path = out_dir / "review-options.json"
    review_options_path.write_text(json.dumps(review_options, indent=2), encoding="utf-8")
    subprocess.run(
        [
            sys.executable,
            str(REVIEW_RENDERER),
            "--out-dir",
            str(out_dir),
            "--manifest",
            str(renderer_manifest),
            "--review-options",
            str(review_options_path),
            "--contact-sheet",
            "--moodboard-widget-payload",
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--polish-source", type=Path, action="append", default=[], help="Optional ImageGen polish source. May be passed multiple times.")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    sources, source_paths, provenance = collect_polish_sources(out_dir, args.polish_source)

    families = []
    for family_id, size in SIZES.items():
        family_dir = out_dir / family_id
        family_dir.mkdir(parents=True, exist_ok=True)
        family = {
            "id": family_id,
            "label": {
                "iphone-69": "iPhone 6.9-inch portrait",
                "iphone-67": "iPhone 6.7-inch portrait",
                "ipad-13": "iPad 13-inch portrait",
            }[family_id],
            "screenshots": [],
        }
        for index, spec in enumerate(SCREENS, start=1):
            image = render_ipad(sources, spec, size) if family_id == "ipad-13" else render_iphone(sources, spec, size)
            filename = f"{index:02d}-{spec.slug}.png"
            path = family_dir / filename
            image.save(path, optimize=True)
            family["screenshots"].append(
                {
                    "index": index,
                    "slug": spec.slug,
                    "caption": spec.caption,
                    "headline": spec.headline,
                    "path": workspace_path(path),
                    "width": size[0],
                    "height": size[1],
                    "mode": spec.mode,
                    "layout": spec.layout,
                }
            )
        families.append(family)

    manifest = {
        "app": "Woof",
        "run_id": RUN_ID,
        "generated_at": "2026-06-30",
        "purpose": "Premium App Store screenshot refresh with product-proof-first pet food scanner positioning.",
        "source_polish_layer": workspace_path(source_paths[0]),
        "source_polish_layers": [workspace_path(path) for path in source_paths],
        "source_polish_provenance": provenance,
        "competitor_research": [
            "Bobby Approved - Food Scanner",
            "Fooducate",
            "Yuko Scan for Food Safety",
            "OneLabel - Product Scanner",
        ],
        "deterministic_layers": [
            "captions",
            "app UI composites",
            "scores and ingredient labels",
            "device frames",
            "safe-zone layout",
            "export filenames and dimensions",
        ],
        "claim_guardrails": [
            "No unsupported third-party source claims",
            "No review, alert, or historical incident claims",
            "No professional approval, certainty, or diagnosis claims",
            "Human food checks remain informational only",
        ],
        "families": families,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    run_review_renderer(out_dir, families)
    print(f"Generated {sum(len(f['screenshots']) for f in families)} screenshots in {out_dir}")


if __name__ == "__main__":
    main()
