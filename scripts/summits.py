"""Find the summits the route actually crosses.
Downloads OpenStreetMap peaks around each stage and keeps those the GPS track passes over
(horizontal distance <= 120 m and the track reaches within 70 m of the summit altitude).
Writes _data/summits_auto.json. Run by .github/workflows/data.yml."""
import json, math, time, urllib.parse, urllib.request

S = json.load(open("assets/data/stages.json"))

def hav(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def overpass(q):
    for url in ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]:
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "alta-linea-continua/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except Exception as e:
            print("overpass failed", url, e)
            time.sleep(5)
    raise SystemExit("no overpass server answered")

# one request for the whole route area, then check every peak against every stage
allla = [p[0] for s in S for p in s["line"]]; alllo = [p[1] for s in S for p in s["line"]]
bbox = f"{min(allla)-0.005},{min(alllo)-0.005},{max(allla)+0.005},{max(alllo)+0.005}"
res = overpass(f'[out:json][timeout:120];node["natural"="peak"]({bbox});out;')
peaks = res.get("elements", [])
print(len(peaks), "peaks in the area")
out = []
for s in S:
    line = s["line"]; prof = s["profile"]
    la0, la1 = min(p[0] for p in line) - 0.003, max(p[0] for p in line) + 0.003
    lo0, lo1 = min(p[1] for p in line) - 0.003, max(p[1] for p in line) + 0.003
    for el in peaks:
        if not (la0 <= el["lat"] <= la1 and lo0 <= el["lon"] <= lo1):
            continue
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("name:it") or tags.get("name:fr")
        if not name:
            continue
        pk = (el["lat"], el["lon"])
        best, bkm = 1e9, 0
        for p in line:
            d = hav(pk, p)
            if d < best:
                best, bkm = d, p[2]
        if best > 120:
            continue
        near = [a for k, a in prof if abs(k - bkm) <= 0.3]
        reached = max(near) if near else 0
        try:
            ele = int(float(str(tags.get("ele", "0")).replace(",", ".").split()[0]))
        except Exception:
            ele = 0
        if ele and reached < ele - 70:
            continue
        out.append({"name": name, "ele": ele, "lat": round(pk[0], 5), "lon": round(pk[1], 5),
                    "stage": s["n"], "km": round(bkm, 2), "dist_m": round(best)})

# one entry per summit (a summit on a stage boundary counts once, on its first stage)
seen, uniq = set(), []
for p in sorted(out, key=lambda x: (x["stage"], x["km"])):
    key = (p["name"], p["ele"])
    if key in seen:
        continue
    seen.add(key); uniq.append(p)
json.dump(uniq, open("_data/summits_auto.json", "w"), ensure_ascii=False, indent=1)
print(len(uniq), "summits")
