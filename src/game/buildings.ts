// 建物の定義。新しい建物はここに追加すれば地図・建設メニュー・シミュレーションに反映される。

import { COM_JOBS, IND_JOBS, RES_CAPACITY } from "./config";
import type { BuildingType, CoverageKind, ModifierEffects, RankId, TraitId, ZoneType } from "./types";

export type BuildingCategory = "road" | "zone" | "service" | "project" | "special";

export interface CoverageDef {
  kind: CoverageKind;
  radius: number;
  /** 効果の強さ（0〜1） */
  strength: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  /** 短い説明（建設メニュー用） */
  description: string;
  category: BuildingCategory;
  /** レベルごとの絵文字（index = レベル）。レベルのない建物は [_, emoji] */
  emoji: string[];
  /** レベルごとの呼び名 */
  levelNames?: string[];
  cost: number;
  /** 月額維持費 */
  upkeep: number;
  /** 雇用枠（レベルごと） */
  jobs: number[];
  coverage?: CoverageDef;
  /** 効果範囲の中で何が起きるか（プレイヤー向けの説明） */
  effect?: string;
  unlockRank: RankId;
  /** 撤去できるか */
  removable: boolean;
  /** ドラッグで連続設置できるか */
  paintable: boolean;
  /** 地図タイルの色 */
  color: string;
  /** 占めるマス（2 = 2×2。左上のマスが本体） */
  size?: 2;
  /** 完成までにかかる月数（大型プロジェクト） */
  buildMonths?: number;
  /** 毎月の施設収入（入場料など） */
  revenue?: number;
  /** 毎月生む交通量（指定がなければ公共施設の標準値） */
  trips?: number;
  /** 周囲3マスへの騒音 */
  noise?: number;
  /** 周囲3マスの環境を下げる量 */
  pollution?: number;
  /** 完成すると街全体にかかる効果 */
  globalEffects?: ModifierEffects;
  /** 大型プロジェクトの完成後の効果（説明用） */
  impact?: string;
  /** この個性の町だけで建てられる専用プロジェクト */
  trait?: TraitId;
  /** 水辺（海・川）に面していないと建てられない */
  nearWater?: boolean;
  /** 地図の端（となり町との境）に面していないと建てられない */
  mapEdge?: boolean;
}

const ALL_LEVELS = (n: number) => [0, n, n, n, n];

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  road: {
    type: "road",
    name: "道路",
    description: "建物は道路に面していないと機能しない",
    category: "road",
    emoji: ["", "🛣️"],
    cost: 20_000,
    upkeep: 1_500,
    jobs: [0, 0],
    unlockRank: "village",
    removable: true,
    paintable: true,
    color: "#5b6472",
  },
  avenue: {
    type: "avenue",
    name: "大通り",
    description: "道路の約2.5倍の車が通れる。渋滞対策に",
    category: "road",
    emoji: ["", "🚥"],
    cost: 90_000,
    upkeep: 5_000,
    jobs: [0, 0],
    unlockRank: "town",
    removable: true,
    paintable: true,
    color: "#3f4652",
  },
  residential: {
    type: "residential",
    name: "住宅",
    description: "人が住む。仕事や施設が近く、空気がきれいなほど人気",
    category: "zone",
    emoji: ["🚧", "🏠", "🏘️", "🏢", "🌇", "🌆"],
    levelNames: ["造成中", "戸建て", "集合住宅", "マンション", "タワーマンション", "超高層レジデンス"],
    cost: 50_000,
    upkeep: 0,
    jobs: [0, 0, 0, 0, 0],
    unlockRank: "village",
    removable: true,
    paintable: true,
    color: "#7cc576",
  },
  commercial: {
    type: "commercial",
    name: "商業",
    description: "お店と働く場所。周りに住む人が多いほど大きな店に育つ",
    category: "zone",
    emoji: ["🚧", "🏪", "🛒", "🏬", "🏙️", "🌃"],
    levelNames: ["造成中", "コンビニ", "スーパー", "デパート", "複合ビル（お店＋オフィス）", "ランドマークビル"],
    cost: 80_000,
    upkeep: 0,
    jobs: COM_JOBS,
    coverage: { kind: "shopping", radius: 3, strength: 1 },
    unlockRank: "village",
    removable: true,
    paintable: true,
    color: "#6aa9e9",
  },
  industrial: {
    type: "industrial",
    name: "工業",
    description: "働く場所と税収が多い。空気が汚れ、騒音と車が増える",
    category: "zone",
    emoji: ["🚧", "🛠️", "🏭", "🏭", "🤖", "🚀"],
    levelNames: ["造成中", "町工場", "工場", "工業団地", "ハイテク工業団地", "先端研究所"],
    cost: 100_000,
    upkeep: 0,
    jobs: IND_JOBS,
    unlockRank: "village",
    removable: true,
    paintable: true,
    color: "#e0b050",
  },
  park: {
    type: "park",
    name: "公園",
    description: "安い小さな公園。2マス先までの家の満足度と空気を上げる",
    category: "service",
    emoji: ["", "🌳"],
    cost: 150_000,
    upkeep: 10_000,
    jobs: ALL_LEVELS(1),
    coverage: { kind: "park", radius: 2, strength: 1 },
    effect: "範囲内の住宅の満足度が最大+14、空気が最大+18（端では半分）",
    unlockRank: "village",
    removable: true,
    paintable: false,
    color: "#4caf50",
  },
  bigPark: {
    type: "bigPark",
    name: "大きな公園",
    description: "池や林のある広い公園。4マス先まで、公園より強く効き、騒音もやわらげる",
    category: "service",
    emoji: ["", "🏞️"],
    cost: 500_000,
    upkeep: 35_000,
    jobs: ALL_LEVELS(4),
    coverage: { kind: "park", radius: 4, strength: 1.3 },
    effect: "満足度が最大+18・空気が最大+23（公園の1.3倍）で、範囲は約3倍。周り2マスの騒音を半分にする",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#2e7d32",
  },
  school: {
    type: "school",
    name: "学校",
    description: "満足度アップ。マンションに育つための条件",
    category: "service",
    emoji: ["", "🏫"],
    cost: 600_000,
    upkeep: 60_000,
    jobs: ALL_LEVELS(12),
    coverage: { kind: "education", radius: 4, strength: 1 },
    effect: "満足度が上がる。範囲内の住宅はマンションに育てるようになる",
    unlockRank: "village",
    removable: true,
    paintable: false,
    color: "#f2a65a",
  },
  hospital: {
    type: "hospital",
    name: "病院",
    description: "満足度アップ。感染症の被害も減る",
    category: "service",
    emoji: ["", "🏥"],
    cost: 900_000,
    upkeep: 90_000,
    jobs: ALL_LEVELS(18),
    coverage: { kind: "health", radius: 5, strength: 1 },
    effect: "範囲内の住宅の満足度が上がる。感染症がはやっても被害が小さくなる",
    unlockRank: "village",
    removable: true,
    paintable: false,
    color: "#ef8a8a",
  },
  fireStation: {
    type: "fireStation",
    name: "消防署",
    description: "範囲内の火災リスクを大きく下げる",
    category: "service",
    emoji: ["", "🚒"],
    cost: 500_000,
    upkeep: 50_000,
    jobs: ALL_LEVELS(8),
    coverage: { kind: "fire", radius: 5, strength: 1 },
    effect: "範囲内の建物は火事が起きにくく、起きても被害を防げる。安心感で満足度も少し上がる",
    unlockRank: "village",
    removable: true,
    paintable: false,
    color: "#e05a4f",
  },
  cityHall: {
    type: "cityHall",
    name: "役所",
    description: "街の中心。建物は道路でここにつながっていることが大切",
    category: "special",
    emoji: ["", "🏛️"],
    cost: 0,
    upkeep: 50_000,
    jobs: ALL_LEVELS(20),
    unlockRank: "village",
    removable: false,
    paintable: false,
    color: "#b39ddb",
  },
  busStop: {
    type: "busStop",
    name: "バス停",
    description: "範囲内の交通量を減らし、満足度も少し上げる",
    category: "service",
    emoji: ["", "🚏"],
    cost: 250_000,
    upkeep: 20_000,
    jobs: ALL_LEVELS(2),
    coverage: { kind: "transit", radius: 3, strength: 0.7 },
    effect: "範囲内の建物が出す車を4割前後減らし、満足度+3〜4。タワーマンション・複合ビルに育つ条件にもなる",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#ffca28",
  },
  plaza: {
    type: "plaza",
    name: "広場",
    description: "人が集まる広場。近くのお店が大きな店に育ちやすくなる",
    category: "service",
    emoji: ["", "⛲"],
    cost: 400_000,
    upkeep: 15_000,
    jobs: ALL_LEVELS(2),
    coverage: { kind: "plaza", radius: 3, strength: 1 },
    effect: "範囲内のお店は、周りの住民が半分でもスーパー・デパートに育つ。満足度も少し上がり（+5）、街全体のお客も+60人分",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#90caf9",
  },
  station: {
    type: "station",
    name: "バスターミナル",
    description: "路線バスが集まる大きなターミナル。広い範囲の車を減らす",
    category: "service",
    emoji: ["", "🚌"],
    cost: 2_500_000,
    upkeep: 150_000,
    jobs: ALL_LEVELS(20),
    coverage: { kind: "transit", radius: 5, strength: 1 },
    effect: "範囲内の建物が出す車を4〜5割減らし（バス停は約4割）、満足度+5。街全体のお客も+80人分",
    unlockRank: "city",
    removable: true,
    paintable: false,
    color: "#9fa8da",
  },
  landmark: {
    type: "landmark",
    name: "シンボルタワー",
    description: "街の誇り。広範囲の満足度を大きく上げる",
    category: "service",
    emoji: ["", "🗼"],
    cost: 6_000_000,
    upkeep: 200_000,
    jobs: ALL_LEVELS(30),
    coverage: { kind: "landmark", radius: 7, strength: 1 },
    effect: "半径7マスの満足度が最大+10。街全体のお客も+150人分",
    unlockRank: "metropolis",
    removable: true,
    paintable: false,
    color: "#f48fb1",
  },
  stadium: {
    type: "stadium",
    name: "スタジアム",
    description: "入場料が入り、お店の客も増える",
    category: "project",
    emoji: ["🏗️", "🏟️"],
    cost: 8_000_000,
    upkeep: 150_000,
    jobs: ALL_LEVELS(60),
    coverage: { kind: "landmark", radius: 5, strength: 0.7 },
    effect: "範囲内の住宅の満足度が上がる",
    impact: "入場料 月¥35万・お店の客 +200人分・周りの満足度アップ／試合の日は車が増える",
    unlockRank: "city",
    removable: true,
    paintable: false,
    color: "#26a69a",
    size: 2,
    buildMonths: 6,
    revenue: 350_000,
    trips: 70,
    globalEffects: { comSupport: 200, resAppeal: 0.02 },
  },
  university: {
    type: "university",
    name: "大学",
    description: "学生と研究者が集まり、若い世代が住みたがる街に",
    category: "project",
    emoji: ["🏗️", "🎓"],
    cost: 10_000_000,
    upkeep: 220_000,
    jobs: ALL_LEVELS(90),
    coverage: { kind: "education", radius: 8, strength: 1 },
    effect: "半径8マスが学校の範囲になり、満足度が上がる。マンションに育つ条件も満たす",
    impact: "半径8マスが学校の範囲に・引っ越してくる人が増える・お店の客 +150人分",
    unlockRank: "city",
    removable: true,
    paintable: false,
    color: "#5c6bc0",
    size: 2,
    buildMonths: 8,
    trips: 40,
    globalEffects: { resAppeal: 0.05, comSupport: 150 },
  },
  bulletTrain: {
    type: "bulletTrain",
    name: "新幹線駅",
    description: "大都市と直結。線路がとなり町へ続くよう、地図の端に建てる",
    category: "project",
    emoji: ["🏗️", "🚄"],
    cost: 12_000_000,
    upkeep: 180_000,
    jobs: ALL_LEVELS(40),
    coverage: { kind: "transit", radius: 7, strength: 1 },
    effect: "バスターミナルと同じ効き目（車4〜5割減・満足度+5）が建物の端から7マスに届く",
    impact: "引っ越してくる人が大きく増える・お店の客 +300人分・工場の注文 +150人分・半径7マスの渋滞がやわらぐ",
    unlockRank: "city",
    removable: true,
    paintable: false,
    color: "#42a5f5",
    size: 2,
    buildMonths: 10,
    trips: 30,
    mapEdge: true,
    globalEffects: { resAppeal: 0.08, comSupport: 300, indSupport: 150 },
  },
  themePark: {
    type: "themePark",
    name: "テーマパーク",
    description: "遠くから客が来る観光地。そのぶん道路は大混雑",
    category: "project",
    emoji: ["🏗️", "🎢"],
    cost: 16_000_000,
    upkeep: 320_000,
    jobs: ALL_LEVELS(160),
    coverage: { kind: "landmark", radius: 6, strength: 0.8 },
    effect: "範囲内の住宅の満足度が上がる",
    impact: "入場料 月¥110万・お店の客 +400人分／車がとても増える",
    unlockRank: "metropolis",
    removable: true,
    paintable: false,
    color: "#ec407a",
    size: 2,
    buildMonths: 10,
    revenue: 1_100_000,
    trips: 160,
    globalEffects: { comSupport: 400 },
  },
  airport: {
    type: "airport",
    name: "空港",
    description: "工場とお店が大きく伸びる。騒音と大気汚染に注意",
    category: "project",
    emoji: ["🏗️", "✈️"],
    cost: 25_000_000,
    upkeep: 420_000,
    jobs: ALL_LEVELS(220),
    impact: "工場の注文 +700人分・お店の客 +400人分・引っ越してくる人が増える／周り3マスに大きな騒音と大気汚染",
    unlockRank: "metropolis",
    removable: true,
    paintable: false,
    color: "#78909c",
    size: 2,
    buildMonths: 12,
    trips: 150,
    noise: 20,
    pollution: 18,
    globalEffects: { indSupport: 700, comSupport: 400, resAppeal: 0.04 },
  },
  // ---------- 町の個性ごとの専用プロジェクト（1つの街に1つ） ----------
  forestPark: {
    type: "forestPark",
    name: "森林公園",
    description: "郊外住宅地だけの専用施設。森と遊歩道の大きな公園",
    category: "project",
    emoji: ["🏗️", "🌲"],
    cost: 5_000_000,
    upkeep: 100_000,
    jobs: ALL_LEVELS(20),
    coverage: { kind: "park", radius: 6, strength: 1.2 },
    effect: "建物の端から6マスが公園の範囲になり、ふつうの公園より強く効く",
    impact: "半径6マスが強い公園の範囲に・引っ越してくる人が増える・街全体の空気+4・公園の効果+20%",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#1b5e20",
    size: 2,
    buildMonths: 6,
    trips: 20,
    trait: "suburban",
    globalEffects: { resAppeal: 0.05, env: 4, parkWeight: 0.2 },
  },
  kombinat: {
    type: "kombinat",
    name: "産業コンビナート",
    description: "工業の町だけの専用施設。巨大な工場群で雇用と税収が大きく増える",
    category: "project",
    emoji: ["🏗️", "🏗️"],
    cost: 7_000_000,
    upkeep: 150_000,
    jobs: ALL_LEVELS(200),
    impact: "雇用200人・工場の注文 +400人分・税収+5%／周り3マスの空気が悪くなる",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#8d6e63",
    size: 2,
    buildMonths: 8,
    trips: 80,
    pollution: 10,
    trait: "industrial",
    globalEffects: { indSupport: 400, taxIncome: 0.05 },
  },
  marina: {
    type: "marina",
    name: "マリーナ",
    description: "海沿いの町だけの専用施設。ヨットが並ぶ港。水辺に面して建てる",
    category: "project",
    emoji: ["🏗️", "⛵"],
    cost: 6_000_000,
    upkeep: 120_000,
    jobs: ALL_LEVELS(50),
    coverage: { kind: "landmark", radius: 5, strength: 0.6 },
    effect: "範囲内の住宅の満足度が上がる（海辺の人気スポット）",
    impact: "入場料 月¥40万・お店の客 +250人分・引っ越してくる人が増える・周り5マスの満足度アップ",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#0288d1",
    size: 2,
    buildMonths: 6,
    revenue: 400_000,
    trips: 40,
    trait: "coastal",
    nearWater: true,
    globalEffects: { comSupport: 250, resAppeal: 0.03 },
  },
  arcade: {
    type: "arcade",
    name: "アーケード商店街",
    description: "商店街の町だけの専用施設。屋根つきの大きな商店街",
    category: "project",
    emoji: ["🏗️", "🏮"],
    cost: 5_000_000,
    upkeep: 100_000,
    jobs: ALL_LEVELS(80),
    coverage: { kind: "shopping", radius: 5, strength: 1.2 },
    effect: "建物の端から5マスで買い物がとても便利になる",
    impact: "雇用80人・お店の客 +300人分・周り5マスの買い物がとても便利に",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#e53935",
    size: 2,
    buildMonths: 6,
    trips: 50,
    trait: "merchant",
    globalEffects: { comSupport: 300 },
  },
  annex: {
    type: "annex",
    name: "大型施設の敷地",
    description: "2×2 の大型施設の一部",
    category: "special",
    emoji: ["", ""],
    cost: 0,
    upkeep: 0,
    jobs: [0, 0],
    unlockRank: "village",
    removable: false,
    paintable: false,
    color: "#cfd8dc",
  },
};

/** 大型プロジェクト（2×2） */
export const PROJECTS: BuildingType[] = ["stadium", "university", "bulletTrain", "themePark", "airport"];

/** 町の個性ごとの専用プロジェクト */
export const TRAIT_PROJECTS: Record<TraitId, BuildingType> = {
  suburban: "forestPark",
  industrial: "kombinat",
  coastal: "marina",
  merchant: "arcade",
};

/** その町で建てられる大型プロジェクト（専用プロジェクトを先頭に） */
export function projectsFor(trait: TraitId): BuildingType[] {
  return [TRAIT_PROJECTS[trait], ...PROJECTS];
}

export function isProject(type: BuildingType | undefined): boolean {
  return !!type && BUILDINGS[type].category === "project";
}

/** 建設メニューの並び順 */
export const BUILD_ORDER: BuildingType[] = [
  "road",
  "avenue",
  "residential",
  "commercial",
  "industrial",
  "park",
  "bigPark",
  "school",
  "hospital",
  "fireStation",
  "busStop",
  "plaza",
  "station",
  "landmark",
  ...PROJECTS,
];

export const ZONES: ZoneType[] = ["residential", "commercial", "industrial"];

export function isZone(type: BuildingType): type is ZoneType {
  return BUILDINGS[type].category === "zone";
}

export function isRoad(type: BuildingType | undefined): boolean {
  return type === "road" || type === "avenue";
}

export function buildingEmoji(type: BuildingType, level: number): string {
  const e = BUILDINGS[type].emoji;
  return e[Math.min(level, e.length - 1)] || e[e.length - 1];
}

export function levelName(type: BuildingType, level: number): string {
  const def = BUILDINGS[type];
  return def.levelNames?.[level] ?? def.name;
}

export function jobsAt(type: BuildingType, level: number): number {
  const j = BUILDINGS[type].jobs;
  return j[Math.min(level, j.length - 1)] ?? 0;
}

export function capacityAt(type: BuildingType, level: number): number {
  return type === "residential" ? RES_CAPACITY[level] ?? 0 : 0;
}
