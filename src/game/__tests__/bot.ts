// テスト・バランス調整用の簡単な自動プレイヤー。需要メーターを見て建物を置く「普通のプレイヤー」を模す。

import { borrow, checkPlacement, placeBuilding } from "../actions";
import { analyzeCity } from "../analysis";
import { PROJECTS, isRoad } from "../buildings";
import { describePendingEvent, resolveEvent } from "../events";
import { isUnlockedTile, neighbors4, toXY } from "../map";
import { isBuildingUnlocked, rankIndex } from "../progression";
import { createRng } from "../rng";
import { advanceMonth } from "../simulation";
import { TOWN_OFFSET } from "../state";
import type { BuildingType, GameState } from "../types";

const O = TOWN_OFFSET;

function tryPlace(s: GameState, type: BuildingType, i: number): GameState {
  const r = placeBuilding(s, type, i);
  return r.ok ? r.state : s;
}

/** 道路用に空けておく格子線（ここには建物を置かない） */
function onGrid(s: GameState, i: number): boolean {
  const { x, y } = toXY(i, s.width);
  return (((x - 6 - O) % 3) + 3) % 3 === 0 || (((y - 8 - O) % 3) + 3) % 3 === 0;
}

function emptyLots(s: GameState): number[] {
  const a = analyzeCity(s);
  const out: number[] = [];
  s.tiles.forEach((t, i) => {
    if (t.building || t.terrain === "water" || !isUnlockedTile(s, i) || onGrid(s, i)) return;
    if (neighbors4(i, s.width, s.height).some((j) => isRoad(s.tiles[j].building?.type) && a.net.connected[j])) out.push(i);
  });
  return out;
}

const dist = (s: GameState, i: number, x: number, y: number) => {
  const p = toXY(i, s.width);
  return Math.hypot(p.x - x, p.y - y);
};

function nearestResidential(s: GameState, i: number): number {
  let best = 99;
  s.tiles.forEach((t, j) => {
    if (t.building?.type === "residential") best = Math.min(best, dist(s, i, j % s.width, Math.floor(j / s.width)));
  });
  return best;
}

function extendRoad(s: GameState): GameState {
  const a = analyzeCity(s);
  const candidates: Array<{ i: number; score: number }> = [];
  s.tiles.forEach((t, i) => {
    if (t.building || t.terrain === "water" || !isUnlockedTile(s, i)) return;
    if (!neighbors4(i, s.width, s.height).some((j) => isRoad(s.tiles[j].building?.type) && a.net.connected[j])) return;
    const grid = onGrid(s, i);
    const open = neighbors4(i, s.width, s.height).filter((j) => !s.tiles[j].building && s.tiles[j].terrain !== "water" && isUnlockedTile(s, j)).length;
    candidates.push({ i, score: (grid ? 10 : 0) + open * 2 - dist(s, i, 7.5 + O, 7.5 + O) });
  });
  candidates.sort((p, q) => q.score - p.score);
  for (const c of candidates.slice(0, 3)) s = tryPlace(s, "road", c.i);
  return s;
}

export interface BotOptions {
  /** 公共施設も建てるか */
  services?: boolean;
  /** 住宅税 */
  resTax?: number;
}

/** 1か月分の判断を行う */
export function botTurn(s: GameState, opts: BotOptions = {}): GameState {
  const a = analyzeCity(s);
  const pop = a.population;
  if (opts.resTax !== undefined) s = { ...s, taxes: { ...s.taxes, residential: opts.resTax } };

  let lots = emptyLots(s);
  if (lots.length < 10) {
    s = extendRoad(s);
    lots = emptyLots(s);
  }
  const byCenter = [...lots].sort((p, q) => dist(s, p, 7 + O, 7 + O) - dist(s, q, 7 + O, 7 + O));

  // 赤字なら少し増税し、公共施設は控える
  const deficit = a.budget.net < 0;
  if (deficit && s.taxes.residential < 12) s = { ...s, taxes: { ...s.taxes, residential: s.taxes.residential + 1 } };
  if (opts.services !== false && !deficit) {
    const want: Array<[BuildingType, boolean]> = [
      [rankIndex(s.rank) >= 1 ? "bigPark" : "park", a.coverage.park.filter((v, i) => v === 0 && s.tiles[i].building?.type === "residential").length > 4],
      ["school", pop > 350 && a.coverage.education.filter((v, i) => v === 0 && s.tiles[i].building?.type === "residential").length > 3],
      ["hospital", pop > 600 && a.coverage.health.filter((v, i) => v === 0 && s.tiles[i].building?.type === "residential").length > 3],
      ["fireStation", pop > 800 && a.fireRisk > 0.4],
      ["busStop", a.congestion > 25 || (rankIndex(s.rank) >= 2 && a.coverage.transit.filter((v, i) => v === 0 && (s.tiles[i].building?.level ?? 0) >= 3).length > 2)],
    ];
    for (const [type, need] of want) {
      if (!need || !isBuildingUnlocked(type, s.rank)) continue;
      // 範囲外の住宅にもっとも近い空き地
      // 道路の延長をふさがないよう、周りが埋まっている空き地を優先
      const openCount = (i: number) => neighbors4(i, s.width, s.height).filter((j) => !s.tiles[j].building && s.tiles[j].terrain !== "water").length;
      const target = [...byCenter]
        .sort((p, q) => openCount(p) - openCount(q))
        .find((i) => !s.tiles[i].building && checkPlacement(s, type, i).ok && s.money > checkPlacement(s, type, i).cost + 300_000);
      if (target !== undefined) {
        s = tryPlace(s, type, target);
        lots = lots.filter((i) => i !== target);
      }
    }
  }

  // 余裕があれば大型プロジェクトを建てる
  if (!deficit) {
    for (const p of PROJECTS) {
      if (!isBuildingUnlocked(p, s.rank) || s.tiles.some((t) => t.building?.type === p)) continue;
      const spot = s.tiles.findIndex((_, i) => checkPlacement(s, p, i).ok && s.money > checkPlacement(s, p, i).cost + 2_000_000 && neighbors4(i, s.width, s.height).some((j) => isRoad(s.tiles[j].building?.type)));
      if (spot >= 0) s = tryPlace(s, p, spot);
      break;
    }
  }

  const d = analyzeCity(s).demand;
  const placeZone = (type: BuildingType, count: number, order: number[]) => {
    let placed = 0;
    for (const i of order) {
      if (placed >= count) break;
      if (s.tiles[i].building) continue;
      const next = tryPlace(s, type, i);
      if (next !== s) {
        s = next;
        placed++;
      }
    }
  };
  if (d.residential > 15) placeZone("residential", d.residential > 50 ? 4 : 2, byCenter.filter((i) => nearestResidential(s, i) < 3 || true));
  if (d.commercial > 15) placeZone("commercial", d.commercial > 50 ? 2 : 1, byCenter);
  if (d.industrial > 15) {
    const far = [...emptyLots(s)].sort((p, q) => nearestResidential(s, q) - nearestResidential(s, p));
    placeZone("industrial", d.industrial > 50 ? 2 : 1, far);
  }
  if (s.money < -200_000) {
    const r = borrow(s);
    if (r.ok) s = r.state;
  }
  return s;
}

/** 選択式イベントには最初の（払える）選択肢で答える */
export function autoResolve(s: GameState): GameState {
  if (!s.pendingEvent) return s;
  const a = analyzeCity(s);
  const view = describePendingEvent(s, a);
  const choice = view?.choices.find((c) => c.affordable) ?? view?.choices[view.choices.length - 1];
  const r = resolveEvent(s, a, choice?.id ?? "", createRng(1));
  return r.ok ? r.state : { ...s, pendingEvent: null };
}

export function runMonths(s: GameState, months: number, turn?: (s: GameState) => GameState): GameState {
  for (let m = 0; m < months && !s.gameOver; m++) {
    if (turn) s = turn(s);
    s = autoResolve(s);
    const out = advanceMonth(s);
    if (!out) break;
    s = autoResolve(out.state);
  }
  return s;
}
