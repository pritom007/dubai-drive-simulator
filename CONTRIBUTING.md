# Contributing

Thanks for helping improve Dubai Drive.

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm start` and open http://localhost:4177.
3. Run `npm test` before submitting a change.

There are no npm dependencies. Do not commit generated `work/` files, release archives in `outputs/`, secrets, or local environment files.

## Pull requests

- Keep changes focused and explain the user-visible effect.
- Add or update deterministic tests for physics, routing, parsing, or recovery changes.
- Test keyboard and pointer controls in a WebGL2 browser for visual changes.
- Preserve OpenStreetMap and Dubai Municipality attribution.
- Clearly label reconstructed or estimated behavior. Do not describe generated lane geometry, traffic timing, entrances, or building models as authoritative.
- Avoid adding large map extracts to the repository without documenting their source, date, bounds, license, and why the existing bounded-corridor approach is insufficient.

## Rebuilding map data

Use `npm run prepare:world -- path/to/extract.osm data/world.json`. Review the generated bounds and counts, run the complete test suite, and include source/provenance notes in the pull request.

By contributing, you agree that your code contribution may be distributed under the repository's MIT license. Map/database contributions remain subject to their source licenses, including ODbL where applicable.
