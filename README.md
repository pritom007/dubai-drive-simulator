# Dubai Drive

A runnable browser driving prototype with real OpenStreetMap road connectivity, 3D building footprints, building/place route selection, official Makani entrance lookup, and on-demand Dubai road corridors.

## Run

Requires Node.js 20 or later and a modern browser with WebGL2. No installation or API key is needed.

```sh
npm install
npm start
```

There are no third-party npm dependencies; `npm install` verifies the lockfile and prepares the standard npm workflow.

Open **http://localhost:4177**. The bundled Marina / JLT map loads first. Select two buildings and press **Start this drive**. For the **Marina → Dubai Mall** preset, press **Load real-road corridor**, then **Start**. That corridor is included in the package and does not need a map download.

Other Dubai addresses can be entered as a building name, `latitude, longitude`, or a ten-digit Makani number. Unknown place names use OpenStreetMap Nominatim. Makani numbers use Dubai Municipality's official service. Routes beyond loaded coverage download their own road/building corridor using public OSRM and Overpass services. These services are subject to availability and their usage policies; use a dedicated provider or self-host them before public deployment. Routes over 60 km are currently rejected to bound prototype memory and download size.

## Controls

| Input | Action |
|---|---|
| W / Up | Accelerate |
| S / Down | Brake, without reversing in Drive |
| G / D and R buttons | Select Drive or Reverse while stopped |
| B / Look behind button | Toggle rear-window view |
| A D / Left Right | Continuous steering |
| Q / E | Left / right indicator |
| H | Hazard indicator |
| C / camera button | Driver seat (default) / chase / overhead camera |
| Space | Pause and report |
| R | Retry selected route |

Mouse/touch pedals and steering buttons are also available. The audio-first button hides visual route guidance.

To reverse: brake to a stop, select **R** using its on-screen button or **G**, then use **W / Up / ACCEL** to move backward. **S / Down / BRAKE** stops in either gear. Reverse is capped at 18 km/h; selecting the opposite gear is blocked while moving. The **R keyboard key still retries the route**, so it is distinct from the on-screen R gear button.

The default driver-seat camera includes a 3D dashboard, windshield pillars, an animated steering wheel, a speedometer and a D/R gauge. Use **B** to look through the rear window while manoeuvring. Alternative external cameras remain available on **C**.

## What changed

- Replaced the flat road projection with a local Three.js WebGL renderer: actual building footprints, streets, ramps, water polygons, lighting, shadows, approximate bridge elevations, lane markings, source-named street labels, and 3D vehicles.
- Replaced hardcoded turn sequences with a directed graph over source node IDs. Source one-ways, public/unspecified access, and supported node-via turn restrictions affect routing. Crossing lines do not create junctions.
- Added building/place selection, local coordinate input, online building search, official Makani lookup, offline route presets, and new corridor loading.
- Rerouting retains the destination and car position. It can request additional corridor data when the loaded graph has no recovery route.
- Traffic traverses connected graph edges independently of the player's route, follows leaders, reacts to the player, negotiates simple lane changes, observes synthetic traffic phases, and recycles away from the player.
- Vehicle steering is capped by speed and comfortable lateral acceleration. Braking no longer causes reverse motion. Collision bounds follow vehicle orientation.

## Coverage and accuracy

Initial dataset: **1,869 road ways, 1,685 building footprints, 1,180 places**. Loading the bundled Marina–Dubai Mall corridor extends the combined world to **7,590 ways and 3,220 footprints**.

This is a source-based prototype, not a certified road or driver-training model. Road centerlines and footprint positions come from OSM. Lanes, untagged speeds, bridge heights, building facades, and untagged building heights are reconstructed. Signal locations come from OSM; their timing is synthetic. Street-label placement is generated, not a survey of official sign locations.

Building names are not equivalent to surveyed vehicle entrances. Routing reaches a nearby mapped drivable access; the planner shows its distance from the requested point. Makani can resolve an official entrance coordinate, but the last driveway/walk may still be missing from OSM. The application does not claim that every Dubai building has a verified car-access route or photorealistic model.

See **IMPLEMENTATION.md** for tests, performance, data processing, and remaining work.

## Repository layout

```text
data/       Processed OSM world and bundled Dubai Mall corridor
scripts/    Local HTTP/API server and OSM world builder
src/        Renderer, driving physics, routing, services and UI
tests/      Deterministic physics, routing, service and corridor tests
vendor/     Pinned Three.js browser modules and their MIT license
```

## Docker

```sh
docker build -t dubai-drive .
docker run --rm -p 4177:4177 dubai-drive
```

Then open **http://localhost:4177**. The container includes the bundled maps; live address and new-corridor features still need outbound internet access.

## Verification

```sh
npm test
```

Tests exercise driving physics, graph connectivity, turn rules, false bridge junction prevention, four building routes, continuous highway/ramp traversal on the 21.89 km Dubai Mall corridor, wrong-road recovery without teleportation, and official-service parsing.

## Licenses and attribution

Application source code is available under the **MIT License** in `LICENSE`.

Map and processed database: **© OpenStreetMap contributors, ODbL 1.0**, https://www.openstreetmap.org/copyright. The processed JSON files and their conversion code are included for source inspection and reuse under the applicable database license.

Official Makani results: **Dubai Municipality**, https://www.dm.gov.ae/open-data2/open-data-for-makani/. These responses remain separate from the bundled OSM database and are not sold or redistributed as a bulk dataset.

Three.js 0.180.0: MIT, license included in `vendor/THREE-LICENSE.txt`. Fonts are loaded from Google Fonts with system-font fallbacks.

See `data/LICENSE.md` for the data-specific notice, `CONTRIBUTING.md` before submitting changes, and `SECURITY.md` for private vulnerability reporting guidance.
