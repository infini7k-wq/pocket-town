import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { GOALS } from "../goals";
import { bestStars, makeHallRecord, upsertHall } from "../hall";
import { population } from "../map";
import { migrateSave, parseHall } from "../save";
import { SCENARIOS, evaluateScenario, getScenario, starsFor } from "../scenarios";
import { cityScore, weakestPart } from "../score";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";
import type { GameState } from "../types";

describe("街の評価", () => {
  it("0〜1000点でグレードがつき、項目ごとの内訳とヒントがある", () => {
    const s = createNewGame("A", 1);
    const score = cityScore(s, analyzeCity(s));
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(1000);
    expect(["S", "A", "B", "C", "D"]).toContain(score.grade);
    expect(score.parts.reduce((n, p) => n + p.max, 0)).toBe(1000);
    expect(weakestPart(score).hint.length).toBeGreaterThan(0);
  });

  it("メガシティの先の目標（人口2万人・評価S・100年）がある", () => {
    const ids = GOALS.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(["pop20k", "gradeS", "century"]));
  });
});

describe("チャレンジ（シナリオ）", () => {
  it("6本あり、それぞれ特別な状況から始まる", () => {
    expect(SCENARIOS).toHaveLength(6);
    const debt = createNewGame("A", 1, { scenario: "debt" });
    expect(debt.scenario).toMatchObject({ id: "debt", startTurn: 0, deadline: 6 * 12 - 1, result: null });
    expect(debt.loan).toBe(2_000_000);
    const green = createNewGame("A", 1, { scenario: "greenRevival" });
    expect(green.profile.trait).toBe("industrial");
    expect(green.tiles.some((t) => t.building?.type === "commercial")).toBe(false);
    const village = createNewGame("A", 1, { scenario: "depopulated" });
    expect(population(village)).toBeLessThan(population(createNewGame("A", 1)));
    expect(village.era.id).toBe("aging");
    expect(createNewGame("A", 1).scenario).toBeNull();
  });

  it("目標を満たすと星つきで達成、期限を過ぎると失敗", () => {
    const s = createNewGame("A", 1, { scenario: "debt" });
    s.loan = 0;
    s.money = 5_000_000;
    s.turn = 10;
    const r = evaluateScenario(s, analyzeCity(s));
    expect(r).toEqual({ turn: 10, stars: 3 });
    expect(s.news[0].title).toContain("チャレンジ達成");
    // 一度結果が出たら、もう判定しない
    expect(evaluateScenario(s, analyzeCity(s))).toBeNull();

    const late = createNewGame("B", 2, { scenario: "debt" });
    late.turn = late.scenario!.deadline;
    expect(evaluateScenario(late, analyzeCity(late))).toBe("failed");
  });

  it("早く達成するほど星が多い", () => {
    const def = getScenario("ecoCity")!;
    const s = createNewGame("A", 1);
    expect(starsFor(def, s, 12)).toBe(3);
    expect(starsFor(def, s, 100)).toBe(2);
    expect(starsFor(def, s, 140)).toBe(1);
    const speed = getScenario("speedrun")!;
    expect(starsFor(speed, s, 18 * 12)).toBe(3);
    expect(starsFor(speed, s, 30 * 12)).toBe(1);
  });

  it("月次処理の中で判定され、レポートに結果が載る", () => {
    const s = createNewGame("A", 1, { scenario: "debt" });
    s.loan = 0;
    s.money = 9_000_000;
    const out = advanceMonth(s)!;
    expect(out.report.scenarioResult).toMatchObject({ stars: 3 });
    expect(out.state.scenario!.result).toMatchObject({ stars: 3 });
  });
});

describe("殿堂", () => {
  it("街の記録をつくり、同じ街はより良い記録で上書きする", () => {
    const s = createNewGame("記録町", 3);
    const a = analyzeCity(s);
    const rec = makeHallRecord(s, a, new Date("2026-01-01"));
    expect(rec).toMatchObject({ gameId: s.gameId, townName: "記録町", rank: "village" });
    let hall = upsertHall([], rec);
    hall = upsertHall(hall, { ...rec, score: rec.score - 50, peakPopulation: 10 });
    expect(hall).toHaveLength(1);
    expect(hall[0].score).toBe(rec.score);
    expect(hall[0].peakPopulation).toBe(rec.peakPopulation);
    hall = upsertHall(hall, { ...rec, gameId: "other", scenarioId: "debt", stars: 2 });
    expect(bestStars(hall)).toEqual({ debt: 2 });
    expect(parseHall(JSON.stringify(hall))).toHaveLength(2);
    expect(parseHall("{broken")).toEqual([]);
  });
});

describe("セーブの移行（v2 → v3）", () => {
  it("ゲーム ID とチャレンジの項目を補う", () => {
    const now = createNewGame("A", 7);
    const v2 = { ...now, version: 2 } as Partial<GameState>;
    delete v2.gameId;
    delete v2.scenario;
    const migrated = migrateSave(v2 as GameState)!;
    expect(migrated.version).toBe(3);
    expect(migrated.gameId).toMatch(/^legacy-/);
    expect(migrated.scenario).toBeNull();
  });
});
