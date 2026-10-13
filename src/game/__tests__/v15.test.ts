import { describe, expect, it } from "vitest";
import { checkPlacement, demolish, placeBuilding } from "../actions";
import { analyzeCity } from "../analysis";
import { noiseSources } from "../environment";
import { cityProblems } from "../problems";
import { besideTrack, computeRailNetwork, stationWorking } from "../rail";
import { parseSave, serialize } from "../save";
import type { GameState } from "../types";
import { blankState, idx, put, roadCol, roadRow, trackRow, unwrap } from "./helpers";

/** 市の町：道路 y=4 と y=6、その間 y=5 に家が並ぶ（線路を通す空き地がない） */
function denseTown(): GameState {
  const s: GameState = { ...blankState(), rank: "city" };
  roadRow(s, 4, 0, 15);
  roadRow(s, 6, 0, 15);
  roadCol(s, 7, 4, 6);
  for (let x = 0; x < 16; x++) if (x !== 7) put(s, x, 5, "residential", 2, 30);
  return s;
}

describe("埋まった街にも線路を通せる", () => {
  it("家の列の上に線路を引き、家の場所に駅を置くと電車が走る（ほかの家はそのまま）", () => {
    let s = denseTown();
    for (let x = 0; x < 16; x++) s = unwrap(placeBuilding(s, "rail", idx(s, x, 5)));
    expect(s.tiles.filter((t) => t.building?.type === "residential")).toHaveLength(15);
    s = unwrap(placeBuilding(s, "railStation", idx(s, 3, 5)));
    expect(stationWorking(computeRailNetwork(s), idx(s, 3, 5))).toBe(true); // 地図の端につながっている
    expect(analyzeCity(s).rail.ride[idx(s, 3, 8)]).toBeGreaterThan(0);
  });

  it("線路の下の家の騒音は「電車」が原因と分かる", () => {
    const s = denseTown();
    trackRow(s, 5, 2, 4);
    expect(noiseSources(s, idx(s, 3, 5))).toMatchObject({ train: true, factory: false, airport: false });
    expect(noiseSources(s, idx(s, 9, 5)).train).toBe(false);
  });
});

describe("線路は道路の代わりにならない、の案内", () => {
  it("線路にしか面していない家は、困りごとで「道路に面した場所へ」と案内する", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    roadRow(s, 4, 0, 15);
    roadCol(s, 7, 4, 6);
    trackRow(s, 9, 0, 15);
    const h = put(s, 3, 10, "residential", 1, 3);
    expect(besideTrack(s, h)).toBe(true);
    const p = cityProblems(s, analyzeCity(s)).find((q) => q.tile === h);
    expect(p?.text).toContain("線路は家の入口にならない");
  });
});

describe("線路をまとめたあとのレビューで見つかった点", () => {
  it("古いセーブの住民の声に残った「高架線路」「地下鉄」の道具は、線路・駅に読みかえる", () => {
    const s = denseTown();
    const raw = JSON.parse(serialize(s));
    raw.voices = [{ id: "traffic", turn: 0, persona: "worker", text: "渋滞", tone: "bad", tool: "elevated" }, { id: "x", turn: 0, persona: "worker", text: "x", tone: "bad", tool: "subwayStation" }];
    const loaded = parseSave(JSON.stringify(raw))!;
    expect(loaded.voices.map((v) => v.tool)).toEqual(["rail", "railStation"]);
  });

  it("線路の上には2×2の大型施設を建てられない", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    trackRow(s, 10, 2, 6);
    expect(checkPlacement(s, "stadium", idx(s, 3, 9)).ok).toBe(false);
    expect(checkPlacement(s, "stadium", idx(s, 3, 11)).ok).toBe(true);
  });

  it("今月引いた川の上の線路は、外すと払った額（¥25万）が戻る", () => {
    let s: GameState = { ...blankState(), rank: "city" };
    s.tiles[idx(s, 3, 3)].terrain = "water";
    const money = s.money;
    s = unwrap(placeBuilding(s, "rail", idx(s, 3, 3)));
    expect(money - s.money).toBe(250_000);
    s = unwrap(demolish(s, idx(s, 3, 3)));
    expect(s.money).toBe(money);
  });

  it("となりが「線路の下の家」なだけなら、線路の案内は出さない", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    const h = put(s, 3, 10, "residential", 1, 3);
    put(s, 4, 10, "residential", 1, 3);
    s.tiles[idx(s, 4, 10)].track = true;
    expect(besideTrack(s, h)).toBe(false);
  });

  it("線路の真下の家は電車の音の苦情が出るくらいうるさい（苦情の文と食い違わない）", () => {
    const s = denseTown();
    trackRow(s, 5, 2, 2);
    expect(analyzeCity(s).noise[idx(s, 2, 5)]).toBeGreaterThan(5);
  });
});

