import { ROAD_LINES, LOCATIONS } from './config.js';
import { clamp, dist2 } from './math.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.elements = {
      hud: $('hud'), district: $('district'), zone: $('map-zone'), coords: $('map-coords'),
      wantedLabel: $('wanted-label'), stars: [...$('wanted-stars').children], heat: $('heat-fill'),
      missionKicker: $('mission-kicker'), missionTitle: $('mission-title'), missionDescription: $('mission-description'),
      objective: $('objective-text'), distance: $('mission-distance'), speed: $('speed-value'), vehicle: $('vehicle-name'),
      cash: $('cash-value'), health: $('health-fill'), healthValue: $('health-value'), armor: $('armor-fill'), armorValue: $('armor-value'),
      interaction: $('interaction'), crosshair: $('crosshair'), toast: $('toast'),
      caption: $('story-caption'), speaker: $('speaker'), captionText: $('caption-text'),
    };
    this.minimap = $('minimap'); this.bigMap = $('big-map');
    this.toastTime = 0; this.captionTime = 0; this.lastMissionStage = -1;
  }
  show() { this.elements.hud.classList.remove('hidden'); $('status').textContent = 'In Meridian City. Use the mission marker to find Roxy.'; }
  toast(text, duration = 3) { this.elements.toast.textContent = text; this.elements.toast.classList.add('show'); this.toastTime = duration; }
  caption(speaker, text, duration = 6) {
    this.elements.speaker.textContent = speaker; this.elements.captionText.textContent = text;
    this.elements.caption.classList.remove('hidden'); this.captionTime = duration;
  }
  damage() {
    $('damage-vignette').classList.add('hurt');
    clearTimeout(this.damageTimeout); this.damageTimeout = setTimeout(() => $('damage-vignette').classList.remove('hurt'), 140);
  }
  update(dt, game) {
    const e = this.elements, p = game.player, mission = game.missions;
    if (game.tick % 3 === 0) {
      const [district, zone] = game.city.districtAt(p.position.x, p.position.z);
      e.district.textContent = district; e.zone.textContent = zone;
      e.coords.textContent = `${Math.round(p.position.x).toString().padStart(3, '0')} / ${Math.round(p.position.z).toString().padStart(3, '0')}`;
      e.wantedLabel.textContent = game.wanted > 0 ? 'VCPD DISPATCH · IN PURSUIT' : game.heat > .15 ? 'LAY LOW · HEAT COOLING' : 'KEEP IT COOL';
      e.stars.forEach((star, i) => star.classList.toggle('hot', i < game.wanted));
      e.heat.style.width = `${clamp(game.heat / 5 * 100, 0, 100)}%`;
      e.missionKicker.textContent = mission.complete ? 'STORY COMPLETE · FREE ROAM' : `STORY ${String(mission.stage + 1).padStart(2, '0')} / 05`;
      e.missionTitle.textContent = mission.complete ? 'CITY OF SECOND CHANCES' : mission.job.title;
      e.missionDescription.textContent = mission.complete ? 'Meridian is yours. Explore, collect cars, or outrun another night.' : mission.job.description;
      e.objective.textContent = mission.objectiveText();
      e.distance.textContent = mission.complete ? '∞' : `${Math.round(dist2(p.position, mission.target))} M`;
      const kmh = p.car ? Math.round(Math.abs(p.car.speed) * 3.6) : 0;
      e.speed.textContent = String(kmh); e.vehicle.textContent = p.car ? (p.car.type === 'sport' ? 'COMET S · SPORT' : p.car.type === 'van' ? 'MERIDIAN VAN' : 'VICE COUPE') : `${Math.round(p.speed * 3.6)} KM/H · ON FOOT`;
      e.cash.textContent = p.cash.toLocaleString('en-US');
      e.health.style.width = `${clamp(p.health, 0, 100)}%`; e.healthValue.textContent = String(Math.ceil(p.health));
      e.armor.style.width = `${clamp(p.armor, 0, 100)}%`; e.armorValue.textContent = String(Math.ceil(p.armor));
      e.interaction.classList.toggle('hidden', p.car || !p.nearestCar);
      e.crosshair.classList.toggle('hidden', Boolean(p.car));
      this.drawMap(this.minimap, game, false);
      if (game.mapOpen) this.drawMap(this.bigMap, game, true);
    }
    this.toastTime -= dt; if (this.toastTime <= 0) e.toast.classList.remove('show');
    this.captionTime -= dt; if (this.captionTime <= 0) e.caption.classList.add('hidden');
  }
  drawMap(canvas, game, large) {
    const ctx = canvas.getContext('2d'), width = canvas.width, height = canvas.height;
    const center = large ? { x: 0, z: 0 } : game.player.position;
    const scale = large ? width / 690 : width / 170;
    const toX = (x) => width / 2 + (x - center.x) * scale;
    const toY = (z) => height / 2 + (z - center.z) * scale;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0c3441'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#07506c'; ctx.fillRect(0, 0, toX(-310), height);
    ctx.fillStyle = '#b69a73'; ctx.fillRect(toX(-310), 0, 48 * scale, height);
    if (!large) {
      ctx.save(); ctx.beginPath(); ctx.arc(width / 2, height / 2, width / 2 - 2, 0, Math.PI * 2); ctx.clip();
    }
    const left = center.x - width / scale / 2, top = center.z - height / scale / 2;
    ctx.fillStyle = '#122a35'; ctx.fillRect(toX(Math.max(-310, left)), toY(Math.max(-310, top)), 620 * scale, 620 * scale);
    for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 4; iz++) {
      const x = (ROAD_LINES[ix] + ROAD_LINES[ix + 1]) / 2, z = (ROAD_LINES[iz] + ROAD_LINES[iz + 1]) / 2;
      const park = (ix === 2 && iz === 1) || (ix === 0 && iz === 2);
      ctx.fillStyle = park ? '#235348' : '#38505a';
      ctx.fillRect(toX(x - 43), toY(z - 43), 86 * scale, 86 * scale);
      if (large) {
        ctx.fillStyle = park ? '#2e6454' : '#243c47';
        for (const b of game.city.colliders) {
          if (b.minX >= x - 44 && b.maxX <= x + 44 && b.minZ >= z - 44 && b.maxZ <= z + 44) ctx.fillRect(toX(b.minX), toY(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
        }
      }
    }
    ctx.strokeStyle = '#799196'; ctx.lineWidth = Math.max(2, 22 * scale);
    for (const road of ROAD_LINES) {
      ctx.beginPath(); ctx.moveTo(toX(road), toY(-310)); ctx.lineTo(toX(road), toY(310)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(-310), toY(road)); ctx.lineTo(toX(310), toY(road)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,213,166,.55)'; ctx.lineWidth = Math.max(1, scale * .35); ctx.setLineDash([5 * scale, 8 * scale]);
    for (const road of ROAD_LINES) {
      ctx.beginPath(); ctx.moveTo(toX(road), toY(-310)); ctx.lineTo(toX(road), toY(310)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(-310), toY(road)); ctx.lineTo(toX(310), toY(road)); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const car of game.vehicles.all) {
      if (!car.active) continue;
      const x = toX(car.position.x), y = toY(car.position.z);
      if (x < 0 || y < 0 || x > width || y > height) continue;
      ctx.fillStyle = car.police ? (Math.floor(game.tick / 15) % 2 ? '#ff487c' : '#4aafff') : 'rgba(217,239,234,.75)';
      ctx.fillRect(x - (large ? 2 : 1.5), y - (large ? 2 : 1.5), large ? 4 : 3, large ? 4 : 3);
    }
    if (large) {
      ctx.fillStyle = '#f6ce8f'; ctx.font = 'bold 12px Arial';
      for (const key of ['safehouse', 'marina', 'hotel', 'plaza', 'docks', 'club']) {
        const place = LOCATIONS[key]; ctx.fillText(place.label.toUpperCase(), toX(place.x) + 8, toY(place.z) - 8);
      }
    }
    if (!game.missions.complete) this.mapMarker(ctx, toX(game.missions.target.x), toY(game.missions.target.z), width, height, '#ff5a9f', game.player.position, game.missions.target, toX, toY);
    ctx.fillStyle = '#ffd184'; const sx = toX(LOCATIONS.safehouse.x), sy = toY(LOCATIONS.safehouse.z); ctx.fillRect(sx - 4, sy - 4, 8, 8);
    this.playerArrow(ctx, toX(game.player.position.x), toY(game.player.position.z), game.player.heading, large ? 1.3 : 1);
    if (!large) {
      const g = ctx.createRadialGradient(width / 2, height / 2, width * .35, width / 2, height / 2, width * .52);
      g.addColorStop(0, 'rgba(3,15,24,0)'); g.addColorStop(1, 'rgba(3,15,24,.68)'); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
  mapMarker(ctx, x, y, w, h, color, player, target) {
    const margin = 18;
    if (x < margin || x > w - margin || y < margin || y > h - margin) {
      const angle = Math.atan2(target.z - player.z, target.x - player.x);
      const radius = w * .43;
      x = w / 2 + Math.cos(angle) * radius; y = h / 2 + Math.sin(angle) * radius;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
  }
  playerArrow(ctx, x, y, heading, size) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI - heading); ctx.scale(size, size);
    ctx.shadowColor = '#39f3ed'; ctx.shadowBlur = 9; ctx.fillStyle = '#ecffff';
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-6, 7); ctx.lineTo(0, 4); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#103440'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  refreshStory(missions) {
    const list = $('story-list'); list.replaceChildren();
    for (const item of missions.storyStates()) {
      const li = document.createElement('li'); li.textContent = item.title; if (item.state) li.className = item.state; list.append(li);
    }
  }
}
