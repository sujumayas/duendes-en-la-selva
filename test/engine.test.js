import test from "node:test";
import assert from "node:assert/strict";
import { SIZE, RECIPES, STRUCTURES, generateMap, reachableTiles, canAfford, hasRequirements, encounterChance, mulberry32, chooseEncounter } from "../src/engine.js";

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

test("all materials and exactly one exit-like feature are generated", () => {
  const { map } = generateMap(44);
  const features = map.flat().map((tile) => tile.feature).filter(Boolean);
  assert.equal(features.filter((f) => f === "branch").length, 8);
  assert.equal(features.filter((f) => f === "stone").length, 7);
  assert.equal(features.filter((f) => f === "vine").length, 6);
  assert.equal(features.filter((f) => f === "exit" || f === "dungeon").length, 1);
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
