// 街のランクとアンロック。

import { BUILD_ORDER, BUILDINGS, TRAIT_PROJECTS } from "./buildings";
import { RANKS, type RankDef } from "./config";
import type { BuildingType, RankId, TraitId } from "./types";

export function getRank(id: RankId): RankDef {
  return RANKS.find((r) => r.id === id) ?? RANKS[0];
}

/** ランクに合わせた長の呼び名（村長・町長・市長） */
export function mayorTitle(rank: RankId): string {
  return rank === "village" ? "村長" : rank === "town" ? "町長" : "市長";
}

/** ランクに合わせた街の呼び名（村・町・市） */
export function placeWord(rank: RankId): string {
  return rank === "village" ? "村" : rank === "town" ? "町" : "市";
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
export function unlocksForRank(id: RankId, trait?: TraitId): string[] {
  const rank = getRank(id);
  const prev = RANKS[rankIndex(id) - 1];
  const types = trait ? [...BUILD_ORDER, TRAIT_PROJECTS[trait]] : BUILD_ORDER;
  const out: string[] = types.filter((t) => BUILDINGS[t].unlockRank === id).map((t) => `${BUILDINGS[t].emoji[1]} ${BUILDINGS[t].name}${BUILDINGS[t].trait ? "（この町だけの専用施設）" : ""}`);
  if (prev && rank.maxLevel > prev.maxLevel) {
    out.push(
      rank.maxLevel === 3
        ? "⬆️ 3段目の建物（🏢 マンション・🏬 デパート・🏭 工業団地）"
        : rank.maxLevel === 4
          ? "⬆️ 4段目の超高層（🌇 タワーマンション・🏙️ 複合ビル・🤖 ハイテク工業団地）。バス停・バスターミナルや学校の近くで育つ"
          : "⬆️ 5段目（🌆 超高層レジデンス・🌃 ランドマークビル・🚀 先端研究所）。大型プロジェクトの近くで育つ",
    );
  }
  if (id === "metropolis") out.push("🏝️ 埋め立て（海や川を陸地にできる）");
  if (id === "megacity") {
    out.push("🗺️ 土地の買い足し（となり町から土地を買い、マップを広げられる）");
    out.push("🏗️ 大型プロジェクトを2つずつ建てられる");
  }
  if (prev && rank.mapSize > prev.mapSize) out.push(`🗺️ 建設エリア拡張（${rank.mapSize}×${rank.mapSize}）`);
  if (prev && rank.loanLimit > prev.loanLimit) out.push(`💳 借りられる上限 ¥${Math.round(rank.loanLimit / 10_000).toLocaleString("ja-JP")}万`);
  return out;
}
