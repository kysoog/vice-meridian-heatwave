// The heads-up display: speed, wanted stars, money, mission objective and a
// top-down minimap, drawn over the canvas with plain DOM and canvas 2D.

export function createHUD(document) {
  const els = {};
  for (const id of ['speed', 'stars', 'money', 'objective', 'msg']) {
    els[id] = document.getElementById(id);
  }
  const map = document.getElementById('minimap');
  const ctx = map.getContext('2d');

  const scale = 0.24; // pixels per metre on the minimap
  const range = map.width / 2 / scale;

  function starsText(count) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= count ? '&#9733;' : '&#9734;';
    return s;
  }

  /** A timed job shows its clock in front of the objective text. */
  function clockText(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    draw(state, entities, screen, briefing) {
      const p = state.player;
      if (els.speed) els.speed.textContent = Math.abs(Math.round(p.speed * 3.6)) + ' km/h';
      if (els.stars) {
        els.stars.innerHTML = starsText(state.stars);
        els.stars.style.color = state.stars > 0 ? '#ffd93a' : '#6b7485';
      }
      if (els.money) els.money.textContent = '$' + p.money;
      if (els.objective) {
        const timer = state.mission.timer;
        els.objective.textContent = (timer > 0 ? clockText(timer) + '   ·   ' : '') + state.mission.objective;
      }
      if (els.msg) els.msg.textContent = briefing || '';
      drawMinimap(state, entities);
      setOverlays(screen, briefing);
    },
  };

  function drawMinimap(state, entities) {
    const { cars, peds, player, boxes, missions, police } = entities;
    const p = state.player;
    const cx = p.x;
    const cz = p.z;
    const yaw = p.yaw;

    ctx.clearRect(0, 0, map.width, map.height);
    ctx.fillStyle = '#14171f';
    ctx.fillRect(0, 0, map.width, map.height);

    const hx = map.width / 2;
    const hy = map.height / 2;

    // Roads: grid lines around the player.
    ctx.strokeStyle = '#333a44';
    ctx.lineWidth = 2;
    const layout = entities.layout;
    for (const r of layout.roads) {
      const z = (r - cz) * scale;
      if (z > -map.height && z < map.height) {
        ctx.beginPath(); ctx.moveTo(0, hy + z); ctx.lineTo(map.width, hy + z); ctx.stroke();
      }
      const x = (r - cx) * scale;
      if (x > -map.width && x < map.width) {
        ctx.beginPath(); ctx.moveTo(hx + x, 0); ctx.lineTo(hx + x, map.height); ctx.stroke();
      }
    }

    // Buildings within range.
    ctx.fillStyle = '#3a3f4a';
    for (const b of boxes) {
      const dx = (b.x - cx) * scale;
      const dz = (b.z - cz) * scale;
      if (Math.abs(dx) < range + 70 && Math.abs(dz) < range + 70) {
        ctx.fillRect(hx + dx - b.w * scale / 2, hy + dz - b.d * scale / 2, b.w * scale, b.d * scale);
      }
    }

    // Mission marker.
    if (missions.stage === 'active' && missions.index < missions.list.length) {
      const t = missions.target;
      const dx = (t.x - cx) * scale;
      const dz = (t.z - cz) * scale;
      if (Math.abs(dx) < range && Math.abs(dz) < range) {
        ctx.fillStyle = '#ffd93a';
        ctx.beginPath();
        ctx.arc(hx + dx, hy + dz, 5, 0, 6.28);
        ctx.fill();
      }
    }

    const dot = (x, z, color, size) => {
      const dx = (x - cx) * scale;
      const dz = (z - cz) * scale;
      if (Math.abs(dx) < range && Math.abs(dz) < range) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(hx + dx, hy + dz, size, 0, 6.28);
        ctx.fill();
      }
    };

    for (const c of cars) dot(c.x, c.z, c.police ? '#ff3333' : '#5aa9e6', 3);
    for (const p2 of peds) {
      if (!p2.down) dot(p2.x, p2.z, '#9aa3ae', 1.5);
    }

    // Player at the centre, heading line.
    ctx.strokeStyle = '#4cff77';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.sin(yaw) * 14, hy + Math.cos(yaw) * 14);
    ctx.stroke();
    ctx.fillStyle = '#4cff77';
    ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, 6.28); ctx.fill();
  }

  function setOverlays(screen, briefing) {
    const show = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'flex'; };
    const hide = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
    hide('start'); hide('pause'); hide('save'); hide('msg');
    if (screen === 'title') { show('start'); }
    else if (screen === 'paused' || screen === 'menu') { show('pause'); }
    else if (screen === 'save') { show('save'); }
    if (briefing) { show('msg'); }
  }
}
