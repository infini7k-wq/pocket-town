import { describe, expect, it } from "vitest";
import { checkPlacement, demolish, expandLand, placeBuilding, removeElevated } from "../actions";
import { analyzeCity } from "../analysis";
import { noiseSources } from "../environment";
import { cityProblems } from "../problems";
import { besideGroundTrack, computeRailNetwork, stationWorking } from "../rail";
import { createNewGame } from "../state";
import type { GameState } from "../types";
import { blankState, idx, put, roadCol, roadRow, unwrap } from "./helpers";

/** 市の町：道路 y=4 と y=6、その間 y=5 に家が並ぶ（線路を通す場所がない） */
function denseTown(): GameState {
  const s: GameState = { ...blankState(), rank: "city" };
  roadRow(s, 4, 0, 15);
  roadRow(s, 6, 0, 15);
  roadCol(s, 7, 4, 6);
  for (let x = 0; x < 16; x++) if (x !== 7) put(s, x, 5, "residential", 2, 30);
  return s;
}

describe("高架線路", () => {
  it("家や道路の上に架けても、下はそのまま残る", () => {
    let s = denseTown();
    for (let x = 0; x < 16; x++) s = unwrap(placeBuilding(s, "elevated", idx(s, x, 5)));
    expect(s.tiles[idx(s, 3, 5)].building?.type).toBe("residential");
    expect(s.tiles[idx(s, 7, 5)].building?.type).toBe("road");
    expect(s.tiles.filter((t) => t.elevated)).toHaveLength(16);
    const a = analyzeCity(s);
    expect(a.net.connected[idx(s, 3, 5)]).toBe(true); // 道路のつながりは変わらない
    expect(computeRailNetwork(s).lines[0].edge).toBe(true); // 地図の端までの高架はとなり町へ続く
  });

  it("高架の下の家の場所に駅を置くと駅に建て替わり、電車が走る。撤去すると高架だけ残る", () => {
    let s = denseTown();
    for (let x = 0; x < 16; x++) s = unwrap(placeBuilding(s, "elevated", idx(s, x, 5)));
    expect(checkPlacement(s, "railStation", idx(s, 7, 5)).ok).toBe(false); // 道路の上は不可
    s = unwrap(placeBuilding(s, "railStation", idx(s, 3, 5)));
    expect(s.tiles[idx(s, 3, 5)].building?.type).toBe("railStation");
    expect(stationWorking(computeRailNetwork(s), idx(s, 3, 5))).toBe(true);
    expect(analyzeCity(s).rail.ride[idx(s, 3, 8)]).toBeGreaterThan(0);
    s = unwrap(demolish(s, idx(s, 3, 5)));
    expect(s.tiles[idx(s, 3, 5)].building).toBeNull();
    expect(s.tiles[idx(s, 3, 5)].elevated).toBe(true);
  });

  it("真下ととなりに電車の音が届き、騒音の理由は「電車」と案内する", () => {
    let s = denseTown();
    const quiet = analyzeCity(s).noise[idx(s, 3, 5)];
    s = unwrap(placeBuilding(s, "elevated", idx(s, 3, 5)));
    const a = analyzeCity(s);
    expect(a.noise[idx(s, 3, 5)]).toBeGreaterThan(quiet);
    expect(a.noise[idx(s, 4, 5)]).toBeGreaterThan(0);
    expect(noiseSources(s, idx(s, 3, 5))).toMatchObject({ train: true, factory: false, airport: false });
  });

  it("今月架けた高架は外すと全額戻る。家の上の高架は「高架を外す」で外せる", () => {
    let s = denseTown();
    const money = s.money;
    s = unwrap(placeBuilding(s, "elevated", idx(s, 3, 5)));
    expect(s.money).toBeLessThan(money);
    s = unwrap(removeElevated(s, idx(s, 3, 5)));
    expect(s.money).toBe(money);
    expect(s.tiles[idx(s, 3, 5)].building?.type).toBe("residential");
    // 空き地の高架は撤去ツールで外れる
    s = unwrap(placeBuilding(s, "elevated", idx(s, 3, 9)));
    s = unwrap(demolish(s, idx(s, 3, 9)));
    expect(s.tiles[idx(s, 3, 9)].elevated).toBeUndefined();
  });

  it("線路のあるマスや高架の下には重ねられず、市になるまで使えない", () => {
    const s = denseTown();
    put(s, 2, 9, "rail");
    expect(checkPlacement(s, "elevated", idx(s, 2, 9)).ok).toBe(false);
    const e = unwrap(placeBuilding(s, "elevated", idx(s, 3, 9)));
    expect(checkPlacement(e, "rail", idx(s, 3, 9)).ok).toBe(false);
    expect(checkPlacement({ ...s, rank: "town" }, "elevated", idx(s, 4, 9)).ok).toBe(false);
  });

  it("地図の端まで来ていた高架は、土地を買い足すと新しい端まで延びる", () => {
    const s = createNewGame("M", 3);
    s.rank = "megacity";
    s.money = 1e10;
    s.tiles[10 * 24].elevated = true;
    const next = unwrap(expandLand(s));
    for (let x = 0; x <= 2; x++) expect(next.tiles[12 * next.width + x].elevated).toBe(true);
  });
});

describe("線路は道路の代わりにならない、の案内", () => {
  it("線路にしか面していない家は、困りごとで「反対側に道路を」と案内する", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    roadRow(s, 4, 0, 15);
    roadCol(s, 7, 4, 6);
    for (let x = 0; x < 16; x++) put(s, x, 9, "rail");
    const h = put(s, 3, 10, "residential", 1, 3);
    expect(besideGroundTrack(s, h)).toBe(true);
    const p = cityProblems(s, analyzeCity(s)).find((q) => q.tile === h);
    expect(p?.text).toContain("反対側に道路");
  });

  it("電車の音はななめには届かず、川の上の高架は鉄橋と同じ費用", () => {
    let s = denseTown();
    s = unwrap(placeBuilding(s, "elevated", idx(s, 3, 9)));
    const a = analyzeCity(s);
    expect(a.noise[idx(s, 4, 10)]).toBe(0);
    s.tiles[idx(s, 5, 9)].terrain = "water";
    expect(checkPlacement(s, "elevated", idx(s, 5, 9)).cost).toBeGreaterThanOrEqual(250_000);
  });
});
