import test from "node:test";
import assert from "node:assert/strict";
import { generateMap } from "../src/engine.js";

const SAVE_KEY = "duendes-save-v2";

class FakeClassList {
  values = new Set();
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.open = false;
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ currentTarget: this, preventDefault() {}, ...event }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  getContext() { return fakeContext; }
}

let drawCalls = 0;
const fakeContext = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = (...args) => { if (["fillRect", "strokeRect", "clearRect"].includes(property)) drawCalls += 1; return args[0]; };
    return target[property];
  },
  set(target, property, value) { target[property] = value; return true; },
});

const selectors = [
  "#gameCanvas", "#portrait", "#healthBar", "#healthText", "#dayText", "#stepsText", "#dangerText", "#dangerBar", "#levelText",
  "#resources", "#tools", "#toast", "#gameDialog", "#dialogKicker", "#dialogTitle", "#dialogBody", "#dialogActions",
  "#interactButton", "#trapButton", "#craftButton", "#buildButton", "#helpButton", "#dialogClose", "#restartButton", "#soundButton",
];
const elements = new Map(selectors.map((selector) => [selector, new FakeElement(selector.includes("Canvas") || selector === "#portrait" ? "canvas" : selector === "#gameDialog" ? "dialog" : "div")]));
elements.get("#gameCanvas").width = 576;
elements.get("#gameCanvas").height = 576;

const documentListeners = new Map();
globalThis.document = {
  activeElement: null,
  querySelector(selector) { return elements.get(selector); },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener(type, handler) { documentListeners.set(type, handler); },
};

const storage = new Map([["duendes-seen-help", "1"]]);
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};

function pathToTile(game, predicate) {
  const directions = [[0, -1, "ArrowUp"], [1, 0, "ArrowRight"], [0, 1, "ArrowDown"], [-1, 0, "ArrowLeft"]];
  const queue = [{ ...game.player, path: [] }];
  const seen = new Set([`${game.player.x},${game.player.y}`]);
  while (queue.length) {
    const current = queue.shift();
    if (predicate(game.map[current.y][current.x], current.x, current.y)) return current.path;
    for (const [dx, dy, key] of directions) {
      const x = current.x + dx; const y = current.y + dy;
      if (!game.map[y]?.[x] || game.map[y][x].terrain === "forest" || seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`); queue.push({ x, y, path: [...current.path, key] });
    }
  }
  throw new Error("No path to requested tile");
}

function seededSave(seed, overrides = {}) {
  const generated = generateMap(seed);
  return {
    ...generated, player: { ...generated.start }, health: 10, maxHealth: 10, day: 1, totalSteps: 0, stepsOnMap: 0, mapsVisited: 1, trapCount: 0, encounterCooldown: 5,
    levelIndex: 0, won: false, freePlay: false,
    inventory: {
      branch: 10, stone: 10, vine: 10, log: 10, tela: 0, resina: 0, brujula: 0,
      campfire: false, hammer: false, axe: false, spear: false, torch: false, piano: false,
      cuerda: false, remo: false, vela: false, balsa: false,
    },
    ...overrides,
  };
}

test("the real UI entry point executes the gathering, crafting, chopping, building, and level-advance loop", async () => {
  storage.set(SAVE_KEY, JSON.stringify(seededSave(12345)));
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  await import(`../src/main.js?smoke=${Date.now()}`);

  assert.ok(drawCalls > 200, "initial map and portrait should issue canvas draw calls");
  assert.equal(elements.get("#resources").children.length, 4);
  assert.equal(elements.get("#tools").children.length, 11, "10 recipes + the trap stockpile counter");
  assert.match(elements.get("#healthText").textContent, /^10\/10$/);
  assert.match(elements.get("#levelText").textContent, /^1 · /);

  const keydown = documentListeners.get("keydown");
  assert.equal(typeof keydown, "function");
  const beforeGathering = JSON.parse(storage.get(SAVE_KEY));
  for (const key of pathToTile(beforeGathering, (tile) => tile.feature === "branch")) keydown({ key, preventDefault() {} });
  keydown({ key: "e", preventDefault() {} });
  const gathered = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(gathered.inventory.branch, 11);
  assert.equal(gathered.map[gathered.player.y][gathered.player.x].feature, null);

  keydown({ key: "c", preventDefault() {} });
  assert.equal(elements.get("#gameDialog").open, true);
  assert.equal(elements.get("#dialogTitle").textContent, "Fabricar herramientas");
  assert.equal(elements.get("#dialogBody").children[0].children.length, 12, "2 section titles + 10 recipe cards");

  const hammerCard = elements.get("#dialogBody").children[0].children[2];
  const hammerButton = hammerCard.children[3];
  assert.equal(hammerButton.disabled, false);
  hammerButton.dispatch("click");
  const crafted = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(crafted.inventory.hammer, true);
  assert.equal(crafted.inventory.branch, 10);
  assert.equal(crafted.inventory.stone, 9);

  const refreshedCraftList = elements.get("#dialogBody").children[0];
  const axeButton = refreshedCraftList.children[3].children[3];
  assert.equal(axeButton.disabled, false);
  axeButton.dispatch("click");
  const axeCrafted = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(axeCrafted.inventory.axe, true);
  assert.equal(axeCrafted.inventory.branch, 9);
  assert.equal(axeCrafted.inventory.stone, 8);

  elements.get("#dialogClose").dispatch("click");
  assert.equal(elements.get("#gameDialog").open, false);

  const beforeChopping = JSON.parse(storage.get(SAVE_KEY));
  const adjacentForests = (game, x, y) => [[0,-1],[1,0],[0,1],[-1,0]].filter(([dx,dy]) => game.map[y + dy]?.[x + dx]?.terrain === "forest").length;
  const besideForest = (tile, x, y) => !tile.feature && !tile.structure && adjacentForests(beforeChopping, x, y) > 0;
  for (const key of pathToTile(beforeChopping, besideForest)) keydown({ key, preventDefault() {} });
  const positioned = JSON.parse(storage.get(SAVE_KEY));
  const trees = adjacentForests(positioned, positioned.player.x, positioned.player.y);
  for (let i = 0; i < trees * 3; i += 1) keydown({ key: "e", preventDefault() {} });
  const chopped = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(chopped.inventory.log, 10 + trees * 3, "each adjacent tree yields exactly 3 logs");
  assert.ok(chopped.map.flat().some((tile) => tile.chopped === 3));
  keydown({ key: "e", preventDefault() {} });
  const afterExhausted = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(afterExhausted.inventory.log, chopped.inventory.log, "exhausted trees yield no more logs");

  keydown({ key: "b", preventDefault() {} });
  assert.equal(elements.get("#dialogTitle").textContent, "Levantar una estructura");
  const chairButton = elements.get("#dialogBody").children[0].children[1].children[3];
  assert.equal(chairButton.disabled, false);
  chairButton.dispatch("click");
  const chairBuilt = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(chairBuilt.map[chairBuilt.player.y][chairBuilt.player.x].structure, "chair");
  assert.equal(chairBuilt.inventory.log, chopped.inventory.log - 5);

  keydown({ key: "e", preventDefault() {} });
  const restedOnce = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(restedOnce.map[restedOnce.player.y][restedOnce.player.x].structure, "chair", "the chair survives its first use");
  keydown({ key: "e", preventDefault() {} });
  const restedTwice = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(restedTwice.map[restedTwice.player.y][restedTwice.player.x].structure, null, "the chair breaks after two uses");

  keydown({ key: "b", preventDefault() {} });
  const trapButton = elements.get("#dialogBody").children[0].children[2].children[3];
  assert.equal(trapButton.disabled, false);
  trapButton.dispatch("click");
  const stockpiled = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(stockpiled.inventory.trap, 1, "built traps are stored in the backpack");
  assert.equal(stockpiled.inventory.log, chopped.inventory.log - 8);
  assert.equal(stockpiled.map[stockpiled.player.y][stockpiled.player.x].structure, null, "building a trap does not place it");
  assert.equal(stockpiled.trapCount, 0);

  keydown({ key: "t", preventDefault() {} });
  const built = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(built.map[built.player.y][built.player.x].structure, "trap", "T places a stockpiled trap on the current tile");
  assert.equal(built.inventory.trap, 0);
  assert.equal(built.trapCount, 1);

  for (const key of pathToTile(built, (tile) => tile.feature === "exit")) keydown({ key, preventDefault() {} });
  keydown({ key: "e", preventDefault() {} });
  assert.equal(elements.get("#gameDialog").open, true);
  elements.get("#dialogActions").children[0].dispatch("click");
  const advanced = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(advanced.levelIndex, 1);
  assert.equal(advanced.mapsVisited, 2);
  assert.equal(advanced.stepsOnMap, 0);
  assert.deepEqual(advanced.monsters, [], "with encounters suppressed no monster ever spawns");
  Math.random = originalRandom;
});

test("bumping into a roaming monster opens the fight dialog and a lost fight deals its damage", async () => {
  const save = seededSave(4242);
  const { x, y } = save.player;
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .find((p) => save.map[p.y]?.[p.x] && save.map[p.y][p.x].terrain !== "forest");
  assert.ok(spot, "the start tile should have a walkable neighbor");
  save.monsters = [{ type: "jabali", x: spot.x, y: spot.y, turns: 0, rest: 0 }];
  storage.set(SAVE_KEY, JSON.stringify(save));
  const originalRandom = Math.random;
  Math.random = () => 0.99; // suppresses random encounters and loses the fight (0.99 > unarmed win chance)
  await import(`../src/main.js?monster=${Date.now()}`);
  const keydown = documentListeners.get("keydown");
  const direction = spot.x > x ? "ArrowRight" : spot.x < x ? "ArrowLeft" : spot.y > y ? "ArrowDown" : "ArrowUp";
  keydown({ key: direction, preventDefault() {} });
  assert.equal(elements.get("#gameDialog").open, true, "bumping the beast opens the fight dialog");
  assert.equal(elements.get("#dialogTitle").textContent, "Jabalí furioso");
  elements.get("#dialogActions").children[0].dispatch("click");
  const after = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(after.health, 8, "losing to the jabalí costs its damage stat (2)");
  assert.equal(after.monsters.length, 1, "the beast survives a lost fight");
  assert.equal(after.monsters[0].rest, 2, "the beast rests after the fight instead of instantly re-catching");
  Math.random = originalRandom;
});

test("crafting La Balsa wins the game and free play keeps the jungle open", async () => {
  storage.set(SAVE_KEY, JSON.stringify(seededSave(777, {
    levelIndex: 4, day: 5, totalSteps: 300, mapsVisited: 5,
    inventory: {
      branch: 5, stone: 5, vine: 5, log: 8, tela: 0, resina: 2, brujula: 1,
      campfire: false, hammer: true, axe: true, spear: false, torch: false, piano: false,
      cuerda: true, remo: true, vela: true, balsa: false,
    },
  })));
  await import(`../src/main.js?victory=${Date.now()}`);
  const keydown = documentListeners.get("keydown");

  keydown({ key: "c", preventDefault() {} });
  const list = elements.get("#dialogBody").children[0];
  const balsaCard = list.children[list.children.length - 1];
  const balsaButton = balsaCard.children[3];
  assert.equal(balsaButton.disabled, false, "La Balsa should be craftable with the full kit");
  balsaButton.dispatch("click");

  const won = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(won.won, true);
  assert.equal(won.inventory.balsa, true);
  assert.equal(won.inventory.log, 0);
  assert.equal(elements.get("#dialogTitle").textContent, "El río te llevará a casa");

  elements.get("#dialogActions").children[1].dispatch("click");
  const freePlay = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(freePlay.freePlay, true);
  assert.equal(elements.get("#gameDialog").open, false);
  assert.equal(elements.get("#levelText").textContent, "Libre");
});

test("an old v1 save is discarded and a fresh expedition starts at level 1", async () => {
  storage.delete(SAVE_KEY);
  storage.set("duendes-save-v1", JSON.stringify({ map: [], player: { x: 0, y: 0 }, inventory: {} }));
  await import(`../src/main.js?migration=${Date.now()}`);
  assert.equal(storage.has("duendes-save-v1"), false, "stale v1 save is removed");
  const fresh = JSON.parse(storage.get(SAVE_KEY));
  assert.equal(fresh.levelIndex, 0);
  assert.equal(fresh.inventory.branch, 0);
  assert.equal(fresh.won, false);
});
