# Vice Meridian Heatwave — contributor guide

## What this repository is

An entry for make.fun's "Make GTA 6" bounty (gta6-01): an open-world crime game played in a desktop browser, keyboard and mouse, built from static files under game/ with three.js vendored under game/vendor/. main.ts at the repository root is the entry hand-in: it copies game/ and screenshots/ to the output directory and writes dossier.json with the vendored make.fun library.

## How to run the game

    node serve.ts

then open http://localhost:8080. The server needs Node 22 and the standard library only; nothing is installed and nothing loads over the network at run time.

Controls: WASD to walk or drive, F to get into or out of a car, left click to shoot, ESC for the pause menu, and the title screen starts a new game or loads a save.

Screenshots are taken by the harness in tools/capture.js (Chromium over the Chrome DevTools Protocol, WebGL enabled). tools/determinism.js loads every shot scene twice and compares the simulation state the page exposes.

## How the entry is built and verified

- game/ holds index.html, the source modules under game/src/ and the vendored three.js minified build under game/vendor/. A file under a directory named vendor, or named *.min.js, is classed as vendored and never shown as source in the dossier.
- screenshots/ holds 3 to 4 JPEG screenshots, each at most 256 KiB, long side at most 1280 px and short side at least 480 px, named with letters, digits, dot, underscore or dash only. shots.json names them, and screenshots/ must contain exactly those files.
- Shot scenes are staged (not scripted input) by game/src/shots.js from the URL: `?shot=cover|driving|chase|mission&seed=N` runs the simulation forward deterministically, paints the frame and sets `window.__shotReady` for the harness. Reload the same URL and the same frame comes back.
- Run the hand-in locally: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` — it must exit 0 and write out/game, out/screenshots and out/dossier.json.
- Run the competition's pre-submit checks: `node /root/makefun/gta6-kit-v20/gta6-01-kit/cli/makefun.mjs check --kit ... --repo ...` — every check must pass.
- The dossier's text is capped at 163,840 UTF-8 bytes: keep the game's own source focused and well named; the vendor library is excluded from it.

## What is read-only

Do not modify vendor/makefun-game.ts, LICENSE or .makefun/owner.json — the gate rebuilds the dossier with vendor/makefun-game.ts and compares byte for byte. Everything else under game/, screenshots/, main.ts, serve.ts and shots.json is written for this entry and may be rewritten.

## Conventions

- One clear job per source file, named for what it does (file and function names are what the dossier outline shows of the code).
- All simulation randomness comes from a seeded RNG so screenshot scenes are reproducible per seed.
- No network requests, no external assets: sounds are synthesised with Web Audio, textures are generated on canvas.
- Everything written for this entry is original: no names, logos, characters, art, music or map from any commercial game.
