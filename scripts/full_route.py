"""Build the light full-route GPX from the per-stage tracks.

    python3 scripts/full_route.py

Reads assets/tracks/stage-XX.gpx and writes
assets/tracks/alta-linea-continua-full-route.gpx as ONE track with ONE
segment (what Komoot, Garmin, OsmAnd and Gaia import reliably), simplified
with Douglas-Peucker so the whole line stays a few MB at most. Each stage
start is kept as a waypoint, plus the finish. No extra packages needed.
"""
import glob
import math
import os
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACKS = os.path.join(ROOT, "assets", "tracks")
OUT = os.path.join(TRACKS, "alta-linea-continua-full-route.gpx")
TOLERANCE_M = 2.0          # max deviation from the original line, metres
NS = {"g": "http://www.topografix.com/GPX/1/1"}


def read_stage(path):
    root = ET.parse(path).getroot()
    name = root.findtext("g:trk/g:name", default="", namespaces=NS)
    pts = []
    for p in root.iterfind(".//g:trkpt", NS):
        ele = p.findtext("g:ele", namespaces=NS)
        pts.append((float(p.get("lat")), float(p.get("lon")), float(ele) if ele else None))
    return name, pts


def to_xy(pts):
    lat0 = math.radians(sum(p[0] for p in pts) / len(pts))
    r = 6371000.0
    return [(math.radians(lon) * r * math.cos(lat0), math.radians(lat) * r) for lat, lon, _ in pts]


def simplify(pts, tol):
    """Iterative Douglas-Peucker; returns the indices to keep."""
    if len(pts) < 3:
        return list(range(len(pts)))
    xy = to_xy(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            if L2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [i for i, k in enumerate(keep) if k]


def main():
    files = sorted(glob.glob(os.path.join(TRACKS, "stage-*.gpx")),
                   key=lambda f: int(re.search(r"stage-(\d+)", f).group(1)))
    wpts, line = [], []
    n_in = 0
    for f in files:
        name, pts = read_stage(f)
        n_in += len(pts)
        num = int(re.search(r"stage-(\d+)", f).group(1))
        label = re.sub(r"^Alta Linea Continua\s*[–-]\s*", "", name) or f"Stage {num}"
        wpts.append((pts[0], label))
        line += [pts[i] for i in simplify(pts, TOLERANCE_M)]
    wpts.append((line[-1], "Finish · Pian del Re"))

    def pt(tag, p, inner=""):
        ele = f"<ele>{p[2]:.1f}</ele>" if p[2] is not None else ""
        return f'<{tag} lat="{p[0]:.6f}" lon="{p[1]:.6f}">{ele}{inner}</{tag}>'

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Alta Linea Continua">',
           "<metadata><name>Alta Linea Continua – full route</name></metadata>"]
    out += [pt("wpt", p, f"<name>{escape(n)}</name>") for p, n in wpts]
    out += ["<trk><name>Alta Linea Continua – full route</name><trkseg>"]
    out += [pt("trkpt", p) for p in line]
    out += ["</trkseg></trk>", "</gpx>", ""]
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))
    print(f"{n_in:,} points in -> {len(line):,} points out, "
          f"{os.path.getsize(OUT) / 1e6:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
