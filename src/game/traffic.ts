// 交通エンジン：建物が生む交通量を隣の道路に割り当て、道路網に拡散させて混雑度を出す簡易モデル。

import { BUILDINGS } from "./buildings";
import { TRAFFIC } from "./config";
import type { CoverageMap } from "./coverage";
import type { Employment } from "./employment";
import { footprint, neighbors4 } from "./map";
import type { Effects } from "./modifiers";
import type { GameState } from "./types";

/** 0 = 道路ではない, 1 = 空いている, 2 = やや混雑, 3 = 渋滞 */
export type TrafficLevel = 0 | 1 | 2 | 3;

export interface TrafficResult {
  load: number[];
  ratio: number[];
  level: TrafficLevel[];
  /** 街全体の混雑度（0〜100） */
  congestion: number;
}

export function roadCapacity(type: string | undefined): number {
  if (type === "avenue") return TRAFFIC.avenueCapacity;
  if (type === "road") return TRAFFIC.roadCapacity;
  return 0;
}

export function levelForRatio(ratio: number): TrafficLevel {
  if (ratio >= TRAFFIC.highAt) return 3;
  if (ratio >= TRAFFIC.mediumAt) return 2;
  return 1;
}

/** 建物1つが生む交通量 */
export function tripsFor(state: GameState, i: number, emp: Employment, coverage: CoverageMap, fx: Effects): number {
  const b = state.tiles[i].building;
  if (!b || b.abandoned) return 0;
  let trips = 0;
  if (b.type === "residential") trips = b.occupants * TRAFFIC.perResident;
  else if (b.type === "commercial") trips = emp.workersAt[i] * TRAFFIC.perComWorker;
  else if (b.type === "industrial") trips = emp.workersAt[i] * TRAFFIC.perIndWorker;
  else if (b.type !== "road" && b.type !== "avenue" && b.type !== "annex" && b.level > 0) trips = BUILDINGS[b.type].trips ?? TRAFFIC.perService;
  const transit = coverage.transit[i] ?? 0;
  return trips * (1 - TRAFFIC.transitReduction * transit) * Math.max(0.2, 1 + fx.traffic);
}

export function computeTraffic(state: GameState, emp: Employment, coverage: CoverageMap, fx: Effects): TrafficResult {
  const { tiles, width, height } = state;
  const n = tiles.length;
  const cap = tiles.map((t) => roadCapacity(t.building?.type));
  const isRoadAt = (i: number) => cap[i] > 0;
  let load = new Array<number>(n).fill(0);

  // 建物の交通量を隣接する道路に均等に割り当てる
  for (let i = 0; i < n; i++) {
    if (isRoadAt(i) || !tiles[i].building) continue;
    const trips = tripsFor(state, i, emp, coverage, fx);
    if (trips <= 0) continue;
    // 2×2 の大型施設は4マスの周りの道路すべてに分散する
    const cells = BUILDINGS[tiles[i].building!.type].size === 2 ? footprint(i, width).filter((j) => j < n) : [i];
    const roads = [...new Set(cells.flatMap((c) => neighbors4(c, width, height)).filter(isRoadAt))];
    for (const r of roads) load[r] += trips / roads.length;
  }

  // 拡散：交通は道路網を伝って周囲に広がる（容量の大きい道路ほど多く引き受ける）
  for (let it = 0; it < TRAFFIC.diffuseIterations; it++) {
    const next = load.slice();
    for (let i = 0; i < n; i++) {
      if (!isRoadAt(i) || load[i] <= 0) continue;
      const nbs = neighbors4(i, width, height).filter(isRoadAt);
      if (nbs.length === 0) continue;
      const out = load[i] * TRAFFIC.diffuseShare;
      const totalCap = nbs.reduce((a, j) => a + cap[j], 0);
      next[i] -= out;
      for (const j of nbs) next[j] += (out * cap[j]) / totalCap;
    }
    // 自分自身にも同じ割合で戻す（行き止まりに溜まりすぎないよう平均化）
    load = next.map((v, i) => (isRoadAt(i) ? (v + load[i]) / 2 : 0));
  }

  const ratio = load.map((v, i) => (isRoadAt(i) ? v / cap[i] : 0));
  const level = ratio.map((r, i) => (isRoadAt(i) ? levelForRatio(r) : 0)) as TrafficLevel[];
  let sum = 0;
  let roads = 0;
  for (let i = 0; i < n; i++) {
    if (!isRoadAt(i)) continue;
    roads++;
    sum += Math.max(0, Math.min(1, (ratio[i] - 0.3) / 0.9));
  }
  return { load, ratio, level, congestion: roads ? Math.round((sum / roads) * 100) : 0 };
}

/** 隣接する道路の中で最も混んでいる状態 */
export function adjacentTraffic(state: Pick<GameState, "width" | "height">, i: number, level: TrafficLevel[]): TrafficLevel {
  let max: TrafficLevel = 0;
  for (const j of neighbors4(i, state.width, state.height)) if (level[j] > max) max = level[j];
  return max;
}
