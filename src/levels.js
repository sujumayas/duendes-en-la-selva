// Niveles del juego. Edítalos a mano o con el editor (editor.html) y pega aquí el resultado exportado.
export const LEVELS = [
  {
    id: 1,
    name: "El claro del despertar",
    map: {
      type: "random",
      seed: 1101,
      params: { itemCounts: { branch: 8, stone: 7, vine: 6 }, dungeonChance: 0 },
    },
    encounters: {
      base: 0.02, perStep: 0.005, trapFactor: 0.03, cap: 0.3,
      weights: { enemy: 0.55, merchant: 0.25, treasure: 0.2 },
      spearWinChance: 0.85, unarmedWinChance: 0.45,
    },
    loot: [],
    logsPerTree: 3,
    monsterPool: ["jabali"],
    intro: "La selva parece tranquila. Demasiado.",
  },
  {
    id: 2,
    name: "Senderos de piedra",
    map: {
      type: "random",
      seed: 2203,
      params: { itemCounts: { branch: 7, stone: 8, vine: 6 }, dungeonChance: 0 },
    },
    encounters: {
      base: 0.02, perStep: 0.006, trapFactor: 0.03, cap: 0.34,
      weights: { enemy: 0.62, merchant: 0.22, treasure: 0.16 },
      spearWinChance: 0.85, unarmedWinChance: 0.4,
    },
    loot: ["tela"],
    logsPerTree: 3,
    monsterPool: ["jabali"],
    intro: "Alguien empedró estos caminos. Nadie recuerda a quién.",
  },
  {
    id: 3,
    name: "La espesura",
    map: {
      type: "random",
      seed: 3307,
      params: { itemCounts: { branch: 6, stone: 6, vine: 7 }, dungeonChance: 1 },
    },
    encounters: {
      base: 0.03, perStep: 0.006, trapFactor: 0.03, cap: 0.38,
      weights: { enemy: 0.66, merchant: 0.18, treasure: 0.16 },
      spearWinChance: 0.82, unarmedWinChance: 0.36,
    },
    loot: ["tela", "resina"],
    logsPerTree: 2,
    monsterPool: ["jabali", "sombra"],
    intro: "Los árboles se aprietan. La luz llega con permiso.",
  },
  {
    id: 4,
    name: "El corazón oscuro",
    map: {
      type: "random",
      seed: 4409,
      params: { itemCounts: { branch: 5, stone: 6, vine: 6 }, dungeonChance: 1 },
    },
    encounters: {
      base: 0.04, perStep: 0.007, trapFactor: 0.03, cap: 0.42,
      weights: { enemy: 0.74, merchant: 0.12, treasure: 0.14 },
      spearWinChance: 0.8, unarmedWinChance: 0.3,
    },
    loot: ["resina", "brujula"],
    logsPerTree: 3,
    monsterPool: ["sombra"],
    intro: "Aquí los duendes no cantan. Escuchan.",
  },
  {
    id: 5,
    name: "La orilla del río",
    map: {
      type: "random",
      seed: 5511,
      params: { itemCounts: { branch: 6, stone: 5, vine: 7 }, dungeonChance: 1 },
    },
    encounters: {
      base: 0.03, perStep: 0.006, trapFactor: 0.03, cap: 0.38,
      weights: { enemy: 0.6, merchant: 0.2, treasure: 0.2 },
      spearWinChance: 0.85, unarmedWinChance: 0.38,
    },
    loot: ["resina", "brujula"],
    logsPerTree: 3,
    monsterPool: ["jabali", "sombra"],
    intro: "Se oye agua. El río está cerca, y con él, el camino a casa.",
  },
];
