import { DEFAULT_SAVE_VERSION } from './config.js';

const KEY = 'vice-meridian-heatwave-v2';
export function saveGame(game) {
  const p = game.player.position;
  const data = {
    version: DEFAULT_SAVE_VERSION, seed: game.seed, tick: game.tick,
    player: { x: p.x, z: p.z, health: game.player.health, armor: game.player.armor, cash: game.player.cash },
    wanted: game.wanted, heat: game.heat, mission: game.missions.stage,
    missionProgress: game.missions.progress, missionCount: game.missions.count,
    muted: game.audio.muted, savedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}
export function loadGame(game) {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || data.version !== DEFAULT_SAVE_VERSION || !data.player) return false;
    game.player.position.set(data.player.x, 0, data.player.z);
    game.player.health = data.player.health;
    game.player.armor = data.player.armor;
    game.player.cash = data.player.cash;
    game.wanted = data.wanted;
    game.heat = data.heat;
    game.missions.restore(data);
    game.audio.setMuted(Boolean(data.muted));
    game.showToast('SAVE LOADED · WELCOME BACK TO MERIDIAN');
    return true;
  } catch { return false; }
}
export function hasSave() {
  try { return Boolean(localStorage.getItem(KEY)); } catch { return false; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* Storage can be disabled. */ } }
