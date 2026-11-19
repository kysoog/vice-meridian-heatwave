// Save slot: progress kept in this browser's localStorage. Never sends
// anything anywhere. Returns null when storage is unavailable.

const KEY = 'vmh-save-v1';

export function saveGame(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function defaultSave() {
  return { money: 400, missionIndex: 0, missionStage: 'idle', completed: 0 };
}
