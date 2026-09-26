// 開発用：ボットで育てた町のセーブデータを書き出す（EXPORT_SAVE=パス のときだけ実行）
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { checkPlacement, placeBuilding } from "../actions";
import { isRoad } from "../buildings";
import { footprint, neighbors4 } from "../map";
import { createNewGame } from "../state";
import type { BuildingType, GameState } from "../types";
import { botTurn, runMonths } from "./bot";

function placeProject(s: GameState, type: BuildingType): GameState {
  const ok = (i: number) => checkPlacement(s, type, i).ok;
  const nearRoad = (i: number) => footprint(i, s.width).some((c) => neighbors4(c, s.width, s.height).some((j) => isRoad(s.tiles[j].building?.type)));
  let spot = s.tiles.findIndex((_, i) => ok(i) && nearRoad(i));
  if (spot < 0) spot = s.tiles.findIndex((_, i) => ok(i));
  if (spot < 0) return s;
  const r = placeBuilding(s, type, spot);
  return r.ok ? r.state : s;
}

it.runIf(process.env.EXPORT_SAVE)("export grown town", () => {
  let s = runMonths(createNewGame("そだった町", 4), 84, (x) => botTurn(x));
  s = { ...s, money: s.money + 30_000_000 };
  s = placeProject(s, "university");
  const uni = s.tiles.find((t) => t.building?.type === "university")?.building;
  if (uni) {
    uni.level = 1;
    delete uni.buildLeft;
  }
  s = placeProject(s, "stadium");
  s.era = { ...s.era, next: { id: "tourism", turn: s.turn + 5, announced: true } };
  writeFileSync(process.env.EXPORT_SAVE!, JSON.stringify(s));
});
