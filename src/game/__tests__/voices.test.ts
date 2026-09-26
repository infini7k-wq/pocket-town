import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { createRng } from "../rng";
import { generateVoices, voiceCandidates } from "../voices";
import { blankState, put, roadRow } from "./helpers";

describe("住民の声", () => {
  it("仕事が足りないと「仕事が見つからない」という声が出る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 50);
    const ids = voiceCandidates(s, analyzeCity(s), null).map((v) => v.id);
    expect(ids).toContain("unemployment");
  });

  it("工場の騒音の声は、問題の住宅の場所を指す", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const home = put(s, 4, 9, "residential", 1, 10);
    put(s, 5, 9, "industrial", 2);
    const noise = voiceCandidates(s, analyzeCity(s), null).find((v) => v.id === "noise");
    expect(noise?.tile).toBe(home);
    expect(noise?.hint).toBeTruthy();
  });

  it("道路に面していない建物があると教えてくれる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const i = put(s, 3, 3, "residential", 0);
    const v = voiceCandidates(s, analyzeCity(s), null).find((c) => c.id === "noRoad");
    expect(v?.tile).toBe(i);
  });

  it("状態が良ければ褒める声も出る。最大4件で、良い声が少なくとも1つ入る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 1, 10);
    s.taxes.residential = 5; // 「税金が安くて助かる」
    const voices = generateVoices(s, analyzeCity(s), createRng(1), null);
    expect(voices.length).toBeLessThanOrEqual(4);
    expect(voices.some((v) => v.tone === "good")).toBe(true);
  });
});
