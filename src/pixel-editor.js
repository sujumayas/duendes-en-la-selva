// Editor de píxeles compartido (terrenos, objetos y monstruos).
// Trabaja sobre el formato de sprite del juego: { size, palette: ["#hex"], pixels: ["0.1a…"] }
// donde "." es un píxel transparente y cada carácter hexadecimal indexa la paleta.

export const SPRITE_SIZE = 16;
const CELL = 22;
const MAX_COLORS = 16;
const INDEX_CHARS = "0123456789abcdef";

export function blankSprite({ transparent = true, color = "#806b3f" } = {}) {
  return {
    size: SPRITE_SIZE,
    palette: [color],
    pixels: Array.from({ length: SPRITE_SIZE }, () => (transparent ? "." : "0").repeat(SPRITE_SIZE)),
  };
}

export function createPixelEditor(container, { allowTransparent = true, onChange = () => {} } = {}) {
  let sprite = blankSprite({ transparent: allowTransparent });
  let selected = "0";
  let enabled = true;
  let painting = false;

  container.replaceChildren();
  container.classList.add("pixel-editor");

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE * CELL; canvas.height = SPRITE_SIZE * CELL;
  canvas.className = "pixel-canvas";
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const paletteRow = document.createElement("div");
  paletteRow.className = "pixel-palette";

  const controls = document.createElement("div");
  controls.className = "pixel-controls";
  const colorInput = document.createElement("input");
  colorInput.type = "color"; colorInput.value = "#806b3f"; colorInput.title = "Color del pincel seleccionado";
  const addButton = document.createElement("button");
  addButton.type = "button"; addButton.className = "wood-button"; addButton.textContent = "+ COLOR";
  const previewLabel = document.createElement("span");
  previewLabel.className = "pixel-preview-label"; previewLabel.textContent = "Vista";
  const preview = document.createElement("canvas");
  preview.width = 48; preview.height = 48; preview.className = "pixel-preview";
  const previewCtx = preview.getContext("2d");
  previewCtx.imageSmoothingEnabled = false;
  controls.append(colorInput, addButton, previewLabel, preview);

  container.append(canvas, paletteRow, controls);

  function drawChecker(target, x, y, w, h, cell) {
    for (let cy = 0; cy < h; cy += cell) for (let cx = 0; cx < w; cx += cell) {
      target.fillStyle = ((cx / cell + cy / cell) % 2 === 0) ? "#2a3a2e" : "#22302a";
      target.fillRect(x + cx, y + cy, cell, cell);
    }
  }

  function render() {
    drawChecker(ctx, 0, 0, canvas.width, canvas.height, CELL / 2);
    for (let row = 0; row < SPRITE_SIZE; row += 1) {
      const line = sprite.pixels[row] ?? "";
      for (let col = 0; col < SPRITE_SIZE; col += 1) {
        const char = line[col] ?? ".";
        if (char === ".") continue;
        const color = sprite.palette[parseInt(char, 16)];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      }
    }
    ctx.globalAlpha = .25; ctx.strokeStyle = "#0d1810"; ctx.lineWidth = 1;
    for (let i = 0; i <= SPRITE_SIZE; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    renderPreview();
    renderPalette();
  }

  function renderPreview() {
    drawChecker(previewCtx, 0, 0, 48, 48, 6);
    const scale = 48 / SPRITE_SIZE;
    for (let row = 0; row < SPRITE_SIZE; row += 1) {
      const line = sprite.pixels[row] ?? "";
      for (let col = 0; col < SPRITE_SIZE; col += 1) {
        const char = line[col] ?? ".";
        if (char === ".") continue;
        const color = sprite.palette[parseInt(char, 16)];
        if (!color) continue;
        previewCtx.fillStyle = color;
        previewCtx.fillRect(col * scale, row * scale, scale, scale);
      }
    }
  }

  function renderPalette() {
    paletteRow.replaceChildren();
    if (allowTransparent) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = `pixel-swatch transparent${selected === "." ? " selected" : ""}`;
      swatch.title = "Transparente (borrar)";
      swatch.addEventListener("click", () => { selected = "."; renderPalette(); });
      paletteRow.append(swatch);
    }
    sprite.palette.forEach((color, index) => {
      const char = INDEX_CHARS[index];
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = `pixel-swatch${selected === char ? " selected" : ""}`;
      swatch.style.background = color;
      swatch.title = `Color ${index + 1} — clic para pintar con él`;
      swatch.addEventListener("click", () => { selected = char; colorInput.value = color; renderPalette(); });
      paletteRow.append(swatch);
    });
  }

  function setPixel(col, row, char) {
    const line = sprite.pixels[row];
    if (line[col] === char) return;
    sprite.pixels[row] = line.slice(0, col) + char + line.slice(col + 1);
    render();
    onChange(sprite);
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width) / CELL);
    const row = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height) / CELL);
    if (col < 0 || row < 0 || col >= SPRITE_SIZE || row >= SPRITE_SIZE) return null;
    return { col, row };
  }

  function paint(event, erase = false) {
    if (!enabled) return;
    const cell = cellFromEvent(event);
    if (!cell) return;
    const char = erase && allowTransparent ? "." : selected;
    if (char === "." && !allowTransparent) return;
    setPixel(cell.col, cell.row, char);
  }

  canvas.addEventListener("mousedown", (event) => {
    event.preventDefault();
    painting = true;
    paint(event, event.button === 2);
  });
  canvas.addEventListener("mousemove", (event) => { if (painting) paint(event, event.buttons === 2); });
  window.addEventListener("mouseup", () => { painting = false; });
  canvas.addEventListener("mouseleave", () => { painting = false; });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  colorInput.addEventListener("input", () => {
    if (!enabled || selected === ".") return;
    const index = parseInt(selected, 16);
    if (Number.isNaN(index) || !sprite.palette[index]) return;
    sprite.palette[index] = colorInput.value;
    render();
    onChange(sprite);
  });

  addButton.addEventListener("click", () => {
    if (!enabled) return;
    if (sprite.palette.length >= MAX_COLORS) { window.alert(`La paleta admite como máximo ${MAX_COLORS} colores.`); return; }
    sprite.palette.push(colorInput.value);
    selected = INDEX_CHARS[sprite.palette.length - 1];
    render();
    onChange(sprite);
  });

  render();

  return {
    setSprite(next) {
      sprite = next ?? blankSprite({ transparent: allowTransparent });
      selected = sprite.palette.length ? "0" : (allowTransparent ? "." : "0");
      colorInput.value = sprite.palette[0] ?? "#806b3f";
      render();
    },
    getSprite() { return sprite; },
    setEnabled(next) {
      enabled = next;
      canvas.classList.toggle("disabled", !enabled);
      colorInput.disabled = !enabled;
      addButton.disabled = !enabled;
    },
  };
}
