import { describe, expect, it } from "vitest";
import { checkExpandLand, checkPlacement, expandLand, placeBuilding, projectLimit } from "../actions";
import { isUnlockedTile, population } from "../map";
import { advanceMonth } from "../simulation";
import { analyzeCity, demandLevel } from "../analysis";
import { effectiveRadius } from "../coverage";
import { computeNoise } from "../environment";
import { nextLevelChecks } from "../growth";
import { createNewGame, previewTown } from "../state";
import { TENDENCY_IDS, TRAIT_IDS, townStory } from "../traits";
import type { TendencyId, TraitId } from "../types";
import { blankState, idx, put, roadRow, unwrap } from "./helpers";

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

describe("点検で見つかった不具合の再発防止", () => {
  it("転入がほとんどない町でも、住宅の需要メーターが急に振り切れない", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    s.taxes.residential = 20; // 住みにくくして転入を止める
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 1, 14);
    const full = analyzeCity(s).demand.residential;
    put(s, 7, 9, "residential", 1, 13); // 空きが1人分だけ
    const oneRoom = analyzeCity(s).demand.residential;
    expect(Math.abs(full - oneRoom)).toBeLessThan(30);
    expect(Number.isFinite(oneRoom)).toBe(true);
  });

  it("お店の範囲はレベルで広がり、表示と計算で同じ値を使う", () => {
    expect(effectiveRadius({ type: "commercial", level: 1 })).toBe(3);
    expect(effectiveRadius({ type: "commercial", level: 4 })).toBe(5);
    expect(effectiveRadius({ type: "park", level: 1 })).toBe(2);
  });

  it("働き手がいない町では、お店・工場の需要は出ない", () => {
    const s = blankState();
    const d = analyzeCity(s).demand;
    expect(d.industrial).toBeLessThanOrEqual(0);
    expect(d.commercial).toBeLessThanOrEqual(0);
  });
});

describe("はじめの町並みのランダム化", () => {
  it("どの町でも、建物はすべて道路で役所につながり、工場は住宅から離れていて、毎回ちがう町並みになる", () => {
    const halls = new Set<number>();
    for (let seed = 0; seed < 240; seed++) {
      const s = createNewGame("A", seed);
      const a = analyzeCity(s);
      halls.add(s.tiles.findIndex((t) => t.building?.type === "cityHall"));
      const homes: number[] = [];
      const factories: number[] = [];
      s.tiles.forEach((t, i) => {
        const b = t.building;
        if (!b || b.type === "road") return;
        expect(t.terrain).not.toBe("water");
        if (b.type !== "cityHall") expect(a.net.connected[i], `seed ${seed} tile ${i} ${b.type}`).toBe(true);
        if (b.type === "residential") homes.push(i);
        if (b.type === "industrial") factories.push(i);
      });
      for (const f of factories)
        for (const h of homes) {
          const dx = (f % s.width) - (h % s.width);
          const dy = Math.floor(f / s.width) - Math.floor(h / s.width);
          expect(Math.hypot(dx, dy), `seed ${seed}`).toBeGreaterThan(2.5);
        }
      expect(a.population).toBeGreaterThan(150);
      expect(a.population).toBeLessThan(400);
    }
    // 3種類のひな形 × 回転・反転で、役所の位置もばらばら
    expect(halls.size).toBeGreaterThanOrEqual(8);
  });
});

describe("メガシティの先（土地の買い足し・5段目・2つ目の大型プロジェクト）", () => {
  const megacity = () => {
    const s = createNewGame("M", 3);
    s.rank = "megacity";
    s.money = 2_000_000_000;
    // テストで大型施設を置く角のあたりは草地にしておく
    for (const [x0, y0] of [[1, 1], [1, 20], [20, 1]]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.tiles[(y0 + dy) * s.width + x0 + dx] = { terrain: "grass", building: null };
    return s;
  };

  it("土地を買うとマップが 24→28→32 に広がり、町はそのまま中央に残る", () => {
    let s = megacity();
    const before = population(s);
    const hall = s.tiles.findIndex((t) => t.building?.type === "cityHall");
    s = unwrap(expandLand(s));
    expect(s.width).toBe(28);
    expect(s.tiles).toHaveLength(28 * 28);
    expect(population(s)).toBe(before);
    const hx = hall % 24;
    const hy = Math.floor(hall / 24);
    expect(s.tiles[(hy + 2) * 28 + hx + 2].building?.type).toBe("cityHall");
    expect(isUnlockedTile(s, 0)).toBe(true); // 買った土地はすべて開発できる
    expect(analyzeCity(s).unconnected).toBe(0);
    s = unwrap(expandLand(s));
    expect(s.width).toBe(32);
    expect(checkExpandLand(s).ok).toBe(false); // 最大
    expect(advanceMonth(s)).not.toBeNull();
  });

  it("2×2 の施設は、広げたあとも4マスがまとまったまま", () => {
    let s = megacity();
    s = unwrap(placeBuilding(s, "stadium", idx(s, 1, 1)));
    s = unwrap(expandLand(s));
    const anchor = (1 + 2) * s.width + 1 + 2;
    expect(s.tiles[anchor].building?.type).toBe("stadium");
    expect(s.tiles[anchor + 1].building?.anchor).toBe(anchor);
    expect(s.tiles[anchor + s.width + 1].building?.anchor).toBe(anchor);
  });

  it("メガシティ前は土地を買えない", () => {
    const s = createNewGame("M", 3);
    s.money = 2_000_000_000;
    expect(checkExpandLand(s).ok).toBe(false);
  });

  it("メガシティでは大型プロジェクトを2つまで建てられる", () => {
    let s = megacity();
    s = unwrap(placeBuilding(s, "stadium", idx(s, 1, 1)));
    expect(checkPlacement(s, "stadium", idx(s, 1, 20)).ok).toBe(true);
    s = unwrap(placeBuilding(s, "stadium", idx(s, 1, 20)));
    expect(checkPlacement(s, "stadium", idx(s, 20, 1)).ok).toBe(false);
    s.rank = "metropolis";
    expect(projectLimit(s)).toBe(1);
  });

  it("5段目は大型プロジェクトの近くでだけ育つ", () => {
    const s = blankState();
    s.rank = "megacity";
    roadRow(s, 8, 1, 14);
    const home = put(s, 5, 9, "residential", 4, 200);
    const label = () => nextLevelChecks(s, home, analyzeCity(s))!.find((c) => c.label.includes("大型プロジェクト"))!;
    expect(label().ok).toBe(false);
    put(s, 7, 10, "university", 1);
    s.tiles[idx(s, 8, 10)].building = { ...s.tiles[idx(s, 8, 10)].building!, type: "annex" } as never;
    expect(label().ok).toBe(true);
  });
});

describe("渋滞の対策が効く", () => {
  const street = (road: "road" | "avenue", terminal: boolean) => {
    const s = blankState();
    s.rank = "megacity";
    for (let x = 1; x <= 14; x++) put(s, x, 8, road);
    for (let x = 2; x <= 13; x++) {
      put(s, x, 7, "industrial", 4);
      put(s, x, 9, "industrial", 4);
    }
    roadRow(s, 3, 1, 14);
    roadRow(s, 13, 1, 14);
    for (let y = 3; y <= 13; y++) put(s, 1, y, "road");
    for (let x = 1; x <= 14; x++) {
      put(s, x, 2, "residential", 4, 220);
      put(s, x, 14, "residential", 4, 220);
    }
    if (terminal) {
      put(s, 7, 12, "station");
      put(s, 7, 4, "station");
    }
    const a = analyzeCity(s);
    let max = 0;
    for (let x = 2; x <= 13; x++) max = Math.max(max, a.traffic.ratio[idx(s, x, 8)]);
    return max;
  };

  it("工場が並ぶ通りも、バスターミナルで減り、大通りにすれば渋滞しない", () => {
    const plain = street("road", false);
    expect(street("road", true)).toBeLessThan(plain * 0.85);
    expect(street("avenue", false)).toBeLessThan(0.9);
    expect(street("avenue", true)).toBeLessThan(0.55);
  });
});
