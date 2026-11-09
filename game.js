const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const oreStat = document.getElementById('oreStat');
const fuelStat = document.getElementById('fuelStat');
const hullStat = document.getElementById('hullStat');
const powerStat = document.getElementById('powerStat');
const objectiveText = document.getElementById('objective');
const hullBar = document.getElementById('hullBar');
const fuelBar = document.getElementById('fuelBar');
const powerBar = document.getElementById('powerBar');
const toastEl = document.getElementById('toast');

const bgStars = Array.from({ length: 150 }, () => ({
  x: Math.random() * 5000,
  y: Math.random() * 5000,
  r: 0.8 + Math.random() * 2.6,
  alpha: 0.3 + Math.random() * 0.7,
}));

const buildCatalog = {
  solar: { label: 'Solar', cost: 3, power: 11, color: '#f8ea90' },
  reactor: { label: 'Reactor', cost: 5, power: 16, color: '#81d2ff' },
  thruster: { label: 'Thruster', cost: 4, power: 4, color: '#ff9c7a' },
  storage: { label: 'Vault', cost: 4, power: 2, color: '#96e3a9' },
};

const world = {
  width: 4200,
  height: 3000,
};

const state = {
  gameOver: false,
  selectedBuild: 'solar',
  mission: {
    delivered: 0,
    requiredDeliver: 14,
    built: 0,
    requiredBuild: 7,
    win: false,
  },
  player: {
    x: 1100,
    y: 1420,
    vx: 0,
    vy: 0,
    radius: 18,
    angle: 0,
    speed: 280,
    boostMultiplier: 1.4,
    fuel: 100,
    maxFuel: 100,
    hull: 100,
    maxHull: 100,
    ore: 0,
    miningCooldown: 0,
  },
  station: {
    x: 1450,
    y: 1420,
    radius: 170,
    power: 0,
    safeZone: 260,
  },
  oreNodes: [],
  fuelCaches: [],
  blocks: [],
};

const keys = {};
let pointer = { x: canvas.width / 2, y: canvas.height / 2 };
let lastTime = 0;

function spawnOreNodes() {
  const nearbyDeposits = [[820, 1280], [900, 1600], [1210, 1190], [1280, 1670], [1680, 1240]];
  for (let i = 0; i < nearbyDeposits.length; i += 1) {
    const [x, y] = nearbyDeposits[i];
    state.oreNodes.push({
      x,
      y,
      amount: 10 + Math.random() * 18,
      radius: 22 + Math.random() * 9,
      shape: Array.from({ length: 8 }, () => 0.72 + Math.random() * 0.5),
      color: i % 3 === 0 ? '#d9b66d' : i % 3 === 1 ? '#9ed6ff' : '#d7a2ff',
    });
  }
  const total = 24;
  for (let i = 0; i < total; i += 1) {
    state.oreNodes.push({
      x: 200 + Math.random() * (world.width - 400),
      y: 200 + Math.random() * (world.height - 400),
      amount: 10 + Math.random() * 18,
      radius: 18 + Math.random() * 12,
      shape: Array.from({ length: 8 }, () => 0.72 + Math.random() * 0.5),
      color: i % 3 === 0 ? '#d9b66d' : i % 3 === 1 ? '#9ed6ff' : '#d7a2ff',
    });
  }
}

function spawnFuelCaches() {
  const total = 6;
  for (let i = 0; i < total; i += 1) {
    state.fuelCaches.push({
      x: 550 + Math.random() * (world.width - 1100),
      y: 260 + Math.random() * (world.height - 520),
      amount: 40,
      radius: 18,
    });
  }
}

function setToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(setToast.timeoutId);
  setToast.timeoutId = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 1400);
}

function updateObjective() {
  if (state.mission.win) {
    objectiveText.textContent = 'The orbital ring is stable. The frontier is secured.';
    return;
  }

  const oreLeft = Math.max(0, state.mission.requiredDeliver - state.mission.delivered);
  const buildLeft = Math.max(0, state.mission.requiredBuild - state.mission.built);
  objectiveText.textContent = `Deliver ${oreLeft} more ore to the station and complete ${buildLeft} more structure(s).`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = (clientX - rect.left) * (canvas.width / rect.width);
  const sy = (clientY - rect.top) * (canvas.height / rect.height);
  const camX = state.player.x - canvas.width / 2;
  const camY = state.player.y - canvas.height / 2;
  return {
    x: camX + sx,
    y: camY + sy,
  };
}

function setSelectedBuild(type) {
  state.selectedBuild = type;
  document.querySelectorAll('.build-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.type === type);
  });
}

function placeStructure(worldX, worldY) {
  const type = state.selectedBuild;
  const recipe = buildCatalog[type];
  if (!recipe) return;

  if (state.player.ore < recipe.cost) {
    setToast('Not enough ore. Mine more asteroids.');
    return;
  }

  const nearStation = distance({ x: worldX, y: worldY }, state.station) < 120;
  if (!nearStation) {
    setToast('Build next to the station ring.');
    return;
  }

  const tooClose = state.blocks.some((block) => distance(block, { x: worldX, y: worldY }) < 32);
  if (tooClose) {
    setToast('Structure overlap detected.');
    return;
  }

  state.player.ore -= recipe.cost;
  state.blocks.push({ x: worldX, y: worldY, type, radius: 18, power: recipe.power });
  state.station.power += recipe.power;
  state.mission.built += 1;
  updateObjective();
  setToast(`${recipe.label} deployed.`);

  if (state.mission.built >= state.mission.requiredBuild && state.mission.delivered >= state.mission.requiredDeliver) {
    state.mission.win = true;
    updateObjective();
    setToast('Outpost stabilized!');
  }
}

function mineNearestOre() {
  const nearest = state.oreNodes
    .map((ore) => ({ ore, d: distance(state.player, ore) }))
    .sort((a, b) => a.d - b.d)[0];

  if (!nearest || nearest.d > 120) {
    setToast('No viable ore vein in range.');
    return;
  }

  if (state.player.miningCooldown > 0) return;
  nearest.ore.amount -= 5.5;
  state.player.miningCooldown = 0.18;

  if (nearest.ore.amount <= 0) {
    state.player.ore += 4;
    state.oreNodes = state.oreNodes.filter((ore) => ore !== nearest.ore);
    setToast('Ore collected.');
  }
}

function collectFuel() {
  const cache = state.fuelCaches
    .map((cell) => ({ cell, d: distance(state.player, cell) }))
    .sort((a, b) => a.d - b.d)[0];

  if (!cache || cache.d > 80) return;
  const refuel = Math.min(30, 100 - state.player.fuel);
  if (refuel <= 0) {
    setToast('Fuel tank full.');
    return;
  }
  state.player.fuel += refuel;
  cache.cell.amount = 0;
  state.fuelCaches = state.fuelCaches.filter((cell) => cell !== cache.cell);
  setToast('Fuel cells refilled.');
}

function deliverOre() {
  if (distance(state.player, state.station) > state.station.safeZone) {
    setToast('Approach the station ring to deliver.');
    return;
  }

  if (state.player.ore <= 0) {
    setToast('Cargo hold is empty.');
    return;
  }

  const toDeliver = Math.min(state.player.ore, state.mission.requiredDeliver - state.mission.delivered);
  state.player.ore -= toDeliver;
  state.mission.delivered += toDeliver;
  updateObjective();
  setToast(`Delivered ${toDeliver} ore.`);

  if (state.mission.built >= state.mission.requiredBuild && state.mission.delivered >= state.mission.requiredDeliver) {
    state.mission.win = true;
    updateObjective();
    setToast('Outpost stabilized!');
  }
}

function handleInput(dt) {
  const player = state.player;
  const throttle = keys.ShiftLeft || keys.ShiftRight ? 1.4 : 1;
  const moveX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const moveY = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);

  if (moveX || moveY) {
    const length = Math.hypot(moveX, moveY) || 1;
    const vx = (moveX / length) * player.speed * throttle;
    const vy = (moveY / length) * player.speed * throttle;
    player.vx += vx * dt * 0.85;
    player.vy += vy * dt * 0.85;
    const angle = Math.atan2(vy, vx);
    if (Math.abs(vx) > 0 || Math.abs(vy) > 0) player.angle = angle;
    if (player.fuel > 0) {
      player.fuel = Math.max(0, player.fuel - (dt * 3.5 * throttle));
    }
  } else {
    player.vx *= 0.9;
    player.vy *= 0.9;
  }

  const speedLimit = 290 * throttle;
  const mag = Math.hypot(player.vx, player.vy);
  if (mag > speedLimit) {
    const scale = speedLimit / mag;
    player.vx *= scale;
    player.vy *= scale;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, 60, world.width - 60);
  player.y = clamp(player.y, 60, world.height - 60);

  if (keys.KeyE || keys.KeyF) {
    mineNearestOre();
  }

  if (keys.KeyC) {
    deliverOre();
    keys.KeyC = false;
  }

  if (keys.KeyR) {
    collectFuel();
    keys.KeyR = false;
  }

  if (player.fuel <= 0 && (keys.KeyD || keys.KeyA || keys.KeyW || keys.KeyS || keys.ArrowLeft || keys.ArrowRight || keys.ArrowUp || keys.ArrowDown)) {
    player.vx *= 0.68;
    player.vy *= 0.68;
  }

  if (player.miningCooldown > 0) {
    player.miningCooldown -= dt;
  }
}

function drawBackground() {
  ctx.fillStyle = '#010812';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const camX = state.player.x - canvas.width / 2;
  const camY = state.player.y - canvas.height / 2;

  for (const star of bgStars) {
    const x = star.x - camX * 0.18;
    const y = star.y - camY * 0.18;
    if (x < -10 || y < -10 || x > canvas.width + 10 || y > canvas.height + 10) continue;
    ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
    ctx.fillRect(x, y, star.r, star.r);
  }

  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    20,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.9,
  );
  gradient.addColorStop(0, 'rgba(92, 161, 255, 0.10)');
  gradient.addColorStop(1, 'rgba(10, 12, 20, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWorld() {
  const camX = state.player.x - canvas.width / 2;
  const camY = state.player.y - canvas.height / 2;

  ctx.save();
  ctx.translate(-camX, -camY);

  // Distant planetary landmarks make the field readable and give long trips a sense of scale.
  const planet = ctx.createRadialGradient(3300, 620, 30, 3300, 620, 330);
  planet.addColorStop(0, '#d4c6a9');
  planet.addColorStop(0.55, '#817a83');
  planet.addColorStop(0.82, '#4d6177');
  planet.addColorStop(1, '#17263a');
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(3300, 620, 330, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(177, 209, 240, 0.42)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.ellipse(3300, 620, 470, 115, -0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(5, 14, 26, 0.6)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(3300, 620, 440, 104, -0.22, 0, Math.PI * 2);
  ctx.stroke();

  const moonGlow = ctx.createRadialGradient(850, 2460, 8, 850, 2460, 125);
  moonGlow.addColorStop(0, '#9cb2be');
  moonGlow.addColorStop(0.65, '#516576');
  moonGlow.addColorStop(1, '#182638');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(850, 2460, 125, 0, Math.PI * 2);
  ctx.fill();

  const baseGlow = ctx.createRadialGradient(state.station.x, state.station.y, 40, state.station.x, state.station.y, state.station.radius + 200);
  baseGlow.addColorStop(0, 'rgba(121, 169, 255, 0.3)');
  baseGlow.addColorStop(1, 'rgba(121, 169, 255, 0)');
  ctx.fillStyle = baseGlow;
  ctx.beginPath();
  ctx.arc(state.station.x, state.station.y, state.station.radius + 140, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(123, 177, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(state.station.x, state.station.y, state.station.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(177, 220, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(state.station.x - 112, state.station.y);
  ctx.lineTo(state.station.x + 112, state.station.y);
  ctx.moveTo(state.station.x, state.station.y - 112);
  ctx.lineTo(state.station.x, state.station.y + 112);
  ctx.stroke();
  ctx.fillStyle = '#d5ebff';
  ctx.beginPath();
  ctx.arc(state.station.x, state.station.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5c91bd';
  for (const [dx, dy] of [[-112, 0], [112, 0], [0, -112], [0, 112]]) {
    ctx.fillRect(state.station.x + dx - 17, state.station.y + dy - 17, 34, 34);
    ctx.strokeStyle = 'rgba(231, 245, 255, 0.8)';
    ctx.strokeRect(state.station.x + dx - 17, state.station.y + dy - 17, 34, 34);
  }
  ctx.fillStyle = 'rgba(175, 225, 255, 0.8)';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KESTREL OUTPOST', state.station.x, state.station.y + 208);

  for (const block of state.blocks) {
    ctx.fillStyle = buildCatalog[block.type].color;
    ctx.fillRect(block.x - 16, block.y - 16, 32, 32);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(block.x - 16, block.y - 16, 32, 32);
  }

  for (const cell of state.fuelCaches) {
    ctx.fillStyle = '#89e3ff';
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(127, 237, 255, 0.32)';
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const ore of state.oreNodes) {
    ctx.fillStyle = ore.color;
    ctx.beginPath();
    ore.shape.forEach((scale, index) => {
      const angle = (index / ore.shape.length) * Math.PI * 2;
      const x = ore.x + Math.cos(angle) * ore.radius * scale;
      const y = ore.y + Math.sin(angle) * ore.radius * scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(237, 245, 255, 0.38)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(ore.x - ore.radius * 0.2, ore.y - ore.radius * 0.2, ore.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  drawPlayer();
  drawReticle();
}

function drawPlayer() {
  const camX = state.player.x - canvas.width / 2;
  const camY = state.player.y - canvas.height / 2;

  ctx.save();
  ctx.translate(state.player.x - camX, state.player.y - camY);
  ctx.rotate(state.player.angle);

  ctx.fillStyle = '#e1efff';
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-12, 10);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-12, -10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#6ed4ff';
  ctx.fillRect(-4, -4, 10, 8);

  ctx.fillStyle = '#f0a867';
  ctx.fillRect(-18, -5, 10, 10);

  ctx.restore();
}

function drawReticle() {
  const pointerWorld = screenToWorld(pointer.x, pointer.y);
  const drawX = pointerWorld.x - (state.player.x - canvas.width / 2);
  const drawY = pointerWorld.y - (state.player.y - canvas.height / 2);

  ctx.strokeStyle = 'rgba(115, 231, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(drawX, drawY, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(drawX - 22, drawY);
  ctx.lineTo(drawX - 8, drawY);
  ctx.moveTo(drawX + 8, drawY);
  ctx.lineTo(drawX + 22, drawY);
  ctx.moveTo(drawX, drawY - 22);
  ctx.lineTo(drawX, drawY - 8);
  ctx.moveTo(drawX, drawY + 8);
  ctx.lineTo(drawX, drawY + 22);
  ctx.stroke();
}

function drawHUD() {
  oreStat.textContent = `${state.player.ore}`;
  fuelStat.textContent = `${Math.round(state.player.fuel)}%`;
  hullStat.textContent = `${Math.round(state.player.hull)}%`;
  powerStat.textContent = `${state.station.power}`;

  hullBar.style.width = `${state.player.hull}%`;
  fuelBar.style.width = `${state.player.fuel}%`;
  powerBar.style.width = `${Math.min(100, state.station.power * 12)}%`;
}

function update(dt) {
  if (state.mission.win) {
    if (state.player.hull < 100) state.player.hull = clamp(state.player.hull + dt * 5, 0, 100);
    return;
  }

  handleInput(dt);

  const stationDist = distance(state.player, state.station);
  if (stationDist < state.station.radius + 18) {
    state.player.hull = clamp(state.player.hull + dt * 8, 0, 100);
  } else if (state.player.hull < 100) {
    state.player.hull = clamp(state.player.hull - dt * 1.5, 0, 100);
  }

  if (state.player.hull <= 0) {
    state.player.hull = 100;
    state.player.x = 1100;
    state.player.y = 1420;
    state.player.vx = 0;
    state.player.vy = 0;
    setToast('Hull breach. Returning to launch lane.');
  }

  if (state.player.fuel <= 0 && (keys.KeyD || keys.KeyA || keys.KeyW || keys.KeyS)) {
    state.player.hull = clamp(state.player.hull - dt * 6, 0, 100);
  }

  if (state.player.ore > 0 && stationDist < state.station.safeZone * 0.8) {
    // Station transponder sees cargo, encouraging docking.
  }

}

function tick(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0.016, 0.033);
  lastTime = timestamp;
  update(dt);
  drawBackground();
  drawWorld();
  drawHUD();
  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (event.code === 'KeyE' || event.code === 'KeyF') {
    event.preventDefault();
  }
  if (event.code === 'KeyB') {
    event.preventDefault();
    placeStructure(state.player.x + 40, state.player.y + 40);
  }
  if (event.code === 'Digit1') setSelectedBuild('solar');
  if (event.code === 'Digit2') setSelectedBuild('reactor');
  if (event.code === 'Digit3') setSelectedBuild('thruster');
  if (event.code === 'Digit4') setSelectedBuild('storage');
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

canvas.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});

canvas.addEventListener('click', (event) => {
  const worldPoint = screenToWorld(event.clientX, event.clientY);
  placeStructure(worldPoint.x, worldPoint.y);
});

function initialize() {
  spawnOreNodes();
  spawnFuelCaches();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  pointer.x = canvas.width / 2;
  pointer.y = canvas.height / 2;
  updateObjective();
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

initialize();
