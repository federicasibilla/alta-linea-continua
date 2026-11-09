# Alta Linea Continua

**One continuous line across the Ligurian, Maritime and Cottian Alps, from Pian delle Gorre to Pian del Re.**

In summer 2026 Ema and I walked from the Marguareis to the foot of Monviso in one continuous line. This repository holds the website we made about it.

👉 **[federicasibilla.github.io/alta-linea-continua](https://federicasibilla.github.io/alta-linea-continua/)** · also in [Italian](https://federicasibilla.github.io/alta-linea-continua/it/)

| | |
|---|---|
| Stages | 24 (24 July – 18 August 2026) |
| Distance | ~377 km |
| Ascent | ~25,000 m |
| Highest point | 3,331 m |
| Summits crossed | 67 |

## What's on the site

- **[The project](https://federicasibilla.github.io/alta-linea-continua/)**: the idea behind the route.
- **[Stages](https://federicasibilla.github.io/alta-linea-continua/stages/)**: an interactive map of the whole line and a page for every stage, with an elevation profile, photos placed on the track, climbing sections and their grades, and notes.
- **[Summits](https://federicasibilla.github.io/alta-linea-continua/summits/)**: every peak the GPS track actually goes over.
- **[Preparation](https://federicasibilla.github.io/alta-linea-continua/preparation/)**: how we prepared and organised the trip.

## Download the tracks

The recorded GPS tracks are free to download, either from each stage page or directly from [`assets/tracks/`](assets/tracks/):

- [`alta-linea-continua-full-route.gpx`](assets/tracks/alta-linea-continua-full-route.gpx): the whole route as one light track, with a waypoint at the start of each stage.
- `stage-00.gpx` … `stage-23.gpx`: one full-resolution track per stage, also available as `.kml` for Google Earth.

They work with Komoot, Gaia, OsmAnd, Garmin and most other apps and GPS units.

> ⚠️ These are the lines we actually walked, in summer conditions, and they include climbing sections, some graded PD− and harder. They are a record of our trip, not a guide: check current conditions and your own experience before following any part of them.

## How it's built

- A static [Jekyll](https://jekyllrb.com/) site hosted on GitHub Pages, in English and Italian.
- Maps with [Leaflet](https://leafletjs.com/) on [OpenTopoMap](https://opentopomap.org/) tiles; map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Content is edited through [Pages CMS](https://pagescms.org/), so we can write without touching code.
- A few Python scripts in [`scripts/`](scripts/) do the data work:
  - `photos.py` places each photo on the track (from its GPS tag or its timestamp) and resizes it;
  - `summits.py` finds the OpenStreetMap peaks the track really crosses;
  - `full_route.py` builds the light full-route GPX from the stage tracks.

## Contact

Questions about the route? Ask us through the question form on the stage pages, or open an issue here.

*Ema & Federica, summer 2026*
