// 地価：場所ごとの「土地の人気」（0〜100）。公園・駅・水辺・大型施設の近くで上がり、騒音・汚れ・渋滞で下がる。
// 住宅税と商業税に効く（地価の高い場所ほど税収が多い）。毎回の分析で計算する（保存はしない）。

import { BUILDINGS } from "./buildings";
import type { CoverageMap } from "./coverage";
import { forEachInRange, nearTerrain } from "./map";
import type { RoadNetwork } from "./roads";
import { adjacentTraffic, type TrafficLevel } from "./traffic";
import type { GameState } from "./types";

export const LAND = {
  base: 35,
  /** 大型プロジェクトの近く（このマス数以内）は地価が上がる */
  projectRange: 6,
  /** 税収の倍率：地価0で ×min、100で ×max */
  taxMin: 0.85,
  taxMax: 1.15,
};

export interface LandValueContext {
  net: RoadNetwork;
  coverage: CoverageMap;
  env: number[];
  noise: number[];
  trafficLevel: TrafficLevel[];
  ride: Float32Array;
}

/** 地価の内訳（マスの詳細で「なぜ高い・安いか」を見せる） */
export function landValueFactors(state: GameState, i: number, ctx: LandValueContext, nearProjects?: Uint8Array): Array<{ label: string; value: number }> {
  const c = ctx.coverage;
  const out: Array<{ label: string; value: number }> = [];
  const add = (label: string, value: number) => {
    if (Math.abs(value) >= 0.5) out.push({ label, value });
  };
  add("公園", Math.min(1.3, c.park[i]) * 10);
  add("学校・病院・消防", c.education[i] * 5 + c.health[i] * 4 + c.fire[i] * 3);
  add("買い物・広場", c.shopping[i] * 7 + c.plaza[i] * 5);
  add("シンボル", c.landmark[i] * 8);
  add("駅・バス", Math.max(c.transit[i], ctx.ride[i]) * 8 + ctx.ride[i] * 8);
  if (nearTerrain(state, i, "water", 2) > 0) add("水辺", 8);
  if ((nearProjects ?? projectArea(state))[i]) add("大型施設の近く", 8);
  add("空気", (ctx.env[i] - 60) * 0.35);
  add("騒音", -Math.min(20, ctx.noise[i]) * 0.6);
  const t = adjacentTraffic(state, i, ctx.trafficLevel);
  if (t === 3) add("渋滞", -8);
  else if (t === 2) add("交通量", -3);
  if (!ctx.net.roadAccess[i]) add("道路に面していない", -8);
  return out;
}

/** 完成した大型プロジェクトの近くのマス（1 = 近い） */
export function projectArea(state: GameState): Uint8Array {
  const area = new Uint8Array(state.tiles.length);
  state.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || BUILDINGS[b.type].category !== "project" || b.level === 0) return;
    forEachInRange(i, BUILDINGS[b.type].size ?? 1, LAND.projectRange, state.width, state.height, (j) => (area[j] = 1));
  });
  return area;
}

export function computeLandValue(state: GameState, ctx: LandValueContext): number[] {
  const area = projectArea(state);
  return state.tiles.map((t, i) => {
    if (t.terrain === "water" && !t.building) return 0;
    const v = LAND.base + landValueFactors(state, i, ctx, area).reduce((s, f) => s + f.value, 0);
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

/** 地価による税収の倍率（地価50で ×1.0） */
export function landTaxFactor(v: number): number {
  return LAND.taxMin + ((LAND.taxMax - LAND.taxMin) * v) / 100;
}

/** 地価の段階（表示用） */
export function landValueLevel(v: number): { label: string; stars: number } {
  if (v >= 70) return { label: "とても高い", stars: 4 };
  if (v >= 50) return { label: "高い", stars: 3 };
  if (v >= 30) return { label: "ふつう", stars: 2 };
  return { label: "安い", stars: 1 };
}
