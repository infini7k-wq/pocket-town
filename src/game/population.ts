// 人口エンジン：マスごとの満足度と、それに基づく転入・転出を計算する。

import { capacityAt } from "./buildings";
import { DISCONNECTED_FACTOR, HAPPINESS, POPULATION, WORKFORCE_RATIO } from "./config";
import type { CoverageMap } from "./coverage";
import type { Employment } from "./employment";
import { nearTerrain } from "./map";
import type { Effects } from "./modifiers";
import type { Rng } from "./rng";
import type { RoadNetwork } from "./roads";
import { adjacentTraffic, type TrafficLevel } from "./traffic";
import type { GameState, TendencyId } from "./types";

export interface HappinessContext {
  net: RoadNetwork;
  coverage: CoverageMap;
  env: number[];
  noise: number[];
  trafficLevel: TrafficLevel[];
  congestion: number;
  employment: Employment;
  fx: Effects;
}

export interface HappinessFactor {
  label: string;
  value: number;
}

/** 住民の傾向による効果の倍率 */
export const TENDENCY_WEIGHTS: Record<TendencyId, { education: number; health: number; env: number; park: number }> = {
  families: { education: 1.6, health: 1, env: 1, park: 1.2 },
  elderly: { education: 0.6, health: 1.6, env: 1, park: 1 },
  eco: { education: 1, health: 1, env: 1.6, park: 1.3 },
  balanced: { education: 1, health: 1, env: 1, park: 1 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 街全体に共通する満足度の要因（失業・税・渋滞・財政・イベント） */
export function cityWideFactors(state: GameState, ctx: HappinessContext): HappinessFactor[] {
  const out: HappinessFactor[] = [];
  const u = ctx.employment.unemployment;
  if (ctx.employment.population > 0 && u > 0.02) {
    out.push({ label: "失業", value: -Math.min(HAPPINESS.unemploymentCap, u * HAPPINESS.unemploymentWeight) });
  }
  const tax = -(state.taxes.residential - HAPPINESS.taxNeutral) * HAPPINESS.taxWeight;
  if (Math.abs(tax) >= 0.5) out.push({ label: tax > 0 ? "税金が安い" : "税金が高い", value: tax });
  if (ctx.congestion > 5) out.push({ label: "街の渋滞", value: -(ctx.congestion / 100) * HAPPINESS.congestionWeight });
  if (state.money < 0) out.push({ label: "財政不安", value: -HAPPINESS.debtPenalty });
  if (ctx.fx.happiness) out.push({ label: "イベント", value: ctx.fx.happiness });
  return out;
}

/** マスごとの満足度の内訳 */
export function happinessFactors(state: GameState, i: number, ctx: HappinessContext, cityWide?: HappinessFactor[]): HappinessFactor[] {
  const base = TENDENCY_WEIGHTS[state.profile.tendency];
  // 住民の傾向と「時代」によって、学校・病院・環境・公園の重みが変わる
  const w = {
    education: base.education * (1 + ctx.fx.eduWeight),
    health: base.health * (1 + ctx.fx.healthWeight),
    env: base.env * (1 + ctx.fx.envWeight),
    park: base.park * (1 + ctx.fx.parkWeight),
  };
  const c = ctx.coverage;
  const out: HappinessFactor[] = [];
  const add = (label: string, value: number) => {
    if (Math.abs(value) >= 0.5) out.push({ label, value });
  };
  add("公園", c.park[i] * HAPPINESS.park * w.park);
  add("学校", c.education[i] * HAPPINESS.education * w.education);
  add("病院", c.health[i] * HAPPINESS.health * w.health);
  add("消防", c.fire[i] * HAPPINESS.fire);
  add("買い物", c.shopping[i] * HAPPINESS.shopping);
  add("広場", c.plaza[i] * HAPPINESS.plaza);
  add("公共交通", c.transit[i] * HAPPINESS.transit);
  add("シンボル", c.landmark[i] * HAPPINESS.landmark);
  add("環境", (ctx.env[i] - 60) * HAPPINESS.envWeight * w.env);
  if (nearTerrain(state, i, "water", 2) > 0) add("水辺の景色", HAPPINESS.waterView);
  add("騒音", -Math.min(HAPPINESS.noiseCap, ctx.noise[i]));
  const t = adjacentTraffic(state, i, ctx.trafficLevel);
  if (t === 3) add("渋滞", -HAPPINESS.trafficHigh);
  else if (t === 2) add("交通量", -HAPPINESS.trafficMedium);
  if (ctx.net.roadAccess[i] && !ctx.net.connected[i]) add("役所まで道路がない", -HAPPINESS.disconnected);
  out.push(...(cityWide ?? cityWideFactors(state, ctx)));
  return out;
}

export function computeHappiness(state: GameState, ctx: HappinessContext): number[] {
  const cityWide = cityWideFactors(state, ctx);
  return state.tiles.map((t, i) => {
    if (t.terrain === "water") return 0;
    const sum = happinessFactors(state, i, ctx, cityWide).reduce((a, f) => a + f.value, HAPPINESS.base);
    return clamp(sum, 0, 100);
  });
}

/** 住民数で重み付けした街全体の満足度 */
export function cityHappiness(state: GameState, happiness: number[]): number {
  let sum = 0;
  let weight = 0;
  let plain = 0;
  let count = 0;
  state.tiles.forEach((t, i) => {
    if (t.building?.type !== "residential") return;
    sum += happiness[i] * t.building.occupants;
    weight += t.building.occupants;
    plain += happiness[i];
    count++;
  });
  if (weight > 0) return Math.round(sum / weight);
  return count ? Math.round(plain / count) : 50;
}

export interface MigrationContext {
  net: RoadNetwork;
  happiness: number[];
  employment: Employment;
  fx: Effects;
}

/** 住宅1マスの定員（道路条件込み） */
export function effectiveCapacity(state: GameState, i: number, net: RoadNetwork): number {
  const b = state.tiles[i].building;
  if (!b || b.type !== "residential" || b.abandoned || !net.roadAccess[i]) return 0;
  return capacityAt("residential", b.level) * (net.connected[i] ? 1 : DISCONNECTED_FACTOR);
}

/** 住宅1マスが目指す居住者数（住みやすさで決まる。仕事の有無は街全体の転入枠で扱う） */
export function residentialTarget(state: GameState, i: number, ctx: MigrationContext): number {
  const cap = effectiveCapacity(state, i, ctx.net);
  if (cap === 0) return 0;
  const desirability = clamp((ctx.happiness[i] - 30) / 50, 0, 1);
  const appeal = state.profile.resAppeal + ctx.fx.resAppeal;
  return clamp(cap * (0.35 + 0.65 * desirability + appeal), 0, cap);
}

/** 今月、街全体で受け入れられる転入者数（仕事の空きが多いほど増える） */
export function inflowBudget(ctx: MigrationContext, population: number, avgHappiness: number): number {
  const emp = ctx.employment;
  const jobRoom = (emp.jobs - emp.workers) / WORKFORCE_RATIO;
  const mood = clamp((avgHappiness - 35) / 45, 0, 1.2);
  const baseline = (population * POPULATION.baselineInflow + 8) * mood;
  return Math.max(0, jobRoom * POPULATION.jobInflowShare + baseline);
}

/** 失業者のうち、今月街を出ていく人数 */
export function unemploymentOutflow(ctx: MigrationContext): number {
  const emp = ctx.employment;
  const excess = Math.max(0, emp.unemployment - POPULATION.unemploymentTolerance) * emp.workers;
  return (excess / WORKFORCE_RATIO) * POPULATION.unemployedLeaveRate;
}

export interface MigrationResult {
  inflow: number;
  outflow: number;
}

/** 転入・転出を反映する（draft を直接更新する） */
export function migrate(draft: GameState, ctx: MigrationContext, rng: Rng): MigrationResult {
  let inflow = 0;
  let outflow = 0;
  const pop = ctx.employment.population;
  const homes: Array<{ i: number; cap: number; target: number }> = [];
  let weighted = 0;
  draft.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || b.type !== "residential") return;
    const cap = effectiveCapacity(draft, i, ctx.net);
    if (cap === 0) {
      // 住めない住宅からは全員が出ていく
      outflow += b.occupants;
      b.occupants = 0;
      return;
    }
    homes.push({ i, cap, target: residentialTarget(draft, i, ctx) });
    weighted += ctx.happiness[i] * Math.max(1, b.occupants);
  });
  const occTotal = homes.reduce((a, h) => a + Math.max(1, draft.tiles[h.i].building!.occupants), 0);
  const avgHappiness = occTotal > 0 ? weighted / occTotal : 50;

  // 空きの合計に対して、街全体の転入枠を配分する
  const budget = inflowBudget(ctx, pop, avgHappiness);
  const gaps = homes.map((h) => {
    const occ = draft.tiles[h.i].building!.occupants;
    return Math.max(0, Math.min(h.target - occ, h.cap * POPULATION.maxFillRate + 2));
  });
  const totalGap = gaps.reduce((a, g) => a + g, 0);
  const fill = totalGap > 0 ? Math.min(1, budget / totalGap) : 0;
  const jobless = pop > 0 ? unemploymentOutflow(ctx) / pop : 0;

  homes.forEach((h, k) => {
    const b = draft.tiles[h.i].building!;
    const churnRate = POPULATION.churnBase + Math.max(0, 50 - ctx.happiness[h.i]) / 1000 + jobless;
    const churn = Math.round(b.occupants * churnRate * (0.6 + rng.next() * 0.8));
    let moveIn = Math.round(gaps[k] * fill * (0.7 + rng.next() * 0.3));
    let moveOut = churn;
    // 目標を超えている住宅からは少しずつ出ていく
    if (b.occupants - churn > h.target) moveOut += Math.round((b.occupants - churn - h.target) * POPULATION.leaveRate);
    // 入れ替わりで空いた分は、住みやすければ埋まる
    if (gaps[k] > 0) moveIn += Math.round(Math.min(churn, gaps[k]) * fill);
    const occ = clamp(b.occupants + moveIn - moveOut, 0, Math.floor(h.cap));
    // 定員で頭打ちになった分を差し引き、転入 − 転出 = 実際の増減 になるように記録
    const delta = occ - b.occupants;
    if (delta >= 0) moveIn = delta + moveOut;
    else moveOut = moveIn - delta;
    inflow += moveIn;
    outflow += moveOut;
    b.occupants = occ;
  });
  return { inflow, outflow };
}
