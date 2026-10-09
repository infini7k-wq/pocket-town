// 財政エンジン：税収・維持費・利息を計算する。

import { policyState, totalPolicyUpkeep } from "./policies";
import { RAIL } from "./rail";
import { BUILDINGS, isRoad } from "./buildings";
import { ECONOMY, TRAFFIC } from "./config";
import type { Employment } from "./employment";
import type { Effects } from "./modifiers";
import { adjacentTraffic, type TrafficLevel } from "./traffic";
import type { BudgetBreakdown, GameState } from "./types";

const round100 = (v: number) => Math.round(v / 100) * 100;

export interface BudgetContext {
  employment: Employment;
  /** 役所まで道路でつながっているか（施設収入の判定用） */
  connected: boolean[];
  trafficLevel: TrafficLevel[];
  fx: Effects;
  /** 電車の乗客（1か月あたり） */
  riders?: number;
}

/** 住民1人あたりの住宅税（月額） */
export function residentialTaxPerCapita(rate: number, employmentRate: number): number {
  const share = employmentRate + (1 - employmentRate) * ECONOMY.unemployedTaxShare;
  return ECONOMY.resTaxUnit * rate * share;
}

/** 行政サービス費（ゴミ収集・福祉など）。人口が増えるほど1人あたりの費用も増える */
export function adminCost(population: number): number {
  return population * Math.min(ECONOMY.adminCap, ECONOMY.adminBase + population / ECONOMY.adminDivisor);
}

/** 渋滞している道路に面した商業・工業は効率が落ちる */
export function congestionEfficiency(state: GameState, i: number, trafficLevel: TrafficLevel[]): number {
  return adjacentTraffic(state, i, trafficLevel) === 3 ? TRAFFIC.congestedEfficiency : 1;
}

export function computeBudget(state: GameState, ctx: BudgetContext): BudgetBreakdown {
  const emp = ctx.employment;
  const taxMult = Math.max(0, 1 + ctx.fx.taxIncome);
  let commercial = 0;
  let industrial = 0;
  let roads = 0;
  let services = 0;
  let facilities = 0;

  state.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b) return;
    const def = BUILDINGS[b.type];
    const building = def.category === "project" && b.level === 0; // 建設中の大型施設は維持費なし
    // 道路・線路の維持費（踏切は道路と線路の両方）
    if (isRoad(b.type) || b.type === "rail") roads += def.upkeep + (b.rail ? BUILDINGS.rail.upkeep : 0);
    else if (!building) services += def.upkeep;
    if (def.revenue && b.level > 0 && ctx.connected[i]) facilities += def.revenue;
    if (b.type === "commercial") {
      commercial += emp.workersAt[i] * ECONOMY.comTaxUnit * state.taxes.commercial * congestionEfficiency(state, i, ctx.trafficLevel);
    } else if (b.type === "industrial") {
      industrial += emp.workersAt[i] * ECONOMY.indTaxUnit * state.taxes.industrial * congestionEfficiency(state, i, ctx.trafficLevel);
    }
  });
  // 電車の運賃（公共交通無料化の条例中はなし）
  if (!policyState(state).active.some((p) => p.id === "freeTransit")) facilities += (ctx.riders ?? 0) * RAIL.fare;
  // 誘致した大型店などの追加雇用
  commercial += ctx.fx.extraComJobs * emp.comEfficiency * emp.jobFillRate * ECONOMY.comTaxUnit * state.taxes.commercial;

  const residential = emp.population * residentialTaxPerCapita(state.taxes.residential, emp.employmentRate);
  const income = {
    residential: round100(residential * taxMult),
    commercial: round100(commercial * taxMult),
    industrial: round100(industrial * taxMult),
    facilities: round100(facilities * taxMult),
    total: 0,
  };
  income.total = income.residential + income.commercial + income.industrial + income.facilities;
  const expense = {
    roads: round100(roads),
    services: round100(services * Math.max(0.5, 1 + ctx.fx.serviceUpkeep)),
    admin: round100(adminCost(emp.population)),
    interest: round100(state.loan * ECONOMY.loanInterest),
    // 雪の月は除雪費がかかる
    snow: round100(roads * Math.max(0, ctx.fx.roadUpkeep)),
    // 制定中の条例の費用
    policies: round100(totalPolicyUpkeep(state)),
    total: 0,
  };
  expense.total = expense.roads + expense.services + expense.admin + expense.interest + expense.snow + expense.policies;
  return { income, expense, net: income.total - expense.total };
}
