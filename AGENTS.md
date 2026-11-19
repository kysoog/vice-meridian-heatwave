# Contributor guide

## Repository purpose

This repository contains Vice Meridian: Heatwave, the public entry for make.fun bounty `gta6-01`. It is a static, offline-capable browser game rather than a server application. All gameplay code and procedural audiovisual assets live in `game/`; submission plumbing and capture tools live at the repository root and in `tools/`.

## Run locally

Use Node 22 or later. There is no package installation, compilation, or asset download step.

```sh
node serve.ts
```

Open http://localhost:8080 in a desktop Chromium, Firefox, or Safari browser with WebGL enabled. `node serve.ts --port 8090` selects another local port. The server binds to loopback and only serves files below `game/`.

## Controls

WASD moves or drives, Shift sprints, Space applies the handbrake, E enters/exits cars, F fires, M opens the map, and Escape/P pauses. Mouse movement controls the chase camera after pointer capture. Start, pause, audio, save/load, mission recaps, and restart controls are available in the interface.

## Source layout

- `game/index.html`: accessible interface, HUD, menu, map, and styles.
- `game/src/config.js`: shared tuning and deterministic scenario definitions.
- `game/src/random.js`, `math.js`: seeded generation and numeric helpers.
- `game/src/city.js`: static city geometry, materials, collision blocks, and landmarks.
- `game/src/vehicles.js`, `pedestrians.js`, `player.js`: vehicles, crowds, player control, police, and combat.
- `game/src/missions.js`: story progression and objectives.
- `game/src/render.js`, `hud.js`, `audio.js`, `input.js`, `save.js`: platform systems.
- `game/src/shots.js`: fixed-step capture scenarios and exposed state snapshots.
- `game/src/main.js`: composition root and simulation loop.
- `game/vendor/three.module.min.js`: the only third-party runtime library.

Keep one clear responsibility per module. Import three.js with the relative specifier `../vendor/three.module.min.js` from files in `game/src/`. Runtime code must make no CDN or other network request. Preserve fixed-step simulation and seeded random behavior: a seed and frame sequence must reproduce the same state.

## Screenshots and capture

`shots.json` is the authoritative ordered list of the four JPEG captures. `screenshots/` must contain exactly those files. The first filename is the cover. Capture uses only Node standard-library HTTP/WebSocket code and Chromium's DevTools Protocol:

```sh
node serve.ts --port 8080
node tools/capture.js --port 8080
```

The harness launches one headless Chromium instance, runs every scenario to its exposed ready flag, checks browser exceptions, writes a JSON Lines record to `capture/record.jsonl`, and closes the browser. Images must be at most 262144 bytes, at most 1280 pixels on the long side, and at least 480 pixels on the short side. Inspect every render after capture. `tools/determinism.js` repeats scenarios and reports simulation and pixel identity.

## Submission build and verification

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
node /root/makefun/gta6-kit-l25/gta6-01-kit/cli/makefun.mjs check --kit /root/makefun/gta6-kit-l25/gta6-01-kit --repo .
```

The build copies `game/` and `screenshots/` into the selected output directory and invokes `buildDossier` from `vendor/makefun-game.ts`. Limits are 163840 dossier text bytes, at most four screenshots of 262144 bytes each, at most 993 game entries and 50331648 game bytes, and at most 1000 bytes per game-relative path. Keep `out/` and capture scratch uncommitted.

## Read-only kit files

Do not modify `vendor/makefun-game.ts`, `LICENSE`, or `.makefun/owner.json`. The scorer rebuilds and compares the dossier with its own identical library. The vendored three.js module is third-party library code; gameplay changes belong in `game/src/`, not in the vendor build.

Do not commit generated output, browser profiles, capture scratch, credentials, personal information, or host-specific configuration.
