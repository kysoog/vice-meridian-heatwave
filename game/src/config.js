export const FIXED_DT = 1 / 60;
export const ROAD_LINES = [-240, -120, 0, 120, 240];
export const WORLD_LIMIT = 310;
export const PLAYER_START = { x: 6, z: 145, heading: Math.PI };
export const COLORS = {
  ink: 0x07131d, asphalt: 0x132632, concrete: 0x84949b,
  cyan: 0x20e3e6, pink: 0xff3b9d, amber: 0xffc66d,
  ocean: 0x075573, grass: 0x274f44,
};
export const LOCATIONS = {
  safehouse: { x: 6, z: 145, label: 'Palmetto Safehouse' },
  marina: { x: -114, z: -176, label: 'Vesper Marina' },
  hotel: { x: 126, z: 66, label: 'Hotel Solara' },
  plaza: { x: -6, z: -54, label: 'Meridian Plaza' },
  docks: { x: 234, z: -174, label: 'Port Meridian' },
  club: { x: -126, z: 66, label: 'Vice Room' },
  beach: { x: -276, z: 100, label: 'Heatwave Beach' },
};
export const MISSION_NAMES = [
  'A KEY TO THE CITY', 'THE VESPER EXCHANGE', 'SOLARA STATIC',
  'NO SIGNAL', 'HEATWAVE FINALE',
];
export const SHOTS = {
  boulevard: { frame: 240, scene: 0, position: [6, 145], heading: Math.PI },
  driving: { frame: 300, scene: 1, position: [-6, 76], heading: Math.PI },
  chase: { frame: 360, scene: 2, position: [-30, -6], heading: Math.PI / 2 },
  mission: { frame: 300, scene: 3, position: [-114, -138], heading: Math.PI },
};
export const CAR_COLORS = [0xf2507b, 0x24c8cc, 0xf5bd4f, 0xeeeeee, 0x6c7df2, 0x252a37, 0xff7043];
export const DEFAULT_SAVE_VERSION = 2;
