// 町の個性（ニューゲーム時にランダムで決まる）。

import type { TendencyId, TownProfile, TraitId } from "./types";

export interface TraitDef {
  id: TraitId;
  name: string;
  emoji: string;
  description: string;
  comDemand: number;
  indDemand: number;
  resAppeal: number;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  coastal: {
    id: "coastal",
    name: "海沿いの町",
    emoji: "🌊",
    description: "海が見える住宅は人気。観光客で商業も少し強い。台風には注意",
    comDemand: 1.15,
    indDemand: 0.95,
    resAppeal: 0.04,
  },
  industrial: {
    id: "industrial",
    name: "工業の町",
    emoji: "🏭",
    description: "工場の注文が多く雇用を作りやすい。そのぶん環境には気を配りたい",
    comDemand: 0.95,
    indDemand: 1.4,
    resAppeal: 0,
  },
  suburban: {
    id: "suburban",
    name: "郊外住宅地",
    emoji: "🌳",
    description: "緑が多く住宅が人気。工場の需要は少なめ",
    comDemand: 1.05,
    indDemand: 0.75,
    resAppeal: 0.08,
  },
  merchant: {
    id: "merchant",
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
    { label: "商業需要", value: demandLabel(p.comDemand) },
    { label: "工業需要", value: demandLabel(p.indDemand) },
    { label: "住民", value: `${TENDENCIES[p.tendency].emoji} ${TENDENCIES[p.tendency].name}` },
  ];
}
