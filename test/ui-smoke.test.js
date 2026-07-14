import test from "node:test";
import assert from "node:assert/strict";
import { generateMap } from "../src/engine.js";

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
  "#gameCanvas", "#portrait", "#healthBar", "#healthText", "#dayText", "#stepsText", "#dangerText", "#dangerBar",
  "#resources", "#tools", "#toast", "#gameDialog", "#dialogKicker", "#dialogTitle", "#dialogBody", "#dialogActions",
  "#interactButton", "#craftButton", "#buildButton", "#helpButton", "#dialogClose", "#restartButton", "#soundButton",
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

test("the real UI entry point executes the gathering, crafting, chopping, building, and exit loop", async () => {
  const generated = generateMap(12345);
  storage.set("duendes-save-v1", JSON.stringify({
    ...generated, player: { ...generated.start }, health: 10, maxHealth: 10, day: 1, totalSteps: 0, stepsOnMap: 0, mapsVisited: 1, trapCount: 0, encounterCooldown: 5,
    inventory: { branch: 10, stone: 10, vine: 10, log: 10, campfire: false, hammer: false, axe: false, spear: false, torch: false, piano: false },
  }));
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  await import(`../src/main.js?smoke=${Date.now()}`);

  assert.ok(drawCalls > 200, "initial map and portrait should issue canvas draw calls");
  assert.equal(elements.get("#resources").children.length, 4);
  assert.equal(elements.get("#tools").children.length, 6);
  assert.match(elements.get("#healthText").textContent, /^10\/10$/);

  const keydown = documentListeners.get("keydown");
  assert.equal(typeof keydown, "function");
  const beforeGathering = JSON.parse(storage.get("duendes-save-v1"));
  for (const key of pathToTile(beforeGathering, (tile) => tile.feature === "branch")) keydown({ key, preventDefault() {} });
  keydown({ key: "e", preventDefault() {} });
  const gathered = JSON.parse(storage.get("duendes-save-v1"));
  assert.equal(gathered.inventory.branch, 11);
  assert.equal(gathered.map[gathered.player.y][gathered.player.x].feature, null);

  keydown({ key: "c", preventDefault() {} });
  assert.equal(elements.get("#gameDialog").open, true);
  assert.equal(elements.get("#dialogTitle").textContent, "Fabricar herramientas");
  assert.equal(elements.get("#dialogBody").children[0].children.length, 6);

  const hammerCard = elements.get("#dialogBody").children[0].children[1];
  const hammerButton = hammerCard.children[3];
  assert.equal(hammerButton.disabled, false);
  hammerButton.dispatch("click");
  const crafted = JSON.parse(storage.get("duendes-save-v1"));
  assert.equal(crafted.inventory.hammer, true);
  assert.equal(crafted.inventory.branch, 10);
  assert.equal(crafted.inventory.stone, 9);

  const refreshedCraftList = elements.get("#dialogBody").children[0];
  const axeButton = refreshedCraftList.children[2].children[3];
  assert.equal(axeButton.disabled, false);
  axeButton.dispatch("click");
  const axeCrafted = JSON.parse(storage.get("duendes-save-v1"));
  assert.equal(axeCrafted.inventory.axe, true);
  assert.equal(axeCrafted.inventory.branch, 9);
  assert.equal(axeCrafted.inventory.stone, 8);

  elements.get("#dialogClose").dispatch("click");
  assert.equal(elements.get("#gameDialog").open, false);

  const beforeChopping = JSON.parse(storage.get("duendes-save-v1"));
  const besideForest = (tile, x, y) => !tile.feature && !tile.structure && [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy]) => beforeChopping.map[y + dy]?.[x + dx]?.terrain === "forest");
  for (const key of pathToTile(beforeChopping, besideForest)) keydown({ key, preventDefault() {} });
  keydown({ key: "e", preventDefault() {} });
  const chopped = JSON.parse(storage.get("duendes-save-v1"));
  assert.equal(chopped.inventory.log, 11);
  assert.ok(chopped.map.flat().some((tile) => tile.chopped > 0));

  keydown({ key: "b", preventDefault() {} });
  assert.equal(elements.get("#dialogTitle").textContent, "Levantar una estructura");
  const trapButton = elements.get("#dialogBody").children[0].children[2].children[3];
  assert.equal(trapButton.disabled, false);
  trapButton.dispatch("click");
  const built = JSON.parse(storage.get("duendes-save-v1"));
  assert.equal(built.map[built.player.y][built.player.x].structure, "trap");
  assert.equal(built.inventory.log, 8);
  assert.equal(built.trapCount, 1);

  const exitFeature = built.map.flat().some((tile) => tile.feature === "exit") ? "exit" : "dungeon";
  for (const key of pathToTile(built, (tile) => tile.feature === exitFeature)) keydown({ key, preventDefault() {} });
  keydown({ key: "e", preventDefault() {} });
  assert.equal(elements.get("#gameDialog").open, true);
  elements.get("#dialogActions").children[0].dispatch("click");
  const advanced = JSON.parse(storage.get("duendes-save-v1"));
  assert.equal(advanced.mapsVisited, 2);
  assert.equal(advanced.stepsOnMap, 0);
  Math.random = originalRandom;
});
