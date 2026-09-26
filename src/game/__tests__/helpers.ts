import type { ActionResult } from "../types";
import { createNewGame, newBuilding } from "../state";
import type { BuildingType, GameState } from "../types";

export function unwrap(r: ActionResult): GameState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** 役所(7,7)だけがある、16×16 の何もない草地の町（テストで状況を作りやすいように） */
export function blankState(seed = 1): GameState {
  const s = createNewGame("テスト町", seed);
  s.width = 16;
  s.height = 16;
  s.tiles = Array.from({ length: 16 * 16 }, () => ({ terrain: "grass" as const, building: null }));
  s.tiles[7 * 16 + 7].building = newBuilding("cityHall", 1, 0);
  s.money = 100_000_000;
  s.modifiers = [];
  s.profile = { ...s.profile, landValue: 1, comDemand: 1, indDemand: 1, resAppeal: 0, tendency: "balanced" };
  return s;
}

/** 建物を直接置く（お金や条件を無視） */
export function put(s: GameState, x: number, y: number, type: BuildingType, level = 1, occupants = 0): number {
  const i = y * s.width + x;
  const b = newBuilding(type, level, -1);
  b.occupants = occupants;
  s.tiles[i].building = b;
  s.tiles[i].terrain = "grass";
  return i;
}

/** (x1,y)〜(x2,y) に横向きの道路を引く */
export function roadRow(s: GameState, y: number, x1: number, x2: number) {
  for (let x = x1; x <= x2; x++) put(s, x, y, "road");
}

export function roadCol(s: GameState, x: number, y1: number, y2: number) {
  for (let y = y1; y <= y2; y++) put(s, x, y, "road");
}

export const idx = (s: GameState, x: number, y: number) => y * s.width + x;
