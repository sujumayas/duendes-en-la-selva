import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES, RARE_MATERIALS, buildLevelMap, validateLevel, reachableTiles, monsterById } from "../src/engine.js";
import { LEVELS } from "../src/levels.js";

test("every shipped level is valid and its exit is reachable", () => {
  assert.ok(LEVELS.length >= 2);
  for (const level of LEVELS) {
    assert.deepEqual(validateLevel(level), [], `nivel ${level.id}`);
    const { map, start, exit } = buildLevelMap(level);
    assert.ok(reachableTiles(map, start).has(`${exit.x},${exit.y}`), `nivel ${level.id}: salida alcanzable`);
    assert.equal(map[exit.y][exit.x].feature, "exit", `nivel ${level.id}: la salida existe`);
  }
});

test("rare raft components are gated behind deeper levels", () => {
  const firstLevelWith = (rare) => LEVELS.findIndex((level) => level.loot.includes(rare)) + 1;
  assert.equal(firstLevelWith("tela"), 2);
  assert.equal(firstLevelWith("resina"), 3);
  assert.equal(firstLevelWith("brujula"), 4);
});

test("every rare material required by the raft chain drops somewhere", () => {
  const allLoot = new Set(LEVELS.flatMap((level) => level.loot));
  const rareCosts = RECIPES.flatMap((recipe) => Object.keys(recipe.costs).filter((item) => RARE_MATERIALS.includes(item)));
  for (const rare of rareCosts) assert.ok(allLoot.has(rare), `${rare} debe aparecer en el loot de algún nivel`);
});

test("shipped monster pools resolve to defined monsters and stay within the limit", () => {
  assert.ok(LEVELS.some((level) => (level.monsterPool ?? []).length), "algún nivel debe tener monstruos en su pool");
  for (const level of LEVELS) {
    const pool = level.monsterPool ?? [];
    assert.ok(pool.length <= 2, `nivel ${level.id}: máximo 2 tipos de monstruos`);
    for (const id of pool) assert.ok(monsterById(id), `nivel ${level.id}: el monstruo "${id}" existe en content.js`);
  }
});

test("the raft recipe exists, is final, and its chain is completable", () => {
  const balsa = RECIPES.find((recipe) => recipe.id === "balsa");
  assert.ok(balsa);
  assert.equal(balsa.final, true);
  for (const required of balsa.requires) assert.ok(RECIPES.some((recipe) => recipe.id === required), `receta ${required}`);
});
