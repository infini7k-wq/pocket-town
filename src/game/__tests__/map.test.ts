import { describe, expect, it } from "vitest";
import { buildCost, checkPlacement, demolish, placeBuilding } from "../actions";
import { ECONOMY } from "../config";
import { buildableBounds, gridPath, isUnlockedTile, toIndex, toXY } from "../map";
import { blankState, idx, put, unwrap } from "./helpers";

describe("マップモデル", () => {
  it("座標とインデックスを相互に変換できる", () => {
    expect(toIndex(3, 5, 16)).toBe(83);
    expect(toXY(83, 16)).toEqual({ x: 3, y: 5 });
  });

  it("村のうちは中央12×12だけ建設でき、ランクアップで広がる", () => {
    const s = blankState();
    expect(buildableBounds(s)).toEqual({ min: 2, max: 13 });
    expect(isUnlockedTile(s, idx(s, 1, 1))).toBe(false);
    expect(isUnlockedTile({ ...s, rank: "town" }, idx(s, 1, 1))).toBe(true);
    expect(isUnlockedTile({ ...s, rank: "city" }, idx(s, 0, 0))).toBe(true);
  });

  it("gridPath は斜めに飛ばず上下左右につながる", () => {
    const path = gridPath(idx(blankState(), 2, 2), idx(blankState(), 5, 4), 16);
    expect(path[path.length - 1]).toBe(4 * 16 + 5);
    let prev = 2 * 16 + 2;
    for (const p of path) {
      const a = toXY(prev, 16);
      const b = toXY(p, 16);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      prev = p;
    }
    expect(path).toHaveLength(5);
  });
});

describe("建物の配置", () => {
  it("建設すると資金が減り、ゾーンは造成中（Lv0）から始まる", () => {
    const s = blankState();
    const i = idx(s, 4, 4);
    const next = unwrap(placeBuilding(s, "residential", i));
    expect(next.money).toBe(s.money - buildCost(s, "residential", i));
    expect(next.tiles[i].building).toMatchObject({ type: "residential", level: 0 });
    expect(next.monthSpend).toBe(buildCost(s, "residential", i));
    // 元の状態は変わらない（純粋関数）
    expect(s.tiles[i].building).toBeNull();
  });

  it("公共施設はすぐに完成する", () => {
    const s = blankState();
    const next = unwrap(placeBuilding(s, "park", idx(s, 4, 4)));
    expect(next.tiles[idx(s, 4, 4)].building?.level).toBe(1);
  });

  it("水の上・建設済み・未開発エリア・未解禁・資金不足は建てられない", () => {
    const s = blankState();
    s.tiles[idx(s, 4, 4)].terrain = "water";
    expect(checkPlacement(s, "residential", idx(s, 4, 4)).ok).toBe(false);
    put(s, 5, 5, "park");
    expect(checkPlacement(s, "residential", idx(s, 5, 5)).reason).toContain("撤去");
    expect(checkPlacement(s, "road", idx(s, 0, 0)).reason).toContain("開発できない");
    expect(checkPlacement(s, "busStop", idx(s, 6, 6)).reason).toContain("解禁");
    expect(checkPlacement({ ...s, money: 1000 }, "school", idx(s, 6, 6)).reason).toContain("資金");
  });

  it("森に建てると伐採費がかかり、地価が建設費に反映される", () => {
    const s = blankState();
    s.tiles[idx(s, 4, 4)].terrain = "forest";
    expect(buildCost(s, "road", idx(s, 4, 4))).toBe(20_000 + ECONOMY.forestClearCost);
    const pricey = { ...s, profile: { ...s.profile, landValue: 1.2 } };
    expect(buildCost(pricey, "residential", idx(s, 5, 5))).toBe(60_000);
    expect(buildCost(pricey, "road", idx(s, 5, 5))).toBe(20_000); // 道路は地価の影響なし
  });

  it("道路は大通りに置き換えられる（町ランク以上）", () => {
    const s = { ...blankState(), rank: "town" as const };
    put(s, 4, 4, "road");
    expect(checkPlacement(s, "avenue", idx(s, 4, 4)).ok).toBe(true);
  });
});

describe("撤去", () => {
  it("今月建てたものは全額返金される", () => {
    const s = blankState();
    const i = idx(s, 4, 4);
    const built = unwrap(placeBuilding(s, "school", i));
    const removed = unwrap(demolish(built, i));
    expect(removed.money).toBe(s.money);
    expect(removed.tiles[i].building).toBeNull();
  });

  it("過去に建てた公共施設は40%で売却、ゾーンは返金なし", () => {
    const s = blankState();
    const i = idx(s, 4, 4);
    const built = unwrap(placeBuilding(s, "school", i));
    built.turn += 1;
    expect(unwrap(demolish(built, i)).money - built.money).toBe(Math.round((600_000 * 0.4) / 1000) * 1000);
    const z = unwrap(placeBuilding(s, "residential", idx(s, 6, 4)));
    z.turn += 1;
    expect(unwrap(demolish(z, idx(s, 6, 4))).money).toBe(z.money);
  });

  it("役所は撤去できない", () => {
    const s = blankState();
    expect(demolish(s, idx(s, 7, 7)).ok).toBe(false);
  });
});
