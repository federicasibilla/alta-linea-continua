"""Place photos on the route and keep them light.
For every image in assets/images not yet in _data/photos.json:
  1. read the position from the photo's GPS data, or, if missing, match the time it was taken
     with the GPS track (Garmin times);
  2. resize it to at most 2400 px on the longest side (JPEG 85 %), keeping the same file name.
Results go to _data/photos.json: {"file.jpg": {"lat":..,"lon":..,"stage":..,"km":..,"source":"gps"|"time"}}.
Run by .github/workflows/photos.yml."""
import json, math, os, sys
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageOps
try:
    from pillow_heif import register_heif_opener; register_heif_opener()
except Exception:
    pass

IMG = "assets/images"; OUT = "_data/photos.json"; MAXPX = 2400
stages = json.load(open("assets/data/stages.json"))
times = json.load(open("scripts/track_times.json"))
done = json.load(open(OUT)) if os.path.exists(OUT) else {}

def hav(a, b):
    R = 6371000; p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

def at_km(line, km):
    for i in range(1, len(line)):
        if line[i][2] >= km:
            a, b = line[i-1], line[i]; f = (km - a[2]) / ((b[2] - a[2]) or 1)
            return [a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f]
    return line[-1][:2]

def dms(v, ref):
    d, m, s = [float(x) for x in v]
    x = d + m/60 + s/3600
    return -x if ref in ("S", "W") else x

def exif_info(im):
    ex = im.getexif(); gps = ex.get_ifd(0x8825) if ex else {}
    sub = ex.get_ifd(0x8769) if ex else {}
    pos = None
    try:
        if gps and 2 in gps and 4 in gps:
            pos = (dms(gps[2], gps.get(1, "N")), dms(gps[4], gps.get(3, "E")))
    except Exception:
        pos = None
    t = None
    raw = sub.get(36867) or ex.get(306)
    if raw:
        try:
            dt = datetime.strptime(str(raw).strip()[:19], "%Y:%m:%d %H:%M:%S")
            off = sub.get(36881)  # OffsetTimeOriginal like "+02:00"
            if off and len(str(off)) >= 6:
                sign = 1 if str(off)[0] == "+" else -1; hh, mm = str(off)[1:6].split(":")
                tz = timezone(sign * timedelta(hours=int(hh), minutes=int(mm)))
            else:
                tz = timezone(timedelta(hours=2))  # summer time in the Alps
            t = dt.replace(tzinfo=tz).timestamp()
        except Exception:
            t = None
    return pos, t

def place_by_pos(pos):
    best = (1e18, None, None)
    for s in stages:
        for p in s["line"]:
            d = hav(pos, p)
            if d < best[0]: best = (d, s["n"], p[2])
    if best[0] > 3000: return None   # not on the route
    return {"stage": best[1], "km": round(best[2], 2)}

def place_by_time(t):
    for s in times:
        rows = s["t"]
        if rows[0][0] - 600 <= t <= rows[-1][0] + 600:
            km = min(rows, key=lambda r: abs(r[0] - t))[1]
            return {"stage": s["n"], "km": round(km, 2)}
    return None

changed = False
for name in sorted(os.listdir(IMG)):
    path = os.path.join(IMG, name)
    if name in done or not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")):
        continue
    try:
        im = Image.open(path)
    except Exception as e:
        print("skip", name, e); continue
    pos, t = exif_info(im)
    info = {}
    if pos:
        pl = place_by_pos(pos)
        if pl: info = {**pl, "lat": round(pos[0], 5), "lon": round(pos[1], 5), "source": "gps"}
    if not info and t:
        pl = place_by_time(t)
        if pl:
            ll = at_km(stages[pl["stage"]]["line"], pl["km"])
            info = {**pl, "lat": round(ll[0], 5), "lon": round(ll[1], 5), "source": "time"}
    done[name] = info or {"source": "none"}
    changed = True
    # make it light: resize big JPEG/PNG/WebP in place, same name
    if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and (max(im.size) > MAXPX or os.path.getsize(path) > 1_500_000):
        im = ImageOps.exif_transpose(im)
        im.thumbnail((MAXPX, MAXPX))
        fmt = {".png": "PNG", ".webp": "WEBP"}.get(os.path.splitext(name)[1].lower(), "JPEG")
        if fmt == "JPEG" and im.mode != "RGB": im = im.convert("RGB")
        im.save(path, fmt, quality=85, optimize=True)
    print(name, done[name])

if changed:
    json.dump(done, open(OUT, "w"), indent=1, sort_keys=True)
