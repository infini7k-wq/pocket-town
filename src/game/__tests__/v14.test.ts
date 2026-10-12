import { describe, expect, it } from "vitest";
import { checkPlacement, demolish, placeBuilding, placeZones } from "../actions";
import { analyzeCity } from "../analysis";
import { landTaxFactor } from "../landvalue";
import { cityProblems } from "../problems";
import { RAIL, computeRailNetwork, stationWorking } from "../rail";
import { advanceMonth } from "../simulation";
import type { GameState } from "../types";
import { blankState, idx, put, roadCol, roadRow, unwrap } from "./helpers";

/** 市の町：(0..15,3) に線路、(0..15,4) に道路 */
function railTown(rank: "city" | "metropolis" = "city") {
  const s = { ...blankState(), rank };
  roadRow(s, 4, 0, 15);
  roadCol(s, 7, 4, 6);
  for (let x = 0; x < 16; x++) put(s, x, 3, "rail");
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
    expect(unwrap(demolish(st, idx(s, 4, 3))).tiles[idx(s, 4, 3)].building?.type).toBe("rail");
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

describe("地下鉄", () => {
  it("建物の下にも掘れて、トンネルの上の空き地に地下鉄駅を置くと電車が走る", () => {
    let s: GameState = { ...blankState(), rank: "metropolis" };
    roadRow(s, 4, 0, 15);
    put(s, 3, 5, "residential", 2, 30);
    for (let x = 2; x <= 10; x++) s = unwrap(placeBuilding(s, "subway", idx(s, x, 5)));
    expect(s.tiles[idx(s, 3, 5)].building?.type).toBe("residential"); // 地上の家はそのまま
    expect(s.tiles[idx(s, 3, 5)].subway).toBe(true);
    expect(checkPlacement(s, "subwayStation", idx(s, 3, 5)).ok).toBe(false); // 入口には空き地が必要
    expect(checkPlacement(s, "subwayStation", idx(s, 2, 6)).ok).toBe(false); // トンネルの上ではない
    s = unwrap(placeBuilding(s, "subwayStation", idx(s, 2, 5)));
    expect(computeRailNetwork(s).lines[0].working).toBe(false); // 駅1つで端にもつながらない
    s = unwrap(placeBuilding(s, "subwayStation", idx(s, 10, 5)));
    const net = computeRailNetwork(s);
    expect(net.lines[0].working).toBe(true);
    expect(net.ride[idx(s, 6, 7)]).toBeGreaterThan(0);
    expect(checkPlacement({ ...s, rank: "city" }, "subway", idx(s, 1, 8)).ok).toBe(false); // 大都市から
  });

  it("地下鉄の維持費がかかり、空き地のトンネルは撤去で埋められる", () => {
    let s: GameState = { ...blankState(), rank: "metropolis" };
    const before = analyzeCity(s).budget.expense.roads;
    s = unwrap(placeBuilding(s, "subway", idx(s, 2, 2)));
    expect(analyzeCity(s).budget.expense.roads).toBeGreaterThan(before);
    s = unwrap(demolish(s, idx(s, 2, 2)));
    expect(s.tiles[idx(s, 2, 2)].subway).toBeUndefined();
  });
});

describe("困りごと", () => {
  it("道路のない建物・電車の来ない駅・空き家を一覧にする", () => {
    const s = { ...blankState(), rank: "city" as const };
    roadRow(s, 4, 0, 15);
    roadCol(s, 7, 4, 6);
    put(s, 2, 10, "residential", 1, 3); // 道路なし
    for (let x = 3; x <= 6; x++) put(s, x, 3, "rail");
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
  it("地図の端の道路の下を通るトンネルは、となり町とのつながりに数えない", () => {
    let s: GameState = { ...blankState(), rank: "metropolis" };
    roadRow(s, 4, 0, 15);
    roadCol(s, 7, 4, 6);
    for (let x = 0; x <= 5; x++) s = unwrap(placeBuilding(s, "subway", idx(s, x, 4)));
    s = unwrap(placeBuilding(s, "subway", idx(s, 3, 5)));
    s = unwrap(placeBuilding(s, "subwayStation", idx(s, 3, 5)));
    const line = computeRailNetwork(s).lines[computeRailNetwork(s).lineOf[idx(s, 3, 5)]];
    expect(line.edge).toBe(false);
    expect(line.working).toBe(false);
  });

  it("新幹線駅ではない大型施設の下のトンネルは、新幹線につながったことにならない", () => {
    let s: GameState = { ...blankState(), rank: "metropolis" };
    put(s, 2, 2, "stadium");
    s.tiles[idx(s, 3, 2)].building = { type: "annex", level: 1, occupants: 0, growth: 0, builtTurn: 0, paid: 0, abandoned: false, anchor: idx(s, 2, 2) };
    for (let x = 3; x <= 6; x++) s = unwrap(placeBuilding(s, "subway", idx(s, x, 2)));
    expect(computeRailNetwork(s).lines[computeRailNetwork(s).lineOf[idx(s, 3, 2)]].shinkansen).toBe(false);
  });

  it("今月掘ったトンネルは埋めると全額戻り、地下鉄駅を撤去してもトンネルは残る", () => {
    let s: GameState = { ...blankState(), rank: "metropolis" };
    roadRow(s, 4, 0, 15);
    const money = s.money;
    s = unwrap(placeBuilding(s, "subway", idx(s, 2, 2)));
    s = unwrap(demolish(s, idx(s, 2, 2)));
    expect(s.money).toBe(money);
    s = unwrap(placeBuilding(s, "subway", idx(s, 3, 5)));
    s = unwrap(placeBuilding(s, "subwayStation", idx(s, 3, 5)));
    s = unwrap(demolish(s, idx(s, 3, 5)));
    expect(s.tiles[idx(s, 3, 5)].building).toBeNull();
    expect(s.tiles[idx(s, 3, 5)].subway).toBe(true);
  });

  it("駅どうしはバス路線にならないが、バス停と駅はつながる", () => {
    let s: GameState = { ...blankState(), rank: "metropolis" };
    roadRow(s, 4, 0, 15);
    for (const x of [2, 6]) {
      s = unwrap(placeBuilding(s, "subway", idx(s, x, 5)));
      s = unwrap(placeBuilding(s, "subwayStation", idx(s, x, 5)));
    }
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
