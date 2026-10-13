import { describe, expect, it } from "vitest";
import { demolish, placeBuilding, placeZones } from "../actions";
import { analyzeCity } from "../analysis";
import { landTaxFactor } from "../landvalue";
import { cityProblems } from "../problems";
import { RAIL, computeRailNetwork, stationWorking } from "../rail";
import { advanceMonth } from "../simulation";
import type { GameState } from "../types";
import { blankState, idx, put, roadCol, roadRow, trackRow, unwrap } from "./helpers";

/** 市の町：(0..15,3) に線路、(0..15,4) に道路 */
function railTown(): GameState {
  const s: GameState = { ...blankState(), rank: "city" };
  roadRow(s, 4, 0, 15);
  roadCol(s, 7, 4, 6);
  trackRow(s, 3, 0, 15);
  return s;
}

describe("地価", () => {
  it("公園や駅のそばは高く、工場のそばは安い。高い場所の住宅ほど税収が多い", () => {
    const s = railTown();
    put(s, 2, 5, "residential", 2, 40);
    put(s, 12, 5, "residential", 2, 40);
    put(s, 3, 5, "park");
    put(s, 2, 3, "railStation");
    for (let x = 11; x <= 15; x++) if (x !== 12) put(s, x, 6, "industrial", 2);
    const a = analyzeCity(s);
    const good = a.landValue[idx(s, 2, 5)];
    const bad = a.landValue[idx(s, 12, 5)];
    expect(good).toBeGreaterThan(bad + 15);
    expect(landTaxFactor(good)).toBeGreaterThan(landTaxFactor(bad));
    expect(landTaxFactor(50)).toBeCloseTo(1);
  });
});

describe("貨物駅と駅の成長", () => {
  it("貨物駅は線路の上に置き、電車が走ると近くの工場の車が減る", () => {
    const s = railTown();
    for (let x = 2; x <= 6; x++) put(s, x, 5, "industrial", 2);
    for (let x = 8; x <= 15; x++) put(s, x, 5, "residential", 2, 60); // 働き手
    const before = analyzeCity(s);
    const st = unwrap(placeBuilding(s, "freightStation", idx(s, 4, 3)));
    expect(stationWorking(computeRailNetwork(st), idx(s, 4, 3))).toBe(true); // 地図の端につながっている
    const after = analyzeCity(st);
    const load = (a: typeof before) => a.traffic.load.reduce((p, v) => p + v, 0);
    expect(load(after)).toBeLessThan(load(before));
    expect(after.employment.indSupport).toBeGreaterThan(before.employment.indSupport);
    const back = unwrap(demolish(st, idx(s, 4, 3)));
    expect(back.tiles[idx(s, 4, 3)].building).toBeNull();
    expect(back.tiles[idx(s, 4, 3)].track).toBe(true);
  });

  it("乗客の多い駅は、大きな駅 → 駅ビルに育つ（1か月に1段ずつ）", () => {
    const s = railTown();
    for (let x = 0; x < 16; x++) if (x !== 7) put(s, x, 5, "residential", 2, 60);
    put(s, 5, 3, "railStation");
    const riders = analyzeCity(s).traffic.stationRiders.get(idx(s, 5, 3)) ?? 0;
    expect(riders).toBeGreaterThan(0);
    // しきい値を下げて、育ち方のルールだけを確かめる
    const saved = [...RAIL.stationRiders];
    RAIL.stationRiders[2] = 1;
    RAIL.stationRiders[3] = 2;
    try {
      let cur = advanceMonth(s)!.state;
      expect(cur.tiles[idx(s, 5, 3)].building?.level).toBe(2);
      cur = advanceMonth(cur)!.state;
      expect(cur.tiles[idx(s, 5, 3)].building?.level).toBe(3);
      expect(analyzeCity(cur).rail.ride[idx(s, 5, 8)]).toBeGreaterThan(0); // 駅ビルは5マス先まで
      expect(cur.news.some((n) => n.title.includes("駅ビル"))).toBe(true);
    } finally {
      RAIL.stationRiders.splice(0, saved.length, ...saved);
    }
  });
});

describe("困りごと", () => {
  it("道路のない建物・電車の来ない駅・空き家を一覧にする", () => {
    const s = { ...blankState(), rank: "city" as const };
    roadRow(s, 4, 0, 15);
    roadCol(s, 7, 4, 6);
    put(s, 2, 10, "residential", 1, 3); // 道路なし
    trackRow(s, 3, 3, 6);
    put(s, 4, 3, "railStation"); // 端にもほかの駅にもつながらない
    const ab = put(s, 9, 5, "residential", 1, 0);
    s.tiles[ab].building!.abandoned = true;
    const kinds = cityProblems(s, analyzeCity(s)).map((p) => p.kind);
    expect(kinds).toContain("noRoad");
    expect(kinds).toContain("noLine");
    expect(kinds).toContain("abandoned");
  });
});

describe("レビューで見つかった点", () => {
  it("駅どうしはバス路線にならないが、バス停と駅はつながる", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    roadRow(s, 4, 0, 15);
    trackRow(s, 5, 2, 6);
    put(s, 2, 5, "railStation");
    put(s, 6, 5, "railStation");
    let a = analyzeCity(s);
    expect(a.busRoutes.routes.every((r) => r.length === 1)).toBe(true);
    put(s, 4, 5, "busStop");
    a = analyzeCity(s);
    expect(a.busRoutes.routes.some((r) => r.length === 3)).toBe(true);
  });

  it("地価が高いほど住宅税が多い（同じ住民数でくらべる）", () => {
    const base = railTown();
    for (let x = 1; x <= 5; x++) put(base, x, 5, "residential", 2, 40);
    const plain = analyzeCity(base).budget.income.residential;
    // 道路に面した公園（道路に面していない施設は効かない）
    put(base, 0, 5, "park");
    put(base, 6, 5, "park");
    put(base, 3, 3, "railStation");
    expect(analyzeCity(base).budget.income.residential).toBeGreaterThan(plain);
  });

  it("まとめて区画は1回で置き、置けないマスは飛ばす", () => {
    const s = { ...blankState(), rank: "city" as const };
    roadRow(s, 4, 0, 15);
    put(s, 3, 5, "park");
    const r = placeZones(s, "residential", [idx(s, 2, 5), idx(s, 3, 5), idx(s, 4, 5)]);
    expect(r.ok).toBe(true);
    expect(r.placed).toEqual([idx(s, 2, 5), idx(s, 4, 5)]);
  });

  it("困りごとは同じ場所を2回案内しない", () => {
    const s = { ...blankState(), rank: "city" as const };
    const i = put(s, 2, 10, "residential", 1, 0);
    s.tiles[i].building!.abandoned = true;
    const list = cityProblems(s, analyzeCity(s));
    expect(list.filter((p) => p.tile === i)).toHaveLength(1);
  });
});
