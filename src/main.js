import {
  SIZE, MATERIALS, RARE_MATERIALS, RECIPES, STRUCTURES, LOGS_PER_TREE,
  generateMap, buildLevelMap, rollTreasure, canAfford, hasRequirements, spendCosts,
  encounterChance, chooseEncounter, isWalkable, isCollectible, labelFor, getItems, getMonsters, monsterById,
  spawnMonster, advanceMonsters,
} from "./engine.js";
import { TILE, pixelRect, drawIcon, drawMap, drawSprite } from "./render.js";
import { LEVELS } from "./levels.js";

const SAVE_KEY = "duendes-save-v2";
const RAFT_RECIPE_IDS = ["cuerda", "remo", "vela", "balsa"];
const FREE_PLAY_LEVEL = {
  id: 0,
  name: "Selva libre",
  encounters: {
    base: 0.02, perStep: 0.006, trapFactor: 0.03, cap: 0.38,
    weights: { enemy: 0.68, merchant: 0.19, treasure: 0.13 },
    spearWinChance: 0.85, unarmedWinChance: 0.38,
  },
  loot: ["tela", "resina", "brujula"],
  logsPerTree: LOGS_PER_TREE,
  get monsterPool() { return getMonsters().slice(0, 2).map((monster) => monster.id); },
};

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  portrait: document.querySelector("#portrait"), healthBar: document.querySelector("#healthBar"), healthText: document.querySelector("#healthText"),
  dayText: document.querySelector("#dayText"), stepsText: document.querySelector("#stepsText"), dangerText: document.querySelector("#dangerText"),
  dangerBar: document.querySelector("#dangerBar"), levelText: document.querySelector("#levelText"), resources: document.querySelector("#resources"), tools: document.querySelector("#tools"),
  toast: document.querySelector("#toast"), dialog: document.querySelector("#gameDialog"), dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"), dialogBody: document.querySelector("#dialogBody"), dialogActions: document.querySelector("#dialogActions"),
};

let soundOn = true;
let audioContext;
let state;

function currentLevel() { return state.freePlay ? FREE_PLAY_LEVEL : LEVELS[state.levelIndex]; }

function freshState() {
  const generated = buildLevelMap(LEVELS[0]);
  return {
    ...generated,
    player: { ...generated.start },
    inventory: {
      branch: 0, stone: 0, vine: 0, log: 0, tela: 0, resina: 0, brujula: 0, trap: 0,
      campfire: false, hammer: false, axe: false, spear: false, torch: false, piano: false,
      cuerda: false, remo: false, vela: false, balsa: false,
    },
    health: 10, maxHealth: 10, day: 1, totalSteps: 0, stepsOnMap: 0, mapsVisited: 1, trapCount: 0, encounterCooldown: 5,
    levelIndex: 0, won: false, freePlay: false, monsters: [],
  };
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* private browsing */ }
}

function load() {
  try { localStorage.removeItem("duendes-save-v1"); } catch { /* tidy old saves */ }
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved?.map?.length === SIZE && saved.player && saved.inventory
      && Number.isInteger(saved.levelIndex) && saved.levelIndex < LEVELS.length
      && RARE_MATERIALS.every((item) => typeof saved.inventory[item] === "number")) {
      saved.monsters = (saved.monsters ?? []).filter((monster) => monsterById(monster.type));
      if (typeof saved.inventory.trap !== "number") saved.inventory.trap = 0;
      return saved;
    }
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

function drawMonsters() {
  for (const monster of state.monsters ?? []) {
    const def = monsterById(monster.type);
    if (!def?.sprite) continue;
    const x = monster.x * TILE; const y = monster.y * TILE;
    ctx.fillStyle = "rgba(8, 18, 9, .45)"; ctx.fillRect(x + 11, y + 39, 27, 5);
    drawSprite(ctx, def.sprite, x, y, TILE / (def.sprite.size ?? 16));
  }
}

function renderMap() {
  drawMap(ctx, state.map, { seed: state.seed, logsPerTree: currentLevel().logsPerTree ?? LOGS_PER_TREE });
  drawMonsters();
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
  const customItems = getItems().filter((item) => !item.builtin && (state.inventory[item.id] ?? 0) > 0).map((item) => item.id);
  const visibleMaterials = [...MATERIALS, ...RARE_MATERIALS.filter((type) => state.inventory[type] > 0), ...customItems];
  for (const type of visibleMaterials) {
    const card = document.createElement("div"); card.className = "resource"; card.append(iconCanvas(type, 24));
    const label = document.createElement("span"); label.textContent = labelFor(type);
    const count = document.createElement("b"); count.textContent = state.inventory[type];
    card.append(label, count); ui.resources.append(card);
  }
  ui.tools.replaceChildren();
  for (const recipe of RECIPES) {
    const tool = document.createElement("div"); tool.className = `tool${state.inventory[recipe.id] ? " owned" : ""}`;
    tool.title = recipe.name; tool.dataset.short = recipe.name.replace(/^(La|El) /, "").split(" ")[0]; tool.append(iconCanvas(recipe.icon, 32)); ui.tools.append(tool);
  }
  const traps = document.createElement("div"); traps.className = `tool${state.inventory.trap > 0 ? " owned" : ""}`;
  traps.title = "Trampas listas para colocar (T)"; traps.dataset.short = "Trampas"; traps.append(iconCanvas("trap", 32));
  const qty = document.createElement("b"); qty.className = "qty"; qty.textContent = `×${state.inventory.trap ?? 0}`;
  traps.append(qty); ui.tools.append(traps);
}

function renderStatus() {
  const hp = Math.max(0, state.health / state.maxHealth * 100);
  ui.healthBar.style.width = `${hp}%`; ui.healthText.textContent = `${state.health}/${state.maxHealth}`;
  ui.dayText.textContent = state.day; ui.stepsText.textContent = state.totalSteps;
  const params = currentLevel().encounters ?? {};
  const danger = encounterChance(state.stepsOnMap, state.trapCount, params);
  ui.dangerText.textContent = `${Math.round(danger * 100)}%`; ui.dangerBar.style.width = `${danger / (params.cap ?? .38) * 100}%`;
  if (ui.levelText) ui.levelText.textContent = state.freePlay ? "Libre" : `${state.levelIndex + 1} · ${currentLevel().name}`;
  renderInventory(); renderMap(); save();
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.remove("flash");
  void ui.toast.offsetWidth; // restart the flash animation
  ui.toast.classList.add("flash");
}

function makeButton(label, handler, className = "wood-button") {
  const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = label;
  button.addEventListener("click", handler); return button;
}

function openDialog(kicker, title, body, { wide = false } = {}) {
  if (wide) ui.dialog.classList.add("wide"); else ui.dialog.classList.remove("wide");
  ui.dialogKicker.textContent = kicker; ui.dialogTitle.textContent = title; ui.dialogBody.replaceChildren(); ui.dialogActions.replaceChildren();
  if (typeof body === "string") { const p = document.createElement("p"); p.className = "dialog-copy"; p.innerHTML = body; ui.dialogBody.append(p); }
  else ui.dialogBody.append(body);
  if (!ui.dialog.open) ui.dialog.showModal();
}

function closeDialog() { if (ui.dialog.open) ui.dialog.close(); }

function move(dx, dy) {
  if (ui.dialog.open || state.health <= 0) return;
  const nx = state.player.x + dx; const ny = state.player.y + dy;
  if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || !isWalkable(state.map[ny][nx].terrain)) { beep(90, .05); showToast("La selva es demasiado densa por ahí."); return; }
  state.player = { x: nx, y: ny }; state.totalSteps += 1; state.stepsOnMap += 1; state.encounterCooldown -= 1;
  if (state.totalSteps % 30 === 0) state.day += 1;
  beep(130 + (state.totalSteps % 2) * 20, .025, "square", .012);
  const bumped = (state.monsters ?? []).find((monster) => monster.x === nx && monster.y === ny);
  if (bumped) { fightMonster(bumped); renderStatus(); return; }
  for (const event of advanceMonsters(state)) {
    if (event.kind === "trap") { beep(320, .12, "sawtooth"); showToast(`¡Tu trampa atrapó a ${labelFor(event.monster.type).toLowerCase()}! Ambas quedaron destruidas.`); }
    else if (event.kind === "caught" && !ui.dialog.open) fightMonster(event.monster);
  }
  const tile = state.map[ny][nx];
  if (!ui.dialog.open) {
    if (isCollectible(tile.feature)) showToast(`Hay ${labelFor(tile.feature).toLowerCase()} aquí. Pulsa E para recoger.`);
    else if (tile.feature === "exit") showToast("La salida de esta parcela. Pulsa E para continuar.");
    else if (tile.feature === "dungeon") showToast("Una entrada a un calabozo. Pulsa E si te atreves.");
    if (state.encounterCooldown <= 0 && Math.random() < encounterChance(state.stepsOnMap, state.trapCount, currentLevel().encounters)) triggerEncounter();
  }
  renderStatus();
}

function collect(type, tile) {
  state.inventory[type] = (state.inventory[type] ?? 0) + 1; tile.feature = null; beep(type === "stone" ? 210 : 360, .09); showToast(`Recogiste 1 ${labelFor(type).toLowerCase().replace(/s$/, "")}.`); renderStatus();
}

function loadLevel(index) {
  const level = LEVELS[index];
  const generated = buildLevelMap(level);
  state.map = generated.map; state.seed = generated.seed; state.exit = generated.exit; state.start = generated.start; state.player = { ...generated.start };
  state.levelIndex = index; state.freePlay = false;
  state.mapsVisited += 1; state.stepsOnMap = 0; state.trapCount = 0; state.encounterCooldown = 5; state.monsters = [];
  closeDialog(); showToast(level.intro ?? `Nivel ${index + 1} — ${level.name}.`);
  renderStatus();
}

function enterFreeParcel() {
  const generated = generateMap(Date.now() + state.mapsVisited * 991);
  state.map = generated.map; state.seed = generated.seed; state.exit = generated.exit; state.start = generated.start; state.player = { ...generated.start };
  state.freePlay = true;
  state.mapsVisited += 1; state.stepsOnMap = 0; state.trapCount = 0; state.encounterCooldown = 5; state.monsters = [];
  closeDialog(); showToast(`Parcela ${state.mapsVisited}: la selva vuelve a cambiar.`);
  renderStatus();
}

function raidDungeon(tile) {
  const level = currentLevel();
  tile.feature = null;
  const bonus = state.inventory.torch ? 2 : 1;
  state.inventory.stone += bonus; state.inventory.vine += bonus;
  let reward = rollTreasure(level, state.inventory, Math.random);
  if (state.inventory.torch) {
    for (let i = 0; i < 6 && !RARE_MATERIALS.includes(reward.type); i += 1) reward = rollTreasure(level, state.inventory, Math.random);
  }
  state.inventory[reward.type] += reward.count;
  if (!state.inventory.torch) state.health = Math.max(1, state.health - 2);
  closeDialog(); beep(700, .14, "triangle");
  const rare = RARE_MATERIALS.includes(reward.type);
  showToast(`El calabozo guardaba ${reward.count} ${labelFor(reward.type).toLowerCase()}${rare ? ". ¡Un hallazgo raro!" : "."}`);
  renderStatus();
}

function interact() {
  if (ui.dialog.open || state.health <= 0) return;
  const tile = state.map[state.player.y][state.player.x];
  if (isCollectible(tile.feature)) { collect(tile.feature, tile); return; }
  if (tile.feature === "exit") {
    if (state.freePlay || state.won) {
      openDialog("NUEVO SENDERO", "Dejar esta parcela", "Tu mochila y tus herramientas viajarán contigo, pero el <strong>factor de aparición</strong> volverá a su mínimo.");
      ui.dialogActions.append(makeButton("SEGUIR ADELANTE", enterFreeParcel), makeButton("QUEDARME", closeDialog, "wood-button moss"));
    } else if (state.levelIndex >= LEVELS.length - 1) {
      openDialog("EL RÍO", "La otra orilla", "El agua corre ancha y fría. Sin una <strong>balsa</strong>, aquí termina el sendero.");
      ui.dialogActions.append(makeButton("VOLVER A LA SELVA", closeDialog, "wood-button moss"));
    } else {
      openDialog("NUEVO SENDERO", `Hacia el nivel ${state.levelIndex + 2}`, "Tu mochila y tus herramientas viajarán contigo, pero el <strong>factor de aparición</strong> volverá a su mínimo.");
      ui.dialogActions.append(makeButton("SEGUIR ADELANTE", () => loadLevel(state.levelIndex + 1)), makeButton("QUEDARME", closeDialog, "wood-button moss"));
    }
    return;
  }
  if (tile.feature === "dungeon") {
    const warning = state.inventory.torch ? "Tu antorcha revela un paso seguro y un botín bajo tierra." : "Sin antorcha perderás 2 puntos de vida en la oscuridad.";
    openDialog("HALLAZGO INFRECUENTE", "Entrada al calabozo", `${warning}<br><br>Lo que guarde, lo guarda una sola vez.`);
    ui.dialogActions.append(makeButton("ENTRAR", () => raidDungeon(tile)), makeButton("TODAVÍA NO", closeDialog, "wood-button moss")); return;
  }
  if (tile.structure === "chair") {
    state.health = Math.min(state.maxHealth, state.health + 2);
    tile.chairUses = (tile.chairUses ?? 0) + 1;
    beep(520, .12, "triangle");
    if (tile.chairUses >= 2) { tile.structure = null; showToast("Te sentaste un momento. +2 vida. La silla cedió con un último crujido."); }
    else showToast("Te sentaste un momento. +2 vida. La silla aguantará un descanso más.");
    renderStatus(); return;
  }
  if (tile.structure) { showToast(`Aquí construiste: ${STRUCTURES.find((s) => s.id === tile.structure)?.name ?? "estructura"}.`); return; }

  const forests = [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy]) => ({ x: state.player.x + dx, y: state.player.y + dy })).filter((p) => state.map[p.y]?.[p.x]?.terrain === "forest");
  if (forests.length) {
    if (!state.inventory.axe) { showToast("Un hacha permitiría obtener troncos de estos árboles."); return; }
    const logsPerTree = currentLevel().logsPerTree ?? LOGS_PER_TREE;
    const choppable = forests.filter((p) => state.map[p.y][p.x].chopped < logsPerTree);
    if (!choppable.length) { beep(90, .05); showToast("Solo quedan tocones. Estos árboles ya dieron todo."); return; }
    const tree = choppable.sort((a,b) => state.map[a.y][a.x].chopped - state.map[b.y][b.x].chopped)[0];
    const treeTile = state.map[tree.y][tree.x];
    treeTile.chopped += 1; state.inventory.log += 1; beep(110, .08); setTimeout(() => beep(80, .12), 80);
    showToast(treeTile.chopped >= logsPerTree ? "Un tronco más… y el árbol quedó en tocón. El bosque sigue cerrado." : "Talaste ramas del borde y obtuviste 1 tronco. El bosque sigue cerrado.");
    renderStatus(); return;
  }
  showToast("No hay nada con qué interactuar aquí.");
}

function costText(recipe) {
  const costs = recipe.costs ?? { log: recipe.logs };
  return Object.entries(costs).map(([item, count]) => {
    const have = state.inventory[item] ?? 0;
    const label = labelFor(item).toLowerCase();
    return have >= count ? `${count} ${label}` : `${have}/${count} ${label}`;
  }).join(" · ");
}

function showCrafting() {
  openDialog("BANCO DE TRABAJO", "Fabricar herramientas", document.createElement("div"), { wide: true });
  const list = document.createElement("div"); list.className = "recipe-list";
  const sections = [
    ["HERRAMIENTAS", RECIPES.filter((recipe) => !RAFT_RECIPE_IDS.includes(recipe.id))],
    ["RUMBO A CASA", RAFT_RECIPE_IDS.map((id) => RECIPES.find((recipe) => recipe.id === id))],
  ];
  for (const [heading, recipes] of sections) {
    const title = document.createElement("h4"); title.className = "recipe-section-title"; title.textContent = heading; list.append(title);
    for (const recipe of recipes) {
      const owned = Boolean(state.inventory[recipe.id]); const affordable = canAfford(state.inventory, recipe); const requirements = hasRequirements(state.inventory, recipe);
      const card = document.createElement("div"); card.className = `recipe-card${(!affordable || !requirements || owned) ? " disabled" : ""}${recipe.final ? " final" : ""}`; card.append(iconCanvas(recipe.icon, 40));
      const info = document.createElement("div"); const title2 = document.createElement("h4"); title2.textContent = recipe.name; const description = document.createElement("p"); description.textContent = owned ? "Ya está en tu mochila." : recipe.description; info.append(title2, description);
      if (!owned && !affordable && recipe.hint) { const hint = document.createElement("p"); hint.className = "recipe-hint"; hint.textContent = recipe.hint; info.append(hint); }
      const side = document.createElement("div"); side.className = "recipe-cost"; side.textContent = owned ? "HECHO" : costText(recipe);
      const button = makeButton(owned ? "LISTO" : "CREAR", () => craft(recipe)); button.disabled = owned || !affordable || !requirements;
      if (!requirements && recipe.requires) side.textContent = `Requiere ${recipe.requires.map((id) => RECIPES.find((r) => r.id === id)?.name).join(", ")}`;
      card.append(info, side, button); list.append(card);
    }
  }
  ui.dialogBody.replaceChildren(list); ui.dialogActions.append(makeButton("CERRAR", closeDialog, "wood-button moss"));
}

function craft(recipe) {
  if (state.inventory[recipe.id] || !canAfford(state.inventory, recipe) || !hasRequirements(state.inventory, recipe)) return;
  state.inventory = { ...spendCosts(state.inventory, recipe.costs), [recipe.id]: true };
  beep(440, .08); setTimeout(() => beep(660, .1), 90); renderStatus();
  if (recipe.final) { state.won = true; save(); showVictory(); return; }
  showCrafting(); showToast(`Fabricaste: ${recipe.name}.`);
}

function showVictory() {
  const stats = `Sobreviviste <strong>${state.day} día${state.day === 1 ? "" : "s"}</strong>, diste ${state.totalSteps} pasos y llegaste al nivel ${state.levelIndex + 1}.`;
  openDialog("LA BALSA ESTÁ LISTA", "El río te llevará a casa", `Musguito ata el último nudo. La selva, por una vez, no dice nada.<br><br>${stats}`);
  ui.dialogActions.append(
    makeButton("PARTIR EN LA BALSA", showFarewell),
    makeButton("SEGUIR EXPLORANDO", () => { state.freePlay = true; closeDialog(); renderStatus(); showToast("La selva sigue ahí. Tú también, por gusto."); }, "wood-button moss"),
  );
}

function showFarewell() {
  openDialog("FIN DE LA EXPLORACIÓN", "Rumbo a casa", "La corriente hace el resto. Los duendes te despiden desde la orilla a su manera: en silencio.<br><br>Gracias por jugar. Puedes cerrar la pestaña con la conciencia tranquila, o empezar otra expedición.");
  ui.dialogActions.append(
    makeButton("OTRA EXPEDICIÓN", restart),
    makeButton("SEGUIR EXPLORANDO", () => { state.freePlay = true; closeDialog(); renderStatus(); }, "wood-button moss"),
  );
}

function showBuilding() {
  openDialog("CONSTRUCCIÓN", "Levantar una estructura", document.createElement("div"), { wide: true });
  const list = document.createElement("div"); list.className = "recipe-list";
  const tile = state.map[state.player.y][state.player.x];
  for (const structure of STRUCTURES) {
    const stockpiled = structure.id === "trap";
    const affordable = canAfford(state.inventory, structure); const requirements = hasRequirements(state.inventory, structure); const space = stockpiled || (!tile.feature && !tile.structure);
    const card = document.createElement("div"); card.className = `recipe-card${(!affordable || !requirements || !space) ? " disabled" : ""}`; card.append(iconCanvas(structure.id, 40));
    const info = document.createElement("div"); const title = document.createElement("h4"); title.textContent = structure.name; const description = document.createElement("p"); description.textContent = structure.description; info.append(title, description);
    const side = document.createElement("div"); side.className = "recipe-cost"; side.textContent = `${structure.logs} tronco${structure.logs === 1 ? "" : "s"}${stockpiled ? ` · tienes ${state.inventory.trap}` : ""}`;
    const button = makeButton("CONSTRUIR", () => build(structure)); button.disabled = !affordable || !requirements || !space;
    if (!requirements) side.textContent = "Requiere herramientas"; if (!space) side.textContent = "Casilla ocupada";
    card.append(info, side, button); list.append(card);
  }
  ui.dialogBody.replaceChildren(list); ui.dialogActions.append(makeButton("CERRAR", closeDialog, "wood-button moss"));
}

function build(structure) {
  const tile = state.map[state.player.y][state.player.x];
  if (!canAfford(state.inventory, structure) || !hasRequirements(state.inventory, structure)) return;
  if (structure.id === "trap") {
    state.inventory.log -= structure.logs; state.inventory.trap += 1;
    beep(180, .08); setTimeout(() => beep(230, .08), 80); closeDialog();
    showToast(`Construiste una trampa (tienes ${state.inventory.trap}). Colócala con T.`); renderStatus(); return;
  }
  if (tile.feature || tile.structure) return;
  state.inventory.log -= structure.logs; tile.structure = structure.id;
  beep(180, .08); setTimeout(() => beep(230, .08), 80); closeDialog(); showToast(`Construiste: ${structure.name}.`); renderStatus();
}

function placeTrap() {
  if (ui.dialog.open || state.health <= 0) return;
  if (!(state.inventory.trap > 0)) { beep(90, .05); showToast("No tienes trampas guardadas. Constrúyelas con B."); return; }
  const tile = state.map[state.player.y][state.player.x];
  if (tile.feature || tile.structure) { beep(90, .05); showToast("Esta casilla está ocupada; busca un lugar libre para la trampa."); return; }
  tile.structure = "trap"; state.inventory.trap -= 1; state.trapCount += 1;
  beep(180, .08); setTimeout(() => beep(230, .08), 80);
  showToast(`Colocaste una trampa. Te quedan ${state.inventory.trap} en la mochila.`);
  renderStatus();
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
  state.encounterCooldown = 7; const type = chooseEncounter(Math.random, currentLevel().encounters?.weights);
  if (type === "enemy") {
    const monster = spawnMonster(state, currentLevel(), Math.random);
    if (monster) { beep(75, .16, "sawtooth", .035); showToast(`Algo se mueve entre los árboles… ${labelFor(monster.type)} te ha olido.`); return; }
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
    ui.dialogActions.append(tradeA, tradeB);
    if (currentLevel().loot?.includes("tela")) {
      const tradeC = makeButton("3 PIEDRAS → 1 TELA", () => trade("stone", 3, "tela")); tradeC.disabled = state.inventory.stone < 3;
      ui.dialogActions.append(tradeC);
    }
    ui.dialogActions.append(makeButton("DESPEDIRME", closeDialog, "wood-button moss"));
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
  const armed = state.inventory.spear;
  const { spearWinChance = .85, unarmedWinChance = .38 } = currentLevel().encounters ?? {};
  const win = Math.random() < (armed ? spearWinChance : unarmedWinChance);
  closeDialog();
  if (win) { const type = ["branch", "stone", "vine"][Math.floor(Math.random() * 3)]; state.inventory[type] += armed ? 2 : 1; beep(520, .12); showToast(`Venciste y encontraste ${armed ? 2 : 1} ${labelFor(type).toLowerCase()}.`); renderStatus(); }
  else loseHealth(armed ? 1 : 3, "Escapaste del combate, bastante magullado.");
}

function fleeEnemy() { closeDialog(); loseHealth(1, "Huiste entre los helechos. -1 vida."); }

function monsterCanvas(def) {
  const art = document.createElement("canvas"); art.width = 48; art.height = 48; art.className = "encounter-art";
  const c = art.getContext("2d"); c.imageSmoothingEnabled = false;
  pixelRect(c, "#183423", 0, 0, 48, 48);
  if (def?.sprite) drawSprite(c, def.sprite, 0, 0, 48 / (def.sprite.size ?? 16));
  return art;
}

function fightMonster(monster) {
  const def = monsterById(monster.type) ?? {};
  openDialog("¡TE ALCANZÓ!", def.name ?? "Una bestia de la selva", document.createElement("div"));
  const copy = document.createElement("p"); copy.className = "dialog-copy";
  copy.innerHTML = state.inventory.spear
    ? `${def.name ?? "La bestia"} te corta el paso. Tu <strong>lanza</strong> inclina la balanza.`
    : `${def.name ?? "La bestia"} te corta el paso. Sin lanza, luchar será doloroso.`;
  ui.dialogBody.replaceChildren(monsterCanvas(def), copy);
  ui.dialogActions.append(
    makeButton("LUCHAR", () => resolveMonsterFight(monster)),
    makeButton("HUIR (-1 VIDA)", () => fleeMonster(monster), "wood-button moss"),
  );
  beep(75, .16, "sawtooth", .035);
}

function resolveMonsterFight(monster) {
  const def = monsterById(monster.type) ?? {};
  const params = currentLevel().encounters ?? {};
  const armed = state.inventory.spear;
  const chance = armed ? (def.spearWinChance ?? params.spearWinChance ?? .85) : (def.unarmedWinChance ?? params.unarmedWinChance ?? .38);
  closeDialog();
  if (Math.random() < chance) {
    state.monsters = state.monsters.filter((entry) => entry !== monster);
    const type = isCollectible(def.loot) || MATERIALS.includes(def.loot) ? def.loot : ["branch", "stone", "vine"][Math.floor(Math.random() * 3)];
    const count = armed ? 2 : 1;
    state.inventory[type] = (state.inventory[type] ?? 0) + count;
    beep(520, .12); showToast(`Venciste a ${labelFor(monster.type).toLowerCase()} y encontraste ${count} ${labelFor(type).toLowerCase()}.`);
    renderStatus();
  } else {
    monster.rest = 2;
    loseHealth(def.damage ?? 2, `${def.name ?? "La bestia"} te golpeó. -${def.damage ?? 2} vida.`);
  }
}

function fleeMonster(monster) {
  monster.rest = 2;
  closeDialog();
  const options = [[0,-1],[1,0],[0,1],[-1,0]]
    .map(([dx, dy]) => ({ x: state.player.x + dx, y: state.player.y + dy }))
    .filter((p) => state.map[p.y]?.[p.x] && isWalkable(state.map[p.y][p.x].terrain)
      && !(p.x === monster.x && p.y === monster.y)
      && !state.monsters.some((other) => other.x === p.x && other.y === p.y))
    .sort((a, b) => (Math.abs(b.x - monster.x) + Math.abs(b.y - monster.y)) - (Math.abs(a.x - monster.x) + Math.abs(a.y - monster.y)));
  if (options.length) state.player = { x: options[0].x, y: options[0].y };
  loseHealth(1, "Huiste entre los helechos. -1 vida. La bestia sigue ahí.");
}
function trade(from, amount, to, gain = 1) { state.inventory[from] -= amount; state.inventory[to] += gain; closeDialog(); beep(400, .1); showToast("Intercambio cerrado con un apretón de manos."); renderStatus(); }

function lootTreasure() {
  const reward = rollTreasure(currentLevel(), state.inventory, Math.random);
  state.inventory[reward.type] += reward.count; closeDialog(); beep(700, .14, "triangle");
  const rare = RARE_MATERIALS.includes(reward.type);
  showToast(`El cofre guardaba ${reward.count} ${labelFor(reward.type).toLowerCase()}${rare ? ". ¡Justo lo que la balsa pide!" : "."}`);
  renderStatus();
}

function showHelp() {
  openDialog("MANUAL DE CAMPO", "Cómo sobrevivir", `<strong>1.</strong> Camina con WASD o las flechas. Sólo puedes cruzar tierra, jardines y caminos.<br><br><strong>2.</strong> Párate sobre ramas, piedras o lianas y pulsa E para recogerlas.<br><br><strong>3.</strong> Fabrica un martillo y luego un hacha. Junto a un bosque, pulsa E para obtener troncos; cada árbol da unos pocos antes de quedar en tocón.<br><br><strong>4.</strong> Construye sobre una casilla vacía. Las trampas se fabrican primero (menú B) y se guardan en la mochila; pulsa <strong>T</strong> para colocar una donde estés. Reducen el factor de aparición y destruyen a la bestia que las pise (la trampa también se pierde).<br><br><strong>4½.</strong> Cuando el factor de aparición sube, las bestias aparecen en el mapa y te persiguen. Corre, ponles trampas en el camino o pelea.<br><br><strong>5.</strong> Encuentra la salida para avanzar de nivel. Tu mochila viaja contigo.<br><br><strong>6.</strong> Reúne lo necesario para construir <strong>La Balsa</strong> y volver a casa. Algunas piezas solo aparecen selva adentro.`);
  ui.dialogActions.append(makeButton("A LA SELVA", closeDialog));
}

function showGameOver() {
  openDialog("FIN DE LA EXPLORACIÓN", "La selva ganó esta vez", `Sobreviviste <strong>${state.day} día${state.day === 1 ? "" : "s"}</strong>, recorriste ${state.totalSteps} pasos y llegaste al nivel ${state.levelIndex + 1}.`);
  ui.dialogActions.append(makeButton("VOLVER A EMPEZAR", restart));
}

function restart() { localStorage.removeItem(SAVE_KEY); state = freshState(); closeDialog(); renderStatus(); showToast("Una nueva selva despierta."); }

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
  else if (event.key.toLowerCase() === "t") placeTrap();
  else if (event.key === "Escape") closeDialog();
});

document.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => {
  const moves = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }; move(...moves[button.dataset.move]);
}));
document.querySelector("#interactButton").addEventListener("click", interact);
document.querySelector("#trapButton").addEventListener("click", placeTrap);
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
