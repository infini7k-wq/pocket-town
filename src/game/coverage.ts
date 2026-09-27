// 公共施設・商業などの効果範囲（カバー率）を計算する。

import { BUILDINGS } from "./buildings";
import { DISCONNECTED_FACTOR, SHOP_RADIUS } from "./config";
import { forEachInRange } from "./map";
import type { RoadNetwork } from "./roads";
import type { Building, CoverageKind, GameState } from "./types";

export type CoverageMap = Record<CoverageKind, number[]>;

export const COVERAGE_KINDS: CoverageKind[] = ["park", "education", "health", "fire", "transit", "plaza", "shopping", "landmark"];

/** 商業のレベルごとの「買い物の便利さ」 */
const SHOPPING_STRENGTH = [0, 0.6, 0.85, 1, 1.15, 1.3];

/** 範囲内の効果：中心で 1、範囲の端で 0.5 */
export function falloff(dist: number, radius: number): number {
  return 1 - 0.5 * Math.min(1, dist / Math.max(1, radius));
}

/** 建物の実際の効果範囲（お店はレベルが上がるほど遠くから客が来る） */
export function effectiveRadius(b: Pick<Building, "type" | "level">): number {
  const def = BUILDINGS[b.type];
  if (!def.coverage) return 0;
  return b.type === "commercial" ? (SHOP_RADIUS[b.level] ?? def.coverage.radius) : def.coverage.radius;
}

export function computeCoverage(state: Pick<GameState, "tiles" | "width" | "height">, net: RoadNetwork): CoverageMap {
  const n = state.tiles.length;
  const map = Object.fromEntries(COVERAGE_KINDS.map((k) => [k, new Array<number>(n).fill(0)])) as CoverageMap;

  state.tiles.forEach((tile, i) => {
    const b = tile.building;
    if (!b || b.abandoned) return;
    const def = BUILDINGS[b.type];
    if (!def.coverage || !net.roadAccess[i]) return;
    let strength = def.coverage.strength * (net.connected[i] ? 1 : DISCONNECTED_FACTOR);
    if (def.category === "project" && b.level === 0) return; // 建設中はまだ効果なし
    if (b.type === "commercial") {
      if (b.level === 0) return;
      strength *= SHOPPING_STRENGTH[b.level] ?? 1;
    }
    const target = map[def.coverage.kind];
    // お店は大きいほど遠くから客が来る
    const radius = effectiveRadius(b);
    forEachInRange(i, def.size ?? 1, radius, state.width, state.height, (j, d) => {
      const v = strength * falloff(d, radius);
      if (v > target[j]) target[j] = v;
    });
  });

  return map;
}
