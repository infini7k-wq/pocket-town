// 環境エンジン：工業の公害・交通量・緑（森・公園）・水辺からマスごとの環境値と騒音を計算する。

import { BUILDINGS } from "./buildings";
import { ENVIRONMENT, INDUSTRIAL_NOISE } from "./config";
import type { CoverageMap } from "./coverage";
import { forEachInRadius, forEachInRange } from "./map";
import type { Effects } from "./modifiers";
import type { TrafficResult } from "./traffic";
import type { GameState } from "./types";

const POLLUTION_FALLOFF = [1, 1, 0.6, 0.3];
/** 大きな公園の近くの騒音の倍率 */
const NOISE_BUFFER = 0.5;

export function computeEnvironment(state: GameState, coverage: CoverageMap, traffic: TrafficResult, fx: Effects): number[] {
  const { tiles, width, height } = state;
  const n = tiles.length;
  const env = new Array<number>(n).fill(ENVIRONMENT.base + fx.env);

  // 汚染源（工業）と交通は周囲に向けて足し込む
  const pollution = new Array<number>(n).fill(0);
  const trafficPenalty = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const b = tiles[i].building;
    const extra = b && b.level > 0 ? BUILDINGS[b.type].pollution : undefined;
    if ((b?.type === "industrial" && !b.abandoned && b.level > 0) || extra) {
      const p = extra ?? ENVIRONMENT.industrialPollution[b!.level] ?? 0;
      forEachInRange(i, BUILDINGS[b!.type].size ?? 1, ENVIRONMENT.pollutionRadius, width, height, (j, d) => {
        pollution[j] += p * (POLLUTION_FALLOFF[Math.round(d)] ?? 0);
      });
    }
    if (traffic.ratio[i] > 0) {
      forEachInRadius(i, 1, width, height, (j) => {
        trafficPenalty[j] += traffic.ratio[i] * ENVIRONMENT.trafficWeight;
      });
    }
  }

  for (let i = 0; i < n; i++) {
    let forest = 0;
    let water = 0;
    forEachInRadius(i, 2, width, height, (j) => {
      if (tiles[j].terrain === "forest" && !tiles[j].building) forest++;
      if (tiles[j].terrain === "water") water++;
    });
    let v = env[i];
    v += Math.min(ENVIRONMENT.forestCap, forest * ENVIRONMENT.forestEach);
    if (water > 0) v += ENVIRONMENT.water;
    v += coverage.park[i] * ENVIRONMENT.park;
    v -= pollution[i];
    v -= Math.min(ENVIRONMENT.trafficCap, trafficPenalty[i]);
    env[i] = Math.max(0, Math.min(100, v));
  }
  return env;
}

/** 工業による騒音（隣接で満額、2マス先で半分） */
export function computeNoise(state: GameState, fx: Effects): number[] {
  const { tiles, width, height } = state;
  const noise = new Array<number>(tiles.length).fill(0);
  tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || b.abandoned || b.level === 0) return;
    const loud = BUILDINGS[b.type].noise;
    if (loud) {
      // 空港などの大型施設：周囲3マスに大きな騒音
      forEachInRange(i, BUILDINGS[b.type].size ?? 1, 3, width, height, (j, d) => {
        if (state.tiles[j].building?.anchor === i || j === i) return;
        noise[j] += d <= 2 ? loud : loud / 2;
      });
      return;
    }
    if (b.type !== "industrial") return;
    const base = INDUSTRIAL_NOISE[b.level] ?? 0;
    forEachInRadius(i, 2, width, height, (j, d) => {
      if (j === i) return;
      noise[j] += d <= 1.5 ? base : base / 2;
    });
  });
  // 大きな公園の林が、周り2マスの騒音をやわらげる
  tiles.forEach((t, i) => {
    const b = t.building;
    if (b?.type !== "bigPark" && b?.type !== "forestPark") return;
    forEachInRange(i, BUILDINGS[b.type].size ?? 1, 2, width, height, (j) => {
      noise[j] *= NOISE_BUFFER;
    });
  });
  return noise.map((v) => v * (1 - fx.noiseShield));
}

/** そのマスに騒音を届けているもの（空港などの大型施設か、工場か） */
export function noiseSources(state: GameState, i: number): { airport: boolean; factory: boolean } {
  let airport = false;
  let factory = false;
  state.tiles.forEach((t, j) => {
    const b = t.building;
    if (!b || b.abandoned || b.level === 0) return;
    if (BUILDINGS[b.type].noise) {
      forEachInRange(j, BUILDINGS[b.type].size ?? 1, 3, state.width, state.height, (k) => {
        if (k === i) airport = true;
      });
    } else if (b.type === "industrial" && (INDUSTRIAL_NOISE[b.level] ?? 0) > 0) {
      forEachInRadius(j, 2, state.width, state.height, (k) => {
        if (k === i && k !== j) factory = true;
      });
    }
  });
  return { airport, factory };
}

/** 街全体の環境値：建物のあるマスの平均 */
export function cityEnvironment(state: GameState, env: number[]): number {
  let sum = 0;
  let count = 0;
  state.tiles.forEach((t, i) => {
    const type = t.building?.type;
    if (!type || type === "road" || type === "avenue" || type === "annex") return;
    sum += env[i];
    count++;
  });
  return count ? Math.round(sum / count) : 70;
}
