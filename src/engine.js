export const SIZE = 12;

export const MATERIALS = ["branch", "stone", "vine", "log"];

export const MATERIAL_LABELS = {
  branch: "Ramas",
  stone: "Piedras",
  vine: "Lianas",
  log: "Troncos",
};

export const RECIPES = [
  { id: "campfire", name: "Fogata básica", icon: "campfire", costs: { branch: 3, stone: 5 }, description: "Una pequeña tregua contra la noche." },
  { id: "hammer", name: "Martillo básico", icon: "hammer", costs: { branch: 1, stone: 1 }, description: "Necesario para levantar estructuras." },
  { id: "axe", name: "Hacha básica", icon: "axe", costs: { branch: 1, stone: 1 }, requires: ["hammer"], description: "Permite obtener troncos del bosque." },
  { id: "spear", name: "Lanza básica", icon: "spear", costs: { branch: 1, stone: 1 }, requires: ["axe"], description: "La mejor respuesta ante algo con colmillos." },
  { id: "torch", name: "Antorcha básica", icon: "torch", costs: { branch: 1, vine: 1 }, description: "Hace menos temibles los calabozos." },
  { id: "piano", name: "Pianoforte de Beethoven", icon: "piano", costs: { stone: 2, branch: 3 }, description: "Autografiado. Sorprendentemente portátil." },
];

export const STRUCTURES = [
  { id: "base", name: "Base inicial", logs: 10, requires: ["hammer", "axe"], description: "Un hogar seguro en esta parcela." },
  { id: "chair", name: "Silla", logs: 5, requires: ["hammer"], description: "Descansa y recupera 2 puntos de vida." },
  { id: "trap", name: "Trampa sencilla", logs: 3, requires: ["hammer"], description: "Reduce la amenaza de esta parcela." },
  { id: "pen", name: "Corral", logs: 1, requires: ["hammer"], description: "Todavía no hay animales, pero hay optimismo." },
];

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
      if (map[next.y][next.x].terrain === "forest" || seen.has(key(next.x, next.y))) continue;
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

function distances(map, start) {
  const result = new Map([[key(start.x, start.y), 0]]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift();
    for (const n of neighbors(p.x, p.y)) {
      if (map[n.y][n.x].terrain === "forest" || result.has(key(n.x, n.y))) continue;
      result.set(key(n.x, n.y), result.get(key(p.x, p.y)) + 1);
      queue.push(n);
    }
  }
  return result;
}

export function generateMap(seed = Date.now()) {
  const rng = mulberry32(seed);
  const { map, start, open } = carveConnectedTerrain(rng);
  const distanceMap = distances(map, start);
  const candidates = [...open]
    .map((value) => { const [x, y] = value.split(",").map(Number); return { x, y }; })
    .filter((p) => distanceMap.get(key(p.x, p.y)) > 5);
  const farthest = candidates.sort((a, b) => distanceMap.get(key(b.x, b.y)) - distanceMap.get(key(a.x, a.y)))[0];
  map[farthest.y][farthest.x].feature = rng() < 0.14 ? "dungeon" : "exit";

  const free = shuffled([...open]
    .map((value) => { const [x, y] = value.split(",").map(Number); return { x, y }; })
    .filter((p) => key(p.x, p.y) !== key(start.x, start.y) && !map[p.y][p.x].feature), rng);
  const itemCounts = { branch: 8, stone: 7, vine: 6 };
  for (const [type, count] of Object.entries(itemCounts)) {
    for (let i = 0; i < count; i += 1) {
      const p = free.pop();
      if (p) map[p.y][p.x].feature = type;
    }
  }
  return { map, start, seed, exit: farthest };
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

export function encounterChance(stepsOnMap, trapCount = 0) {
  return Math.max(0.02, Math.min(0.38, 0.02 + stepsOnMap * 0.006 - trapCount * 0.03));
}

export function chooseEncounter(rng = Math.random) {
  const roll = rng();
  if (roll < 0.68) return "enemy";
  if (roll < 0.87) return "merchant";
  return "treasure";
}
