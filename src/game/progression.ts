// 街のランクとアンロック。

import { BUILD_ORDER, BUILDINGS } from "./buildings";
import { RANKS, type RankDef } from "./config";
import type { BuildingType, RankId } from "./types";

export function getRank(id: RankId): RankDef {
  return RANKS.find((r) => r.id === id) ?? RANKS[0];
}

export function rankIndex(id: RankId): number {
  return RANKS.findIndex((r) => r.id === id);
}

export function rankForPopulation(population: number): RankDef {
  let result = RANKS[0];
  for (const r of RANKS) if (population >= r.minPopulation) result = r;
  return result;
}

export function nextRank(id: RankId): RankDef | null {
  return RANKS[rankIndex(id) + 1] ?? null;
}

export function isBuildingUnlocked(type: BuildingType, rank: RankId): boolean {
  return rankIndex(rank) >= rankIndex(BUILDINGS[type].unlockRank);
}

/** そのランクで新しく解禁される内容（ランクアップ演出用） */
export function unlocksForRank(id: RankId): string[] {
  const rank = getRank(id);
  const prev = RANKS[rankIndex(id) - 1];
  const out: string[] = BUILD_ORDER.filter((t) => BUILDINGS[t].unlockRank === id).map((t) => `${BUILDINGS[t].emoji[1]} ${BUILDINGS[t].name}`);
  if (prev && rank.maxLevel > prev.maxLevel) {
    out.push(
      rank.maxLevel === 3
        ? "⬆️ 3段目の建物（🏢 マンション・🏙️ オフィスビル・🏭 工業団地）"
        : "⬆️ 4段目の超高層（🌇 タワーマンション・🏦 超高層オフィス・🤖 ハイテク工業団地）。バス停・駅や学校の近くで育つ",
    );
  }
  if (id === "metropolis") out.push("🏝️ 埋め立て（海や川を陸地にできる）");
  if (prev && rank.mapSize > prev.mapSize) out.push(`🗺️ 建設エリア拡張（${rank.mapSize}×${rank.mapSize}）`);
  if (prev && rank.loanLimit > prev.loanLimit) out.push(`💳 借りられる上限 ¥${Math.round(rank.loanLimit / 10_000).toLocaleString("ja-JP")}万`);
  return out;
}
