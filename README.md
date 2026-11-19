# Vice Meridian Heatwave

An open-world crime game in the spirit of GTA 6: a city to explore on foot and by car, traffic and pedestrians, cars to steal and drive, a wanted level with police who respond, missions and a story, combat, a HUD with a minimap, a start screen, save slots and synthesised sound. Played with keyboard and mouse. Built with three.js, vendored as a minified build under game/vendor/; every other file under game/ is source written for this entry.

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kysoog/vice-meridian-heatwave/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kysoog/vice-meridian-heatwave/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## How to run

    node serve.ts

then open http://localhost:8080 in a desktop browser. Nothing loads over the network once the page is open.

Controls: WASD walks or drives, F gets in and out of cars, left click shoots, ESC opens the pause menu with save and load.

## What is in this repository

- game/ — the playable entry: index.html, ES modules under game/src/ and the vendored three.js build under game/vendor/.
- screenshots/ — three or four real browser renders of the game, named by shots.json.
- main.ts — the entry hand-in: copies game/ and screenshots/ to $MAKEFUN_OUTPUT_DIR (or /output) and writes dossier.json with the vendored make.fun library.
- serve.ts — a localhost static server for game/, for local play and for the screenshot harness.
- tools/capture.js — the screenshot harness: serves game/, drives headless Chromium over the Chrome DevTools Protocol and writes the JPEGs shots.json names.
- tools/determinism.js — loads every shot scene twice and compares the simulation state the page exposes.
- vendor/makefun-game.ts, LICENSE, .makefun/owner.json — read-only kit files, never modified.

Read-only: vendor/makefun-game.ts, LICENSE, .makefun/owner.json (the gate rebuilds the dossier from them and compares byte for byte).
