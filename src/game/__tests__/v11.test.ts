import { describe, expect, it } from "vitest";
import { rebuild, repay, setTax } from "../actions";
import { nextAdvice } from "../advice";
import { analyzeCity } from "../analysis";
import { forEachInRange } from "../map";
import { migrate } from "../population";
import { createRng } from "../rng";
import { advanceMonth } from "../simulation";
import { generateVoices, voiceCandidates } from "../voices";
import { blankState, idx, put, roadRow, unwrap } from "./helpers";

describe("v1.1 エンジン", () => {
  it("2×2 の施設の範囲は、4マスのどこからでも同じ距離で測る", () => {
    const s = blankState();
    const cells: number[] = [];
    // (5,5) を左上とする2×2から半径2
    forEachInRange(idx(s, 5, 5), 2, 2, s.width, s.height, (j) => cells.push(j));
    expect(cells).toContain(idx(s, 8, 6)); // 右へ2マス
    expect(cells).toContain(idx(s, 3, 5)); // 左へ2マス
    expect(cells).toContain(idx(s, 5, 8)); // 下へ2マス
    expect(cells).not.toContain(idx(s, 8, 8)); // 右下の斜め（√8 > 2.5）
    expect(cells).not.toContain(idx(s, 9, 6)); // 右へ3マス
  });

  it("建て替えで、住宅を撤去せずに商業へ変えられる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const i = put(s, 4, 9, "residential", 2, 30);
    const next = unwrap(rebuild(s, i, "commercial"));
    expect(next.tiles[i].building?.type).toBe("commercial");
    expect(next.tiles[i].building?.level).toBe(0);
    expect(next.money).toBeLessThan(s.money);
    expect(rebuild(s, idx(s, 7, 7), "commercial").ok).toBe(false); // 役所は不可
  });

  it("ゲームオーバー後は税率変更・返済もできない", () => {
    const s = blankState();
    s.loan = 500_000;
    s.gameOver = { reason: "test", turn: 1 };
    expect(setTax(s, "residential", 5).ok).toBe(false);
    expect(repay(s).ok).toBe(false);
  });

  it("転出の理由を記録する（道路がない家からは noRoad）", () => {
    const s = blankState();
    put(s, 3, 3, "residential", 1, 10); // 道路なし
    const a = analyzeCity(s);
    const r = migrate(s, { net: a.net, happiness: a.happiness, employment: a.employment, fx: a.fx }, createRng(1));
    expect(r.reasons.noRoad).toBe(10);
  });

  it("一気に2ランク上がると、飛ばしたランクのお祝い金ももらえる", () => {
    const s = blankState();
    roadRow(s, 8, 1, 14);
    roadRow(s, 10, 1, 14);
    for (let x = 1; x <= 14; x++) {
      put(s, x, 9, "residential", 4, 220);
      put(s, x, 11, "residential", 4, 220);
    }
    const before = s.money;
    const { state, report } = advanceMonth(s)!;
    expect(report.rankUp).toBe("city");
    // 町（100万）＋市（300万）の両方が入る（収支の増減は ±100万に収まる）
    expect(state.money - before).toBeGreaterThan(3_000_000);
  });

  it("困りごとが解決すると、お礼の声が出る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 1, 10);
    const prev = [{ id: "noRoad", persona: "", face: "", text: "", tone: "bad" as const }];
    const voices = generateVoices(s, analyzeCity(s), createRng(1), null, prev);
    expect(voices.some((v) => v.id === "thanks-noRoad")).toBe(true);
  });

  it("赤字だと、財政タブへ案内する声とおすすめが出る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    put(s, 4, 9, "hospital");
    put(s, 5, 9, "school");
    s.money = 100_000;
    const a = analyzeCity(s);
    expect(a.budget.net).toBeLessThan(0);
    expect(voiceCandidates(s, a, null).find((c) => c.id === "deficit")?.openTab).toBe("finance");
    const advice = nextAdvice(s, a);
    expect(advice?.urgent).toBe(true);
  });

  it("困りごとがなければ、需要の高いゾーンをすすめる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const advice = nextAdvice(s, analyzeCity(s));
    expect(advice).not.toBeNull();
    expect(advice!.title.length).toBeGreaterThan(0);
  });
});
