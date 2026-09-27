import { describe, expect, it } from "vitest";
import { checkPlacement } from "../actions";
import { analyzeCity, demandLevel } from "../analysis";
import { computeNoise } from "../environment";
import { nextLevelChecks } from "../growth";
import { createNewGame, previewTown } from "../state";
import { TENDENCY_IDS, TRAIT_IDS, townStory } from "../traits";
import type { TendencyId, TraitId } from "../types";
import { blankState, idx, put, roadRow } from "./helpers";

describe("v1.2 エンジン", () => {
  it("町の個性の専用施設は、その個性の町でしか建てられない", () => {
    const s = blankState();
    s.rank = "town";
    s.profile = { ...s.profile, trait: "suburban" };
    roadRow(s, 8, 1, 14);
    expect(checkPlacement(s, "forestPark", idx(s, 2, 9)).ok).toBe(true);
    expect(checkPlacement(s, "kombinat", idx(s, 2, 9)).ok).toBe(false);
  });

  it("マリーナは水辺に面していないと建てられない", () => {
    const s = blankState();
    s.rank = "town";
    s.profile = { ...s.profile, trait: "coastal" };
    expect(checkPlacement(s, "marina", idx(s, 3, 3)).ok).toBe(false);
    s.tiles[idx(s, 5, 3)].terrain = "water";
    expect(checkPlacement(s, "marina", idx(s, 3, 3)).ok).toBe(true);
  });

  it("新幹線駅は地図の端に面した場所にしか建てられない", () => {
    const s = blankState();
    s.rank = "city";
    expect(checkPlacement(s, "bulletTrain", idx(s, 5, 5)).ok).toBe(false);
    expect(checkPlacement(s, "bulletTrain", idx(s, 0, 5)).ok).toBe(true);
  });

  it("大きな店に育つには周りに住む人が必要で、広場の近くなら半分で済む", () => {
    const s = blankState();
    s.rank = "town";
    roadRow(s, 8, 3, 12);
    const shop = put(s, 5, 9, "commercial", 2);
    const label = () => nextLevelChecks(s, shop, analyzeCity(s))!.find((c) => c.label.includes("住む人"))!;
    expect(label().label).toContain("600人以上");
    put(s, 6, 9, "plaza");
    expect(label().label).toContain("300人以上");
  });

  it("造成中の住宅も数えるので、住宅を置くと住宅の需要が下がる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 1, 14);
    put(s, 8, 9, "industrial", 2);
    const before = analyzeCity(s).demand.residential;
    for (let x = 3; x <= 12; x++) put(s, x, 7, "residential", 0);
    const after = analyzeCity(s).demand.residential;
    expect(after).toBeLessThan(before);
  });

  it("需要メーターの段階：真ん中は「足りている」", () => {
    expect(demandLevel(50).tone).toBe("high");
    expect(demandLevel(0).label).toBe("足りている");
    expect(demandLevel(-50).tone).toBe("spare");
  });

  it("大きな公園は周りの騒音を半分にする", () => {
    const s = blankState();
    put(s, 5, 5, "industrial", 2);
    const home = idx(s, 6, 6);
    const before = computeNoise(s, analyzeCity(s).fx)[home];
    put(s, 7, 7, "bigPark");
    const after = computeNoise(s, analyzeCity(s).fx)[home];
    expect(after).toBeCloseTo(before / 2);
  });
});

describe("町のタイプと住民の傾向", () => {
  it("タイプと住民を選ぶと、そのとおりに始まり、プレビューとも一致する", () => {
    for (const seed of [1, 2, 3, 99]) {
      const choice = { trait: "suburban" as const, tendency: "eco" as const };
      const game = createNewGame("A", seed, choice);
      expect(game.profile.trait).toBe("suburban");
      expect(game.profile.tendency).toBe("eco");
      expect(previewTown(seed, undefined, choice).profile).toEqual(game.profile);
    }
  });

  it("おまかせでもプレビューと実際の町は一致する", () => {
    for (const seed of [5, 6, 7]) expect(previewTown(seed).profile).toEqual(createNewGame("A", seed).profile);
  });

  it("住民の傾向はタイプに合わせて出やすさが変わる（郊外は子育て世代が多く、工業×環境は少ない）", () => {
    const count = (trait: TraitId, tendency: TendencyId) => {
      let n = 0;
      for (let seed = 0; seed < 4000; seed++) if (previewTown(seed, undefined, { trait }).profile.tendency === tendency) n++;
      return n / 4000;
    };
    expect(count("suburban", "families")).toBeGreaterThan(0.38);
    expect(count("industrial", "eco")).toBeLessThan(0.18);
    expect(count("industrial", "eco")).toBeGreaterThan(0.06);
  });

  it("「限界集落を救え」はスタート画面の表示も実際もお年寄りが多い町", () => {
    for (const seed of [1, 2, 3]) {
      expect(previewTown(seed, "depopulated").profile.tendency).toBe("elderly");
      expect(createNewGame("A", seed, { scenario: "depopulated" }).profile.tendency).toBe("elderly");
    }
  });

  it("16通りすべてに町の紹介文がある", () => {
    for (const t of TRAIT_IDS) for (const d of TENDENCY_IDS) expect(townStory(t, d).length).toBeGreaterThan(5);
  });
});
