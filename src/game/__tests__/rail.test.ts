import { describe, expect, it } from "vitest";
import { checkPlacement, demolish, expandLand, placeBuilding } from "../actions";
import { analyzeCity } from "../analysis";
import { enactPolicy } from "../policies";
import { RAIL, computeBusRoutes, computeRailNetwork, lineStyle, stationWorking } from "../rail";
import { computeRoadNetwork } from "../roads";
import { parseSave, serialize } from "../save";
import { createNewGame, newBuilding } from "../state";
import { blankState, idx, put, roadCol, roadRow, unwrap } from "./helpers";

/** 市の町：(0,3)〜(15,3) に線路、(0..15,4) に道路 */
function railTown() {
  const s = { ...blankState(), rank: "city" as const };
  roadRow(s, 4, 0, 15);
  roadCol(s, 7, 4, 7);
  for (let x = 0; x < 16; x++) put(s, x, 3, "rail");
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
    const s = { ...blankState(), rank: "city" as const };
    for (let x = 3; x <= 10; x++) put(s, x, 3, "rail");
    put(s, 4, 3, "railStation");
    expect(computeRailNetwork(s).lines[0].working).toBe(false);
    put(s, 9, 3, "railStation");
    const net = computeRailNetwork(s);
    expect(net.lines[0].working).toBe(true);
    expect(net.lines[0].strength).toBeGreaterThan(0.6);
    expect(lineStyle(s, net, 0).name).toBe("テスト本線");
  });
});

describe("線路の置き方", () => {
  it("道路に線路を通すと踏切になり、撤去すると線路だけ外れる", () => {
    const s = { ...blankState(), rank: "city" as const };
    roadRow(s, 4, 0, 15);
    const i = idx(s, 3, 4);
    const crossed = unwrap(placeBuilding(s, "rail", i));
    expect(crossed.tiles[i].building?.type).toBe("road");
    expect(crossed.tiles[i].building?.rail).toBe(true);
    expect(checkPlacement(crossed, "rail", i).ok).toBe(false);
    const removed = unwrap(demolish(crossed, i));
    expect(removed.tiles[i].building?.type).toBe("road");
    expect(removed.tiles[i].building?.rail).toBeUndefined();
  });

  it("線路の上に道路を通しても踏切になる", () => {
    const s = { ...blankState(), rank: "city" as const };
    put(s, 3, 3, "rail");
    const next = unwrap(placeBuilding(s, "road", idx(s, 3, 3)));
    expect(next.tiles[idx(s, 3, 3)].building).toMatchObject({ type: "road", rail: true });
  });

  it("鉄道駅は道路に面した線路の上だけ。撤去すると線路に戻る", () => {
    const s = railTown();
    put(s, 5, 2, "rail");
    expect(checkPlacement(s, "railStation", idx(s, 5, 2)).ok).toBe(false); // 道路に面していない
    expect(checkPlacement(s, "railStation", idx(s, 5, 6)).ok).toBe(false); // 線路ではない
    const i = idx(s, 5, 3);
    const built = unwrap(placeBuilding(s, "railStation", i));
    expect(built.tiles[i].building?.type).toBe("railStation");
    const back = unwrap(demolish(built, i));
    expect(back.tiles[i].building?.type).toBe("rail");
  });

  it("水の上の線路は鉄橋の費用で、町のランクが市になるまで敷けない", () => {
    const s = { ...blankState(), rank: "city" as const };
    s.tiles[idx(s, 3, 3)].terrain = "water";
    const c = checkPlacement(s, "rail", idx(s, 3, 3));
    expect(c.ok).toBe(true);
    expect(c.cost).toBe(RAIL.bridgeCost);
    expect(checkPlacement({ ...s, rank: "town" }, "rail", idx(s, 4, 4)).ok).toBe(false);
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

  it("踏切の道路は容量が少し減る", () => {
    const s = railTown();
    for (let x = 2; x <= 9; x++) if (x !== 7) put(s, x, 5, "residential", 3, 120);
    const plain = analyzeCity(s);
    s.tiles[idx(s, 3, 4)].building!.rail = true;
    const crossed = analyzeCity(s);
    expect(crossed.traffic.ratio[idx(s, 3, 4)]).toBeGreaterThan(plain.traffic.ratio[idx(s, 3, 4)]);
  });
});

describe("バス路線", () => {
  it("道のり8マス以内のバス停どうしが路線になり、効き目が強くなる", () => {
    const s = { ...blankState(), rank: "town" as const };
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
    const s = { ...blankState(), rank: "town" as const };
    roadRow(s, 4, 0, 15);
    put(s, 1, 5, "busStop");
    put(s, 14, 5, "busStop");
    expect(computeBusRoutes(s, computeRoadNetwork(s)).routes).toHaveLength(2);
  });
});

describe("保存と土地の買い足し", () => {
  it("踏切の印は保存・読み込みで残る", () => {
    const s = railTown();
    s.tiles[idx(s, 3, 4)].building!.rail = true;
    const loaded = parseSave(serialize(s));
    expect(loaded?.tiles[idx(s, 3, 4)].building?.rail).toBe(true);
  });

  it("地図の端まで来ていた線路は、土地を買い足すと新しい端まで延びる", () => {
    const s = createNewGame("M", 3);
    s.rank = "megacity";
    s.money = 1e10;
    const y = 10;
    s.tiles[y * 24].building = newBuilding("rail", 1, 0);
    s.tiles[y * 24].terrain = "grass";
    const next = unwrap(expandLand(s));
    const w = next.width;
    expect(next.tiles[(y + 2) * w + 0].building?.type).toBe("rail");
    expect(next.tiles[(y + 2) * w + 1].building?.type).toBe("rail");
    expect(next.tiles[(y + 2) * w + 2].building?.type).toBe("rail");
    expect(computeRailNetwork(next).lines.some((l) => l.edge)).toBe(true);
  });
});
