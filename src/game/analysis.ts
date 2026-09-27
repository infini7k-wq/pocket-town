// 街の分析：各エンジンを順番に呼び出し、現在の状態から派生する値（KPI・マスごとの指標）をまとめて計算する。
// UI とシミュレーションの両方がこの結果を使う。状態は変更しない。

import { BUILDINGS, isRoad } from "./buildings";
import { COM_JOBS, DEMAND, HAPPINESS, IND_JOBS, POPULATION, RES_CAPACITY, WORKFORCE_RATIO } from "./config";
import { computeCoverage, type CoverageMap } from "./coverage";
import { computeBudget } from "./economy";
import { computeEmployment, type Employment } from "./employment";
import { cityEnvironment, computeEnvironment, computeNoise } from "./environment";
import { eraModifiers } from "./eras";
import { sumEffects, type Effects } from "./modifiers";
import { cityHappiness, computeHappiness, type HappinessContext } from "./population";
import { computeRoadNetwork, type RoadNetwork } from "./roads";
import { computeTraffic, type TrafficResult } from "./traffic";
import type { BudgetBreakdown, GameState, Modifier, ZoneType } from "./types";

export interface CityAnalysis {
  net: RoadNetwork;
  coverage: CoverageMap;
  employment: Employment;
  traffic: TrafficResult;
  env: number[];
  noise: number[];
  happiness: number[];
  fx: Effects;
  population: number;
  /** 街全体の満足度（0〜100） */
  cityHappiness: number;
  cityEnvironment: number;
  congestion: number;
  /** 住宅・商業・工業の需要（-100〜100） */
  demand: Record<ZoneType, number>;
  budget: BudgetBreakdown;
  /** 消防の範囲外にある建物の割合 */
  fireRisk: number;
  /** 道路に面していない、または役所につながっていない建物の数 */
  unconnected: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 建設の需要（-100〜100）。0 付近が「足りている」。
 * - 住宅：空き部屋が「何か月分の転入」をまかなえるか（空きが4か月分あれば 0）
 * - 商業・工業：人口が支えられる雇用を、働き手の余力で割り引いた「目標」と比べる
 * 造成中の区画は Lv1 として「予約済み」に数えるので、置いた直後からメーターが下がる。
 */
export function computeDemand(state: GameState, emp: Employment, happiness: number, fx: Effects): Record<ZoneType, number> {
  const u = emp.unemployment;
  let pendingRes = 0;
  let pendingCom = 0;
  let pendingInd = 0;
  for (const t of state.tiles) {
    const b = t.building;
    if (!b || b.level !== 0) continue;
    if (b.type === "residential") pendingRes += RES_CAPACITY[1];
    else if (b.type === "commercial") pendingCom += COM_JOBS[1];
    else if (b.type === "industrial") pendingInd += IND_JOBS[1];
  }
  const pop = emp.population;
  const workers = emp.workers;
  const jobRoom = (emp.jobs + pendingCom + pendingInd - workers) / WORKFORCE_RATIO;
  const mood = clamp((happiness - 35) / 45, 0, 1.2);
  const inflow = Math.max(0, jobRoom * POPULATION.jobInflowShare + (pop * POPULATION.baselineInflow + 8) * mood);
  const vacant = Math.max(0, emp.housingCapacity + pendingRes - pop);
  // 空き部屋が「転入の何か月分」あるか。転入がほとんどない町で急に振り切れないよう、分母に下限を設ける
  const need = inflow * DEMAND.vacancyMonths;
  const vacancyTerm = inflow < 1 ? -60 * Math.min(1, vacant / 20) : (60 * (need - vacant)) / Math.max(need, 20);
  const residential =
    vacancyTerm +
    (state.profile.resAppeal + fx.resAppeal) * 60 -
    Math.max(0, u - 0.08) * 150 -
    (state.taxes.residential - HAPPINESS.taxNeutral) * 3;
  // 働き手が足りない分は、お店や工場を建てても埋まらないので目標から割り引く
  const room = workers <= 0 ? 0 : clamp(((1 + DEMAND.jobHeadroom) * workers - emp.serviceJobs) / Math.max(1, emp.comSupport + emp.indSupport), 0.4, 1);
  const targetCom = room * emp.comSupport;
  const targetInd = room * emp.indSupport;
  const commercial = ((targetCom - emp.comJobs - pendingCom) / Math.max(targetCom, 30)) * 120 + Math.max(0, u - 0.05) * 100;
  const industrial = ((targetInd - emp.indJobs - pendingInd) / Math.max(targetInd, 30)) * 120 + Math.max(0, u - 0.05) * 120;
  return {
    residential: Math.round(clamp(residential, -100, 100)),
    commercial: Math.round(clamp(commercial, -100, 100)),
    industrial: Math.round(clamp(industrial, -100, 100)),
  };
}

/** 需要メーターの表示段階（UI・おすすめで共通に使う） */
export function demandLevel(v: number): { label: string; tone: "high" | "some" | "ok" | "spare" } {
  if (v > DEMAND.high) return { label: "不足", tone: "high" };
  if (v > DEMAND.some) return { label: "少し不足", tone: "some" };
  if (v >= DEMAND.spare) return { label: "足りている", tone: "ok" };
  return { label: "空きあり", tone: "spare" };
}

/** 完成して道路につながっている大型プロジェクトの、街全体への効果 */
export function projectModifiers(state: GameState, net: RoadNetwork): Modifier[] {
  const out: Modifier[] = [];
  state.tiles.forEach((t, i) => {
    const b = t.building;
    const def = b ? BUILDINGS[b.type] : undefined;
    if (!b || !def?.globalEffects || b.level === 0 || !net.roadAccess[i]) return;
    out.push({ id: `project:${i}`, label: def.name, emoji: def.emoji[1], turnsLeft: 1, effects: def.globalEffects });
  });
  return out;
}

export function analyzeCity(state: GameState): CityAnalysis {
  const net = computeRoadNetwork(state);
  const fx = sumEffects([...state.modifiers, ...eraModifiers(state), ...projectModifiers(state, net)]);
  const coverage = computeCoverage(state, net);
  const employment = computeEmployment(state, net, fx);
  const traffic = computeTraffic(state, employment, coverage, fx);
  const env = computeEnvironment(state, coverage, traffic, fx);
  const noise = computeNoise(state, fx);
  const ctx: HappinessContext = {
    net,
    coverage,
    env,
    noise,
    trafficLevel: traffic.level,
    congestion: traffic.congestion,
    employment,
    fx,
  };
  const happiness = computeHappiness(state, ctx);
  const cityH = cityHappiness(state, happiness);

  let buildings = 0;
  let uncovered = 0;
  let unconnected = 0;
  state.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || isRoad(b.type)) return;
    buildings++;
    if (coverage.fire[i] < 0.1) uncovered++;
    if (BUILDINGS[b.type].category !== "special" && !net.connected[i]) unconnected++;
  });

  return {
    net,
    coverage,
    employment,
    traffic,
    env,
    noise,
    happiness,
    fx,
    population: employment.population,
    cityHappiness: cityH,
    cityEnvironment: cityEnvironment(state, env),
    congestion: traffic.congestion,
    demand: computeDemand(state, employment, cityH, fx),
    budget: computeBudget(state, { employment, connected: net.connected, trafficLevel: traffic.level, fx }),
    fireRisk: buildings ? uncovered / buildings : 0,
    unconnected,
  };
}

export function happinessContext(a: CityAnalysis): HappinessContext {
  return {
    net: a.net,
    coverage: a.coverage,
    env: a.env,
    noise: a.noise,
    trafficLevel: a.traffic.level,
    congestion: a.congestion,
    employment: a.employment,
    fx: a.fx,
  };
}
