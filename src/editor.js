import {
  SIZE, RARE_MATERIALS, MATERIALS, MATERIAL_LABELS, generateMap, buildLevelMap, mapToPainted, validateLevel,
  reachableTiles, applyContent, getTerrains, getItems, getMonsters, validateContent,
} from "./engine.js";
import { TILE, drawMap } from "./render.js";
import { LEVELS } from "./levels.js";
import { CONTENT } from "./content.js";
import { createPixelEditor, blankSprite } from "./pixel-editor.js";

const DRAFT_KEY = "duendes-editor-draft-v2";
const LEGACY_DRAFT_KEY = "duendes-editor-draft-v1";

const canvas = document.querySelector("#editorCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  tabs: document.querySelector("#editorTabs"),
  tabNiveles: document.querySelector("#tab-niveles"),
  tabContenido: document.querySelector("#tab-contenido"),
  levelList: document.querySelector("#levelList"),
  canvasTitle: document.querySelector("#canvasTitle"),
  validation: document.querySelector("#validation"),
  seedInput: document.querySelector("#seedInput"),
  terrainBrushes: document.querySelector("#terrainBrushes"),
  featureBrushes: document.querySelector("#featureBrushes"),
  specialBrushes: document.querySelector("#specialBrushes"),
  form: document.querySelector("#levelForm"),
  lootChecks: document.querySelector("#lootChecks"),
  monsterChecks: document.querySelector("#monsterChecks"),
  contentListTitle: document.querySelector("#contentListTitle"),
  contentList: document.querySelector("#contentList"),
  contentHint: document.querySelector("#contentHint"),
  contentForm: document.querySelector("#contentForm"),
  contentValidation: document.querySelector("#contentValidation"),
  pixelEditor: document.querySelector("#pixelEditor"),
  exportArea: document.querySelector("#exportArea"),
};

const SPECIAL_TOOLS = [
  { id: "start", label: "Inicio" }, { id: "exit", label: "Salida" }, { id: "erase", label: "Borrar" },
];

const KINDS = {
  terrenos: {
    key: "terrains", title: "TERRENOS", transparent: false,
    hint: "Los terrenos integrados no se editan. Los nuevos aparecen como pinceles en NIVELES; marca si son transitables.",
  },
  objetos: {
    key: "items", title: "OBJETOS", transparent: true,
    hint: "Los objetos se colocan en los mapas y se recogen con E. Usa píxeles transparentes para el fondo.",
  },
  monstruos: {
    key: "monsters", title: "MONSTRUOS", transparent: true,
    hint: "Asigna monstruos a cada nivel en NIVELES → «Monstruos del nivel». Aparecen según la amenaza y te persiguen.",
  },
};

const CHAR_POOL = "abcdefhijklmnopqrtuvwxyz0123456789";

const DEFAULT_ENCOUNTERS = () => ({
  base: 0.02, perStep: 0.006, trapFactor: 0.03, cap: 0.38,
  weights: { enemy: 0.68, merchant: 0.19, treasure: 0.13 },
  spearWinChance: 0.85, unarmedWinChance: 0.38,
});

function blankLevel(id) {
  const terrain = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => (x >= 3 && x <= 8 && y >= 3 && y <= 8 ? "." : "F")).join(""));
  return {
    id,
    name: `Nivel nuevo ${id}`,
    map: { type: "painted", seed: id * 101, terrain, features: {}, start: { x: 5, y: 5 }, exit: { x: 8, y: 8 } },
    encounters: DEFAULT_ENCOUNTERS(),
    loot: [],
    logsPerTree: 3,
    monsterPool: [],
    intro: "",
  };
}

function normalizeContent(content) {
  return { terrains: content?.terrains ?? [], items: content?.items ?? [], monsters: content?.monsters ?? [] };
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (Array.isArray(saved?.levels) && saved.levels.length) {
      return {
        levels: saved.levels,
        content: normalizeContent(saved.content),
        selected: Math.min(saved.selected ?? 0, saved.levels.length - 1),
        tab: KINDS[saved.tab] || saved.tab === "niveles" ? saved.tab : "niveles",
        contentSelected: { terrains: 0, items: 0, monsters: 0, ...(saved.contentSelected ?? {}) },
      };
    }
  } catch { /* borrador nuevo */ }
  let legacyLevels = null;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DRAFT_KEY));
    if (Array.isArray(legacy?.levels) && legacy.levels.length) legacyLevels = legacy.levels;
  } catch { /* sin borrador v1 */ }
  return {
    levels: legacyLevels ?? structuredClone(LEVELS),
    content: structuredClone(CONTENT),
    selected: 0,
    tab: "niveles",
    contentSelected: { terrains: 0, items: 0, monsters: 0 },
  };
}

const draft = loadDraft();
applyContent(draft.content);

let tool = { kind: "terrain", value: "." };
let painting = false;
let pixel = null;

function persist() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      levels: draft.levels, content: draft.content, selected: draft.selected,
      tab: draft.tab, contentSelected: draft.contentSelected,
    }));
  } catch { /* navegación privada */ }
}

function syncContent() { applyContent(draft.content); persist(); }

function ensurePainted(level) {
  if (level.map.type === "painted") return level;
  const { map, start, exit, seed } = buildLevelMap(level);
  level.map = mapToPainted(map, start, exit, seed);
  return level;
}

function selectedLevel() { return ensurePainted(draft.levels[draft.selected]); }

function renumber() { draft.levels.forEach((level, index) => { level.id = index + 1; }); }

// --- pestañas ------------------------------------------------------------------

function currentKind() { return KINDS[draft.tab] ?? null; }

function setTab(tab) {
  draft.tab = tab;
  persist();
  for (const button of ui.tabs.querySelectorAll("[data-tab]")) button.classList.toggle("selected", button.dataset.tab === tab);
  ui.tabNiveles.classList.toggle("hidden", tab !== "niveles");
  ui.tabContenido.classList.toggle("hidden", tab === "niveles");
  if (tab === "niveles") renderAll(); else renderContentTab();
}

ui.tabs.addEventListener("click", (event) => {
  const tab = event.target?.dataset?.tab;
  if (tab) setTab(tab);
});

// --- pestaña NIVELES -------------------------------------------------------------

function drawMarker(x, y, color) {
  ctx.lineWidth = 3; ctx.strokeStyle = color;
  ctx.strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
}

function redraw() {
  const level = selectedLevel();
  const { map, start, exit } = buildLevelMap(level);
  drawMap(ctx, map, { seed: level.map.seed, logsPerTree: level.logsPerTree ?? 3 });

  const reachable = reachableTiles(map, start);
  ctx.globalAlpha = 0.35;
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    if (map[y][x].terrain !== "forest" && !reachable.has(`${x},${y}`)) {
      ctx.fillStyle = "#c23b2e"; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  ctx.globalAlpha = 1;
  drawMarker(start.x, start.y, "#7ce87c");
  drawMarker(exit.x, exit.y, "#f0d276");
  ctx.fillStyle = "#7ce87c"; ctx.font = "10px monospace";
  ctx.fillText("INICIO", start.x * TILE + 5, start.y * TILE + 14);
  ui.canvasTitle.textContent = `MAPA — NIVEL ${draft.selected + 1}`;
  renderValidation(level);
}

function renderValidation(level) {
  ui.validation.replaceChildren();
  const issues = validateLevel(level);
  if (!issues.length) {
    const ok = document.createElement("p"); ok.className = "ok"; ok.textContent = "✔ Nivel válido: inicio, salida y objetos alcanzables.";
    ui.validation.append(ok);
  } else {
    for (const issue of issues) { const p = document.createElement("p"); p.className = "issue"; p.textContent = `⚠ ${issue}`; ui.validation.append(p); }
  }
  const broken = draft.levels.map((entry, index) => ({ index, issues: validateLevel(entry) })).filter((entry) => entry.issues.length);
  const summary = document.createElement("p");
  summary.className = broken.length ? "issue" : "ok";
  summary.textContent = broken.length ? `⚠ Niveles con problemas: ${broken.map((entry) => entry.index + 1).join(", ")}` : `✔ Los ${draft.levels.length} niveles del borrador son válidos.`;
  ui.validation.append(summary);
}

function renderLevelList() {
  ui.levelList.replaceChildren();
  draft.levels.forEach((level, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = `wood-button${index === draft.selected ? " selected" : ""}`;
    button.textContent = `${index + 1}. ${level.name}${level.loot?.length ? ` (${level.loot.join(", ")})` : ""}`;
    button.addEventListener("click", () => { draft.selected = index; persist(); renderAll(); });
    ui.levelList.append(button);
  });
}

function renderBrushes() {
  const terrainTools = getTerrains().map((terrain) => ({ id: terrain.char, label: terrain.name }));
  const featureTools = [
    ...getItems().map((item) => ({ id: item.id, label: item.name })),
    { id: "dungeon", label: "Calabozo" },
  ];
  const groups = [
    [ui.terrainBrushes, terrainTools, "terrain"],
    [ui.featureBrushes, featureTools, "feature"],
    [ui.specialBrushes, SPECIAL_TOOLS, "special"],
  ];
  for (const [container, tools, kind] of groups) {
    container.replaceChildren();
    for (const entry of tools) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `wood-button${tool.kind === kind && tool.value === entry.id ? " selected" : ""}`;
      button.textContent = entry.label;
      button.addEventListener("click", () => { tool = { kind, value: entry.id }; renderBrushes(); });
      container.append(button);
    }
  }
}

function getField(level, path) {
  return path.split(".").reduce((node, part) => node?.[part], level);
}

function setField(level, path, value) {
  const parts = path.split(".");
  let node = level;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts.at(-1)] = value;
}

function renderForm() {
  const level = selectedLevel();
  level.encounters ??= DEFAULT_ENCOUNTERS();
  for (const input of ui.form.querySelectorAll("[data-field]")) {
    const value = getField(level, input.dataset.field);
    input.value = value ?? "";
  }
  ui.seedInput.value = level.map.seed ?? 1;
  ui.lootChecks.replaceChildren();
  for (const rare of RARE_MATERIALS) {
    const label = document.createElement("label"); label.className = "inline";
    const check = document.createElement("input"); check.type = "checkbox";
    check.checked = level.loot?.includes(rare) ?? false;
    check.addEventListener("change", () => {
      level.loot = RARE_MATERIALS.filter((item) => (item === rare ? check.checked : level.loot?.includes(item)));
      persist(); renderLevelList(); redraw();
    });
    label.append(check, ` ${MATERIAL_LABELS[rare]} (${rare})`);
    ui.lootChecks.append(label);
  }
  renderMonsterChecks(level);
}

function renderMonsterChecks(level) {
  ui.monsterChecks.replaceChildren();
  const monsters = getMonsters();
  if (!monsters.length) {
    const p = document.createElement("p"); p.className = "hint-copy";
    p.textContent = "No hay monstruos definidos. Crea uno en la pestaña MONSTRUOS.";
    ui.monsterChecks.append(p);
    return;
  }
  level.monsterPool ??= [];
  const full = level.monsterPool.length >= 2;
  for (const monster of monsters) {
    const label = document.createElement("label"); label.className = "inline";
    const check = document.createElement("input"); check.type = "checkbox";
    check.checked = level.monsterPool.includes(monster.id);
    check.disabled = full && !check.checked;
    check.addEventListener("change", () => {
      level.monsterPool = monsters.map((m) => m.id).filter((id) => (id === monster.id ? check.checked : level.monsterPool.includes(id)));
      persist(); redraw(); renderMonsterChecks(level);
    });
    label.append(check, ` ${monster.name} (${monster.id})`);
    ui.monsterChecks.append(label);
  }
}

function renderAll() { renderLevelList(); renderBrushes(); renderForm(); redraw(); }

// --- pintado del mapa -------------------------------------------------------------

function tileFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width) / TILE);
  const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height) / TILE);
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  return { x, y };
}

function paint(position) {
  if (!position) return;
  const level = selectedLevel();
  const def = level.map;
  const key = `${position.x},${position.y}`;
  const terrainDef = getTerrains().find((terrain) => terrain.char === def.terrain[position.y][position.x]);
  if (tool.kind === "terrain") {
    const row = def.terrain[position.y];
    def.terrain[position.y] = row.slice(0, position.x) + tool.value + row.slice(position.x + 1);
    const painted = getTerrains().find((terrain) => terrain.char === tool.value);
    if (painted && !painted.walkable) delete def.features[key];
  } else if (tool.kind === "feature") {
    if (terrainDef && !terrainDef.walkable) return;
    if (def.features[key] === tool.value) delete def.features[key]; else def.features[key] = tool.value;
  } else if (tool.value === "start") {
    def.start = { ...position };
  } else if (tool.value === "exit") {
    def.exit = { ...position };
  } else if (tool.value === "erase") {
    delete def.features[key];
  }
  persist(); redraw();
}

canvas.addEventListener("mousedown", (event) => { painting = true; paint(tileFromEvent(event)); });
canvas.addEventListener("mousemove", (event) => { if (painting && tool.kind === "terrain") paint(tileFromEvent(event)); });
window.addEventListener("mouseup", () => { painting = false; });
canvas.addEventListener("mouseleave", () => { painting = false; });

// --- acciones de la lista de niveles ------------------------------------------------

document.querySelector("#addLevel").addEventListener("click", () => {
  draft.levels.splice(draft.selected + 1, 0, blankLevel(draft.levels.length + 1));
  draft.selected += 1; renumber(); persist(); renderAll();
});

document.querySelector("#removeLevel").addEventListener("click", () => {
  if (draft.levels.length <= 1) { window.alert("Debe quedar al menos un nivel."); return; }
  if (!window.confirm(`¿Quitar el nivel ${draft.selected + 1} — ${draft.levels[draft.selected].name}?`)) return;
  draft.levels.splice(draft.selected, 1);
  draft.selected = Math.min(draft.selected, draft.levels.length - 1);
  renumber(); persist(); renderAll();
});

function moveLevel(offset) {
  const target = draft.selected + offset;
  if (target < 0 || target >= draft.levels.length) return;
  const [level] = draft.levels.splice(draft.selected, 1);
  draft.levels.splice(target, 0, level);
  draft.selected = target; renumber(); persist(); renderAll();
}
document.querySelector("#moveUp").addEventListener("click", () => moveLevel(-1));
document.querySelector("#moveDown").addEventListener("click", () => moveLevel(1));

// --- generación aleatoria -----------------------------------------------------------

document.querySelector("#generateRandom").addEventListener("click", () => {
  const seed = Number(ui.seedInput.value) || 1;
  const level = selectedLevel();
  const { map, start, exit } = generateMap(seed);
  level.map = mapToPainted(map, start, exit, seed);
  persist(); renderAll();
});

ui.seedInput.addEventListener("change", () => {
  const level = selectedLevel();
  level.map.seed = Number(ui.seedInput.value) || 1;
  persist(); redraw();
});

// --- formulario de ajustes del nivel -------------------------------------------------

ui.form.addEventListener("input", (event) => {
  const field = event.target?.dataset?.field;
  if (!field) return;
  const level = selectedLevel();
  const value = event.target.type === "number" ? Number(event.target.value) : event.target.value;
  if (event.target.type === "number" && !Number.isFinite(value)) return;
  setField(level, field, value);
  persist(); renderLevelList(); redraw();
});
ui.form.addEventListener("submit", (event) => event.preventDefault());

// --- pestañas de contenido (terrenos / objetos / monstruos) ---------------------------

function contentDefs(kind) {
  if (kind.key === "terrains") return [...getTerrains().filter((t) => t.builtin), ...draft.content.terrains];
  if (kind.key === "items") return [...getItems().filter((i) => i.builtin), ...draft.content.items];
  return [...draft.content.monsters];
}

function selectedContentDef(kind) {
  const defs = contentDefs(kind);
  const index = Math.min(draft.contentSelected[kind.key] ?? 0, Math.max(0, defs.length - 1));
  draft.contentSelected[kind.key] = index;
  return defs[index] ?? null;
}

function uniqueContentId(base) {
  const taken = new Set([
    ...getTerrains().map((t) => t.id), ...getItems().map((i) => i.id), ...getMonsters().map((m) => m.id),
    ...MATERIALS, ...RARE_MATERIALS, "exit", "dungeon", "log",
  ]);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

function nextTerrainChar() {
  const used = new Set(getTerrains().map((terrain) => terrain.char));
  return [...CHAR_POOL].find((char) => !used.has(char)) ?? "?";
}

function newContentDef(kind) {
  const count = draft.content[kind.key].length + 1;
  if (kind.key === "terrains") {
    return { id: uniqueContentId("terreno"), char: nextTerrainChar(), name: `Terreno ${count}`, walkable: true, sprite: blankSprite({ transparent: false }) };
  }
  if (kind.key === "items") {
    return { id: uniqueContentId("objeto"), name: `Objeto ${count}`, sprite: blankSprite() };
  }
  return {
    id: uniqueContentId("monstruo"), name: `Monstruo ${count}`, damage: 2, restEvery: 3, loot: "branch",
    spearWinChance: 0.85, unarmedWinChance: 0.38, sprite: blankSprite(),
  };
}

function renderContentList(kind) {
  ui.contentListTitle.textContent = kind.title;
  ui.contentHint.textContent = kind.hint;
  ui.contentList.replaceChildren();
  const defs = contentDefs(kind);
  defs.forEach((def, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wood-button${index === draft.contentSelected[kind.key] ? " selected" : ""}${def.builtin ? " builtin" : ""}`;
    button.textContent = `${def.name}${def.builtin ? " 🔒" : ""}${kind.key === "terrains" ? ` [${def.char}]` : ""}`;
    button.addEventListener("click", () => { draft.contentSelected[kind.key] = index; persist(); renderContentTab(); });
    ui.contentList.append(button);
  });
  if (!defs.length) {
    const p = document.createElement("p"); p.className = "hint-copy"; p.textContent = "Nada por aquí todavía. Pulsa «+ Añadir».";
    ui.contentList.append(p);
  }
}

function contentField(label, input) {
  const wrap = document.createElement("label");
  wrap.append(label, input);
  return wrap;
}

function renderContentForm(kind, def) {
  ui.contentForm.replaceChildren();
  if (!def) return;
  const readOnly = Boolean(def.builtin);

  const idInput = document.createElement("input");
  idInput.type = "text"; idInput.value = def.id; idInput.disabled = readOnly;
  idInput.addEventListener("change", () => {
    const value = idInput.value.trim();
    if (!value) { idInput.value = def.id; return; }
    def.id = value;
    syncContent(); renderContentTab();
  });
  ui.contentForm.append(contentField("Id (interno, sin espacios)", idInput));

  const nameInput = document.createElement("input");
  nameInput.type = "text"; nameInput.value = def.name ?? ""; nameInput.disabled = readOnly;
  nameInput.addEventListener("input", () => { def.name = nameInput.value; syncContent(); renderContentList(kind); renderContentValidation(); });
  ui.contentForm.append(contentField("Nombre", nameInput));

  if (kind.key === "terrains") {
    const charInput = document.createElement("input");
    charInput.type = "text"; charInput.maxLength = 1; charInput.value = def.char ?? ""; charInput.disabled = readOnly;
    charInput.addEventListener("change", () => {
      const value = charInput.value.trim();
      if (value.length !== 1) { charInput.value = def.char; return; }
      def.char = value;
      syncContent(); renderContentTab();
    });
    ui.contentForm.append(contentField("Carácter de mapa (1 letra)", charInput));

    const walkLabel = document.createElement("label"); walkLabel.className = "inline";
    const walkCheck = document.createElement("input"); walkCheck.type = "checkbox";
    walkCheck.checked = def.walkable ?? true; walkCheck.disabled = readOnly;
    walkCheck.addEventListener("change", () => { def.walkable = walkCheck.checked; syncContent(); renderContentValidation(); });
    walkLabel.append(walkCheck, " Transitable (se puede caminar encima)");
    ui.contentForm.append(walkLabel);
  }

  if (kind.key === "monsters") {
    const numbers = [
      ["Daño al perder la pelea", "damage", { min: 1, max: 9, step: 1 }],
      ["Descansa cada N pasos (0 = nunca)", "restEvery", { min: 0, max: 9, step: 1 }],
      ["Victoria con lanza (0–1)", "spearWinChance", { min: 0, max: 1, step: 0.01 }],
      ["Victoria sin lanza (0–1)", "unarmedWinChance", { min: 0, max: 1, step: 0.01 }],
    ];
    for (const [label, field, attrs] of numbers) {
      const input = document.createElement("input");
      input.type = "number"; input.min = attrs.min; input.max = attrs.max; input.step = attrs.step;
      input.value = def[field] ?? "";
      input.addEventListener("input", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        def[field] = value;
        syncContent(); renderContentValidation();
      });
      ui.contentForm.append(contentField(label, input));
    }
    const lootSelect = document.createElement("select");
    for (const option of [...MATERIALS, ...getItems().filter((item) => !item.builtin).map((item) => item.id)]) {
      const element = document.createElement("option");
      element.value = option; element.textContent = option;
      lootSelect.append(element);
    }
    lootSelect.value = def.loot ?? "branch";
    lootSelect.addEventListener("change", () => { def.loot = lootSelect.value; syncContent(); });
    ui.contentForm.append(contentField("Botín al vencerlo", lootSelect));
  }

  if (readOnly) {
    const note = document.createElement("p");
    note.className = "hint-copy";
    note.textContent = "Este elemento es parte del juego base y no se puede editar; su dibujo es procedural.";
    ui.contentForm.append(note);
  }
}

function renderContentValidation() {
  ui.contentValidation.replaceChildren();
  const issues = validateContent(draft.content);
  if (!issues.length) {
    const ok = document.createElement("p"); ok.className = "ok"; ok.textContent = "✔ Contenido válido.";
    ui.contentValidation.append(ok);
    return;
  }
  for (const issue of issues) {
    const p = document.createElement("p"); p.className = "issue"; p.textContent = `⚠ ${issue}`;
    ui.contentValidation.append(p);
  }
}

function renderContentTab() {
  const kind = currentKind();
  if (!kind) return;
  renderContentList(kind);
  const def = selectedContentDef(kind);
  pixel = createPixelEditor(ui.pixelEditor, {
    allowTransparent: kind.transparent,
    onChange: () => { syncContent(); renderContentValidation(); },
  });
  if (def && !def.builtin) {
    def.sprite ??= blankSprite({ transparent: kind.transparent });
    pixel.setSprite(def.sprite);
    pixel.setEnabled(true);
  } else {
    pixel.setEnabled(false);
  }
  renderContentForm(kind, def);
  renderContentValidation();
}

document.querySelector("#addContent").addEventListener("click", () => {
  const kind = currentKind();
  if (!kind) return;
  draft.content[kind.key].push(newContentDef(kind));
  draft.contentSelected[kind.key] = contentDefs(kind).length - 1;
  syncContent(); renderContentTab();
});

document.querySelector("#removeContent").addEventListener("click", () => {
  const kind = currentKind();
  if (!kind) return;
  const def = selectedContentDef(kind);
  if (!def || def.builtin) { window.alert("Los elementos integrados no se pueden quitar."); return; }
  if (!window.confirm(`¿Quitar «${def.name}» (${def.id})? Los niveles que lo usen quedarán con avisos de validación.`)) return;
  const list = draft.content[kind.key];
  const index = list.indexOf(def);
  if (index >= 0) list.splice(index, 1);
  draft.contentSelected[kind.key] = Math.max(0, (draft.contentSelected[kind.key] ?? 0) - 1);
  syncContent(); renderContentTab();
});

// --- exportar / importar --------------------------------------------------------------

function exportLevelsFile() {
  renumber();
  return `// Niveles del juego. Generado con editor.html — pega este archivo completo en src/levels.js\nexport const LEVELS = ${JSON.stringify(draft.levels, null, 2)};\n`;
}

function exportContentFile() {
  return `// Contenido personalizado (terrenos, objetos y monstruos). Generado con editor.html — pega este archivo completo en src/content.js\nexport const CONTENT = ${JSON.stringify(normalizeContent(draft.content), null, 2)};\n`;
}

function levelsUseCustomContent() {
  const customChars = new Set(draft.content.terrains.map((terrain) => terrain.char));
  const customItems = new Set(draft.content.items.map((item) => item.id));
  return draft.levels.some((level) => {
    if ((level.monsterPool ?? []).length) return true;
    if (level.map?.type !== "painted") return false;
    if (level.map.terrain.some((row) => [...row].some((char) => customChars.has(char)))) return true;
    return Object.values(level.map.features ?? {}).some((feature) => customItems.has(feature));
  });
}

document.querySelector("#exportLevelsButton").addEventListener("click", () => {
  ui.exportArea.value = exportLevelsFile();
  const broken = draft.levels.filter((level) => validateLevel(level).length);
  if (broken.length) window.alert(`Aviso: hay ${broken.length} nivel(es) con problemas de validación. Revisa el panel antes de publicar.`);
  else if (levelsUseCustomContent()) window.alert("Los niveles usan contenido personalizado: recuerda exportar y pegar también src/content.js.");
});

document.querySelector("#exportContentButton").addEventListener("click", () => {
  ui.exportArea.value = exportContentFile();
  const issues = validateContent(draft.content);
  if (issues.length) window.alert(`Aviso: el contenido tiene ${issues.length} problema(s) de validación. Revisa la pestaña correspondiente.`);
});

document.querySelector("#copyButton").addEventListener("click", async () => {
  const content = ui.exportArea.value || exportLevelsFile();
  ui.exportArea.value = content;
  try { await navigator.clipboard.writeText(content); window.alert("Copiado al portapapeles."); }
  catch { window.alert("No se pudo copiar automáticamente. Selecciona el texto y copia a mano."); }
});

document.querySelector("#importButton").addEventListener("click", () => {
  const raw = ui.exportArea.value.trim();
  if (!raw) { window.alert("Pega primero el contenido de un levels.js, un content.js o su JSON."); return; }
  try {
    const isContent = /export const CONTENT\s*=/.test(raw);
    const jsonText = raw.replace(/^[\s\S]*?export const (LEVELS|CONTENT)\s*=\s*/, "").replace(/;\s*$/, "");
    const parsed = JSON.parse(jsonText);
    if (isContent || (!Array.isArray(parsed) && (parsed?.terrains || parsed?.items || parsed?.monsters))) {
      draft.content = normalizeContent(parsed);
      draft.contentSelected = { terrains: 0, items: 0, monsters: 0 };
      syncContent();
      if (draft.tab === "niveles") renderAll(); else renderContentTab();
      window.alert(`Contenido importado: ${draft.content.terrains.length} terreno(s), ${draft.content.items.length} objeto(s), ${draft.content.monsters.length} monstruo(s).`);
      return;
    }
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("no es una lista de niveles ni un contenido válido");
    draft.levels = parsed; draft.selected = 0;
    renumber(); persist();
    if (draft.tab === "niveles") renderAll();
    window.alert(`Importados ${parsed.length} niveles.`);
  } catch (error) {
    window.alert(`No se pudo importar: ${error.message}`);
  }
});

setTab(draft.tab);
