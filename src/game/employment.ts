// 雇用エンジン：働き手と雇用枠を比較し、失業率・人手不足・商業/工業の需要充足を計算する。

import { BUILDINGS, capacityAt, jobsAt } from "./buildings";
import { COM_SUPPORT, DISCONNECTED_FACTOR, ECONOMY, HAPPINESS, IND_SUPPORT, WORKFORCE_RATIO } from "./config";
import { population } from "./map";
import type { Effects } from "./modifiers";
import type { RoadNetwork } from "./roads";
import type { GameState } from "./types";

export interface Employment {
  population: number;
  workers: number;
  /** 商業の雇用枠（需要で割り引く前） */
  comJobs: number;
  /** 人口などから見て商業が支えられる雇用 */
  comSupport: number;
  /** 商業の需要充足率（0.3〜1） */
  comEfficiency: number;
  indJobs: number;
  indSupport: number;
  indEfficiency: number;
  serviceJobs: number;
  /** 実際に働ける雇用枠の合計 */
  jobs: number;
  filled: number;
  employmentRate: number;
  /** 雇用枠のうち埋まっている割合（低いと人手不足） */
  jobFillRate: number;
  unemployment: number;
  /** マスごとの従業員数 */
  workersAt: number[];
  housingCapacity: number;
  vacancyRate: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 商業・工業税による需要の倍率 */
export function bizTaxFactor(rate: number): number {
  return clamp(1 - (rate - HAPPINESS.taxNeutral) * ECONOMY.bizTaxSensitivity, 0.4, 1.4);
}

export function computeEmployment(state: GameState, net: RoadNetwork, fx: Effects): Employment {
  const pop = population(state);
  const n = state.tiles.length;
  const rawJobs = new Array<number>(n).fill(0);
  let comJobs = fx.extraComJobs;
  let indJobs = 0;
  let serviceJobs = 0;
  let housingCapacity = 0;
  let plazas = 0;
  let stations = 0;
  let landmarks = 0;

  state.tiles.forEach((tile, i) => {
    const b = tile.building;
    if (!b || b.abandoned || !net.roadAccess[i]) return;
    const factor = net.connected[i] ? 1 : DISCONNECTED_FACTOR;
    if (b.type === "residential") {
      housingCapacity += capacityAt("residential", b.level) * factor;
      return;
    }
    const jobs = jobsAt(b.type, b.level) * factor;
    rawJobs[i] = jobs;
    if (b.type === "commercial") comJobs += jobs;
    else if (b.type === "industrial") indJobs += jobs;
    else if (BUILDINGS[b.type].jobs.length) serviceJobs += jobs;
    if (b.type === "plaza") plazas++;
    if (b.type === "station") stations++;
    if (b.type === "landmark") landmarks++;
  });

  const comSupport =
    fx.comSupport +
    (COM_SUPPORT.base + pop * COM_SUPPORT.perCapita + plazas * COM_SUPPORT.plazaBonus + stations * COM_SUPPORT.stationBonus + landmarks * COM_SUPPORT.landmarkBonus) *
      state.profile.comDemand *
      bizTaxFactor(state.taxes.commercial) *
      (1 + fx.comDemand) +
    fx.extraComJobs;
  const indSupport = (IND_SUPPORT.base + pop * IND_SUPPORT.perCapita + fx.indSupport) * state.profile.indDemand * bizTaxFactor(state.taxes.industrial) * (1 + fx.indDemand);
  const comEfficiency = comJobs > 0 ? clamp(comSupport / comJobs, 0.3, 1) : 1;
  const indEfficiency = indJobs > 0 ? clamp(indSupport / indJobs, 0.3, 1) : 1;

  const effective = rawJobs.map((j, i) => {
    const t = state.tiles[i].building?.type;
    if (t === "commercial") return j * comEfficiency;
    if (t === "industrial") return j * indEfficiency;
    return j;
  });
  const jobs = effective.reduce((a, b) => a + b, 0) + fx.extraComJobs * comEfficiency;
  const workers = pop * WORKFORCE_RATIO;
  const filled = Math.min(jobs, workers);
  const employmentRate = workers > 0 ? filled / workers : 1;
  const jobFillRate = jobs > 0 ? filled / jobs : 1;

  return {
    population: pop,
    workers,
    comJobs,
    comSupport,
    comEfficiency,
    indJobs,
    indSupport,
    indEfficiency,
    serviceJobs,
    jobs,
    filled,
    employmentRate,
    jobFillRate,
    unemployment: 1 - employmentRate,
    workersAt: effective.map((j) => j * jobFillRate),
    housingCapacity,
    vacancyRate: housingCapacity > 0 ? clamp(1 - pop / housingCapacity, 0, 1) : 0,
  };
}
