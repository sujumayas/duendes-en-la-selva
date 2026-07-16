import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE, RECIPES, STRUCTURES, generateMap, reachableTiles, canAfford, hasRequirements,
  encounterChance, mulberry32, chooseEncounter, buildLevelMap, mapToPainted, validateLevel, rollTreasure,
  isWalkable, applyContent, distances, spawnMonster, advanceMonsters, validateSprite, validateContent,
} from "../src/engine.js";
import { CONTENT } from "../src/content.js";

test("generated maps are 12x12 and every navigable tile is connected", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const generated = generateMap(seed);
    assert.equal(generated.map.length, SIZE);
    assert.ok(generated.map.every((row) => row.length === SIZE));
    const reachable = reachableTiles(generated.map, generated.start);
    const navigable = generated.map.flat().filter((tile) => tile.terrain !== "forest").length;
    assert.equal(reachable.size, navigable, `seed ${seed}`);
    assert.ok(reachable.has(`${generated.exit.x},${generated.exit.y}`));
  }
});

test("all materials and exactly one exit are generated", () => {
  const { map } = generateMap(44);
  const features = map.flat().map((tile) => tile.feature).filter(Boolean);
  assert.equal(features.filter((f) => f === "branch").length, 8);
  assert.equal(features.filter((f) => f === "stone").length, 7);
  assert.equal(features.filter((f) => f === "vine").length, 6);
  assert.equal(features.filter((f) => f === "exit").length, 1);
  assert.ok(features.filter((f) => f === "dungeon").length <= 1);
});

test("generateMap honors item counts and dungeon chance options", () => {
  const { map } = generateMap(7, { itemCounts: { branch: 2, stone: 1, vine: 0 }, dungeonChance: 0 });
  const features = map.flat().map((tile) => tile.feature).filter(Boolean);
  assert.equal(features.filter((f) => f === "branch").length, 2);
  assert.equal(features.filter((f) => f === "stone").length, 1);
  assert.equal(features.filter((f) => f === "vine").length, 0);
  assert.equal(features.filter((f) => f === "dungeon").length, 0);
  assert.equal(features.filter((f) => f === "exit").length, 1);
  const always = generateMap(7, { dungeonChance: 1 });
  const dungeonCount = always.map.flat().filter((tile) => tile.feature === "dungeon").length;
  assert.equal(dungeonCount, 1);
  assert.equal(always.map[always.exit.y][always.exit.x].feature, "exit");
});

test("recipes require their listed materials and prerequisite tools", () => {
  const axe = RECIPES.find((recipe) => recipe.id === "axe");
  assert.equal(canAfford({ branch: 1, stone: 1 }, axe), true);
  assert.equal(hasRequirements({ hammer: false }, axe), false);
  assert.equal(hasRequirements({ hammer: true }, axe), true);
});

test("crafting and building costs match the design document", () => {
  assert.deepEqual(Object.fromEntries(RECIPES.map((r) => [r.id, r.costs])), {
    campfire: { branch: 3, stone: 5 },
    hammer: { branch: 1, stone: 1 },
    axe: { branch: 1, stone: 1 },
    spear: { branch: 1, stone: 1 },
    torch: { branch: 1, vine: 1 },
    piano: { stone: 2, branch: 3 },
    cuerda: { vine: 4 },
    remo: { log: 2, branch: 1 },
    vela: { tela: 2, vine: 2 },
    balsa: { log: 8, resina: 2, brujula: 1 },
  });
  assert.deepEqual(Object.fromEntries(STRUCTURES.map((s) => [s.id, s.logs])), { base: 10, chair: 5, trap: 3, pen: 1 });
});

test("encounter factor rises, caps, and traps lower it", () => {
  assert.equal(encounterChance(0), 0.02);
  assert.ok(encounterChance(20) > encounterChance(5));
  assert.equal(encounterChance(500), 0.38);
  assert.ok(encounterChance(20, 2) < encounterChance(20, 0));
});

test("encounter selection is deterministic with a seeded generator", () => {
  const rng = mulberry32(9);
  assert.deepEqual(Array.from({ length: 4 }, () => chooseEncounter(rng)), ["enemy", "merchant", "enemy", "merchant"]);
});

test("encounter chance and selection honor per-level parameters", () => {
  assert.equal(encounterChance(0, 0, { base: 0.1 }), 0.1);
  assert.equal(encounterChance(100, 0, { cap: 0.5 }), 0.5);
  assert.ok(encounterChance(10, 0, { perStep: 0.02 }) > encounterChance(10, 0));
  const rng = mulberry32(9);
  const picks = Array.from({ length: 50 }, () => chooseEncounter(rng, { enemy: 0, merchant: 0, treasure: 1 }));
  assert.ok(picks.every((pick) => pick === "treasure"));
});

const paintedLevel = () => ({
  id: 1,
  name: "Prueba",
  map: {
    type: "painted",
    seed: 5,
    terrain: [
      "FFFFFFFFFFFF",
      "F....gFFFFFF",
      "F.FF.sFFFFFF",
      "F.FF..FFFFFF",
      "F......FFFFF",
      "FFFF.FFFFFFF",
      "FFFF.FFFFFFF",
      "FFFF....FFFF",
      "FFFFFFF.FFFF",
      "FFFFFFF.FFFF",
      "FFFFFFF..FFF",
      "FFFFFFFFFFFF",
    ],
    features: { "1,1": "branch", "5,2": "stone" },
    start: { x: 4, y: 1 },
    exit: { x: 8, y: 10 },
  },
  loot: [],
});

test("buildLevelMap builds painted levels and round-trips through mapToPainted", () => {
  const level = paintedLevel();
  const { map, start, exit, seed } = buildLevelMap(level);
  assert.equal(seed, 5);
  assert.deepEqual(start, level.map.start);
  assert.deepEqual(exit, level.map.exit);
  assert.equal(map[1][1].feature, "branch");
  assert.equal(map[10][8].feature, "exit");
  assert.equal(map[0][0].terrain, "forest");
  assert.equal(map[2][5].terrain, "stonePath");
  assert.equal(map[1][5].terrain, "garden");
  const painted = mapToPainted(map, start, exit, seed);
  assert.deepEqual(painted.terrain, level.map.terrain);
  assert.deepEqual(painted.features, level.map.features);
  assert.deepEqual(painted.start, level.map.start);
  assert.deepEqual(painted.exit, level.map.exit);
});

test("validateLevel accepts good levels and flags broken ones", () => {
  assert.deepEqual(validateLevel(paintedLevel()), []);
  const forestStart = paintedLevel();
  forestStart.map.start = { x: 0, y: 0 };
  assert.ok(validateLevel(forestStart).some((issue) => issue.includes("inicio")));
  const isolatedExit = paintedLevel();
  isolatedExit.map.terrain[9] = "FFFFFFFFFFFF";
  assert.ok(validateLevel(isolatedExit).some((issue) => issue.includes("alcanzable")));
  const featureOnForest = paintedLevel();
  featureOnForest.map.features["0,0"] = "vine";
  assert.ok(validateLevel(featureOnForest).some((issue) => issue.includes("bosque")));
});

test("validateLevel flags bad monster pools", () => {
  const level = paintedLevel();
  level.monsterPool = ["fantasma"];
  assert.ok(validateLevel(level).some((issue) => issue.includes("Monstruo desconocido")));
  level.monsterPool = ["jabali", "sombra", "jabali"];
  assert.ok(validateLevel(level).some((issue) => issue.includes("2 tipos")));
  level.monsterPool = ["jabali"];
  assert.deepEqual(validateLevel(level), []);
});

test("isWalkable consults the terrain registry, including custom terrains", () => {
  assert.equal(isWalkable("dirt"), true);
  assert.equal(isWalkable("garden"), true);
  assert.equal(isWalkable("forest"), false);
  applyContent({ terrains: [{ id: "lava", char: "l", name: "Lava", walkable: false }], items: [], monsters: [] });
  assert.equal(isWalkable("lava"), false);
  applyContent(CONTENT);
});

const testSprite = () => ({ size: 16, palette: ["#123123"], pixels: Array.from({ length: 16 }, () => "0".repeat(16)) });

test("custom terrains round-trip through painted maps and validation", () => {
  applyContent({
    terrains: [{ id: "swamp", char: "w", name: "Pantano", walkable: true, sprite: testSprite() }],
    items: [], monsters: CONTENT.monsters,
  });
  const level = paintedLevel();
  level.map.terrain[1] = "F.w..gFFFFFF";
  assert.deepEqual(validateLevel(level), []);
  const { map, start, exit, seed } = buildLevelMap(level);
  assert.equal(map[1][2].terrain, "swamp");
  const painted = mapToPainted(map, start, exit, seed);
  assert.equal(painted.terrain[1], "F.w..gFFFFFF");
  applyContent(CONTENT);
  assert.ok(validateLevel(level).some((issue) => issue.includes("desconocido")), "unknown chars are flagged once the terrain is gone");
});

test("sprites and content definitions are validated", () => {
  assert.deepEqual(validateSprite(testSprite()), []);
  assert.deepEqual(validateContent(CONTENT), []);
  assert.ok(validateSprite({ palette: [], pixels: ["x"] }).length > 0);
  assert.ok(validateSprite(null).length > 0);
  const issues = validateContent({ terrains: [{ id: "dirt", char: "F", name: "", walkable: "sí" }], items: [], monsters: [] });
  assert.ok(issues.length >= 4, `reserved id, reserved char, missing name, bad walkable and missing sprite should all flag: ${issues}`);
});

function openState(playerAt = { x: 0, y: 0 }) {
  const map = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ terrain: "dirt", feature: null, structure: null, chopped: 0 })));
  return { map, player: { ...playerAt }, monsters: [], trapCount: 0 };
}

test("spawnMonster places pool monsters far from the player and respects the cap", () => {
  const state = openState({ x: 6, y: 6 });
  const level = { monsterPool: ["jabali"] };
  const rng = mulberry32(3);
  const first = spawnMonster(state, level, rng);
  assert.ok(first);
  assert.equal(first.type, "jabali");
  const distanceMap = distances(state.map, state.player);
  assert.ok(distanceMap.get(`${first.x},${first.y}`) >= 5, "spawns keep their distance");
  assert.ok(spawnMonster(state, level, rng), "a second monster fits");
  assert.equal(spawnMonster(state, level, rng), null, "MAX_MONSTERS caps concurrent beasts");
  assert.equal(spawnMonster(openState(), { monsterPool: [] }, rng), null);
  assert.equal(spawnMonster(openState(), { monsterPool: ["fantasma"] }, rng), null, "unknown ids are skipped");
});

test("monsters pathfind toward the player and pause to rest", () => {
  const state = openState({ x: 0, y: 0 });
  state.monsters = [{ type: "jabali", x: 5, y: 0, turns: 0, rest: 0 }];
  advanceMonsters(state);
  assert.equal(state.monsters[0].x, 4, "turn 1 moves closer");
  advanceMonsters(state);
  assert.equal(state.monsters[0].x, 3, "turn 2 moves closer");
  advanceMonsters(state);
  assert.equal(state.monsters[0].x, 3, "turn 3 rests (restEvery: 3)");
  advanceMonsters(state);
  assert.equal(state.monsters[0].x, 2, "turn 4 moves again");
  state.monsters[0].rest = 2;
  advanceMonsters(state);
  assert.equal(state.monsters[0].x, 2, "a resting beast holds still");
  assert.equal(state.monsters[0].rest, 1);
});

test("a trap destroys the monster that steps on it, and itself", () => {
  const state = openState({ x: 0, y: 0 });
  state.trapCount = 1;
  state.map[0][1].structure = "trap";
  state.monsters = [{ type: "jabali", x: 2, y: 0, turns: 0, rest: 0 }];
  const events = advanceMonsters(state);
  assert.deepEqual(events.map((event) => event.kind), ["trap"]);
  assert.equal(state.map[0][1].structure, null, "the trap is consumed");
  assert.equal(state.trapCount, 0);
  assert.equal(state.monsters.length, 0, "the beast is destroyed");
});

test("a monster that reaches the player emits a caught event", () => {
  const state = openState({ x: 0, y: 0 });
  state.monsters = [{ type: "jabali", x: 1, y: 0, turns: 0, rest: 0 }];
  const events = advanceMonsters(state);
  assert.equal(events[0]?.kind, "caught");
  assert.deepEqual({ x: state.monsters[0].x, y: state.monsters[0].y }, { x: 0, y: 0 });
});

test("rollTreasure gates rare loot by level and inventory", () => {
  const rng = mulberry32(21);
  const noLoot = paintedLevel();
  for (let i = 0; i < 200; i += 1) {
    const { type } = rollTreasure(noLoot, { brujula: 0 }, rng);
    assert.ok(["branch", "stone", "vine", "log"].includes(type));
  }
  const withLoot = { ...paintedLevel(), loot: ["brujula"] };
  const rares = Array.from({ length: 200 }, () => rollTreasure(withLoot, { brujula: 0 }, rng)).filter((r) => r.type === "brujula");
  assert.ok(rares.length > 0);
  for (let i = 0; i < 200; i += 1) {
    const { type } = rollTreasure(withLoot, { brujula: 1 }, rng);
    assert.notEqual(type, "brujula");
  }
});
