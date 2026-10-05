// 建物の成長：造成中 → 小さな建物 → 中規模 → 大規模。条件が悪いと衰退・空き家化する。

import type { CityAnalysis } from "./analysis";
import { BUILDINGS, capacityAt, isProject, isZone } from "./buildings";
import { GROWTH, LEVEL5_PROJECT_RANGE, MAX_LEVEL, SHOP_CATCHMENT } from "./config";
import { forEachInRadius, forEachInRange } from "./map";
import { effectiveCapacity } from "./population";
import { getRank } from "./progression";
import type { Rng } from "./rng";
import { adjacentTraffic } from "./traffic";
import type { GameState, TileChange } from "./types";

/** 成長の条件の種類（表示の文言ではなく、この種類で住民の声などを出し分ける） */
export type GrowthKey = "road" | "connected" | "rank" | "happiness" | "occupancy" | "transit" | "env" | "school" | "efficiency" | "workers" | "catchment" | "traffic" | "project";

export interface GrowthCheck {
  key: GrowthKey;
  label: string;
  ok: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** マスの周り（半径 r）に住んでいる人数 */
export function nearbyResidents(state: GameState, i: number, r: number): number {
  let n = 0;
  forEachInRadius(i, r, state.width, state.height, (j) => {
    const t = state.tiles[j].building;
    if (t?.type === "residential") n += t.occupants;
  });
  return n;
}

/** 完成した大型プロジェクト（2×2）が、建物の端から r マス以内にあるか */
export function nearProject(state: GameState, i: number, r: number): boolean {
  let found = false;
  state.tiles.forEach((t, j) => {
    if (found) return;
    const b = t.building;
    if (!b || !isProject(b.type) || b.level === 0) return;
    forEachInRange(j, BUILDINGS[b.type].size ?? 1, r, state.width, state.height, (k) => {
      if (k === i) found = true;
    });
  });
  return found;
}

/** 次のレベルに上がるための条件（最大レベルなら null） */
export function nextLevelChecks(state: GameState, i: number, a: CityAnalysis): GrowthCheck[] | null {
  const b = state.tiles[i].building;
  if (!b || !isZone(b.type) || b.level >= MAX_LEVEL) return null;
  if (b.level === 0) return [{ key: "road", label: "道路に面している", ok: a.net.roadAccess[i] }];

  const checks: GrowthCheck[] = [{ key: "connected", label: "役所まで道路でつながっている", ok: a.net.connected[i] }];
  const upper = b.level + 1;
  if (upper > getRank(state.rank).maxLevel) {
    const need = upper === 3 ? "町（人口1,000人）" : upper === 4 ? "市（人口3,000人）" : upper === 5 ? "メガシティ（人口15,000人）" : "次のランク";
    checks.push({ key: "rank", label: `街のランクが${need}以上`, ok: false });
  }
  const emp = a.employment;
  const trafficOk = adjacentTraffic(state, i, a.traffic.level) < 3;
  if (b.type === "residential") {
    const cap = effectiveCapacity(state, i, a.net);
    const occ = cap > 0 ? b.occupants / cap : 0;
    if (b.level === 1) {
      checks.push({ key: "happiness", label: `満足度 55以上（いま ${Math.round(a.happiness[i])}）`, ok: a.happiness[i] >= 55 });
      checks.push({ key: "occupancy", label: `住んでいる割合 80%以上（いま ${pct(occ)}）`, ok: occ >= 0.8 });
    } else if (b.level === 4) {
      // 超高層レジデンス：大型プロジェクトの近くの、とても住みやすい場所
      checks.push({ key: "happiness", label: `満足度 80以上（いま ${Math.round(a.happiness[i])}）`, ok: a.happiness[i] >= 80 });
      checks.push({ key: "transit", label: "バス停・バスターミナルの範囲内", ok: a.coverage.transit[i] > 0 });
      checks.push({ key: "env", label: `環境 55以上（いま ${Math.round(a.env[i])}）`, ok: a.env[i] >= 55 });
      checks.push({ key: "occupancy", label: `住んでいる割合 90%以上（いま ${pct(occ)}）`, ok: occ >= 0.9 });
    } else if (b.level === 3) {
      // タワーマンション：公共交通で通勤でき、住みやすい場所
      checks.push({ key: "happiness", label: `満足度 70以上（いま ${Math.round(a.happiness[i])}）`, ok: a.happiness[i] >= 70 });
      checks.push({ key: "transit", label: "バス停・バスターミナルの範囲内", ok: a.coverage.transit[i] > 0 });
      checks.push({ key: "env", label: `環境 50以上（いま ${Math.round(a.env[i])}）`, ok: a.env[i] >= 50 });
      checks.push({ key: "occupancy", label: `住んでいる割合 90%以上（いま ${pct(occ)}）`, ok: occ >= 0.9 });
    } else {
      checks.push({ key: "happiness", label: `満足度 65以上（いま ${Math.round(a.happiness[i])}）`, ok: a.happiness[i] >= 65 });
      checks.push({ key: "school", label: "学校の範囲内", ok: a.coverage.education[i] > 0 });
      checks.push({ key: "env", label: `環境 45以上（いま ${Math.round(a.env[i])}）`, ok: a.env[i] >= 45 });
      checks.push({ key: "occupancy", label: `住んでいる割合 85%以上（いま ${pct(occ)}）`, ok: occ >= 0.85 });
    }
  } else {
    const eff = b.type === "commercial" ? emp.comEfficiency : emp.indEfficiency;
    const what = b.type === "commercial" ? "お客さん" : "工場の注文";
    const needEff = b.level === 1 ? 0.9 : 0.95;
    const needFill = b.level === 1 ? 0.85 : 0.9;
    checks.push({ key: "efficiency", label: `${what}が十分：${pct(needEff)}以上（いま ${pct(eff)}）`, ok: eff >= needEff });
    checks.push({ key: "workers", label: `働き手が足りている：${pct(needFill)}以上（いま ${pct(emp.jobFillRate)}）`, ok: emp.jobFillRate >= needFill });
    if (b.type === "commercial" && SHOP_CATCHMENT.residents[upper] > 0) {
      // 大きな店は、周りに住む人が多い場所にしか育たない（郊外はコンビニのまま）
      // 広場の近くは人が集まるので、必要な人数が半分で済む
      const plaza = a.coverage.plaza[i] > 0;
      const near = nearbyResidents(state, i, SHOP_CATCHMENT.radius);
      const need = Math.round(SHOP_CATCHMENT.residents[upper] * (plaza ? SHOP_CATCHMENT.plazaFactor : 1));
      checks.push({ key: "catchment", label: `周り${SHOP_CATCHMENT.radius}マスに住む人 ${need.toLocaleString("ja-JP")}人以上${plaza ? "（広場の近くで半分に）" : ""}（いま ${near.toLocaleString("ja-JP")}人）`, ok: near >= need });
    }
    if (b.level >= 2) checks.push({ key: "traffic", label: "前の道路が渋滞していない", ok: trafficOk });
    if (b.level >= 3 && b.type === "commercial") checks.push({ key: "transit", label: "バス停・バスターミナルの範囲内（通勤客が来られる）", ok: a.coverage.transit[i] > 0 });
    if (b.level >= 3 && b.type === "industrial") checks.push({ key: "school", label: "学校・大学の範囲内（技術者が集まる）", ok: a.coverage.education[i] > 0 });
  }
  if (upper === 5) {
    // 5段目は、街の顔になる大型プロジェクトのそばだけ
    checks.push({ key: "project", label: `大型プロジェクトから${LEVEL5_PROJECT_RANGE}マス以内（新幹線駅・大学・空港など）`, ok: nearProject(state, i, LEVEL5_PROJECT_RANGE) });
  }
  return checks;
}

/** 1か月あたりの成長ポイントの増減 */
export function growthScore(state: GameState, i: number, a: CityAnalysis): number {
  const b = state.tiles[i].building;
  if (!b || !isZone(b.type) || b.level === 0) return 0;
  const emp = a.employment;
  let score = 0;
  if (b.type === "residential") {
    const cap = effectiveCapacity(state, i, a.net);
    const occ = cap > 0 ? b.occupants / cap : 0;
    score += (a.happiness[i] - 55) / 3;
    if (!b.abandoned) score += occ > 0.9 ? 6 : occ > 0.7 ? 2 : -4;
    score += a.demand.residential / 25;
  } else {
    const eff = b.type === "commercial" ? emp.comEfficiency : emp.indEfficiency;
    score += (eff - 0.85) * 40 + (emp.jobFillRate - 0.85) * 30;
    score += (b.type === "commercial" ? a.demand.commercial : a.demand.industrial) / 25;
    if (b.type === "commercial") score += a.coverage.plaza[i] * 4 + a.coverage.transit[i] * 2;
    if (adjacentTraffic(state, i, a.traffic.level) === 3) score -= 6;
  }
  if (!a.net.roadAccess[i]) score -= 20;
  else if (!a.net.connected[i]) score -= 8;
  return score;
}

export interface GrowthResult {
  changes: TileChange[];
  /** 新築・衰退による住民の増減 */
  movedIn: number;
  movedOut: number;
}

/** 成長を反映する（draft を直接更新する） */
export function applyGrowth(draft: GameState, a: CityAnalysis, rng: Rng): GrowthResult {
  const changes: TileChange[] = [];
  let movedIn = 0;
  let movedOut = 0;
  const maxLevel = getRank(draft.rank).maxLevel;

  draft.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || !isZone(b.type)) return;

    // 造成中：道路に面していれば翌月に完成
    if (b.level === 0) {
      if (a.net.roadAccess[i]) {
        b.level = 1;
        b.growth = rng.int(0, 20);
        if (b.type === "residential") {
          b.occupants = Math.round(capacityAt("residential", 1) * GROWTH.initialOccupancy);
          movedIn += b.occupants;
        }
        changes.push({ tile: i, kind: "built", level: 1 });
      }
      return;
    }

    const score = growthScore(draft, i, a) + rng.range(-2, 2);
    b.growth = clamp(b.growth + score, GROWTH.min, GROWTH.max);

    if (b.abandoned) {
      if (b.growth >= 0) {
        b.abandoned = false;
        changes.push({ tile: i, kind: "built", level: b.level });
      }
      return;
    }

    const threshold = GROWTH.threshold[b.level];
    if (b.growth >= threshold && b.level < MAX_LEVEL) {
      const checks = nextLevelChecks(draft, i, a);
      if (b.level < maxLevel && checks?.every((c) => c.ok)) {
        if (rng.chance(GROWTH.levelUpChance)) {
          b.level += 1;
          b.growth = 0;
          changes.push({ tile: i, kind: "levelUp", level: b.level });
        } else {
          b.growth = threshold;
        }
      } else {
        b.growth = threshold;
      }
    } else if (b.growth <= GROWTH.min) {
      if (b.level > 1) {
        b.level -= 1;
        b.growth = 0;
        changes.push({ tile: i, kind: "levelDown", level: b.level });
        if (b.type === "residential") {
          const cap = capacityAt("residential", b.level);
          if (b.occupants > cap) {
            movedOut += b.occupants - cap;
            b.occupants = cap;
          }
        }
      } else {
        b.abandoned = true;
        b.growth = -50;
        movedOut += b.occupants;
        b.occupants = 0;
        changes.push({ tile: i, kind: "abandoned", level: b.level });
      }
    }
  });

  return { changes, movedIn, movedOut };
}


/** もうすぐ次のレベルに育つか（地図の ✨ 表示用）：条件をすべて満たし、成長ポイントが6割以上 */
export function readyToGrow(state: GameState, i: number, a: CityAnalysis): boolean {
  const b = state.tiles[i].building;
  if (!b || !isZone(b.type) || b.abandoned || b.level === 0 || b.level >= getRank(state.rank).maxLevel) return false;
  if (b.growth < GROWTH.threshold[b.level] * 0.6 || growthScore(state, i, a) <= 0) return false;
  return nextLevelChecks(state, i, a)?.every((c) => c.ok) ?? false;
}
