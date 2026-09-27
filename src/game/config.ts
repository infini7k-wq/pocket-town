// ゲームバランスの数値はすべてここに集約する。調整はこのファイルを中心に行う。

import type { RankId } from "./types";

export const SAVE_VERSION = 3;
export const MAP_SIZE = 24;
/** 旧バージョン（v1）のマップの大きさ */
export const LEGACY_MAP_SIZE = 16;

// ---------- 人口・雇用 ----------
/** 人口のうち働き手になる割合 */
export const WORKFORCE_RATIO = 0.5;
/** 建物の最大レベル（Lv4 の超高層は「市」で解禁） */
export const MAX_LEVEL = 4;
/** 住宅レベルごとの定員（0 = 造成中） */
export const RES_CAPACITY = [0, 14, 50, 110, 220];
/** 商業レベルごとの雇用枠 */
export const COM_JOBS = [0, 8, 24, 60, 120];
/** 工業レベルごとの雇用枠（Lv4 はハイテク工業団地） */
export const IND_JOBS = [0, 14, 36, 80, 140];
/** 中心地（役所）に道路で到達できない建物の効率 */
export const DISCONNECTED_FACTOR = 0.5;

export const POPULATION = {
  /** 転入：1か月に埋まる空きの最大割合（定員比） */
  maxFillRate: 0.25,
  /** 転出：目標を超えた分のうち1か月で出ていく割合 */
  leaveRate: 0.2,
  /** 自然な入れ替わり（毎月の基本転出率） */
  churnBase: 0.01,
  /** 仕事の空き（人口換算）のうち1か月で転入してくる割合 */
  jobInflowShare: 0.5,
  /** 仕事がなくても住みやすさだけで来る転入（人口比） */
  baselineInflow: 0.03,
  /** 失業率がこれを超えると失業者が出ていく */
  unemploymentTolerance: 0.05,
  /** 許容を超えた失業者のうち1か月で出ていく割合 */
  unemployedLeaveRate: 0.15,
};

/** 商業が支えられる雇用 = base + 人口 × perCapita（× 需要倍率） */
export const COM_SUPPORT = { base: 20, perCapita: 0.22, plazaBonus: 30, stationBonus: 80, landmarkBonus: 150 };
/** 工業が支えられる雇用 = base + 人口 × perCapita（× 需要倍率） */
export const IND_SUPPORT = { base: 60, perCapita: 0.25 };

// ---------- 満足度 ----------
export const HAPPINESS = {
  base: 50,
  park: 14,
  education: 8,
  health: 10,
  fire: 4,
  shopping: 6,
  plaza: 8,
  transit: 5,
  landmark: 10,
  /** 環境 60 を基準に 1 ポイントあたり */
  envWeight: 0.35,
  waterView: 4,
  /** 役所から道路で到達できない */
  disconnected: 10,
  trafficHigh: 8,
  trafficMedium: 3,
  noiseCap: 25,
  unemploymentWeight: 60,
  unemploymentCap: 20,
  /** 住宅税の基準税率 */
  taxNeutral: 9,
  taxWeight: 2.2,
  /** 混雑度 100% のときの全体ペナルティ */
  congestionWeight: 8,
  /** 資金がマイナスのときの不安 */
  debtPenalty: 5,
};

// ---------- 環境 ----------
export const ENVIRONMENT = {
  base: 72,
  forestEach: 3,
  forestCap: 12,
  park: 18,
  water: 4,
  /** 工業レベルごとの汚染 */
  /** 工業レベルごとの汚染（Lv4 のハイテク工場はクリーン） */
  industrialPollution: [0, 10, 16, 24, 10],
  pollutionRadius: 3,
  trafficWeight: 6,
  trafficCap: 15,
};

/** 工業レベルごとの騒音（隣接で満額、2マス先で半分） */
export const INDUSTRIAL_NOISE = [0, 6, 9, 12, 5];

// ---------- 交通 ----------
export const TRAFFIC = {
  perResident: 0.3,
  perComWorker: 0.7,
  perIndWorker: 1.0,
  perService: 4,
  /** 道路1マスの容量 */
  roadCapacity: 70,
  avenueCapacity: 180,
  /** 拡散の反復回数と割合（渋滞が道路網に広がる） */
  diffuseIterations: 4,
  diffuseShare: 0.5,
  /** 公共交通の範囲内で減る交通量の最大割合 */
  transitReduction: 0.4,
  mediumAt: 0.55,
  highAt: 0.9,
  /** 渋滞している道路に面した商業・工業の効率 */
  congestedEfficiency: 0.8,
};

// ---------- 財政 ----------
export const ECONOMY = {
  /** 税率 1% あたりの月額（住民1人 / 従業員1人あたり） */
  resTaxUnit: 45,
  comTaxUnit: 85,
  indTaxUnit: 95,
  /** 失業者の納税割合 */
  unemployedTaxShare: 0.4,
  taxMin: 0,
  taxMax: 20,
  defaultTax: 9,
  /** 商業・工業税が基準（9%）から1%上がるごとに減る需要の割合 */
  bizTaxSensitivity: 0.03,
  /** 行政サービス費（住民1人あたり月額 = base + 人口 / perCapitaDivisor）。大きな街ほど1人あたりの費用が増える */
  adminBase: 40,
  adminDivisor: 30,
  /** 行政サービス費の1人あたりの上限 */
  adminCap: 260,
  /** 橋（水の上の道路）の建設費 */
  bridgeCost: 120_000,
  /** 埋め立て（水を陸地にする）の費用。大都市で解禁 */
  reclaimCost: 400_000,
  /** 融資の月利 */
  loanInterest: 0.01,
  loanStep: 500_000,
  /** 森の伐採費 */
  forestClearCost: 10_000,
  /** 公共施設を撤去（売却）したときの返金率 */
  sellRefund: 0.4,
  /** 資金マイナスがこの月数続くと財政破綻 */
  bankruptcyMonths: 6,
};

// ---------- 建物の成長 ----------
export const GROWTH = {
  /** レベルアップに必要な成長ポイント（index = 現在のレベル） */
  threshold: [0, 60, 90, 100, 100],
  min: -100,
  max: 100,
  /** 造成中から完成したときの入居率 */
  initialOccupancy: 0.3,
  /** 条件を満たしたとき、その月にレベルアップする確率（一斉に建て替わらないように） */
  levelUpChance: 0.4,
};

// ---------- イベント ----------
export const EVENTS = {
  /** 毎月イベントが起きる確率 */
  monthlyChance: 0.4,
  /** 最初の数か月はイベントなし */
  graceTurns: 2,
  /** 同じイベントが再び起きるまでの最短の月数 */
  cooldown: 18,
};

// ---------- 時代 ----------
export const ERAS = {
  /** 最初の時代の長さ（月）。村のうちに一度「時代の予告」を体験できるよう短め */
  firstLength: 36,
  /** 2つ目以降の時代の長さ（月、この範囲でランダム） */
  minLength: 60,
  maxLength: 84,
  /** 何か月前に次の時代を予告するか */
  noticeMonths: 12,
};

// ---------- 陳情・依頼 ----------
export const REQUESTS = {
  /** 同時に受けられる依頼の数 */
  maxActive: 2,
  /** 依頼が届き始める月 */
  startTurn: 6,
  /** 依頼と依頼の間の最短の月数 */
  interval: 3,
  /** 条件を満たした月に新しい依頼が届く確率 */
  chance: 0.35,
};

// ---------- ランク ----------
export interface RankDef {
  id: RankId;
  name: string;
  en: string;
  emoji: string;
  minPopulation: number;
  /** 建設可能エリアの一辺 */
  mapSize: number;
  /** 建物の最大レベル */
  maxLevel: number;
  loanLimit: number;
  /** 昇格時のお祝い金 */
  reward: number;
}

export const RANKS: RankDef[] = [
  { id: "village", name: "村", en: "Village", emoji: "🌾", minPopulation: 0, mapSize: 12, maxLevel: 2, loanLimit: 2_000_000, reward: 0 },
  { id: "town", name: "町", en: "Town", emoji: "🏡", minPopulation: 1000, mapSize: 16, maxLevel: 3, loanLimit: 5_000_000, reward: 1_000_000 },
  { id: "city", name: "市", en: "City", emoji: "🏯", minPopulation: 3000, mapSize: 24, maxLevel: 4, loanLimit: 15_000_000, reward: 3_000_000 },
  { id: "metropolis", name: "大都市", en: "Major City", emoji: "🌃", minPopulation: 8000, mapSize: 24, maxLevel: 4, loanLimit: 40_000_000, reward: 8_000_000 },
  { id: "megacity", name: "メガシティ", en: "Megacity", emoji: "🌐", minPopulation: 15000, mapSize: 24, maxLevel: 4, loanLimit: 80_000_000, reward: 20_000_000 },
];

export const HISTORY_LIMIT = 120;
export const NEWS_LIMIT = 40;
