import { SIZE, LOGS_PER_TREE, terrainById, itemById, monsterById } from "./engine.js";

export const TILE = 48;

export function pixelRect(target, color, x, y, w, h) { target.fillStyle = color; target.fillRect(x, y, w, h); }

export function drawSprite(target, sprite, x, y, scale = 1) {
  if (!sprite?.pixels) return;
  const palette = sprite.palette ?? [];
  for (let row = 0; row < sprite.pixels.length; row += 1) {
    const line = sprite.pixels[row];
    for (let col = 0; col < line.length; col += 1) {
      const char = line[col];
      if (char === ".") continue;
      const color = palette[parseInt(char, 16)];
      if (color) pixelRect(target, color, x + col * scale, y + row * scale, scale, scale);
    }
  }
}

function hash(seed, x, y, salt = 0) {
  let n = (x * 374761393 + y * 668265263 + seed + salt * 69069) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function drawGround(ctx, x, y, tile, seed) {
  const px = x * TILE; const py = y * TILE;
  const palettes = {
    dirt: ["#806b3f", "#6e5b35", "#9a7d47"],
    garden: ["#53733c", "#466535", "#71884a"],
    stonePath: ["#73705a", "#5e604e", "#8c8569"],
  };
  if (!palettes[tile.terrain]) {
    const def = terrainById(tile.terrain);
    if (def?.sprite) {
      pixelRect(ctx, def.sprite.palette?.[0] ?? "#806b3f", px, py, TILE, TILE);
      drawSprite(ctx, def.sprite, px, py, TILE / (def.sprite.size ?? 16));
      return;
    }
  }
  const colors = palettes[tile.terrain] ?? palettes.dirt;
  pixelRect(ctx, colors[0], px, py, TILE, TILE);
  for (let i = 0; i < 7; i += 1) {
    const dx = 3 + Math.floor(hash(seed, x, y, i) * 38);
    const dy = 3 + Math.floor(hash(seed, y, x, i + 8) * 38);
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

export function drawForest(ctx, x, y, tile, logsPerTree = LOGS_PER_TREE) {
  const px = x * TILE; const py = y * TILE;
  pixelRect(ctx, "#193c29", px, py, TILE, TILE);
  pixelRect(ctx, "#173423", px + 2, py + 2, 44, 44);
  if (tile.chopped >= logsPerTree) {
    pixelRect(ctx, "#26301f", px + 4, py + 4, 40, 40);
    pixelRect(ctx, "#4c3523", px + 15, py + 22, 18, 14);
    pixelRect(ctx, "#b18a4e", px + 17, py + 18, 14, 10);
    pixelRect(ctx, "#8a6437", px + 20, py + 20, 8, 6);
    pixelRect(ctx, "#b18a4e", px + 22, py + 22, 4, 2);
    pixelRect(ctx, "#7a5b34", px + 8, py + 36, 6, 3);
    pixelRect(ctx, "#7a5b34", px + 33, py + 12, 5, 3);
    pixelRect(ctx, "#513724", px + 12, py + 10, 4, 3);
    return;
  }
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

export function drawIcon(target, type, x, y, scale = 1) {
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
  if (type === "tela") { r("#d8cba4", 4, 6, 17, 13); r("#c2b28a", 4, 10, 17, 2); r("#c2b28a", 4, 15, 17, 2); r("#efe6c6", 6, 7, 6, 3); r("#8f815f", 4, 18, 17, 2); }
  if (type === "resina") { r("#8a5a1c", 8, 5, 9, 4); r("#d9932c", 6, 8, 13, 11); r("#f2b64a", 9, 10, 6, 6); r("#ffe08a", 10, 11, 3, 3); }
  if (type === "brujula") { r("#5e615c", 5, 5, 15, 15); r("#8c8f88", 7, 7, 11, 11); r("#d8d3bb", 8, 8, 9, 9); r("#b33d2e", 12, 9, 2, 5); r("#3a4a68", 12, 13, 2, 4); r("#42463f", 11, 3, 3, 3); }
  if (type === "cuerda") { r("#9c7a42", 6, 5, 13, 4); r("#b59150", 6, 10, 13, 4); r("#9c7a42", 6, 15, 13, 4); r("#7a5c30", 9, 4, 2, 16); r("#7a5c30", 14, 4, 2, 16); }
  if (type === "remo") { r("#8e5a31", 11, 3, 3, 14); r("#a86f3c", 9, 15, 7, 8); r("#c18a4a", 10, 16, 3, 6); }
  if (type === "vela") { r("#76502f", 12, 3, 2, 20); r("#e8ddba", 4, 5, 8, 12); r("#d1c49a", 4, 10, 8, 2); r("#efe6c6", 14, 6, 7, 9); }
  if (type === "balsa") { r("#6b4729", 3, 14, 20, 3); r("#8b5730", 3, 17, 20, 3); r("#a86f3c", 3, 20, 20, 3); r("#76502f", 12, 4, 2, 11); r("#e8ddba", 14, 5, 8, 8); r("#c8b184", 5, 12, 15, 2); }
  const custom = itemById(type) ?? monsterById(type);
  if (custom?.sprite && !custom.builtin) {
    const size = custom.sprite.size ?? 16;
    drawSprite(target, custom.sprite, x + 1 * scale, y + 1 * scale, (22 / size) * scale);
  }
}

export function drawFeature(ctx, x, y, type) {
  const scale = 1.35; const iconSize = 24 * scale;
  drawIcon(ctx, type, x * TILE + (TILE - iconSize) / 2, y * TILE + (TILE - iconSize) / 2, scale);
  if (["branch", "stone", "vine"].includes(type)) {
    ctx.fillStyle = "rgba(242, 218, 137, .8)";
    ctx.fillRect(x * TILE + 21, y * TILE + 40, 6, 2);
  }
}

export function drawMap(ctx, map, { seed = 1, logsPerTree = LOGS_PER_TREE } = {}) {
  ctx.clearRect(0, 0, SIZE * TILE, SIZE * TILE);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const tile = map[y][x];
    if (tile.terrain === "forest") drawForest(ctx, x, y, tile, logsPerTree); else drawGround(ctx, x, y, tile, seed);
  }
  ctx.globalAlpha = .16; ctx.strokeStyle = "#142319"; ctx.lineWidth = 1;
  for (let i = 0; i <= SIZE; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, SIZE * TILE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * TILE); ctx.lineTo(SIZE * TILE, i * TILE); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const tile = map[y][x];
    if (tile.feature) drawFeature(ctx, x, y, tile.feature);
    if (tile.structure) drawFeature(ctx, x, y, tile.structure);
  }
}
