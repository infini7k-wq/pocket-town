import { describe, expect, it } from "vitest";
import { checkPlacement, demolish, expandLand, placeBuilding, removeTrack } from "../actions";
import { analyzeCity } from "../analysis";
import { enactPolicy } from "../policies";
import { RAIL, computeBusRoutes, computeRailNetwork, lineStyle, stationWorking } from "../rail";
import { computeRoadNetwork } from "../roads";
import { parseSave, serialize } from "../save";
import { createNewGame } from "../state";
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

describe("鉄道の路線", () => {
  it("駅が1つで地図の端につながると電車が走り、駅のない線路は走らない", () => {
    const s = railTown();
    let net = computeRailNetwork(s);
    expect(net.lines).toHaveLength(1);
    expect(net.lines[0].edge).toBe(true);
    expect(net.lines[0].working).toBe(false); // 駅がない
    put(s, 5, 3, "railStation");
    net = computeRailNetwork(s);
    expect(net.lines[0].working).toBe(true);
    expect(stationWorking(net, idx(s, 5, 3))).toBe(true);
    expect(net.ride[idx(s, 5, 6)]).toBeGreaterThan(0);
    expect(net.ride[idx(s, 5, 12)]).toBe(0); // 4マスより遠い
  });

  it("端につながらない線路は、駅が2つ以上で走る", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    trackRow(s, 3, 3, 10);
    put(s, 4, 3, "railStation");
    expect(computeRailNetwork(s).lines[0].working).toBe(false);
    put(s, 9, 3, "railStation");
    const net = computeRailNetwork(s);
    expect(net.lines[0].working).toBe(true);
    expect(net.lines[0].strength).toBeGreaterThan(0.6);
    expect(lineStyle(s, net, 0).name).toBe("テスト本線");
  });
});

describe("線路の引き方（1種類だけ）", () => {
  it("空き地・道路・家の上のどこでも引けて、下のものはそのまま残る", () => {
    let s: GameState = { ...blankState(), rank: "city" };
    roadRow(s, 4, 0, 15);
    roadCol(s, 7, 4, 6);
    put(s, 3, 5, "residential", 2, 30);
    for (const y of [2, 3, 4, 5, 6]) s = unwrap(placeBuilding(s, "rail", idx(s, 3, y)));
    expect(s.tiles[idx(s, 3, 4)].building?.type).toBe("road");
    expect(s.tiles[idx(s, 3, 5)].building?.type).toBe("residential");
    expect(s.tiles.filter((t) => t.track)).toHaveLength(5);
    expect(analyzeCity(s).net.connected[idx(s, 3, 5)]).toBe(true); // 道路のつながりは変わらない
    expect(checkPlacement(s, "rail", idx(s, 3, 4)).ok).toBe(false); // すでに線路がある
  });

  it("川や海の上は高く、市になるまで引けない。大きな施設の上は不可", () => {
    const s: GameState = { ...blankState(), rank: "city" };
    s.tiles[idx(s, 3, 3)].terrain = "water";
    expect(checkPlacement(s, "rail", idx(s, 3, 3)).cost).toBe(RAIL.bridgeCost);
    expect(checkPlacement(s, "rail", idx(s, 4, 4)).cost).toBe(100_000);
    expect(checkPlacement({ ...s, rank: "town" }, "rail", idx(s, 4, 4)).ok).toBe(false);
    put(s, 10, 10, "stadium");
    expect(checkPlacement(s, "rail", idx(s, 10, 10)).ok).toBe(false);
  });

  it("駅は線路の上の、道路に面した空き地か家の場所だけ。撤去しても線路は残る", () => {
    const s = railTown();
    trackRow(s, 2, 5, 5);
    put(s, 6, 3, "residential", 1, 3);
    expect(checkPlacement(s, "railStation", idx(s, 5, 2)).ok).toBe(false); // 道路に面していない
    expect(checkPlacement(s, "railStation", idx(s, 5, 6)).ok).toBe(false); // 線路ではない
    expect(checkPlacement(s, "railStation", idx(s, 7, 4)).ok).toBe(false); // 道路の上は不可
    expect(checkPlacement(s, "railStation", idx(s, 6, 3)).ok).toBe(true); // 家の場所は建て替え
    const i = idx(s, 5, 3);
    const built = unwrap(placeBuilding(s, "railStation", i));
    expect(built.tiles[i].building?.type).toBe("railStation");
    const back = unwrap(demolish(built, i));
    expect(back.tiles[i].building).toBeNull();
    expect(back.tiles[i].track).toBe(true);
  });

  it("建物のないマスの線路は撤去で外れ、家の上の線路は「線路を外す」で外せる（今月の分は全額戻る）", () => {
    let s = railTown();
    put(s, 2, 8, "residential", 1, 3);
    const money = s.money;
    s = unwrap(placeBuilding(s, "rail", idx(s, 2, 8)));
    s = unwrap(removeTrack(s, idx(s, 2, 8)));
    expect(s.money).toBe(money);
    expect(s.tiles[idx(s, 2, 8)].building?.type).toBe("residential");
    s = unwrap(placeBuilding(s, "rail", idx(s, 4, 9)));
    s = unwrap(demolish(s, idx(s, 4, 9)));
    expect(s.tiles[idx(s, 4, 9)].track).toBeUndefined();
    expect(s.money).toBe(money);
  });
});

describe("鉄道の効果", () => {
  it("電車が走る駅のそばでは車が減り、運賃収入が入る（無料化中はなし）", () => {
    const s = railTown();
    for (let x = 2; x <= 9; x++) if (x !== 7) put(s, x, 5, "residential", 3, 120);
    const before = analyzeCity(s);
    put(s, 5, 3, "railStation");
    const after = analyzeCity(s);
    expect(after.traffic.riders).toBeGreaterThan(0);
    const load = (a: typeof before) => a.traffic.load.reduce((p, v) => p + v, 0);
    expect(load(after)).toBeLessThan(load(before) * 0.75);
    expect(after.budget.income.facilities).toBeGreaterThan(before.budget.income.facilities);
    const free = unwrap(enactPolicy({ ...s, rank: "metropolis", money: 1e9 }, "freeTransit"));
    expect(analyzeCity(free).budget.income.facilities).toBeLessThan(after.budget.income.facilities);
  });

  it("線路の真下の家にだけ電車の音が届き、維持費がかかる", () => {
    const s = railTown();
    put(s, 2, 5, "residential", 2, 30);
    put(s, 3, 5, "residential", 2, 30);
    const before = analyzeCity(s);
    s.tiles[idx(s, 2, 5)].track = true;
    const after = analyzeCity(s);
    expect(after.noise[idx(s, 2, 5)]).toBeGreaterThan(before.noise[idx(s, 2, 5)]);
    expect(after.noise[idx(s, 3, 5)]).toBe(before.noise[idx(s, 3, 5)]);
    expect(after.budget.expense.roads).toBeGreaterThan(before.budget.expense.roads);
  });
});

describe("バス路線", () => {
  it("道のり8マス以内のバス停どうしが路線になり、効き目が強くなる", () => {
    const s: GameState = { ...blankState(), rank: "town" };
    roadRow(s, 4, 0, 15);
    put(s, 2, 5, "busStop");
    let routes = computeBusRoutes(s, computeRoadNetwork(s));
    expect(routes.routes).toHaveLength(1);
    const alone = analyzeCity(s).coverage.transit[idx(s, 2, 6)];
    put(s, 8, 5, "busStop");
    routes = computeBusRoutes(s, computeRoadNetwork(s));
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes[0]).toHaveLength(2);
    expect(analyzeCity(s).coverage.transit[idx(s, 2, 6)]).toBeGreaterThan(alone);
  });

  it("道のりが8マスより遠いバス停は別の路線（ひとりぼっち）", () => {
    const s: GameState = { ...blankState(), rank: "town" };
    roadRow(s, 4, 0, 15);
    put(s, 1, 5, "busStop");
    put(s, 14, 5, "busStop");
    expect(computeBusRoutes(s, computeRoadNetwork(s)).routes).toHaveLength(2);
  });
});

describe("保存と土地の買い足し", () => {
  it("線路は保存・読み込みで残る", () => {
    const s = railTown();
    const loaded = parseSave(serialize(s));
    expect(loaded?.tiles.filter((t) => t.track)).toHaveLength(16);
  });

  it("以前の版の線路（地上・踏切・高架・地下鉄）と地下鉄駅・貨物駅は、新しい線路と駅に変わる", () => {
    const s = railTown();
    s.tiles.forEach((t) => delete t.track);
    const raw = JSON.parse(serialize(s));
    raw.tiles[idx(s, 1, 3)].building = { type: "rail", level: 1, occupants: 0, growth: 0, builtTurn: 0, paid: 0, abandoned: false };
    raw.tiles[idx(s, 2, 4)].building.rail = true; // 踏切
    raw.tiles[idx(s, 3, 3)].elevated = true;
    raw.tiles[idx(s, 4, 3)].subway = true;
    raw.tiles[idx(s, 5, 3)].building = { type: "subwayStation", level: 2, occupants: 0, growth: 0, builtTurn: 0, paid: 0, abandoned: false };
    raw.tiles[idx(s, 6, 3)].building = { type: "freightStation", level: 1, occupants: 0, growth: 0, builtTurn: 0, paid: 0, abandoned: false };
    const loaded = parseSave(JSON.stringify(raw))!;
    expect(loaded.tiles[idx(s, 1, 3)].building).toBeNull();
    expect(loaded.tiles[idx(s, 1, 3)].track).toBe(true);
    expect(loaded.tiles[idx(s, 2, 4)].building?.type).toBe("road");
    expect(loaded.tiles[idx(s, 2, 4)].track).toBe(true);
    expect("rail" in (loaded.tiles[idx(s, 2, 4)].building ?? {})).toBe(false);
    expect(loaded.tiles[idx(s, 3, 3)].track).toBe(true);
    expect(loaded.tiles[idx(s, 4, 3)].track).toBe(true);
    expect(loaded.tiles[idx(s, 5, 3)].building).toMatchObject({ type: "railStation", level: 2 });
    expect(loaded.tiles[idx(s, 5, 3)].track).toBe(true);
    expect(loaded.tiles[idx(s, 6, 3)].building?.type).toBe("railStation"); // 貨物駅も普通の駅に
    expect(JSON.stringify(loaded)).not.toMatch(/elevated|subway|freight/);
  });

  it("地図の端まで来ていた線路は、土地を買い足すと新しい端まで延びる", () => {
    const s = createNewGame("M", 3);
    s.rank = "megacity";
    s.money = 1e10;
    const y = 10;
    s.tiles[y * 24].track = true;
    const next = unwrap(expandLand(s));
    const w = next.width;
    for (let x = 0; x <= 2; x++) expect(next.tiles[(y + 2) * w + x].track).toBe(true);
    expect(computeRailNetwork(next).lines.some((l) => l.edge)).toBe(true);
  });
});
