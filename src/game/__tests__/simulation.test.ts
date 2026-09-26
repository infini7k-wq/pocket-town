import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { ECONOMY, RANKS } from "../config";
import { population } from "../map";
import { rankForPopulation } from "../progression";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";
import { botTurn, runMonths } from "./bot";
import { blankState, put, roadCol, roadRow } from "./helpers";

describe("新規ゲーム", () => {
  it("道路・住宅・商店・役所・数百人の住民がいる小さな町から始まる", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createNewGame("テスト", seed);
      const types = new Set(s.tiles.map((t) => t.building?.type));
      for (const t of ["road", "residential", "commercial", "cityHall"]) expect(types.has(t as never)).toBe(true);
      const pop = population(s);
      expect(pop).toBeGreaterThan(200);
      expect(pop).toBeLessThan(600);
      expect(s.voices.length).toBeGreaterThan(0);
      const a = analyzeCity(s);
      expect(a.budget.net).toBeGreaterThan(0); // 最初から赤字にはしない
      expect(a.unconnected).toBe(0);
    }
  });

  it("町の個性はシードによって変わる", () => {
    const traits = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => createNewGame("x", seed).profile.trait));
    expect(traits.size).toBeGreaterThan(1);
  });
});

describe("月次シミュレーション", () => {
  it("1か月進めると日付・履歴・レポートが更新される", () => {
    const s = createNewGame("テスト", 1);
    const out = advanceMonth(s)!;
    expect(out.state.turn).toBe(1);
    expect(out.state.history).toHaveLength(2);
    expect(out.state.lastReport).toEqual(out.report);
    expect(out.report.populationBefore).toBe(population(s));
  });

  it("何もしなくても最初の2年で町は崩壊しない", () => {
    const s = runMonths(createNewGame("放置", 11), 24);
    expect(s.gameOver).toBeNull();
    expect(population(s)).toBeGreaterThan(200);
  });

  it("需要を見て建設を続けると、町は成長してランクアップする", () => {
    let best = 0;
    for (const seed of [1, 2]) {
      const s = runMonths(createNewGame("成長", seed), 60, (x) => botTurn(x));
      best = Math.max(best, population(s));
      expect(population(s)).toBeGreaterThan(population(createNewGame("成長", seed)) * 2);
    }
    expect(best).toBeGreaterThanOrEqual(RANKS[1].minPopulation);
  });

  it("人口がしきい値を超えるとランクアップし、お祝い金と新しい建物が手に入る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    roadRow(s, 10, 3, 12);
    roadRow(s, 12, 3, 12);
    roadCol(s, 2, 8, 12); // すべての道路を役所につなぐ
    // 満員の集合住宅（1,200人以上）と十分な雇用
    for (const y of [9, 11, 13]) for (let x = 3; x <= 12; x++) put(s, x, y, "residential", 2, 50);
    for (let x = 3; x <= 12; x++) if (x !== 7) put(s, x, 7, "industrial", 3);
    expect(population(s)).toBeGreaterThanOrEqual(1200);
    const money = s.money;
    const out = advanceMonth(s)!;
    expect(population(out.state)).toBeGreaterThanOrEqual(1000);
    expect(out.state.rank).toBe("town");
    expect(out.report.rankUp).toBe("town");
    expect(out.state.money - money - out.report.budget.net).toBe(RANKS[1].reward);
    expect(rankForPopulation(3000).id).toBe("city");
    expect(rankForPopulation(8000).id).toBe("metropolis");
  });

  it(`資金がマイナスのまま${ECONOMY.bankruptcyMonths}か月続くと財政破綻する`, () => {
    let s = createNewGame("赤字", 1);
    s.money = -50_000_000;
    for (let m = 0; m < ECONOMY.bankruptcyMonths; m++) {
      expect(s.gameOver).toBeNull();
      s = advanceMonth({ ...s, pendingEvent: null })!.state;
    }
    expect(s.gameOver).not.toBeNull();
    expect(advanceMonth(s)).toBeNull();
  });

  it("一時的な赤字では破綻しない（立て直せばカウントがリセット）", () => {
    let s = createNewGame("立て直し", 1);
    s.money = -10_000;
    s = advanceMonth(s)!.state;
    s.money = 1_000_000;
    s = advanceMonth(s)!.state;
    expect(s.debtMonths).toBe(0);
  });
});
