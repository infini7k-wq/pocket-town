// プレイヤーの操作（建設・撤去・税率・融資）。すべて新しい状態を返す純粋関数。

import { BUILDINGS, isRoad, isZone } from "./buildings";
import { ECONOMY } from "./config";
import { anchorOf, countBuildings, footprint, isUnlockedTile, neighbors4, toXY } from "./map";
import { getRank, isBuildingUnlocked, rankIndex } from "./progression";
import { newBuilding } from "./state";
import type { ActionResult, BuildingType, GameState, ZoneType } from "./types";

const yen = (v: number) => `¥${Math.round(v).toLocaleString("ja-JP")}`;

export interface PlacementCheck {
  ok: boolean;
  cost: number;
  reason?: string;
}

/** 建物が占めるマス（2×2 の大型施設は4マス） */
export function cellsFor(state: Pick<GameState, "width">, type: BuildingType, i: number): number[] {
  return BUILDINGS[type].size === 2 ? footprint(i, state.width) : [i];
}

/** 建設費（地価・森の伐採費・橋を含む） */
export function buildCost(state: GameState, type: BuildingType, i: number): number {
  const def = BUILDINGS[type];
  if (isRoad(type) && state.tiles[i]?.terrain === "water") return ECONOMY.bridgeCost * (type === "avenue" ? 2 : 1);
  const land = isRoad(type) ? 1 : state.profile.landValue;
  let cost = Math.round((def.cost * land) / 1000) * 1000;
  for (const j of cellsFor(state, type, i)) if (state.tiles[j]?.terrain === "forest") cost += ECONOMY.forestClearCost;
  return cost;
}

/** 地図の外周（となり町との境）のマスか */
export function isOnEdge(state: Pick<GameState, "width" | "height">, i: number): boolean {
  const { x, y } = toXY(i, state.width);
  return x === 0 || y === 0 || x === state.width - 1 || y === state.height - 1;
}

export function checkPlacement(state: GameState, type: BuildingType, i: number): PlacementCheck {
  const tile = state.tiles[i];
  const def = BUILDINGS[type];
  if (!tile) return { ok: false, cost: 0, reason: "マップの外です" };
  const cost = buildCost(state, type, i);
  if (state.gameOver) return { ok: false, cost, reason: "ゲームは終了しています" };
  if (def.category === "special") return { ok: false, cost, reason: "この建物は建設できません" };
  if (!isBuildingUnlocked(type, state.rank)) {
    const rank = getRank(def.unlockRank);
    return { ok: false, cost, reason: `${def.name}は「${rank.name}」ランクで解禁されます` };
  }
  if (def.trait && def.trait !== state.profile.trait) return { ok: false, cost, reason: `${def.name}は別の個性の町の専用施設です` };
  if (def.size === 2) {
    // 大型施設：左上のマスを基準に2×2の空き地が必要
    if (def.category === "project" && countBuildings(state, type) > 0) return { ok: false, cost, reason: `${def.name}は1つの街に1つまでです` };
    const { x, y } = toXY(i, state.width);
    if (x + 1 >= state.width || y + 1 >= state.height) return { ok: false, cost, reason: "2×2マスの空き地が必要です" };
    for (const j of cellsFor(state, type, i)) {
      if (!isUnlockedTile(state, j)) return { ok: false, cost, reason: "まだ開発できないエリアにかかっています" };
      if (state.tiles[j].terrain === "water") return { ok: false, cost, reason: "水の上には建てられません" };
      if (state.tiles[j].building) return { ok: false, cost, reason: "2×2マスの空き地が必要です（建物を撤去してください）" };
    }
    const cells = cellsFor(state, type, i);
    if (def.nearWater && !cells.some((j) => neighbors4(j, state.width, state.height).some((k) => state.tiles[k].terrain === "water"))) {
      return { ok: false, cost, reason: `${def.name}は海や川に面した場所に建ててください` };
    }
    if (def.mapEdge && !cells.some((j) => isOnEdge(state, j))) {
      return { ok: false, cost, reason: `${def.name}は線路がとなり町へ続くよう、地図の端に面した場所に建ててください` };
    }
  } else {
    if (!isUnlockedTile(state, i)) return { ok: false, cost, reason: "まだ開発できないエリアです（ランクアップで拡張）" };
    if (tile.terrain === "water" && !isRoad(type)) return { ok: false, cost, reason: "水の上には道路（橋）しか建てられません" };
    const existing = tile.building;
    if (existing) {
      const upgrade = type === "avenue" && existing.type === "road";
      if (!upgrade) return { ok: false, cost, reason: existing.type === type ? "すでに建っています" : "先に撤去してください" };
    }
  }
  if (state.money < cost) return { ok: false, cost, reason: `資金が足りません（${yen(cost)} 必要）` };
  return { ok: true, cost };
}

export function placeBuilding(state: GameState, type: BuildingType, i: number): ActionResult {
  const check = checkPlacement(state, type, i);
  if (!check.ok) return { ok: false, error: check.reason ?? "建設できません" };
  const draft = structuredClone(state);
  const tile = draft.tiles[i];
  const def = BUILDINGS[type];
  const level = def.category === "zone" || def.buildMonths ? 0 : 1;
  const b = newBuilding(type, level, draft.turn, check.cost);
  if (def.buildMonths) b.buildLeft = def.buildMonths;
  tile.building = b;
  // 道路は水の上にも架けられる（橋）。それ以外は整地する
  if (!(isRoad(type) && tile.terrain === "water")) tile.terrain = "grass";
  for (const j of cellsFor(draft, type, i)) {
    if (j === i) continue;
    draft.tiles[j].building = { ...newBuilding("annex", 1, draft.turn), anchor: i };
    draft.tiles[j].terrain = "grass";
  }
  draft.money -= check.cost;
  draft.monthSpend += check.cost;
  const bridge = isRoad(type) && tile.terrain === "water";
  const message = def.buildMonths ? `${def.name}の工事を開始（完成まで${def.buildMonths}か月） -${yen(check.cost)}` : `${bridge ? "橋" : def.name}を建設 -${yen(check.cost)}`;
  return { ok: true, state: draft, message };
}

/** 撤去したときの返金額。今月建てたものは全額、公共施設・大型施設は一部を売却益として返金 */
export function demolishRefund(state: GameState, i: number): number {
  const b = state.tiles[anchorOf(state, i)]?.building;
  if (!b) return 0;
  if (b.builtTurn === state.turn && b.paid > 0) return b.paid;
  const cat = BUILDINGS[b.type].category;
  if (cat === "service" || cat === "project") return Math.round((b.paid * ECONOMY.sellRefund) / 1000) * 1000;
  return 0;
}

export function checkDemolish(state: GameState, i: number): { ok: boolean; refund: number; reason?: string } {
  const b = state.tiles[anchorOf(state, i)]?.building;
  if (state.gameOver) return { ok: false, refund: 0, reason: "ゲームは終了しています" };
  if (!b) return { ok: false, refund: 0, reason: "何も建っていません" };
  if (!BUILDINGS[b.type].removable) return { ok: false, refund: 0, reason: `${BUILDINGS[b.type].name}は撤去できません` };
  return { ok: true, refund: demolishRefund(state, i) };
}

export function demolish(state: GameState, i: number): ActionResult {
  const check = checkDemolish(state, i);
  if (!check.ok) return { ok: false, error: check.reason ?? "撤去できません" };
  const draft = structuredClone(state);
  const a = anchorOf(draft, i);
  const b = draft.tiles[a].building!;
  const name = BUILDINGS[b.type].name;
  for (const j of cellsFor(draft, b.type, a)) {
    if (j === a || draft.tiles[j]?.building?.anchor === a) draft.tiles[j].building = null;
  }
  draft.money += check.refund;
  if (b.builtTurn === draft.turn) draft.monthSpend = Math.max(0, draft.monthSpend - check.refund);
  const message = check.refund > 0 ? `${name}を撤去 +${yen(check.refund)}` : `${name}を撤去しました`;
  return { ok: true, state: draft, message };
}

/** 建て替え：住宅・商業・工業を、撤去せずに別のゾーンへ変える（空き地に建てるのと同じ費用） */
export function checkRebuild(state: GameState, i: number, type: BuildingType): PlacementCheck {
  const b = state.tiles[i]?.building;
  if (state.gameOver) return { ok: false, cost: 0, reason: "ゲームは終了しています" };
  if (!b || !isZone(b.type) || !isZone(type)) return { ok: false, cost: 0, reason: "建て替えできるのは住宅・商業・工業だけです" };
  if (b.type === type) return { ok: false, cost: 0, reason: "同じ種類です" };
  const cost = buildCost(state, type, i);
  if (state.money < cost) return { ok: false, cost, reason: `資金が足りません（${yen(cost)} 必要）` };
  return { ok: true, cost };
}

export function rebuild(state: GameState, i: number, type: BuildingType): ActionResult {
  const check = checkRebuild(state, i, type);
  if (!check.ok) return { ok: false, error: check.reason ?? "建て替えできません" };
  const draft = structuredClone(state);
  const from = BUILDINGS[draft.tiles[i].building!.type].name;
  draft.tiles[i].building = newBuilding(type, 0, draft.turn, check.cost);
  draft.money -= check.cost;
  draft.monthSpend += check.cost;
  return { ok: true, state: draft, message: `${from}を${BUILDINGS[type].name}に建て替え -${yen(check.cost)}` };
}

/** 埋め立て（水のマスを陸地にする）。大都市で解禁 */
export function checkReclaim(state: GameState, i: number): PlacementCheck {
  const cost = ECONOMY.reclaimCost;
  const t = state.tiles[i];
  if (!t) return { ok: false, cost, reason: "マップの外です" };
  if (rankIndex(state.rank) < rankIndex("metropolis")) return { ok: false, cost, reason: "埋め立ては「大都市」ランクで解禁されます" };
  if (!isUnlockedTile(state, i)) return { ok: false, cost, reason: "まだ開発できないエリアです" };
  if (t.terrain !== "water") return { ok: false, cost, reason: "埋め立てられるのは水のマスだけです" };
  if (t.building) return { ok: false, cost, reason: "先に橋を撤去してください" };
  if (state.money < cost) return { ok: false, cost, reason: `資金が足りません（${yen(cost)} 必要）` };
  return { ok: true, cost };
}

export function reclaim(state: GameState, i: number): ActionResult {
  const check = checkReclaim(state, i);
  if (!check.ok) return { ok: false, error: check.reason ?? "埋め立てできません" };
  const draft = structuredClone(state);
  draft.tiles[i].terrain = "grass";
  draft.money -= check.cost;
  draft.monthSpend += check.cost;
  return { ok: true, state: draft, message: `埋め立て -${yen(check.cost)}` };
}

export function setTax(state: GameState, zone: ZoneType, rate: number): ActionResult {
  if (state.gameOver) return { ok: false, error: "ゲームは終了しています" };
  const value = Math.max(ECONOMY.taxMin, Math.min(ECONOMY.taxMax, Math.round(rate)));
  if (state.taxes[zone] === value) return { ok: true, state };
  return { ok: true, state: { ...state, taxes: { ...state.taxes, [zone]: value } } };
}

export function loanLimit(state: GameState): number {
  return getRank(state.rank).loanLimit;
}

export function borrow(state: GameState, amount: number = ECONOMY.loanStep): ActionResult {
  if (state.gameOver) return { ok: false, error: "ゲームは終了しています" };
  const room = loanLimit(state) - state.loan;
  if (room <= 0) return { ok: false, error: "借りられる上限です（ランクアップで増えます）" };
  const value = Math.min(amount, room);
  return {
    ok: true,
    state: { ...state, loan: state.loan + value, money: state.money + value },
    message: `${yen(value)} を借りました（月利${ECONOMY.loanInterest * 100}%）`,
  };
}

export function repay(state: GameState, amount: number = ECONOMY.loanStep): ActionResult {
  if (state.gameOver) return { ok: false, error: "ゲームは終了しています" };
  if (state.loan <= 0) return { ok: false, error: "返済する借入はありません" };
  const value = Math.min(amount, state.loan);
  if (state.money < value) return { ok: false, error: "資金が足りません" };
  return { ok: true, state: { ...state, loan: state.loan - value, money: state.money - value }, message: `${yen(value)} を返済しました` };
}
