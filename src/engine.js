import { CONTENT } from "./content.js";

export const SIZE = 12;

export const MATERIALS = ["branch", "stone", "vine", "log"];

export const RARE_MATERIALS = ["tela", "resina", "brujula"];

export const MATERIAL_LABELS = {
  branch: "Ramas",
  stone: "Piedras",
  vine: "Lianas",
  log: "Troncos",
  tela: "Tela encerada",
  resina: "Resina ámbar",
  brujula: "Brújula oxidada",
};

export const LOGS_PER_TREE = 3;

export const RECIPES = [
  { id: "campfire", name: "Fogata básica", icon: "campfire", costs: { branch: 3, stone: 5 }, description: "Una pequeña tregua contra la noche." },
  { id: "hammer", name: "Martillo básico", icon: "hammer", costs: { branch: 1, stone: 1 }, description: "Necesario para levantar estructuras." },
  { id: "axe", name: "Hacha básica", icon: "axe", costs: { branch: 1, stone: 1 }, requires: ["hammer"], description: "Permite obtener troncos del bosque." },
  { id: "spear", name: "Lanza básica", icon: "spear", costs: { branch: 1, stone: 1 }, requires: ["axe"], description: "La mejor respuesta ante algo con colmillos." },
  { id: "torch", name: "Antorcha básica", icon: "torch", costs: { branch: 1, vine: 1 }, description: "Hace menos temibles los calabozos." },
  { id: "piano", name: "Pianoforte de Beethoven", icon: "piano", costs: { stone: 2, branch: 3 }, description: "Autografiado. Sorprendentemente portátil." },
  { id: "cuerda", name: "Cuerda firme", icon: "cuerda", costs: { vine: 4 }, description: "Cuatro lianas trenzadas con paciencia de duende." },
  { id: "remo", name: "Remo tallado", icon: "remo", costs: { log: 2, branch: 1 }, requires: ["axe"], description: "Ligero, recto y con vocación de río." },
  { id: "vela", name: "Vela remendada", icon: "vela", costs: { tela: 2, vine: 2 }, description: "El viento no pregunta de dónde salió la tela.", hint: "La tela encerada aparece en cofres a partir del nivel 2." },
  { id: "balsa", name: "La Balsa", icon: "balsa", costs: { log: 8, resina: 2, brujula: 1 }, requires: ["cuerda", "remo", "vela"], final: true, description: "Ocho troncos, mucha resina y una promesa: el río te llevará a casa.", hint: "La resina aparece selva adentro (nivel 3+) y la brújula, aún más lejos (nivel 4+)." },
];

export const STRUCTURES = [
  { id: "base", name: "Base inicial", logs: 10, requires: ["hammer", "axe"], description: "Un hogar seguro en esta parcela." },
  { id: "chair", name: "Silla", logs: 5, requires: ["hammer"], description: "Descansa y recupera 2 puntos de vida. Se rompe tras 2 usos." },
  { id: "trap", name: "Trampa sencilla", logs: 3, requires: ["hammer"], description: "Se guarda en la mochila; colócala con T donde la necesites." },
  { id: "pen", name: "Corral", logs: 1, requires: ["hammer"], description: "Todavía no hay animales, pero hay optimismo." },
];

// --- registros de contenido (integrados + personalizados) ---------------------

const BUILTIN_TERRAINS = [
  { id: "forest", char: "F", name: "Bosque", walkable: false, builtin: true },
  { id: "dirt", char: ".", name: "Tierra", walkable: true, builtin: true },
  { id: "garden", char: "g", name: "Jardín", walkable: true, builtin: true },
  { id: "stonePath", char: "s", name: "Camino", walkable: true, builtin: true },
];

const BUILTIN_ITEMS = [
  { id: "branch", name: "Ramas", builtin: true },
  { id: "stone", name: "Piedras", builtin: true },
  { id: "vine", name: "Lianas", builtin: true },
];

function buildRegistry(content = {}) {
  const terrains = [...BUILTIN_TERRAINS, ...(content.terrains ?? [])];
  const items = [...BUILTIN_ITEMS, ...(content.items ?? [])];
  const monsters = [...(content.monsters ?? [])];
  return {
    terrains, items, monsters,
    terrainByChar: Object.fromEntries(terrains.map((t) => [t.char, t])),
    terrainById: Object.fromEntries(terrains.map((t) => [t.id, t])),
    itemById: Object.fromEntries(items.map((i) => [i.id, i])),
    monsterById: Object.fromEntries(monsters.map((m) => [m.id, m])),
  };
}

let registry = buildRegistry(CONTENT);

export function applyContent(content) { registry = buildRegistry(content); }
export function getTerrains() { return registry.terrains; }
export function getItems() { return registry.items; }
export function getMonsters() { return registry.monsters; }
export function terrainById(id) { return registry.terrainById[id]; }
export function itemById(id) { return registry.itemById[id]; }
export function monsterById(id) { return registry.monsterById[id]; }
export function isWalkable(terrainId) { return registry.terrainById[terrainId]?.walkable ?? true; }
export function isCollectible(type) { return Boolean(registry.itemById[type]); }
export function labelFor(type) {
  return MATERIAL_LABELS[type] ?? registry.itemById[type]?.name ?? registry.monsterById[type]?.name ?? type;
}

const SPRITE_SIZE = 16;

export function validateSprite(sprite) {
  const issues = [];
  if (!sprite || !Array.isArray(sprite.palette) || !Array.isArray(sprite.pixels)) return ["El sprite no tiene datos de píxeles."];
  const size = sprite.size ?? SPRITE_SIZE;
  if (sprite.palette.length > 16) issues.push("La paleta admite como máximo 16 colores.");
  if (sprite.pixels.length !== size) issues.push(`El sprite debe tener ${size} filas.`);
  for (const row of sprite.pixels) {
    if (typeof row !== "string" || row.length !== size) { issues.push(`Cada fila del sprite debe tener ${size} caracteres.`); break; }
    for (const char of row) {
      if (char === ".") continue;
      const index = parseInt(char, 16);
      if (Number.isNaN(index) || index >= sprite.palette.length) { issues.push(`Píxel con índice fuera de paleta: "${char}".`); break; }
    }
  }
  return issues;
}

const RESERVED_IDS = new Set([
  ...MATERIALS, ...RARE_MATERIALS, "exit", "dungeon", "start",
  ...RECIPES.map((r) => r.id), ...STRUCTURES.map((s) => s.id),
  ...BUILTIN_TERRAINS.map((t) => t.id),
]);
const RESERVED_CHARS = new Set(BUILTIN_TERRAINS.map((t) => t.char));

export function validateContent(content = {}) {
  const issues = [];
  const seenIds = new Set();
  const seenChars = new Set();
  const groups = [["terrains", content.terrains ?? []], ["items", content.items ?? []], ["monsters", content.monsters ?? []]];
  for (const [kind, defs] of groups) {
    for (const def of defs) {
      const tag = `${kind}/${def?.id ?? "?"}`;
      if (!def?.id || !/^[a-z][a-zA-Z0-9_-]*$/.test(def.id)) issues.push(`${tag}: el id debe empezar en minúscula y no llevar espacios.`);
      if (RESERVED_IDS.has(def?.id)) issues.push(`${tag}: el id "${def.id}" está reservado por el juego.`);
      if (seenIds.has(def?.id)) issues.push(`${tag}: id repetido.`);
      seenIds.add(def?.id);
      if (!def?.name) issues.push(`${tag}: falta el nombre.`);
      issues.push(...validateSprite(def?.sprite).map((issue) => `${tag}: ${issue}`));
      if (kind === "terrains") {
        if (typeof def.char !== "string" || def.char.length !== 1) issues.push(`${tag}: falta un carácter de mapa (1 letra).`);
        else if (RESERVED_CHARS.has(def.char)) issues.push(`${tag}: el carácter "${def.char}" está reservado.`);
        else if (seenChars.has(def.char)) issues.push(`${tag}: carácter de mapa repetido.`);
        seenChars.add(def.char);
        if (typeof def.walkable !== "boolean") issues.push(`${tag}: falta indicar si es transitable.`);
      }
      if (kind === "monsters") {
        if (!Number.isFinite(def.damage) || def.damage < 1) issues.push(`${tag}: el daño debe ser un número (mínimo 1).`);
        if (!Number.isInteger(def.restEvery) || def.restEvery < 0) issues.push(`${tag}: "descansa cada" debe ser un entero (0 = nunca descansa).`);
      }
    }
  }
  return issues;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (x, y) => `${x},${y}`;
export const neighbors = (x, y) => [
  { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 },
].filter((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE);

export function reachableTiles(map, start) {
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbors(current.x, current.y)) {
      if (!isWalkable(map[next.y][next.x].terrain) || seen.has(key(next.x, next.y))) continue;
      seen.add(key(next.x, next.y));
      queue.push(next);
    }
  }
  return seen;
}

function shuffled(array, rng) {
  return [...array].sort(() => rng() - 0.5);
}

function carveConnectedTerrain(rng) {
  const map = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ terrain: "forest", feature: null, structure: null, chopped: 0 })),
  );
  const start = { x: 6, y: 6 };
  const open = new Set([key(start.x, start.y)]);
  const frontier = [start];
  const target = 78 + Math.floor(rng() * 10);
  map[start.y][start.x].terrain = "dirt";

  while (open.size < target) {
    const origin = frontier[Math.floor(rng() * frontier.length)];
    const options = shuffled(neighbors(origin.x, origin.y), rng);
    const next = options.find((p) => !open.has(key(p.x, p.y)));
    if (!next) {
      frontier.splice(frontier.indexOf(origin), 1);
      continue;
    }
    open.add(key(next.x, next.y));
    frontier.push(next);
    const roll = rng();
    map[next.y][next.x].terrain = roll < 0.18 ? "stonePath" : roll < 0.4 ? "garden" : "dirt";
  }
  return { map, start, open };
}

export function distances(map, start) {
  const result = new Map([[key(start.x, start.y), 0]]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift();
    for (const n of neighbors(p.x, p.y)) {
      if (!isWalkable(map[n.y][n.x].terrain) || result.has(key(n.x, n.y))) continue;
      result.set(key(n.x, n.y), result.get(key(p.x, p.y)) + 1);
      queue.push(n);
    }
  }
  return result;
}

export function generateMap(seed = Date.now(), options = {}) {
  const { itemCounts = { branch: 8, stone: 7, vine: 6 }, dungeonChance = 0.14 } = options;
  const rng = mulberry32(seed);
  const { map, start, open } = carveConnectedTerrain(rng);
  const distanceMap = distances(map, start);
  const candidates = [...open]
    .map((value) => { const [x, y] = value.split(",").map(Number); return { x, y }; })
    .filter((p) => distanceMap.get(key(p.x, p.y)) > 5)
    .sort((a, b) => distanceMap.get(key(b.x, b.y)) - distanceMap.get(key(a.x, a.y)));
  const farthest = candidates[0];
  map[farthest.y][farthest.x].feature = "exit";
  if (rng() < dungeonChance && candidates.length > 1) {
    const den = candidates[1];
    map[den.y][den.x].feature = "dungeon";
  }

  const free = shuffled([...open]
    .map((value) => { const [x, y] = value.split(",").map(Number); return { x, y }; })
    .filter((p) => key(p.x, p.y) !== key(start.x, start.y) && !map[p.y][p.x].feature), rng);
  for (const [type, count] of Object.entries(itemCounts)) {
    for (let i = 0; i < count; i += 1) {
      const p = free.pop();
      if (p) map[p.y][p.x].feature = type;
    }
  }
  return { map, start, seed, exit: farthest };
}

export function buildLevelMap(levelDef) {
  const def = levelDef.map;
  if (def.type === "random") return generateMap(def.seed, def.params ?? {});
  const map = def.terrain.map((row) => [...row].map((char) => ({
    terrain: registry.terrainByChar[char]?.id ?? "dirt", feature: null, structure: null, chopped: 0,
  })));
  for (const [position, type] of Object.entries(def.features ?? {})) {
    const [x, y] = position.split(",").map(Number);
    if (map[y]?.[x]) map[y][x].feature = type;
  }
  const start = { ...def.start };
  const exit = { ...def.exit };
  if (map[exit.y]?.[exit.x]) map[exit.y][exit.x].feature = "exit";
  return { map, start, seed: def.seed ?? 1, exit };
}

export function mapToPainted(map, start, exit, seed = 1) {
  const terrain = map.map((row) => row.map((tile) => registry.terrainById[tile.terrain]?.char ?? ".").join(""));
  const features = {};
  for (let y = 0; y < map.length; y += 1) for (let x = 0; x < map[y].length; x += 1) {
    const feature = map[y][x].feature;
    if (feature && feature !== "exit") features[key(x, y)] = feature;
  }
  return { type: "painted", seed, terrain, features, start: { ...start }, exit: { ...exit } };
}

function terrainLabel(id) { return (registry.terrainById[id]?.name ?? id).toLowerCase(); }

export function validateLevel(levelDef) {
  const issues = [];
  const pool = levelDef?.monsterPool ?? [];
  if (pool.length > 2) issues.push("El nivel admite como máximo 2 tipos de monstruos.");
  for (const id of pool) if (!registry.monsterById[id]) issues.push(`Monstruo desconocido en el nivel: "${id}".`);
  const def = levelDef?.map;
  if (!def) return ["El nivel no tiene mapa definido."];
  if (def.type === "random") {
    if (!Number.isFinite(def.seed)) issues.push("La semilla del mapa aleatorio debe ser un número.");
    return issues;
  }
  if (!Array.isArray(def.terrain) || def.terrain.length !== SIZE || def.terrain.some((row) => typeof row !== "string" || row.length !== SIZE)) {
    issues.push(`El terreno debe ser una cuadrícula de ${SIZE}×${SIZE}.`);
    return issues;
  }
  for (const row of def.terrain) for (const char of row) {
    if (!registry.terrainByChar[char]) { issues.push(`Carácter de terreno desconocido: "${char}".`); break; }
  }
  const inBounds = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE;
  if (!inBounds(def.start)) { issues.push("El punto de inicio está fuera del mapa."); return issues; }
  if (!inBounds(def.exit)) { issues.push("La salida está fuera del mapa."); return issues; }
  const { map, start, exit } = buildLevelMap(levelDef);
  if (!isWalkable(map[start.y][start.x].terrain)) issues.push(`El punto de inicio cae sobre terreno intransitable (${terrainLabel(map[start.y][start.x].terrain)}).`);
  if (!isWalkable(map[exit.y][exit.x].terrain)) issues.push(`La salida cae sobre terreno intransitable (${terrainLabel(map[exit.y][exit.x].terrain)}).`);
  if (issues.length) return issues;
  const reachable = reachableTiles(map, start);
  if (!reachable.has(key(exit.x, exit.y))) issues.push("La salida no es alcanzable desde el inicio.");
  for (const [position, type] of Object.entries(def.features ?? {})) {
    if (type === "exit") { issues.push(`La casilla ${position} usa "exit" como objeto; usa el campo de salida.`); continue; }
    const [x, y] = position.split(",").map(Number);
    if (!inBounds({ x, y })) { issues.push(`El objeto en ${position} está fuera del mapa.`); continue; }
    if (!isWalkable(map[y][x].terrain)) issues.push(`El objeto en ${position} cae sobre terreno intransitable (${terrainLabel(map[y][x].terrain)}).`);
    else if (!reachable.has(key(x, y))) issues.push(`El objeto en ${position} no es alcanzable.`);
  }
  return issues;
}

const RARE_CAPS = { tela: 2, resina: 2, brujula: 1 };

export function rollTreasure(levelDef, inventory, rng = Math.random) {
  const pool = (levelDef.loot ?? []).filter((type) => (inventory[type] ?? 0) < (RARE_CAPS[type] ?? 1));
  if (pool.length && rng() < 0.35) return { type: pool[Math.floor(rng() * pool.length)], count: 1 };
  const type = ["branch", "stone", "vine", "log"][Math.floor(rng() * 4)];
  return { type, count: type === "log" ? 1 : 3 };
}

export function canAfford(inventory, recipe) {
  return Object.entries(recipe.costs ?? { log: recipe.logs }).every(([item, count]) => (inventory[item] ?? 0) >= count);
}

export function hasRequirements(inventory, recipe) {
  return (recipe.requires ?? []).every((item) => inventory[item]);
}

export function spendCosts(inventory, costs) {
  const next = { ...inventory };
  for (const [item, count] of Object.entries(costs)) next[item] -= count;
  return next;
}

export function encounterChance(stepsOnMap, trapCount = 0, params = {}) {
  const { base = 0.02, perStep = 0.006, trapFactor = 0.03, cap = 0.38 } = params;
  return Math.max(base, Math.min(cap, base + stepsOnMap * perStep - trapCount * trapFactor));
}

export function chooseEncounter(rng = Math.random, weights = { enemy: 0.68, merchant: 0.19, treasure: 0.13 }) {
  const roll = rng() * (weights.enemy + weights.merchant + weights.treasure);
  if (roll < weights.enemy) return "enemy";
  if (roll < weights.enemy + weights.merchant) return "merchant";
  return "treasure";
}

// --- monstruos -----------------------------------------------------------------

export const MAX_MONSTERS = 2;
const SPAWN_MIN_DISTANCE = 5;

export function spawnMonster(state, levelDef, rng = Math.random) {
  const pool = (levelDef?.monsterPool ?? []).filter((id) => registry.monsterById[id]);
  if (!pool.length) return null;
  state.monsters ??= [];
  if (state.monsters.length >= MAX_MONSTERS) return null;
  const distanceMap = distances(state.map, state.player);
  const occupied = new Set(state.monsters.map((m) => key(m.x, m.y)));
  const candidates = [];
  for (const [position, distance] of distanceMap) {
    if (distance < SPAWN_MIN_DISTANCE || occupied.has(position)) continue;
    const [x, y] = position.split(",").map(Number);
    const tile = state.map[y][x];
    if (tile.feature || tile.structure) continue;
    candidates.push({ x, y, distance });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.distance - a.distance || a.y - b.y || a.x - b.x);
  const pick = candidates[Math.floor(rng() * Math.min(candidates.length, 6))];
  const type = pool[Math.floor(rng() * pool.length)];
  const monster = { type, x: pick.x, y: pick.y, turns: 0, rest: 0 };
  state.monsters.push(monster);
  return monster;
}

export function advanceMonsters(state) {
  const events = [];
  const monsters = state.monsters ?? [];
  if (!monsters.length) return events;
  const distanceMap = distances(state.map, state.player);
  const destroyed = new Set();
  for (const monster of monsters) {
    monster.turns += 1;
    if (monster.rest > 0) { monster.rest -= 1; continue; }
    const def = registry.monsterById[monster.type];
    const restEvery = def?.restEvery ?? 3;
    if (restEvery > 0 && monster.turns % restEvery === 0) continue;
    const currentDistance = distanceMap.get(key(monster.x, monster.y)) ?? Infinity;
    let best = null;
    for (const next of neighbors(monster.x, monster.y)) {
      if (!isWalkable(state.map[next.y][next.x].terrain)) continue;
      if (monsters.some((other) => other !== monster && !destroyed.has(other) && other.x === next.x && other.y === next.y)) continue;
      const distance = distanceMap.get(key(next.x, next.y));
      if (distance === undefined) continue;
      if (!best || distance < best.distance) best = { ...next, distance };
    }
    if (!best || best.distance >= currentDistance) continue;
    monster.x = best.x; monster.y = best.y;
    const tile = state.map[best.y][best.x];
    if (tile.structure === "trap") {
      tile.structure = null;
      state.trapCount = Math.max(0, (state.trapCount ?? 0) - 1);
      destroyed.add(monster);
      events.push({ kind: "trap", x: best.x, y: best.y, monster });
      continue;
    }
    if (best.x === state.player.x && best.y === state.player.y) events.push({ kind: "caught", monster });
  }
  if (destroyed.size) state.monsters = monsters.filter((monster) => !destroyed.has(monster));
  return events;
}
