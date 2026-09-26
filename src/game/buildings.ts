// 建物の定義。新しい建物はここに追加すれば地図・建設メニュー・シミュレーションに反映される。

import { COM_JOBS, IND_JOBS, RES_CAPACITY } from "./config";
import type { BuildingType, CoverageKind, ModifierEffects, RankId, ZoneType } from "./types";

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
    description: "交通容量が道路の約2.5倍。渋滞対策に",
    category: "road",
    emoji: ["", "🛣️"],
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
    description: "人が住む。仕事・公共サービス・環境が良いほど人が集まる",
    category: "zone",
    emoji: ["🚧", "🏠", "🏘️", "🏢", "🌇"],
    levelNames: ["造成中", "戸建て", "集合住宅", "マンション", "タワーマンション"],
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
    description: "雇用と税収。人口が少ないとお客さんが足りない",
    category: "zone",
    emoji: ["🚧", "🏪", "🏬", "🏙️", "🏦"],
    levelNames: ["造成中", "商店", "商店街", "オフィスビル", "超高層オフィス"],
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
    description: "雇用と税収が大きいが、公害・騒音・交通量が増える",
    category: "zone",
    emoji: ["🚧", "📦", "🏭", "🏭", "🔬"],
    levelNames: ["造成中", "町工場", "工場", "工業団地", "ハイテク工業団地"],
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
    description: "周囲の満足度と環境を上げる",
    category: "service",
    emoji: ["", "🌳"],
    cost: 150_000,
    upkeep: 10_000,
    jobs: ALL_LEVELS(1),
    coverage: { kind: "park", radius: 2, strength: 1 },
    effect: "範囲内の住宅の満足度と、周りの環境（空気のきれいさ）が上がる",
    unlockRank: "village",
    removable: true,
    paintable: false,
    color: "#4caf50",
  },
  bigPark: {
    type: "bigPark",
    name: "大きな公園",
    description: "池や芝生のある広い公園。1マスで広い範囲に効く",
    category: "service",
    emoji: ["", "🏞️"],
    cost: 700_000,
    upkeep: 35_000,
    jobs: ALL_LEVELS(4),
    coverage: { kind: "park", radius: 4, strength: 1 },
    effect: "範囲内の住宅の満足度と、周りの環境（空気のきれいさ）が上がる。公園の約4倍の広さに効く",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#2e7d32",
  },
  school: {
    type: "school",
    name: "学校",
    description: "教育で満足度UP。マンションへの成長に必要",
    category: "service",
    emoji: ["", "🏫"],
    cost: 600_000,
    upkeep: 60_000,
    jobs: ALL_LEVELS(12),
    coverage: { kind: "education", radius: 4, strength: 1 },
    effect: "範囲内の住宅の満足度が上がる。住宅がマンション（Lv3）に育つには学校の範囲内であることが必要",
    unlockRank: "village",
    removable: true,
    paintable: false,
    color: "#f2a65a",
  },
  hospital: {
    type: "hospital",
    name: "病院",
    description: "医療で満足度UP。住民が定着する",
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
    description: "町の中心。道路でここにつながっていることが大切",
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
    emoji: ["", "🚌"],
    cost: 250_000,
    upkeep: 20_000,
    jobs: ALL_LEVELS(2),
    coverage: { kind: "transit", radius: 3, strength: 0.7 },
    effect: "範囲内の建物が出す車が減り、渋滞がやわらぐ。満足度も少し上がる",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#ffca28",
  },
  plaza: {
    type: "plaza",
    name: "広場",
    description: "にぎわいの中心。満足度と商業を後押し",
    category: "service",
    emoji: ["", "⛲"],
    cost: 400_000,
    upkeep: 15_000,
    jobs: ALL_LEVELS(2),
    coverage: { kind: "plaza", radius: 3, strength: 1 },
    effect: "範囲内の満足度が上がり、お店が育ちやすくなる。町全体の商業のお客さんも増える",
    unlockRank: "town",
    removable: true,
    paintable: false,
    color: "#90caf9",
  },
  station: {
    type: "station",
    name: "駅",
    description: "広い範囲の交通量を大きく減らす",
    category: "service",
    emoji: ["", "🚉"],
    cost: 2_500_000,
    upkeep: 150_000,
    jobs: ALL_LEVELS(20),
    coverage: { kind: "transit", radius: 5, strength: 1 },
    effect: "広い範囲で車が大きく減り、渋滞がやわらぐ。町全体の商業のお客さんも増える",
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
    effect: "とても広い範囲の満足度が大きく上がる。町全体の商業のお客さんも増える",
    unlockRank: "metropolis",
    removable: true,
    paintable: false,
    color: "#f48fb1",
  },
  stadium: {
    type: "stadium",
    name: "スタジアム",
    description: "試合の日は大にぎわい。入場料収入と観光客で商業が潤う",
    category: "project",
    emoji: ["🏗️", "🏟️"],
    cost: 8_000_000,
    upkeep: 150_000,
    jobs: ALL_LEVELS(60),
    coverage: { kind: "landmark", radius: 5, strength: 0.7 },
    effect: "範囲内の住宅の満足度が上がる",
    impact: "入場料収入 月¥350,000 / 商業の需要 +200人分 / 周りの満足度UP / 試合の日は交通量が増える",
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
    effect: "広い範囲が学校の範囲になり、満足度が上がる。マンションに育つ条件も満たす",
    impact: "半径8マスが学校の範囲に / 転入しやすさUP / 商業の需要 +150人分",
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
    description: "大都市と直結。通勤客と観光客が一気に増える",
    category: "project",
    emoji: ["🏗️", "🚄"],
    cost: 12_000_000,
    upkeep: 180_000,
    jobs: ALL_LEVELS(40),
    coverage: { kind: "transit", radius: 7, strength: 1 },
    effect: "広い範囲で車が大きく減る。満足度も少し上がる",
    impact: "転入しやすさが大きくUP / 商業 +300人分・工業 +150人分の需要 / 半径7マスの渋滞がやわらぐ",
    unlockRank: "city",
    removable: true,
    paintable: false,
    color: "#42a5f5",
    size: 2,
    buildMonths: 10,
    trips: 30,
    globalEffects: { resAppeal: 0.08, comSupport: 300, indSupport: 150 },
  },
  themePark: {
    type: "themePark",
    name: "テーマパーク",
    description: "遠くからも客が来る一大観光地。そのぶん道路は大混雑",
    category: "project",
    emoji: ["🏗️", "🎢"],
    cost: 16_000_000,
    upkeep: 320_000,
    jobs: ALL_LEVELS(160),
    coverage: { kind: "landmark", radius: 6, strength: 0.8 },
    effect: "範囲内の住宅の満足度が上がる",
    impact: "入場料収入 月¥1,100,000 / 商業の需要 +400人分 / 大量の交通が発生",
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
    description: "世界とつながる玄関口。産業が大きく伸びるが、騒音と公害も大きい",
    category: "project",
    emoji: ["🏗️", "✈️"],
    cost: 25_000_000,
    upkeep: 420_000,
    jobs: ALL_LEVELS(220),
    impact: "工業 +700人分・商業 +400人分の需要 / 転入しやすさUP / 周囲3マスに大きな騒音と公害",
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

export function isProject(type: BuildingType | undefined): boolean {
  return !!type && BUILDINGS[type].category === "project";
}

/** 建設メニューの並び順 */
export const BUILD_ORDER: BuildingType[] = [
  "road",
  "residential",
  "commercial",
  "industrial",
  "park",
  "bigPark",
  "school",
  "hospital",
  "fireStation",
  "avenue",
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
