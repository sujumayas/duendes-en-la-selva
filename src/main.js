import {
  SIZE, MATERIALS, MATERIAL_LABELS, RECIPES, STRUCTURES,
  generateMap, canAfford, hasRequirements, spendCosts,
  encounterChance, chooseEncounter,
} from "./engine.js";

const TILE = 48;
const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  portrait: document.querySelector("#portrait"), healthBar: document.querySelector("#healthBar"), healthText: document.querySelector("#healthText"),
  dayText: document.querySelector("#dayText"), stepsText: document.querySelector("#stepsText"), dangerText: document.querySelector("#dangerText"),
  dangerBar: document.querySelector("#dangerBar"), resources: document.querySelector("#resources"), tools: document.querySelector("#tools"),
  toast: document.querySelector("#toast"), dialog: document.querySelector("#gameDialog"), dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"), dialogBody: document.querySelector("#dialogBody"), dialogActions: document.querySelector("#dialogActions"),
};

let soundOn = true;
let audioContext;
let toastTimer;
let state;

function freshState() {
  const generated = generateMap();
  return {
    ...generated,
    player: { ...generated.start },
    inventory: { branch: 0, stone: 0, vine: 0, log: 0, campfire: false, hammer: false, axe: false, spear: false, torch: false, piano: false },
    health: 10, maxHealth: 10, day: 1, totalSteps: 0, stepsOnMap: 0, mapsVisited: 1, trapCount: 0, encounterCooldown: 5,
  };
}

function save() {
  try { localStorage.setItem("duendes-save-v1", JSON.stringify(state)); } catch { /* private browsing */ }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem("duendes-save-v1"));
    if (saved?.map?.length === SIZE && saved.player && saved.inventory) return saved;
  } catch { /* begin again */ }
  return freshState();
}

function beep(frequency = 300, duration = 0.06, type = "square", volume = 0.025) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch { /* sound is decorative */ }
}

function pixelRect(target, color, x, y, w, h) { target.fillStyle = color; target.fillRect(x, y, w, h); }

function hash(x, y, salt = 0) {
  let n = (x * 374761393 + y * 668265263 + state.seed + salt * 69069) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function drawGround(x, y, tile) {
  const px = x * TILE; const py = y * TILE;
  const palettes = {
    dirt: ["#806b3f", "#6e5b35", "#9a7d47"],
    garden: ["#53733c", "#466535", "#71884a"],
    stonePath: ["#73705a", "#5e604e", "#8c8569"],
  };
  const colors = palettes[tile.terrain];
  pixelRect(ctx, colors[0], px, py, TILE, TILE);
  for (let i = 0; i < 7; i += 1) {
    const dx = 3 + Math.floor(hash(x, y, i) * 38);
    const dy = 3 + Math.floor(hash(y, x, i + 8) * 38);
    pixelRect(ctx, colors[i % 2 + 1], px + dx, py + dy, i % 3 === 0 ? 5 : 3, i % 2 ? 3 : 2);
  }
  if (tile.terrain === "stonePath") {
    ctx.strokeStyle = "#4c5042"; ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 5, 17, 14); ctx.strokeRect(px + 25, py + 3, 18, 17); ctx.strokeRect(px + 12, py + 25, 21, 17);
  }
  if (tile.terrain === "garden") {
    for (let i = 0; i < 4; i += 1) {
      const fx = px + 8 + i * 10; const fy = py + 10 + (i % 2) * 22;
      pixelRect(ctx, i % 2 ? "#e4b852" : "#c56b6b", fx, fy, 3, 3);
      pixelRect(ctx, "#33542d", fx + 1, fy + 3, 1, 4);
    }
  }
}

function drawForest(x, y, tile) {
  const px = x * TILE; const py = y * TILE;
  pixelRect(ctx, "#193c29", px, py, TILE, TILE);
  pixelRect(ctx, "#173423", px + 2, py + 2, 44, 44);
  const crown = tile.chopped > 0 ? "#31583a" : "#28633a";
  pixelRect(ctx, "#4c3523", px + 20, py + 23, 8, 22);
  pixelRect(ctx, "#69472b", px + 23, py + 24, 4, 20);
  pixelRect(ctx, crown, px + 8, py + 7, 32, 25);
  pixelRect(ctx, "#397a43", px + 13, py + 3, 22, 9);
  pixelRect(ctx, "#1f4e32", px + 5, py + 15, 13, 13);
  pixelRect(ctx, "#4a8a49", px + 19, py + 8, 8, 6);
  pixelRect(ctx, "#173a28", px + 34, py + 18, 8, 11);
  if (tile.chopped > 0) {
    pixelRect(ctx, "#b18a4e", px + 22, py + 21, 7, 5);
    pixelRect(ctx, "#513724", px + 24, py + 22, 3, 2);
  }
}

function drawIcon(target, type, x, y, scale = 1) {
  const r = (color, dx, dy, w, h) => pixelRect(target, color, x + dx * scale, y + dy * scale, w * scale, h * scale);
  if (type === "branch") { r("#3c2a1d", 5, 9, 13, 3); r("#97613a", 4, 7, 13, 3); r("#97613a", 8, 4, 3, 5); r("#3f753b", 6, 2, 5, 4); }
  if (type === "stone") { r("#4c504b", 5, 7, 14, 10); r("#888a76", 8, 4, 8, 4); r("#a7a184", 10, 5, 5, 3); r("#303b35", 6, 15, 12, 3); }
  if (type === "vine") { r("#284d2c", 6, 4, 4, 15); r("#69a54b", 9, 3, 4, 14); r("#376b35", 12, 13, 6, 4); r("#85b85a", 5, 5, 5, 3); }
  if (type === "log") { r("#4a2e1d", 4, 7, 17, 11); r("#8b5730", 3, 5, 15, 11); r("#c18a4a", 16, 6, 6, 10); r("#6b4729", 18, 8, 2, 6); }
  if (type === "hammer") { r("#825435", 10, 9, 4, 14); r("#bab095", 5, 5, 14, 7); r("#5d625b", 4, 7, 16, 5); }
  if (type === "axe") { r("#7f5030", 11, 6, 4, 17); r("#c5b897", 5, 4, 10, 8); r("#5c655e", 5, 5, 8, 8); }
  if (type === "spear") { r("#8e5a31", 11, 5, 3, 18); r("#c4bea4", 9, 2, 7, 6); r("#6a7065", 11, 1, 3, 7); }
  if (type === "torch") { r("#76502f", 11, 9, 4, 14); r("#edb943", 8, 3, 10, 9); r("#d96b32", 10, 6, 6, 7); r("#fff09c", 12, 3, 3, 5); }
  if (type === "campfire") { r("#8a5934", 4, 16, 17, 4); r("#6a402b", 7, 13, 14, 4); r("#e46f2f", 8, 6, 10, 11); r("#f4bd43", 11, 3, 6, 12); r("#fff09b", 12, 8, 4, 7); }
  if (type === "piano") { r("#3d231a", 3, 7, 20, 13); r("#7b4730", 5, 4, 16, 7); r("#eadcae", 7, 12, 13, 5); for (let i = 0; i < 4; i += 1) r("#22211b", 8 + i * 3, 12, 1, 4); r("#563320", 5, 20, 3, 3); r("#563320", 19, 20, 3, 3); }
  if (type === "exit") { r("#493220", 4, 2, 18, 22); r("#b08a4c", 7, 4, 12, 19); r("#193b28", 9, 7, 8, 16); r("#eed16b", 16, 13, 2, 2); }
  if (type === "dungeon") { r("#27232c", 3, 6, 20, 17); r("#57445b", 6, 3, 14, 20); r("#17141c", 9, 9, 8, 14); r("#aa6bb0", 5, 5, 3, 3); }
  if (type === "base") { r("#644027", 3, 10, 20, 13); r("#9c6335", 1, 8, 24, 5); r("#b67a3f", 5, 5, 16, 5); r("#2b241a", 10, 14, 6, 9); }
  if (type === "chair") { r("#81502c", 7, 5, 5, 14); r("#aa6c37", 10, 12, 10, 5); r("#714328", 10, 16, 3, 7); r("#714328", 18, 16, 3, 7); }
  if (type === "trap") { r("#7d5a35", 4, 8, 19, 3); r("#7d5a35", 4, 17, 19, 3); for (let i = 0; i < 4; i += 1) r("#bdb38c", 6 + i * 5, 10, 3, 7); }
  if (type === "pen") { r("#865831", 3, 6, 3, 17); r("#865831", 20, 6, 3, 17); r("#a36c39", 4, 9, 18, 3); r("#a36c39", 4, 17, 18, 3); }
}

function drawFeature(x, y, type) {
  const scale = 1.35; const iconSize = 24 * scale;
  drawIcon(ctx, type, x * TILE + (TILE - iconSize) / 2, y * TILE + (TILE - iconSize) / 2, scale);
  if (["branch", "stone", "vine"].includes(type)) {
    ctx.fillStyle = "rgba(242, 218, 137, .8)";
    ctx.fillRect(x * TILE + 21, y * TILE + 40, 6, 2);
  }
}

function drawPlayer() {
  const x = state.player.x * TILE; const y = state.player.y * TILE;
  ctx.fillStyle = "rgba(8, 18, 9, .45)"; ctx.fillRect(x + 11, y + 39, 27, 5);
  pixelRect(ctx, "#34231c", x + 14, y + 34, 8, 9); pixelRect(ctx, "#34231c", x + 28, y + 34, 8, 9);
  pixelRect(ctx, "#5d783a", x + 12, y + 19, 25, 18);
  pixelRect(ctx, "#9fbe58", x + 14, y + 11, 20, 17);
  pixelRect(ctx, "#7fa447", x + 9, y + 14, 7, 8); pixelRect(ctx, "#7fa447", x + 32, y + 14, 7, 8);
  pixelRect(ctx, "#25331e", x + 18, y + 17, 3, 4); pixelRect(ctx, "#25331e", x + 28, y + 17, 3, 4);
  pixelRect(ctx, "#e8d483", x + 19, y + 17, 1, 1); pixelRect(ctx, "#e8d483", x + 29, y + 17, 1, 1);
  pixelRect(ctx, "#4b6532", x + 17, y + 25, 14, 3);
  pixelRect(ctx, "#334e2a", x + 9, y + 7, 30, 7); pixelRect(ctx, "#4c7136", x + 15, y + 3, 19, 6);
  pixelRect(ctx, "#93a54e", x + 21, y + 1, 8, 4);
}

function renderMap() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const tile = state.map[y][x];
    if (tile.terrain === "forest") drawForest(x, y, tile); else drawGround(x, y, tile);
  }
  ctx.globalAlpha = .16; ctx.strokeStyle = "#142319"; ctx.lineWidth = 1;
  for (let i = 0; i <= SIZE; i += 1) { ctx.beginPath(); ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, canvas.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * TILE); ctx.lineTo(canvas.width, i * TILE); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const tile = state.map[y][x];
    if (tile.feature) drawFeature(x, y, tile.feature);
    if (tile.structure) drawFeature(x, y, tile.structure);
  }
  drawPlayer();
  const current = state.map[state.player.y][state.player.x];
  if (current.feature || current.structure) { ctx.strokeStyle = "#f0d276"; ctx.lineWidth = 3; ctx.strokeRect(state.player.x * TILE + 2, state.player.y * TILE + 2, TILE - 4, TILE - 4); }
}

function iconCanvas(type, size = 32) {
  const element = document.createElement("canvas"); element.width = 26; element.height = 26;
  const target = element.getContext("2d"); target.imageSmoothingEnabled = false;
  drawIcon(target, type, 1, 1, 1);
  element.style.width = `${size}px`; element.style.height = `${size}px`;
  return element;
}

function renderInventory() {
  ui.resources.replaceChildren();
  for (const type of MATERIALS) {
    const card = document.createElement("div"); card.className = "resource"; card.append(iconCanvas(type, 24));
    const label = document.createElement("span"); label.textContent = MATERIAL_LABELS[type];
    const count = document.createElement("b"); count.textContent = state.inventory[type];
    card.append(label, count); ui.resources.append(card);
  }
  ui.tools.replaceChildren();
  for (const recipe of RECIPES) {
    const tool = document.createElement("div"); tool.className = `tool${state.inventory[recipe.id] ? " owned" : ""}`;
    tool.title = recipe.name; tool.dataset.short = recipe.name.split(" ")[0]; tool.append(iconCanvas(recipe.icon, 32)); ui.tools.append(tool);
  }
}

function renderStatus() {
  const hp = Math.max(0, state.health / state.maxHealth * 100);
  ui.healthBar.style.width = `${hp}%`; ui.healthText.textContent = `${state.health}/${state.maxHealth}`;
  ui.dayText.textContent = state.day; ui.stepsText.textContent = state.totalSteps;
  const danger = encounterChance(state.stepsOnMap, state.trapCount);
  ui.dangerText.textContent = `${Math.round(danger * 100)}%`; ui.dangerBar.style.width = `${danger / .38 * 100}%`;
  renderInventory(); renderMap(); save();
}

function showToast(message) {
  clearTimeout(toastTimer); ui.toast.textContent = message; ui.toast.classList.add("visible");
  toastTimer = setTimeout(() => ui.toast.classList.remove("visible"), 2200);
}

function makeButton(label, handler, className = "wood-button") {
  const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = label;
  button.addEventListener("click", handler); return button;
}

function openDialog(kicker, title, body) {
  ui.dialogKicker.textContent = kicker; ui.dialogTitle.textContent = title; ui.dialogBody.replaceChildren(); ui.dialogActions.replaceChildren();
  if (typeof body === "string") { const p = document.createElement("p"); p.className = "dialog-copy"; p.innerHTML = body; ui.dialogBody.append(p); }
  else ui.dialogBody.append(body);
  if (!ui.dialog.open) ui.dialog.showModal();
}

function closeDialog() { if (ui.dialog.open) ui.dialog.close(); }

function move(dx, dy) {
  if (ui.dialog.open || state.health <= 0) return;
  const nx = state.player.x + dx; const ny = state.player.y + dy;
  if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || state.map[ny][nx].terrain === "forest") { beep(90, .05); showToast("La selva es demasiado densa por ahí."); return; }
  state.player = { x: nx, y: ny }; state.totalSteps += 1; state.stepsOnMap += 1; state.encounterCooldown -= 1;
  if (state.totalSteps % 30 === 0) state.day += 1;
  beep(130 + (state.totalSteps % 2) * 20, .025, "square", .012);
  const tile = state.map[ny][nx];
  if (["branch", "stone", "vine"].includes(tile.feature)) showToast(`Hay ${MATERIAL_LABELS[tile.feature].toLowerCase()} aquí. Pulsa E para recoger.`);
  else if (tile.feature === "exit") showToast("La salida de esta parcela. Pulsa E para continuar.");
  else if (tile.feature === "dungeon") showToast("Una entrada a un calabozo. Pulsa E si te atreves.");
  if (state.encounterCooldown <= 0 && Math.random() < encounterChance(state.stepsOnMap, state.trapCount)) triggerEncounter();
  renderStatus();
}

function collect(type, tile) {
  state.inventory[type] += 1; tile.feature = null; beep(type === "stone" ? 210 : 360, .09); showToast(`Recogiste 1 ${MATERIAL_LABELS[type].toLowerCase().replace(/s$/, "")}.`); renderStatus();
}

function enterNextMap(source) {
  const bonus = source === "dungeon" ? (state.inventory.torch ? 2 : 1) : 0;
  if (source === "dungeon") {
    state.inventory.stone += bonus; state.inventory.vine += bonus;
    if (!state.inventory.torch) state.health = Math.max(1, state.health - 2);
  }
  const generated = generateMap(Date.now() + state.mapsVisited * 991);
  state.map = generated.map; state.seed = generated.seed; state.exit = generated.exit; state.start = generated.start; state.player = { ...generated.start };
  state.mapsVisited += 1; state.stepsOnMap = 0; state.trapCount = 0; state.encounterCooldown = 5;
  closeDialog(); showToast(source === "dungeon" ? `Exploraste la oscuridad y llegaste a la parcela ${state.mapsVisited}.` : `Parcela ${state.mapsVisited}: la selva vuelve a cambiar.`);
  renderStatus();
}

function interact() {
  if (ui.dialog.open || state.health <= 0) return;
  const tile = state.map[state.player.y][state.player.x];
  if (["branch", "stone", "vine"].includes(tile.feature)) { collect(tile.feature, tile); return; }
  if (tile.feature === "exit") {
    openDialog("NUEVO SENDERO", "Dejar esta parcela", "Tu mochila y tus herramientas viajarán contigo, pero el <strong>factor de aparición</strong> volverá a su mínimo.");
    ui.dialogActions.append(makeButton("SEGUIR ADELANTE", () => enterNextMap("exit")), makeButton("QUEDARME", closeDialog, "wood-button moss")); return;
  }
  if (tile.feature === "dungeon") {
    const warning = state.inventory.torch ? "Tu antorcha revela un paso seguro y materiales bajo tierra." : "Sin antorcha perderás 2 puntos de vida en la oscuridad.";
    openDialog("HALLAZGO INFRECUENTE", "Entrada al calabozo", `${warning}<br><br>El calabozo desemboca en otra parcela.`);
    ui.dialogActions.append(makeButton("ENTRAR", () => enterNextMap("dungeon")), makeButton("TODAVÍA NO", closeDialog, "wood-button moss")); return;
  }
  if (tile.structure === "chair") { state.health = Math.min(state.maxHealth, state.health + 2); beep(520, .12, "triangle"); showToast("Te sentaste un momento. +2 vida."); renderStatus(); return; }
  if (tile.structure) { showToast(`Aquí construiste: ${STRUCTURES.find((s) => s.id === tile.structure)?.name ?? "estructura"}.`); return; }

  const forests = [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => ({ x: state.player.x + dx, y: state.player.y + dy })).filter((p) => state.map[p.y]?.[p.x]?.terrain === "forest");
  if (forests.length) {
    if (!state.inventory.axe) { showToast("Un hacha permitiría obtener troncos de estos árboles."); return; }
    const tree = forests.sort((a,b) => state.map[a.y][a.x].chopped - state.map[b.y][b.x].chopped)[0];
    state.map[tree.y][tree.x].chopped += 1; state.inventory.log += 1; beep(110, .08); setTimeout(() => beep(80, .12), 80);
    showToast("Talaste ramas del borde y obtuviste 1 tronco. El bosque sigue cerrado."); renderStatus(); return;
  }
  showToast("No hay nada con qué interactuar aquí.");
}

function costText(recipe) {
  const costs = recipe.costs ?? { log: recipe.logs };
  return Object.entries(costs).map(([item, count]) => `${count} ${MATERIAL_LABELS[item].toLowerCase()}`).join(" · ");
}

function showCrafting() {
  openDialog("BANCO DE TRABAJO", "Fabricar herramientas", document.createElement("div"));
  const list = document.createElement("div"); list.className = "recipe-list";
  for (const recipe of RECIPES) {
    const owned = Boolean(state.inventory[recipe.id]); const affordable = canAfford(state.inventory, recipe); const requirements = hasRequirements(state.inventory, recipe);
    const card = document.createElement("div"); card.className = `recipe-card${(!affordable || !requirements || owned) ? " disabled" : ""}`; card.append(iconCanvas(recipe.icon, 40));
    const info = document.createElement("div"); const title = document.createElement("h4"); title.textContent = recipe.name; const description = document.createElement("p"); description.textContent = owned ? "Ya está en tu mochila." : recipe.description; info.append(title, description);
    const side = document.createElement("div"); side.className = "recipe-cost"; side.textContent = owned ? "HECHO" : costText(recipe);
    const button = makeButton(owned ? "LISTO" : "CREAR", () => craft(recipe)); button.disabled = owned || !affordable || !requirements;
    if (!requirements && recipe.requires) side.textContent = `Requiere ${recipe.requires.map((id) => RECIPES.find((r) => r.id === id)?.name).join(", ")}`;
    card.append(info, side, button); list.append(card);
  }
  ui.dialogBody.replaceChildren(list); ui.dialogActions.append(makeButton("CERRAR", closeDialog, "wood-button moss"));
}

function craft(recipe) {
  if (state.inventory[recipe.id] || !canAfford(state.inventory, recipe) || !hasRequirements(state.inventory, recipe)) return;
  state.inventory = { ...spendCosts(state.inventory, recipe.costs), [recipe.id]: true };
  beep(440, .08); setTimeout(() => beep(660, .1), 90); renderStatus(); showCrafting(); showToast(`Fabricaste: ${recipe.name}.`);
}

function showBuilding() {
  openDialog("CONSTRUCCIÓN", "Levantar una estructura", document.createElement("div"));
  const list = document.createElement("div"); list.className = "recipe-list";
  const tile = state.map[state.player.y][state.player.x];
  for (const structure of STRUCTURES) {
    const affordable = canAfford(state.inventory, structure); const requirements = hasRequirements(state.inventory, structure); const space = !tile.feature && !tile.structure;
    const card = document.createElement("div"); card.className = `recipe-card${(!affordable || !requirements || !space) ? " disabled" : ""}`; card.append(iconCanvas(structure.id, 40));
    const info = document.createElement("div"); const title = document.createElement("h4"); title.textContent = structure.name; const description = document.createElement("p"); description.textContent = structure.description; info.append(title, description);
    const side = document.createElement("div"); side.className = "recipe-cost"; side.textContent = `${structure.logs} tronco${structure.logs === 1 ? "" : "s"}`;
    const button = makeButton("CONSTRUIR", () => build(structure)); button.disabled = !affordable || !requirements || !space;
    if (!requirements) side.textContent = "Requiere herramientas"; if (!space) side.textContent = "Casilla ocupada";
    card.append(info, side, button); list.append(card);
  }
  ui.dialogBody.replaceChildren(list); ui.dialogActions.append(makeButton("CERRAR", closeDialog, "wood-button moss"));
}

function build(structure) {
  const tile = state.map[state.player.y][state.player.x];
  if (tile.feature || tile.structure || !canAfford(state.inventory, structure) || !hasRequirements(state.inventory, structure)) return;
  state.inventory.log -= structure.logs; tile.structure = structure.id;
  if (structure.id === "trap") state.trapCount += 1;
  beep(180, .08); setTimeout(() => beep(230, .08), 80); closeDialog(); showToast(`Construiste: ${structure.name}.`); renderStatus();
}

function encounterCanvas(type) {
  const art = document.createElement("canvas"); art.width = 48; art.height = 48; art.className = "encounter-art"; const c = art.getContext("2d"); c.imageSmoothingEnabled = false;
  pixelRect(c, "#183423", 0, 0, 48, 48);
  if (type === "enemy") { pixelRect(c, "#6f3d2d", 9, 15, 30, 24); pixelRect(c, "#a15238", 13, 10, 22, 23); pixelRect(c, "#e7c965", 16, 18, 4, 4); pixelRect(c, "#e7c965", 29, 18, 4, 4); pixelRect(c, "#2b1c18", 17, 19, 2, 2); pixelRect(c, "#2b1c18", 30, 19, 2, 2); pixelRect(c, "#e5d6a5", 18, 30, 4, 7); pixelRect(c, "#e5d6a5", 28, 30, 4, 7); }
  if (type === "merchant") { pixelRect(c, "#4e3525", 10, 14, 28, 27); pixelRect(c, "#b68655", 15, 10, 19, 20); pixelRect(c, "#3d5c35", 8, 6, 32, 9); pixelRect(c, "#263d2a", 14, 2, 20, 7); pixelRect(c, "#e3ca7d", 18, 17, 3, 3); pixelRect(c, "#e3ca7d", 29, 17, 3, 3); pixelRect(c, "#7e5534", 3, 25, 11, 17); }
  if (type === "treasure") { pixelRect(c, "#59351f", 7, 19, 34, 21); pixelRect(c, "#a86a30", 8, 13, 32, 12); pixelRect(c, "#d7a842", 8, 22, 32, 5); pixelRect(c, "#f2d46e", 22, 20, 7, 10); pixelRect(c, "#fff0a5", 24, 22, 3, 4); }
  return art;
}

function triggerEncounter() {
  state.encounterCooldown = 7; const type = chooseEncounter();
  if (type === "enemy") {
    openDialog("ENCUENTRO", "Algo cruje entre las hojas", document.createElement("div"));
    const copy = document.createElement("p"); copy.className = "dialog-copy"; copy.innerHTML = state.inventory.spear ? "Una bestia de la selva te corta el paso. Tu <strong>lanza</strong> inclina la balanza." : "Una bestia de la selva te corta el paso. Sin lanza, luchar será doloroso.";
    ui.dialogBody.replaceChildren(encounterCanvas(type), copy);
    ui.dialogActions.append(makeButton("LUCHAR", fightEnemy), makeButton("HUIR (-1 VIDA)", fleeEnemy, "wood-button moss"));
  } else if (type === "merchant") {
    openDialog("ENCUENTRO", "Mercader de los senderos", document.createElement("div"));
    const copy = document.createElement("p"); copy.className = "dialog-copy"; copy.textContent = "Una duenda viajera abre su manta de trueque. No acepta promesas.";
    ui.dialogBody.replaceChildren(encounterCanvas(type), copy);
    const tradeA = makeButton("2 RAMAS → 1 LIANA", () => trade("branch", 2, "vine")); tradeA.disabled = state.inventory.branch < 2;
    const tradeB = makeButton("2 PIEDRAS → 2 RAMAS", () => trade("stone", 2, "branch", 2)); tradeB.disabled = state.inventory.stone < 2;
    ui.dialogActions.append(tradeA, tradeB, makeButton("DESPEDIRME", closeDialog, "wood-button moss"));
  } else {
    openDialog("ENCUENTRO", "Tesoro inmóvil", document.createElement("div"));
    const copy = document.createElement("p"); copy.className = "dialog-copy"; copy.textContent = "No se mueve. Eso, en esta selva, ya es una magnífica cualidad.";
    ui.dialogBody.replaceChildren(encounterCanvas(type), copy);
    ui.dialogActions.append(makeButton("PILLAJEAR", lootTreasure), makeButton("DEJARLO", closeDialog, "wood-button moss"));
  }
  beep(type === "enemy" ? 75 : 260, .16, "sawtooth", .035);
}

function loseHealth(amount, message) {
  state.health = Math.max(0, state.health - amount); renderStatus();
  if (state.health <= 0) showGameOver(); else showToast(message);
}

function fightEnemy() {
  const armed = state.inventory.spear; const win = Math.random() < (armed ? .85 : .38);
  closeDialog();
  if (win) { const type = ["branch", "stone", "vine"][Math.floor(Math.random() * 3)]; state.inventory[type] += armed ? 2 : 1; beep(520, .12); showToast(`Venciste y encontraste ${armed ? 2 : 1} ${MATERIAL_LABELS[type].toLowerCase()}.`); renderStatus(); }
  else loseHealth(armed ? 1 : 3, "Escapaste del combate, bastante magullado.");
}

function fleeEnemy() { closeDialog(); loseHealth(1, "Huiste entre los helechos. -1 vida."); }
function trade(from, amount, to, gain = 1) { state.inventory[from] -= amount; state.inventory[to] += gain; closeDialog(); beep(400, .1); showToast("Intercambio cerrado con un apretón de manos."); renderStatus(); }
function lootTreasure() { const type = ["branch", "stone", "vine", "log"][Math.floor(Math.random() * 4)]; const count = type === "log" ? 1 : 3; state.inventory[type] += count; closeDialog(); beep(700, .14, "triangle"); showToast(`El cofre guardaba ${count} ${MATERIAL_LABELS[type].toLowerCase()}.`); renderStatus(); }

function showHelp() {
  openDialog("MANUAL DE CAMPO", "Cómo sobrevivir", `<strong>1.</strong> Camina con WASD o las flechas. Sólo puedes cruzar tierra, jardines y caminos.<br><br><strong>2.</strong> Párate sobre ramas, piedras o lianas y pulsa E para recogerlas.<br><br><strong>3.</strong> Fabrica un martillo y luego un hacha. Junto a un bosque, pulsa E para obtener troncos sin abrir el borde.<br><br><strong>4.</strong> Construye sobre una casilla vacía. Las trampas reducen el factor de aparición.<br><br><strong>5.</strong> Encuentra la salida o el raro calabozo. Tu mochila viaja contigo.`);
  ui.dialogActions.append(makeButton("A LA SELVA", closeDialog));
}

function showGameOver() {
  openDialog("FIN DE LA EXPLORACIÓN", "La selva ganó esta vez", `Sobreviviste <strong>${state.day} día${state.day === 1 ? "" : "s"}</strong>, recorriste ${state.totalSteps} pasos y conociste ${state.mapsVisited} parcela${state.mapsVisited === 1 ? "" : "s"}.`);
  ui.dialogActions.append(makeButton("VOLVER A EMPEZAR", restart));
}

function restart() { localStorage.removeItem("duendes-save-v1"); state = freshState(); closeDialog(); renderStatus(); showToast("Una nueva selva despierta."); }

function drawPortrait() {
  const p = ui.portrait.getContext("2d"); p.imageSmoothingEnabled = false; pixelRect(p, "#1a3526", 0, 0, 72, 72);
  pixelRect(p, "#486d39", 7, 22, 58, 37); pixelRect(p, "#90ad57", 15, 20, 42, 40); pixelRect(p, "#719346", 4, 30, 14, 17); pixelRect(p, "#719346", 54, 30, 14, 17);
  pixelRect(p, "#25311d", 23, 34, 6, 7); pixelRect(p, "#25311d", 43, 34, 6, 7); pixelRect(p, "#f0da87", 25, 35, 2, 2); pixelRect(p, "#f0da87", 45, 35, 2, 2);
  pixelRect(p, "#4a6131", 26, 51, 22, 5); pixelRect(p, "#263b25", 7, 14, 58, 12); pixelRect(p, "#3d6334", 16, 7, 42, 12); pixelRect(p, "#759244", 27, 3, 20, 8);
}

document.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  const moves = { w: [0,-1], ArrowUp: [0,-1], s: [0,1], ArrowDown: [0,1], a: [-1,0], ArrowLeft: [-1,0], d: [1,0], ArrowRight: [1,0] };
  if (moves[event.key]) { event.preventDefault(); move(...moves[event.key]); }
  else if (event.key.toLowerCase() === "e" || event.key === " ") { event.preventDefault(); interact(); }
  else if (event.key.toLowerCase() === "c") showCrafting();
  else if (event.key.toLowerCase() === "b") showBuilding();
  else if (event.key === "Escape") closeDialog();
});

document.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => {
  const moves = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }; move(...moves[button.dataset.move]);
}));
document.querySelector("#interactButton").addEventListener("click", interact);
document.querySelector("#craftButton").addEventListener("click", showCrafting);
document.querySelector("#buildButton").addEventListener("click", showBuilding);
document.querySelector("#helpButton").addEventListener("click", showHelp);
document.querySelector("#dialogClose").addEventListener("click", closeDialog);
document.querySelector("#restartButton").addEventListener("click", () => {
  openDialog("NUEVA PARTIDA", "¿Abandonar esta expedición?", "Se perderá la partida guardada en este navegador.");
  ui.dialogActions.append(makeButton("EMPEZAR DE NUEVO", restart), makeButton("CANCELAR", closeDialog, "wood-button moss"));
});
document.querySelector("#soundButton").addEventListener("click", (event) => { soundOn = !soundOn; event.currentTarget.textContent = soundOn ? "♪" : "×"; if (soundOn) beep(420, .1); });

state = load(); drawPortrait(); renderStatus();
try {
  if (!localStorage.getItem("duendes-seen-help")) { localStorage.setItem("duendes-seen-help", "1"); setTimeout(showHelp, 250); }
} catch { setTimeout(showHelp, 250); }
