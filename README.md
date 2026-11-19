# Vice Meridian: Heatwave

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kysoog/vice-meridian-heatwave/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kysoog/vice-meridian-heatwave/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A neon-soaked open-world crime sandbox built for the [Make GTA 6 bounty on make.fun](https://make.fun/bounty/gta6-01). Explore Meridian City on foot or behind the wheel, take story jobs, outrun an escalating police response, and save your progress locally. Everything is rendered with WebGL through a vendored three.js build; there are no runtime network requests or external assets.

## Run

Requires Node 22. No install or build step is needed.

```sh
node serve.ts
```

Open **http://localhost:8080** in a desktop browser. Click **Enter Meridian**, then use:

- **WASD** to move or drive; **Shift** to sprint; **Space** for the handbrake
- **E** to enter or leave a nearby vehicle; **F** to fire
- **M** for the city map; **P / Escape** to pause
- **Mouse** to look; click the game to recapture the pointer
- The pause menu to save, load, adjust sound, or restart

The story marker and mission card show the next objective. Traffic, pedestrians, combat, police heat, and wanted stars are systemic and continue between jobs.

## Entry build

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` and writes `out/dossier.json` with the competition's byte limits. `out/` is local build output and is ignored.
