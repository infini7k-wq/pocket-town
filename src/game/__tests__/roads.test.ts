import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { computeRoadNetwork } from "../roads";
import { advanceMonth } from "../simulation";
import { blankState, idx, put, roadRow } from "./helpers";

describe("道路ネットワーク", () => {
  it("役所に隣接する道路網につながった建物は connected になる", () => {
    const s = blankState();
    roadRow(s, 8, 4, 10); // 役所(7,7)の真下を通る
    put(s, 4, 9, "residential", 1, 5);
    const net = computeRoadNetwork(s);
    expect(net.roadAccess[idx(s, 4, 9)]).toBe(true);
    expect(net.connected[idx(s, 4, 9)]).toBe(true);
    expect(net.distance[idx(s, 7, 8)]).toBe(1);
  });

  it("役所につながっていない道路沿いの建物は roadAccess だが connected ではない", () => {
    const s = blankState();
    roadRow(s, 3, 3, 6);
    put(s, 4, 4, "residential", 1, 5);
    const net = computeRoadNetwork(s);
    expect(net.roadAccess[idx(s, 4, 4)]).toBe(true);
    expect(net.connected[idx(s, 4, 4)]).toBe(false);
  });

  it("道路に面していない住宅には住めず、造成も進まない", () => {
    const s = blankState();
    roadRow(s, 8, 4, 10);
    const lonely = put(s, 3, 3, "residential", 1, 10);
    const zoned = put(s, 4, 3, "residential", 0, 0);
    const a = analyzeCity(s);
    expect(a.net.roadAccess[lonely]).toBe(false);
    expect(a.unconnected).toBeGreaterThanOrEqual(2);
    const next = advanceMonth(s)!.state;
    expect(next.tiles[lonely].building!.occupants).toBe(0);
    expect(next.tiles[zoned].building!.level).toBe(0);
  });

  it("中心に届かない住宅は定員が半分になり、満足度も下がる", () => {
    const s = blankState();
    roadRow(s, 8, 4, 10);
    roadRow(s, 3, 3, 6);
    const near = put(s, 5, 9, "residential", 2, 20);
    const far = put(s, 4, 4, "residential", 2, 20);
    const a = analyzeCity(s);
    expect(a.employment.housingCapacity).toBe(50 + 25);
    expect(a.happiness[far]).toBeLessThan(a.happiness[near]);
  });
});
