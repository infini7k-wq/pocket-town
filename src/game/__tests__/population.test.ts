import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { population } from "../map";
import { advanceMonth } from "../simulation";
import type { GameState } from "../types";
import { blankState, put, roadRow } from "./helpers";

/** 住宅・雇用・サービスがそろった小さな町 */
function goodTown(): GameState {
  const s = blankState();
  roadRow(s, 8, 3, 12);
  roadRow(s, 6, 3, 12);
  for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 25);
  for (let x = 3; x <= 5; x++) put(s, x, 7, "residential", 2, 25);
  put(s, 8, 9, "commercial", 2);
  put(s, 9, 9, "commercial", 2);
  put(s, 11, 5, "industrial", 2);
  put(s, 12, 5, "industrial", 2);
  put(s, 6, 7, "park");
  put(s, 8, 5, "school");
  put(s, 9, 5, "hospital");
  return s;
}

function run(s: GameState, months: number): GameState {
  for (let m = 0; m < months; m++) {
    s = { ...s, pendingEvent: null };
    s = advanceMonth(s)!.state;
  }
  return s;
}

describe("人口の増減", () => {
  it("住みやすく仕事がある町では人口が増える", () => {
    const s = goodTown();
    const after = run(s, 4);
    expect(population(after)).toBeGreaterThan(population(s));
  });

  it("住宅を置くだけでは増えない：仕事がなく満足度が低いと人口が減る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 12; x++) if (x !== 7) put(s, x, 9, "residential", 2, 45);
    s.taxes.residential = 18;
    const after = run(s, 6);
    expect(population(after)).toBeLessThan(population(s));
    expect(after.lastReport!.outflow).toBeGreaterThan(0);
  });

  it("転入 − 転出 は実際の人口の増減と一致する", () => {
    let s = goodTown();
    for (let m = 0; m < 6; m++) {
      const out = advanceMonth({ ...s, pendingEvent: null })!;
      const r = out.report;
      expect(r.inflow - r.outflow).toBe(r.populationAfter - r.populationBefore);
      expect(r.inflow).toBeGreaterThanOrEqual(0);
      expect(r.outflow).toBeGreaterThanOrEqual(0);
      s = out.state;
    }
  });

  it("人口が毎月大きく振動しない（安定性）", () => {
    let s = goodTown();
    s = run(s, 12);
    const pops: number[] = [];
    for (let m = 0; m < 12; m++) {
      s = run(s, 1);
      pops.push(population(s));
    }
    for (let k = 1; k < pops.length; k++) expect(Math.abs(pops[k] - pops[k - 1])).toBeLessThan(Math.max(40, pops[k] * 0.12));
  });
});

describe("満足度", () => {
  it("公園の近くの住宅は満足度が高い", () => {
    const s = blankState();
    roadRow(s, 8, 2, 12);
    const a1 = put(s, 3, 9, "residential", 1, 5);
    const b1 = put(s, 12, 9, "residential", 1, 5);
    put(s, 2, 9, "park"); // 道路に面していないと公園も機能しない
    const noRoad = blankState();
    put(noRoad, 3, 10, "park");
    const a = analyzeCity(s);
    expect(a.happiness[a1]).toBeGreaterThan(a.happiness[b1] + 8);
    expect(analyzeCity(noRoad).coverage.park.every((v) => v === 0)).toBe(true);
  });

  it("工場の近くの住宅は騒音と公害で満足度が下がる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const near = put(s, 3, 9, "residential", 1, 5);
    const far = put(s, 12, 9, "residential", 1, 5);
    put(s, 4, 9, "industrial", 3);
    const a = analyzeCity(s);
    expect(a.noise[near]).toBeGreaterThan(0);
    expect(a.env[near]).toBeLessThan(a.env[far]);
    expect(a.happiness[near]).toBeLessThan(a.happiness[far] - 10);
  });

  it("住宅税を上げると満足度が下がる", () => {
    const s = goodTown();
    const low = analyzeCity({ ...s, taxes: { ...s.taxes, residential: 5 } }).cityHappiness;
    const high = analyzeCity({ ...s, taxes: { ...s.taxes, residential: 15 } }).cityHappiness;
    expect(high).toBeLessThan(low);
  });
});

describe("雇用", () => {
  it("仕事が足りないと失業率が上がり、雇用枠が多すぎると人手不足になる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 50);
    const jobless = analyzeCity(s).employment;
    expect(jobless.unemployment).toBeGreaterThan(0.5);
    for (let x = 8; x <= 12; x++) put(s, x, 9, "industrial", 3);
    const busy = analyzeCity(s).employment;
    expect(busy.unemployment).toBeCloseTo(0, 5);
    expect(busy.jobFillRate).toBeLessThan(1);
  });

  it("人口が少ないと商業は需要不足で効率が落ちる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    put(s, 3, 9, "residential", 1, 10);
    for (let x = 4; x <= 10; x++) if (x !== 7) put(s, x, 9, "commercial", 3);
    expect(analyzeCity(s).employment.comEfficiency).toBeLessThan(0.5);
  });
});
