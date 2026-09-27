// 時代の転換：5〜7年ごとに社会の流れが変わり、需要や住民の好みが大きく変わる。
// 1年前に予告されるので、プレイヤーは街を作り変えて備える。

import { ERAS, NEWS_LIMIT } from "./config";
import type { Rng } from "./rng";
import type { EraState, GameState, Modifier, ModifierEffects, NewsItem } from "./types";

export interface EraDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** 備え方のヒント */
  tips: string[];
  effects: ModifierEffects;
  /** 次の時代として選ばれやすさ */
  weight: number;
}

export const ERA_DEFS: EraDef[] = [
  {
    id: "growth",
    name: "高度成長",
    emoji: "🏭",
    description: "工場の注文が多く、仕事をつくりやすい時代。",
    tips: ["工業を増やして働く場所をつくろう", "工場は住宅から3マス以上はなそう"],
    effects: { indDemand: 0.2, comDemand: 0.05 },
    weight: 0.6,
  },
  {
    id: "postIndustrial",
    name: "脱工業化",
    emoji: "🔄",
    description: "工場の注文が激減し、オフィスやお店が求められる時代。古い工場は衰退しやすい。",
    tips: ["工場を減らし、商業（オフィス）に建て替えよう", "工場のあった場所を公園にすると環境もよくなる"],
    effects: { indDemand: -0.4, comDemand: 0.3, envWeight: 0.4 },
    weight: 1,
  },
  {
    id: "digital",
    name: "IT革命",
    emoji: "💻",
    description: "オフィスが求められ、学校の近くの住宅が大人気になる時代。",
    tips: ["商業を増やしてオフィス街をつくろう", "学校・大学の範囲を広げると住宅が育つ"],
    effects: { comDemand: 0.35, eduWeight: 0.8, resAppeal: 0.02 },
    weight: 1,
  },
  {
    id: "aging",
    name: "高齢化",
    emoji: "👴",
    description: "病院の大切さが増し、引っ越してくる人が減る時代。税収も少し下がる。",
    tips: ["病院の範囲を街全体に広げよう", "公共交通で暮らしやすく"],
    effects: { healthWeight: 0.8, resAppeal: -0.05, taxIncome: -0.06 },
    weight: 1,
  },
  {
    id: "green",
    name: "エコ",
    emoji: "🌿",
    description: "空気のきれいな場所が人気になり、工場の近くは嫌われる時代。",
    tips: ["公園を増やし、工場を住宅から遠ざけよう", "ソーラーパネルなど環境のイベントに乗ろう"],
    effects: { envWeight: 0.8, parkWeight: 0.5, indDemand: -0.15 },
    weight: 1,
  },
  {
    id: "tourism",
    name: "観光ブーム",
    emoji: "📸",
    description: "観光客が押し寄せ、商業が潤う時代。公園や広場のある街が人気。",
    tips: ["商業と広場を増やそう", "スタジアムやテーマパークが大活躍"],
    effects: { comDemand: 0.2, parkWeight: 0.3, resAppeal: 0.03 },
    weight: 0.9,
  },
  {
    id: "babyBoom",
    name: "子育てブーム",
    emoji: "👶",
    description: "若い家族が増え、住宅・学校・公園が求められる時代。",
    tips: ["住宅を増やして受け入れよう", "学校と公園の範囲を広げよう"],
    effects: { resAppeal: 0.07, eduWeight: 0.5, parkWeight: 0.3 },
    weight: 0.9,
  },
  {
    id: "stagnation",
    name: "低成長",
    emoji: "📉",
    description: "どこも不景気で、税収も需要も伸びにくい時代。",
    tips: ["むだな施設を減らして支出を見直そう", "満足度を高く保てば人は出ていかない"],
    effects: { taxIncome: -0.08, comDemand: -0.1, indDemand: -0.1 },
    weight: 0.5,
  },
];

export const FIRST_ERA = "growth";

export function getEra(id: string): EraDef {
  return ERA_DEFS.find((e) => e.id === id) ?? ERA_DEFS[0];
}

/** ニューゲーム時の時代（最初の転換は firstLength か月後） */
export function initialEra(rng: Rng): EraState {
  return { id: FIRST_ERA, since: 0, next: { id: pickNextEra(FIRST_ERA, null, rng), turn: ERAS.firstLength, announced: false } };
}

export function pickNextEra(current: string, previous: string | null, rng: Rng): string {
  const pool = ERA_DEFS.filter((e) => e.id !== current && e.id !== previous);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng.next() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e.id;
  }
  return pool[pool.length - 1].id;
}

/** 分析で使う、いまの時代の効果 */
export function eraModifiers(state: Pick<GameState, "era">): Modifier[] {
  const e = getEra(state.era.id);
  return [{ id: "era", label: `${e.name}の時代`, emoji: e.emoji, turnsLeft: 1, effects: e.effects }];
}

/** 次の時代まであと何か月か（予告前は null） */
export function monthsToNextEra(state: Pick<GameState, "era" | "turn">): number | null {
  const next = state.era.next;
  if (!next || !next.announced) return null;
  return Math.max(0, next.turn - state.turn);
}

export function describeEffects(fx: ModifierEffects): string[] {
  const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  const out: string[] = [];
  if (fx.indDemand) out.push(`工場の注文 ${pct(fx.indDemand)}`);
  if (fx.comDemand) out.push(`お店の客 ${pct(fx.comDemand)}`);
  if (fx.resAppeal) out.push(fx.resAppeal > 0 ? "引っ越してくる人が増える" : "引っ越してくる人が減る");
  if (fx.taxIncome) out.push(`税収 ${pct(fx.taxIncome)}`);
  if (fx.eduWeight) out.push(`学校の効果 ${pct(fx.eduWeight)}`);
  if (fx.healthWeight) out.push(`病院の効果 ${pct(fx.healthWeight)}`);
  if (fx.envWeight) out.push(`空気のきれいさの影響 ${pct(fx.envWeight)}`);
  if (fx.parkWeight) out.push(`公園の効果 ${pct(fx.parkWeight)}`);
  return out;
}

function pushNews(s: GameState, item: NewsItem) {
  s.news = [item, ...s.news].slice(0, NEWS_LIMIT);
}

/** 時代の予告・転換を進める（draft を直接更新）。転換したら新しい時代の id を返す */
export function advanceEra(draft: GameState, rng: Rng): string | null {
  const next = draft.era.next;
  if (!next) {
    draft.era.next = { id: pickNextEra(draft.era.id, null, rng), turn: draft.turn + ERAS.minLength, announced: false };
    return null;
  }
  if (!next.announced && draft.turn >= next.turn - ERAS.noticeMonths) {
    next.announced = true;
    const e = getEra(next.id);
    pushNews(draft, {
      turn: draft.turn,
      emoji: "📢",
      title: `予告：${Math.max(1, next.turn - draft.turn)}か月後に「${e.name}の時代」へ`,
      body: `${e.description} 備え：${e.tips.join("／")}`,
      tone: "neutral",
    });
  }
  if (draft.turn >= next.turn) {
    const previous = draft.era.id;
    const length = rng.int(ERAS.minLength, ERAS.maxLength);
    draft.era = { id: next.id, since: draft.turn, next: { id: pickNextEra(next.id, previous, rng), turn: draft.turn + length, announced: false } };
    const e = getEra(next.id);
    pushNews(draft, { turn: draft.turn, emoji: e.emoji, title: `「${e.name}の時代」がはじまった`, body: `${e.description} ${describeEffects(e.effects).join("・")}`, tone: "neutral" });
    return next.id;
  }
  return null;
}
