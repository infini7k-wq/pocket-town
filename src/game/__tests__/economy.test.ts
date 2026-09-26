import { describe, expect, it } from "vitest";
import { borrow, repay, setTax } from "../actions";
import { analyzeCity } from "../analysis";
import { BUILDINGS } from "../buildings";
import { ECONOMY } from "../config";
import { adminCost, residentialTaxPerCapita } from "../economy";
import { advanceMonth } from "../simulation";
import { blankState, put, roadRow, unwrap } from "./helpers";

describe("財政", () => {
  it("住宅税 = 人口 × 単価 × 税率（失業者は一部のみ納税）", () => {
    expect(residentialTaxPerCapita(10, 1)).toBe(ECONOMY.resTaxUnit * 10);
    expect(residentialTaxPerCapita(10, 0.5)).toBeCloseTo(ECONOMY.resTaxUnit * 10 * (0.5 + 0.5 * ECONOMY.unemployedTaxShare));
  });

  it("維持費は道路・公共施設・行政サービス費の合計", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    put(s, 4, 9, "school");
    put(s, 5, 9, "residential", 2, 40);
    const b = analyzeCity(s).budget;
    expect(b.expense.roads).toBe(10 * BUILDINGS.road.upkeep);
    expect(b.expense.services).toBe(BUILDINGS.school.upkeep + BUILDINGS.cityHall.upkeep);
    expect(b.expense.admin).toBe(Math.round(adminCost(40) / 100) * 100);
    expect(b.net).toBe(b.income.total - b.expense.total);
  });

  it("月次処理で収支が資金に反映される", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    put(s, 5, 9, "residential", 2, 40);
    const out = advanceMonth(s)!;
    // イベントは最初の数か月起きないので、資金の増減は収支と一致する
    expect(out.state.money - s.money).toBe(out.report.budget.net);
  });

  it("税率を上げると税収は増えるが、満足度が下がる（トレードオフ）", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 40);
    put(s, 8, 9, "commercial", 2);
    put(s, 9, 9, "industrial", 2);
    const base = analyzeCity(s);
    const taxed = unwrap(setTax(s, "residential", 14));
    const a = analyzeCity(taxed);
    expect(a.budget.income.residential).toBeGreaterThan(base.budget.income.residential);
    expect(a.cityHappiness).toBeLessThan(base.cityHappiness);
    // 商業・工業税は需要を下げる
    const bizTaxed = analyzeCity(unwrap(setTax(s, "commercial", 18)));
    expect(bizTaxed.employment.comSupport).toBeLessThan(base.employment.comSupport);
  });

  it("税率は 0〜20% に収まる", () => {
    const s = blankState();
    expect(unwrap(setTax(s, "industrial", 99)).taxes.industrial).toBe(ECONOMY.taxMax);
    expect(unwrap(setTax(s, "industrial", -5)).taxes.industrial).toBe(ECONOMY.taxMin);
  });

  it("融資は上限まで借りられ、利息が支出に入る。返済もできる", () => {
    let s = blankState();
    s = unwrap(borrow(s));
    expect(s.loan).toBe(ECONOMY.loanStep);
    expect(analyzeCity(s).budget.expense.interest).toBe(ECONOMY.loanStep * ECONOMY.loanInterest);
    for (let k = 0; k < 10; k++) {
      const r = borrow(s);
      if (r.ok) s = r.state;
    }
    expect(s.loan).toBe(2_000_000);
    expect(borrow(s).ok).toBe(false);
    s = unwrap(repay(s));
    expect(s.loan).toBe(1_500_000);
  });
});
