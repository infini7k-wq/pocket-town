// 街の分析：各エンジンを順番に呼び出し、現在の状態から派生する値（KPI・マスごとの指標）をまとめて計算する。
// UI とシミュレーションの両方がこの結果を使う。状態は変更しない。

import { BUILDINGS, isRoad } from "./buildings";
import { HAPPINESS } from "./config";
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

export function computeDemand(state: GameState, emp: Employment, happiness: number, fx: Effects): Record<ZoneType, number> {
  const u = emp.unemployment;
  const openJobs = (emp.jobs - emp.filled) / Math.max(emp.workers, 50);
  const shortage = Math.max(0, 0.9 - emp.jobFillRate) * 150;
  const residential =
    openJobs * 120 +
    (happiness - 55) * 1.2 -
    emp.vacancyRate * 150 +
    10 +
    (state.profile.resAppeal + fx.resAppeal) * 60 -
    Math.max(0, u - 0.08) * 150 -
    (state.taxes.residential - HAPPINESS.taxNeutral) * 3;
  const commercial = ((emp.comSupport - emp.comJobs) / Math.max(emp.comSupport, 30)) * 120 + Math.max(0, u - 0.05) * 100 - shortage;
  const industrial = ((emp.indSupport - emp.indJobs) / Math.max(emp.indSupport, 30)) * 120 + Math.max(0, u - 0.05) * 120 - shortage;
  return {
    residential: Math.round(clamp(residential, -100, 100)),
    commercial: Math.round(clamp(commercial, -100, 100)),
    industrial: Math.round(clamp(industrial, -100, 100)),
  };
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
