// 町の個性（ニューゲーム時にランダムで決まる）。

import type { Rng } from "./rng";
import type { TendencyId, TownProfile, TraitId } from "./types";

export interface TraitDef {
  id: TraitId;
  name: string;
  /** 選択ボタン用の短い名前 */
  short: string;
  emoji: string;
  description: string;
  comDemand: number;
  indDemand: number;
  resAppeal: number;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  coastal: {
    id: "coastal",
    short: "海沿い",
    name: "海沿いの町",
    emoji: "🌊",
    description: "海が見える住宅は人気。観光客で商業も少し強い。台風には注意",
    comDemand: 1.15,
    indDemand: 0.95,
    resAppeal: 0.04,
  },
  industrial: {
    id: "industrial",
    short: "工業",
    name: "工業の町",
    emoji: "🏭",
    description: "工場の注文が多く雇用を作りやすい。そのぶん環境には気を配りたい",
    comDemand: 0.95,
    indDemand: 1.4,
    resAppeal: 0,
  },
  suburban: {
    id: "suburban",
    short: "郊外",
    name: "郊外住宅地",
    emoji: "🌳",
    description: "緑が多く住宅が人気。工場の需要は少なめ",
    comDemand: 1.05,
    indDemand: 0.75,
    resAppeal: 0.08,
  },
  merchant: {
    id: "merchant",
    short: "商店街",
    name: "商店街の町",
    emoji: "🏮",
    description: "昔ながらの商店街があり、商業需要が高い",
    comDemand: 1.35,
    indDemand: 0.9,
    resAppeal: 0.02,
  },
};

export interface TendencyDef {
  id: TendencyId;
  name: string;
  emoji: string;
  description: string;
}

export const TENDENCIES: Record<TendencyId, TendencyDef> = {
  families: { id: "families", name: "子育て世代が多い", emoji: "👨‍👩‍👧", description: "学校と公園の効果が大きい" },
  elderly: { id: "elderly", name: "お年寄りが多い", emoji: "👵", description: "病院の効果が大きい" },
  eco: { id: "eco", name: "環境意識が高い", emoji: "🍃", description: "環境と公園の効果が大きい" },
  balanced: { id: "balanced", name: "いろいろな世代", emoji: "🧑‍🤝‍🧑", description: "特にかたよりはない" },
};

export const TRAIT_IDS: TraitId[] = ["coastal", "industrial", "suburban", "merchant"];
export const TENDENCY_IDS: TendencyId[] = ["families", "elderly", "eco", "balanced"];

/**
 * 町の個性ごとの、住民の傾向の出やすさ（合計100）。
 * 例：郊外住宅地は子育て世代、商店街や漁港はお年寄りが多い。どの組み合わせも出るが、不自然なものは出にくい。
 */
export const TENDENCY_ODDS: Record<TraitId, Record<TendencyId, number>> = {
  coastal: { families: 20, elderly: 35, eco: 20, balanced: 25 },
  industrial: { families: 33, elderly: 20, eco: 12, balanced: 35 },
  suburban: { families: 45, elderly: 15, eco: 25, balanced: 15 },
  merchant: { families: 15, elderly: 38, eco: 12, balanced: 35 },
};

/** 個性に合わせて住民の傾向を重み付きで選ぶ（乱数は必ず1回だけ使う） */
export function pickTendency(rng: Rng, trait: TraitId): TendencyId {
  const odds = TENDENCY_ODDS[trait];
  let r = rng.next() * TENDENCY_IDS.reduce((sum, id) => sum + odds[id], 0);
  for (const id of TENDENCY_IDS) {
    r -= odds[id];
    if (r < 0) return id;
  }
  return "balanced";
}

/** 個性と住民の傾向を合わせた、町のひとこと紹介 */
const TOWN_STORIES: Record<TraitId, Record<TendencyId, string>> = {
  coastal: {
    families: "港町。浜辺で遊ぶ子どもの声がにぎやか",
    elderly: "漁港の町。お年寄りが多く、のんびりした暮らし",
    eco: "海を守る町。ビーチ清掃が住民の誇り",
    balanced: "港町。漁師も若者も観光客も行き交う",
  },
  industrial: {
    families: "工場の町。若い工員の家族が増えている",
    elderly: "かつて工場で栄えた町。退職した職人さんが多く暮らす",
    eco: "昔の公害を反省した町。住民は空気の汚れに敏感",
    balanced: "ものづくりの町。三世代が工場とともに暮らす",
  },
  suburban: {
    families: "ニュータウン。ベビーカーが並ぶ緑の住宅地",
    elderly: "開発から50年の住宅地。住民もいっしょに歳を重ねた",
    eco: "雑木林を残した住宅地。自然を愛する人が集まる",
    balanced: "緑の住宅地。いろいろな世代が暮らす",
  },
  merchant: {
    families: "商店街の町。駄菓子屋に子どもが集まる",
    elderly: "昔ながらの商店街。なじみ客のお年寄りでにぎわう",
    eco: "量り売りやマイバッグが当たり前の商店街",
    balanced: "老舗と新しい店が並ぶ、活気ある商店街",
  },
};

export function townStory(trait: TraitId, tendency: TendencyId): string {
  return TOWN_STORIES[trait][tendency];
}

/** 難しめの組み合わせ（工場の強みと、環境を気にする住民がぶつかる） */
export function isHardCombo(trait: TraitId, tendency: TendencyId): boolean {
  return trait === "industrial" && tendency === "eco";
}

export function landValueLabel(v: number): string {
  if (v >= 1.12) return "高い";
  if (v <= 0.93) return "安い";
  return "ふつう";
}

export function demandLabel(v: number): string {
  if (v >= 1.2) return "とても高い";
  if (v >= 1.05) return "高い";
  if (v <= 0.8) return "低い";
  return "ふつう";
}

export function profileSummary(p: TownProfile): Array<{ label: string; value: string }> {
  return [
    { label: "地価", value: landValueLabel(p.landValue) },
    { label: "お店の出やすさ", value: demandLabel(p.comDemand) },
    { label: "工場の注文", value: demandLabel(p.indDemand) },
    { label: "住民", value: `${TENDENCIES[p.tendency].emoji} ${TENDENCIES[p.tendency].name}` },
  ];
}
