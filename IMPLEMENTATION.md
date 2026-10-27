# Dubai Drive 0.4 — implementation and verification

## Driver-seat and reverse update

Version 0.4 makes the driver-seat perspective the default. A camera-attached 3D cabin includes dashboard, windshield supports, steering wheel animated from the vehicle steering angle, and live instrument textures. The external player car is hidden only in the interior camera. A rear-window view is available on B or the on-screen control; C cycles driver, chase, and overhead views. These are procedural cabin models, not a scanned production-car interior.

Drive and Reverse are explicit gearbox states. G or the on-screen D/R buttons select direction only below 0.15 m/s, then set speed to zero. Throttle accelerates in the selected direction; braking removes speed in both directions without crossing zero. Reverse is capped at 5 m/s (18 km/h), yaw follows signed velocity, and travelled distance accumulates positively. Route deviation recalculation and spoken turn cues are suppressed during reverse manoeuvring. The R keyboard shortcut remains route retry.

The added regression suite checks reverse displacement, reversed steering yaw, reverse braking, speed cap, moving gear rejection, and returning to forward driving. Browser QA confirmed actual reverse movement and a rejected shift while moving. The existing routing and physics suites still pass.

## Scope

The initial prototype was a small Canvas projection with a hardcoded route. Version 0.3 replaces the active application with a 3D renderer and real graph routing, preserves the earlier source in the task's intermediate backup, and packages the new runtime separately. It implements bounded, source-based city corridors rather than bundling a whole-city database.

## Data and processing

The initial OSM map extract uses the bounding box `55.126,25.063,55.157,25.092`. `scripts/build-world.mjs` parses source nodes, public or unspecified-access driving ways, building polygons, named places, water ways, signal nodes, and supported turn restrictions. Every road retains its OSM way ID, source node IDs, coordinates, bilingual names where tagged, lane-count provenance, speed provenance, layer, bridge and tunnel tags.

`node scripts/build-world.mjs path/to/extract.osm data/world.json` rebuilds the processed data. For an ordinary bounded extract, the original source is the OSM map API, `https://api.openstreetmap.org/api/0.6/map?bbox=55.126,25.063,55.157,25.092`. Do not use that editing API as a bulk city download service.

The bundled Dubai Mall corridor was retrieved on 2026-10-19 using an OSRM route from `25.0869,55.14499` to `25.1974,55.2797`, then an Overpass linestring query with roads within 650 m and buildings within 200 m. Whole ways and referenced nodes preserve connectivity. The runtime has the same bounded corridor-loading implementation in `src/corridor-service.mjs`. A first live response was unusable; a subsequent request returned the validated 6,466-way / 1,656-building corridor included here. Public service failures produce an explicit error rather than a fabricated road.

## Routing

`src/network.js` builds directed edges from shared source nodes. A spatial grid accelerates road matching. A binary priority queue accelerates A*; edge state retains the previous source way to enforce supported node-via restrictions. A route consists of contiguous directed edges and fractional first/last segments. U-turns are penalised and explicit supported prohibitions are respected. Not all OSM conditional, vehicle-specific, lane-level or via-way restrictions are implemented; a route is not a guarantee of real-world legal manoeuvres.

Rerouting uses the current position and heading to the same destination. It does not reset or teleport the car. When no local recovery route exists, the client may load a new corridor, rebuild the world, and preserve the latest car coordinates, heading, speed, driven distance, time, score and incident count. Public services can fail or return insufficient connectivity; this state is reported.

## Buildings and addresses

OSM footprints determine horizontal building location and shape. Initial coverage has 438 named building footprints. Heights use a height tag, else levels × 3.2 m, else an explicitly estimated 15 m. Heights are capped at 420 m for this renderer. All facades/windows are procedural. Multi-part buildings and relation-only footprints are not fully reconstructed.

The official Makani SOAP service was verified live. Cayan Tower's public location resolved to entrance **12922 75854**, coordinate **25.0869,55.14499**. The runtime resolves any submitted ten-digit number through the documented `GetMakaniDetails` method. A malformed number is rejected before a network request. Returned entrance data keeps Dubai Municipality attribution and remains separate from OSM map data.

Local building names and coordinates can snap to mapped roads. Starting/ending roads inside the containing building footprint are avoided where possible. The result is a road-access approximation, not a verified garage entrance. The UI shows access distance. The Dubai Mall preset uses a documented approximate route endpoint; names may resolve differently through a live geocoder.

Unknown place names query Nominatim only on explicit field completion/submission, not on every keypress. Requests are serialised with at least 1.1 seconds between starts and cached in process memory. Set `NOMINATIM_URL` to a compatible provider before wider deployment. Query text is not logged to disk. The local server binds only to 127.0.0.1 and rejects cross-origin API requests.

## Driving and traffic

- Fixed 60 Hz bicycle-model physics; acceleration, aerodynamic drag, non-reversing braking, progressive steering, high-speed lateral-acceleration cap, off-road resistance, and oriented collision bounds.
- Independently traversable world roads rather than turn-trigger scene transitions. Vehicle road elevation is inferred from bridge/layer tags; levels are not surveyed elevations.
- Independent traffic edge traversal, headway braking, player-response braking, simple gap-checked gradual lane changes, synthetic red/amber/green signal phases, and recycled vehicle objects.
- Signal positions are source-derived; timing is a training approximation. Complex intersection priority, lane-by-lane turn negotiation and multiroad merge anticipation remain incomplete.
- Building contact is simplified for off-road departure. Vehicle collision response and camera obstruction are simplified rather than full rigid-body simulation.
- Spoken cues are generated from upcoming graph manoeuvres and speed-based preparation distance. Audio-first hides visual route aid. Speech quality depends on the browser/system.

## Validation performed

Automated suites pass for progressive acceleration/braking, steering, oriented collisions, route projection, car following, braking at rest, highway steering limit, four real building routes, shared-node continuity, supported restrictions, disconnected geometric crossings, private-access exclusion, reverse one-way source conversion, Makani response handling, and wrong-road recovery with unchanged destination/position.

Verified routes:

| From | To | Distance |
|---|---|---:|
| Cayan Tower | Almas Tower | 4.80 km |
| Almas Tower | Cayan Tower | 5.55 km |
| Dubai Marina Mall | Princess Tower | 2.76 km |
| Princess Tower | Dubai Marina Mall | 2.15 km |
| Marina public entrance coordinate | Dubai Mall corridor endpoint | 21.89 km |

The last test checks every one of the 337 graph segments for shared source-node continuity and permitted supported turns, and confirms that both motorway and motorway-link edges are used. A deterministic navigation replay samples source edges; it is not proof of manually driving every kilometre or of survey-grade lane geometry.

Chrome verification exercised the planner, a live Makani lookup with visible source attribution, two building routes, corridor loading, keyboard acceleration and braking, stopped state in Drive, camera switching, and the 3D scene. A planner bug that re-resolved destinations on Start was found and corrected so the previewed route is retained.

## Performance measurements

Representative local measurements, not hardware-independent guarantees:

- The initial runtime/map/renderer payload is approximately **3.79 MB raw / 0.80 MB gzip**, excluding external fonts and HTTP overhead.
- The optional Dubai Mall corridor is **4.14 MB raw / 0.88 MB gzip**; it is not requested during ordinary local Marina/JLT startup.
- The initial-area simulation averaged approximately **0.15 ms per fixed update**, with **0.29 ms p95**, in a 600-update Node sample with traffic.
- Dubai Mall route calculation improved from about 850 ms with repeated sorting to approximately **70–90 ms** with a binary priority queue in Node.
- Chrome samples observed roughly **42–60 FPS** across initial, loaded-corridor, flyover and highway views. No low-end hardware or sustained worst-case GPU benchmark was performed.

The server compresses textual assets, caches only a bounded number of route worlds, serialises corridor requests, pools traffic objects, merges static geometry, caps device pixel ratio, uses a local road spatial index, and releases old renderer resources when replacing a corridor.

## Remaining limits

This is a substantial working prototype, not a complete digital twin of Dubai. Complete authoritative entrance coverage is queried on demand rather than bundled. Driveway/car-park access, official sign placement, lane-level geometry, exact flyover elevations, traffic-light timing, relation-only building polygons, complex turn restrictions and fully validated full-city driving behaviour still require additional data and engineering. Live address/corridor services have no availability guarantee in this prototype. Route and building data must be validated before using the application as formal driving instruction.

## Primary sources

- OpenStreetMap copyright and ODbL: https://www.openstreetmap.org/copyright
- Dubai Municipality Makani terms and service manual: https://www.dm.gov.ae/open-data2/open-data-for-makani/
- OSRM route API: https://project-osrm.org/docs/v5.24.0/api/
- Overpass linestring queries: https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
