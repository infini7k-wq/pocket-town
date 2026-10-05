import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { applyGrowth, nextLevelChecks } from "../growth";
import { createRng } from "../rng";
import { advanceMonth } from "../simulation";
import type { GameState } from "../types";
import { blankState, put, roadRow } from "./helpers";

function niceStreet(): { s: GameState; home: number } {
  const s = blankState();
  roadRow(s, 8, 3, 12);
  const home = put(s, 4, 9, "residential", 1, 14);
  put(s, 3, 9, "park");
  put(s, 5, 9, "commercial", 1);
  put(s, 6, 9, "school");
  put(s, 8, 9, "hospital");
  put(s, 11, 9, "industrial", 1);
  return { s, home };
}

describe("建物の成長", () => {
  it("道路に面した造成地は翌月に Lv1 の建物になる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const i = put(s, 4, 9, "residential", 0);
    const next = advanceMonth(s)!;
    expect(next.state.tiles[i].building!.level).toBe(1);
    expect(next.report.changes).toContainEqual({ tile: i, kind: "built", level: 1 });
  });

  it("条件が良いと Lv1 → Lv2（集合住宅）に成長する", () => {
    const { s, home } = niceStreet();
    s.tiles[home].building!.growth = 100;
    let grew = false;
    let cur = s;
    for (let m = 0; m < 12 && !grew; m++) {
      cur = { ...advanceMonth({ ...cur, pendingEvent: null })!.state };
      grew = cur.tiles[home].building!.level === 2;
    }
    expect(grew).toBe(true);
  });

  it("村のうちは Lv3 にならない（町でアンロック）", () => {
    const { s, home } = niceStreet();
    const b = s.tiles[home].building!;
    b.level = 2;
    b.occupants = 50;
    b.growth = 100;
    const a = analyzeCity(s);
    expect(nextLevelChecks(s, home, a)!.some((c) => c.label.includes("ランク") && !c.ok)).toBe(true);
    for (let k = 0; k < 10; k++) applyGrowth(s, a, createRng(k));
    expect(b.level).toBe(2);
  });

  it("条件が悪いと衰退し、最後は空き家になる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const i = put(s, 4, 9, "residential", 1, 10);
    for (let x = 5; x <= 6; x++) put(s, x, 9, "industrial", 3);
    s.taxes.residential = 20;
    const b = s.tiles[i].building!;
    b.growth = -95;
    applyGrowth(s, analyzeCity(s), createRng(1));
    expect(b.abandoned).toBe(true);
    expect(b.occupants).toBe(0);
  });

  it("レベルアップ条件のチェックリストを返す", () => {
    const { s, home } = niceStreet();
    const checks = nextLevelChecks(s, home, analyzeCity(s))!;
    expect(checks.map((c) => c.label).join()).toContain("満足度");
    expect(checks[0]).toEqual({ key: "connected", label: "役所まで道路でつながっている", ok: true });
  });
});
