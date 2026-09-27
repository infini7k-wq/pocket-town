// ゲーム状態の生成：ニューゲーム時に小さな町（道路・住宅・商店・役所・住民）をランダムな個性つきで作る。

import { analyzeCity } from "./analysis";
import { capacityAt } from "./buildings";
import { ECONOMY, LEGACY_MAP_SIZE, MAP_SIZE, SAVE_VERSION } from "./config";
import { initialEra } from "./eras";
import { getScenario } from "./scenarios";
import { toIndex } from "./map";
import { createRng, randomSeed, type Rng } from "./rng";
import { TRAIT_IDS, TRAITS, pickTendency } from "./traits";
import type { Building, BuildingType, GameState, TendencyId, Tile, TownProfile, TraitId } from "./types";
import { generateVoices } from "./voices";

export function newBuilding(type: BuildingType, level: number, turn: number, paid = 0): Building {
  return { type, level, occupants: 0, growth: 0, builtTurn: turn, paid, abandoned: false };
}

export interface ProfileChoice {
  /** プレイヤーが選んだ個性（なければランダム） */
  trait?: TraitId;
  /** プレイヤーが選んだ住民の傾向（なければ個性に合わせて重み付きでランダム） */
  tendency?: TendencyId;
}

/** 町の個性を決める。選んでも選ばなくても乱数の使い方は同じにして、ほかの要素（地価・地形など）がぶれないようにする */
export function generateProfile(rng: Rng, choice: ProfileChoice = {}): TownProfile {
  const picked = rng.pick<TraitId>(TRAIT_IDS);
  const trait = choice.trait ?? picked;
  const pickedTendency = pickTendency(rng, trait);
  const tendency = choice.tendency ?? pickedTendency;
  const t = TRAITS[trait];
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    trait,
    tendency,
    landValue: round2(rng.range(0.85, 1.25)),
    comDemand: round2(t.comDemand * rng.range(0.88, 1.12)),
    indDemand: round2(t.indDemand * rng.range(0.88, 1.12)),
    resAppeal: t.resAppeal,
  };
}

type Placement = [x: number, y: number, type: BuildingType, level: number];

/** 初期の町並みは 16×16 の座標で書いてあり、24×24 のマップの中央に置く */
export const TOWN_OFFSET = (MAP_SIZE - LEGACY_MAP_SIZE) / 2;

/** 初期の町並みのひな形（16×16 の座標。町は 3〜12 の範囲に収める） */
interface TownLayout {
  name: string;
  roads: Array<[number, number, number, number]>;
  buildings: Placement[];
  /** 町の個性ごとに足す建物 */
  extras: Record<TraitId, Placement[]>;
}

const R = "residential" as const;
const C = "commercial" as const;
const I = "industrial" as const;

/**
 * 初期の町並みは3種類。さらに回転・反転（8通り）をかけるので、毎回ちがう町から始まる。
 * どのひな形も「すべての建物が道路に面している」「工場は住宅から3マス以上はなれている」ようにしてある。
 */
const TOWN_LAYOUTS: TownLayout[] = [
  {
    name: "メインストリートの町",
    roads: [
      [3, 8, 12, 8],
      [6, 3, 6, 12],
      [3, 4, 5, 4],
      [10, 9, 10, 11],
    ],
    buildings: [
      [7, 7, "cityHall", 1],
      [3, 3, R, 1], [4, 3, R, 2], [5, 3, R, 1], [4, 5, R, 2], [5, 5, R, 1], [5, 6, R, 2], [5, 7, R, 1],
      [4, 7, R, 2], [3, 7, R, 1], [5, 9, R, 2], [4, 9, R, 1], [5, 10, R, 1], [5, 11, R, 1],
      [7, 9, C, 2], [8, 9, C, 1], [8, 7, C, 2], [7, 6, C, 1], [7, 10, C, 1],
      [11, 9, I, 2], [11, 10, I, 1],
    ],
    extras: {
      coastal: [[7, 5, "park", 1]],
      industrial: [[12, 9, I, 1], [11, 11, I, 1]],
      suburban: [[7, 5, "park", 1], [3, 9, R, 1]],
      merchant: [[9, 7, C, 1], [9, 9, C, 1]],
    },
  },
  {
    name: "十字路の町",
    roads: [
      [3, 7, 12, 7],
      [7, 3, 7, 12],
      [3, 10, 6, 10],
      [8, 4, 12, 4],
    ],
    buildings: [
      [8, 8, "cityHall", 1],
      [4, 6, R, 1], [5, 6, R, 2], [6, 6, R, 1], [6, 5, R, 2], [6, 4, R, 1], [4, 8, R, 2], [5, 8, R, 1],
      [6, 8, R, 1], [4, 9, R, 1], [5, 9, R, 2], [4, 11, R, 1], [5, 11, R, 2], [6, 11, R, 1],
      [8, 6, C, 2], [9, 6, C, 1], [9, 8, C, 1], [8, 9, C, 2], [6, 9, C, 1],
      [11, 5, I, 2], [12, 5, I, 1],
    ],
    extras: {
      coastal: [[8, 5, "park", 1]],
      industrial: [[10, 5, I, 1], [12, 3, I, 1]],
      suburban: [[8, 5, "park", 1], [3, 6, R, 1]],
      merchant: [[10, 6, C, 1], [10, 8, C, 1]],
    },
  },
  {
    name: "街道ぞいの町",
    roads: [
      [3, 6, 12, 6],
      [5, 6, 5, 11],
      [9, 6, 9, 11],
    ],
    buildings: [
      [6, 7, "cityHall", 1],
      [3, 5, R, 1], [4, 5, R, 2], [5, 5, R, 1], [6, 5, R, 2], [7, 5, R, 1], [4, 7, R, 1], [4, 8, R, 2],
      [4, 9, R, 1], [4, 10, R, 2], [6, 9, R, 1], [6, 10, R, 2], [6, 11, R, 1], [4, 11, R, 1],
      [7, 7, C, 2], [8, 7, C, 1], [8, 5, C, 2], [6, 8, C, 1], [8, 10, C, 1],
      [10, 9, I, 2], [10, 10, I, 1],
    ],
    extras: {
      coastal: [[10, 5, "park", 1]],
      industrial: [[10, 11, I, 1], [10, 8, I, 1]],
      suburban: [[10, 5, "park", 1], [3, 7, R, 1]],
      merchant: [[8, 8, C, 1], [10, 7, C, 1]],
    },
  },
];

/** 16×16 の座標に回転・反転をかける（町の中心 7.5, 7.5 を軸にするので、町は 3〜12 の範囲に収まったまま） */
function transformXY(x: number, y: number, t: number): [number, number] {
  const L = LEGACY_MAP_SIZE - 1;
  let [a, b] = t & 4 ? [y, x] : [x, y];
  if (t & 1) a = L - a;
  if (t & 2) b = L - b;
  return [a, b];
}

function generateTiles(profile: TownProfile, rng: Rng, turn: number): Tile[] {
  const size = MAP_SIZE;
  const O = TOWN_OFFSET;
  const tiles: Tile[] = Array.from({ length: size * size }, () => ({ terrain: "grass", building: null }));
  const at = (x: number, y: number) => tiles[toIndex(x + O, y + O, size)];
  const atAbs = (x: number, y: number) => tiles[toIndex(x, y, size)];
  let hasPond = false;

  // 地形：海沿いなら東側が海。それ以外は西側を川が流れ、池があることも
  if (profile.trait === "coastal") {
    let shore = 13;
    for (let y = -O; y < size - O; y++) {
      shore = Math.max(12, Math.min(14, shore + rng.int(-1, 1)));
      if (y >= 7 && y <= 11) shore = Math.max(shore, 13); // メインストリートの端は陸地
      for (let x = shore + O; x < size; x++) atAbs(x, y + O).terrain = "water";
    }
  } else {
    // 川：町が「市」に育つころ建設エリアに入り、橋を架けると西側に広がれる
    const phase = rng.range(0, Math.PI * 2);
    for (let y = 0; y < size; y++) {
      const cx = 3 + Math.round(Math.sin(y / 3.2 + phase) * 1.2);
      atAbs(cx, y).terrain = "water";
      atAbs(cx + 1, y).terrain = "water";
    }
    hasPond = rng.chance(0.6);
  }

  // 道路と建物：ひな形を選び、回転・反転をかけて置く
  const layout = rng.pick(TOWN_LAYOUTS);
  const t = rng.int(0, 7);
  const put = (x: number, y: number) => {
    const [a, b] = transformXY(x, y, t);
    const tile = at(a, b);
    tile.terrain = "grass";
    return tile;
  };
  for (const [x1, y1, x2, y2] of layout.roads) {
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) put(x, y).building = newBuilding("road", 1, turn);
  }
  for (const [x, y, type, level] of [...layout.buildings, ...layout.extras[profile.trait]]) {
    const b = newBuilding(type, level, turn);
    if (type === "residential") b.occupants = Math.round(capacityAt(type, level) * rng.range(0.66, 0.8));
    if (type === "residential" || type === "commercial" || type === "industrial") b.growth = rng.int(0, 40);
    put(x, y).building = b;
  }

  // 小さな池（建物のない場所だけ）
  if (profile.trait !== "coastal" && hasPond) {
    const px = rng.pick([1, 12]);
    const py = rng.pick([1, 13]);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) if (!at(px + dx, py + dy).building) at(px + dx, py + dy).terrain = "water";
  }

  // 森：中心から離れるほど多い
  addForests(tiles, size, profile, rng);
  return tiles;
}

/** 中心から離れるほど森を多くする（建物・水のないマスのみ） */
export function addForests(tiles: Tile[], size: number, profile: Pick<TownProfile, "trait">, rng: Rng, onlyOuter = 0): void {
  const forestBias = profile.trait === "suburban" ? 0.12 : profile.trait === "industrial" ? -0.05 : 0;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = tiles[toIndex(x, y, size)];
      if (t.building || t.terrain !== "grass") continue;
      if (onlyOuter && Math.max(Math.abs(x - c), Math.abs(y - c)) < onlyOuter) continue;
      const d = Math.hypot(x - c, y - c);
      const p = (d < 4 ? 0.03 : d < 6 ? 0.14 : 0.34) + forestBias;
      if (rng.chance(p)) t.terrain = "forest";
    }
  }
}

export interface NewGameOptions {
  /** チャレンジ（シナリオ）の id。フリープレイなら省略 */
  scenario?: string;
  /** 個性・住民の傾向をプレイヤーが選んだ場合 */
  trait?: TraitId;
  tendency?: TendencyId;
}

/** チャレンジで決まっている個性・傾向を優先して、選択をまとめる */
function resolveChoice(scenario: string | undefined, choice: ProfileChoice): ProfileChoice {
  const def = scenario ? getScenario(scenario) : undefined;
  return { trait: def?.trait ?? choice.trait, tendency: def?.tendency ?? choice.tendency };
}

export function createNewGame(townName: string, seed: number = randomSeed(), options: NewGameOptions = {}): GameState {
  const rng = createRng(seed);
  const scenario = options.scenario ? getScenario(options.scenario) : undefined;
  const profile = generateProfile(rng, resolveChoice(options.scenario, options));
  const money = Math.round(rng.range(2_600_000, 4_000_000) / 100_000) * 100_000;
  const state: GameState = {
    version: SAVE_VERSION,
    townName: townName.trim() || "ポケットタウン",
    turn: 0,
    money,
    loan: 0,
    taxes: { residential: ECONOMY.defaultTax, commercial: ECONOMY.defaultTax, industrial: ECONOMY.defaultTax },
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles: generateTiles(profile, rng, 0),
    rank: "village",
    profile,
    modifiers: [],
    pendingEvent: null,
    voices: [],
    news: [
      {
        turn: 0,
        emoji: "🎉",
        title: "新しい町長が就任しました",
        body: "小さな町を、あなたの判断で育てていきましょう。",
        tone: "good",
      },
    ],
    history: [],
    lastReport: null,
    monthSpend: 0,
    debtMonths: 0,
    surplusStreak: 0,
    achievements: [],
    rngSeed: rng.seed,
    gameOver: null,
    era: initialEra(rng),
    requests: [],
    lastRequestTurn: 0,
    eventLog: {},
    gameId: `${seed.toString(36)}-${townName.trim() || "town"}`,
    scenario: scenario ? { id: scenario.id, startTurn: 0, deadline: scenario.years * 12 - 1, result: null } : null,
  };
  if (scenario) {
    scenario.setup(state, rng);
    state.news.unshift({ turn: 0, emoji: scenario.emoji, title: `チャレンジ「${scenario.title}」`, body: `${scenario.story} 目標：${scenario.goal}`, tone: "neutral" });
  }
  state.rngSeed = rng.seed;
  const a = analyzeCity(state);
  state.voices = generateVoices(state, a, createRng(seed ^ 0x5bd1e995), null);
  state.history.push({ turn: 0, population: a.population, money: state.money, happiness: a.cityHappiness, net: a.budget.net });
  return state;
}

/** スタート画面で町の個性をプレビューする */
export function previewTown(seed: number, scenario?: string, choice: ProfileChoice = {}): { profile: TownProfile; money: number } {
  const rng = createRng(seed);
  const profile = generateProfile(rng, resolveChoice(scenario, choice));
  const money = Math.round(rng.range(2_600_000, 4_000_000) / 100_000) * 100_000;
  return { profile, money };
}
