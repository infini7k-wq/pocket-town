import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { enactPolicy, policyLevelCap, policySlots, revokePolicy, POLICY_DEFS } from "../policies";
import { approvalTarget, choosePromise, initPolitics, makePromiseOffers, processPolitics, shouldOfferPromise } from "../politics";
import { createRng } from "../rng";
import { mayorTitle } from "../progression";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";
import { weatherAt, weatherOf, seasonOf } from "../weather";
import { blankState, unwrap } from "./helpers";

const rich = () => {
  const s = createNewGame("P", 5);
  s.money = 50_000_000;
  return s;
};

describe("条例", () => {
  it("制定すると効果と毎月の費用が反映され、枠はランクで決まる", () => {
    let s = rich();
    const before = analyzeCity(s);
    s = unwrap(enactPolicy(s, "childcare"));
    const after = analyzeCity(s);
    expect(after.fx.resAppeal).toBeGreaterThan(before.fx.resAppeal);
    expect(after.budget.expense.policies).toBeGreaterThan(0);
    expect(policySlots(s)).toBe(1); // 村は1枠
    expect(enactPolicy(s, "noCar").ok).toBe(false); // 枠がいっぱい
    s = unwrap(enactPolicy(s, "noCar", "childcare")); // 入れ替え
    expect(s.policies!.active.map((a) => a.id)).toEqual(["noCar"]);
  });

  it("廃止した条例は12か月出し直せず、すぐ廃止すると支持率が下がる", () => {
    let s = rich();
    s = unwrap(enactPolicy(s, "noCar"));
    s = unwrap(revokePolicy(s, "noCar"));
    expect(s.modifiers.some((m) => m.id === "flipflop")).toBe(true);
    expect(enactPolicy(s, "noCar").ok).toBe(false);
    s.turn += 12;
    expect(enactPolicy(s, "noCar").ok).toBe(true);
  });

  it("同時に出せない条例・解禁前の条例は制定できない", () => {
    let s = rich();
    s.rank = "town";
    s = unwrap(enactPolicy(s, "greening"));
    expect(enactPolicy(s, "factoryZone").ok).toBe(false);
    expect(enactPolicy(s, "freeTransit").ok).toBe(false); // 大都市から
  });

  it("景観保全は建物を3段目までにする", () => {
    let s = rich();
    s.rank = "city";
    s = unwrap(enactPolicy(s, "landscape"));
    expect(policyLevelCap(s)).toBe(3);
  });

  it("すべての条例に、よいことと代わりに悪くなることがある", () => {
    for (const d of POLICY_DEFS) {
      expect(d.pros.length, d.id).toBeGreaterThan(0);
      expect(d.cons.length, d.id).toBeGreaterThan(0);
    }
  });
});

describe("選挙と公約", () => {
  it("新しいゲームは約4年後の4月に最初の選挙。12か月前に公約の候補が出る", () => {
    let s = createNewGame("E", 2);
    s = advanceMonth(s)!.state;
    expect(s.politics!.nextElection % 12).toBe(0);
    expect(s.politics!.nextElection).toBeGreaterThanOrEqual(48);
    s.rank = "town";
    s.turn = s.politics!.nextElection - 12;
    const out = processPolitics(s, analyzeCity(s), createRng(1));
    expect(out.campaignStart).toBe(true);
    expect(shouldOfferPromise(s)).toBe(true);
    s = unwrap(choosePromise(s, 0));
    expect(s.politics!.campaign!.promise).not.toBeNull();
    expect(shouldOfferPromise(s)).toBe(false);
  });

  it("支持率が低いと落選し、条例が白紙になる（ゲームは続く）", () => {
    let s = rich();
    s.rank = "town";
    s = unwrap(enactPolicy(s, "childcare"));
    s.politics = { ...initPolitics(0), approval: 10, nextElection: s.turn };
    s.taxes.residential = 20;
    const out = processPolitics(s, analyzeCity(s), createRng(1));
    expect(out.election?.won).toBe(false);
    expect(s.policies!.active).toHaveLength(0);
    expect(s.politics!.opposition).toBe(12);
    expect(s.gameOver).toBeNull();
  });

  it("支持率が高いと当選し、次の選挙は4年後", () => {
    const s = rich();
    s.rank = "town";
    s.politics = { ...initPolitics(0), approval: 80, nextElection: s.turn };
    const out = processPolitics(s, analyzeCity(s), createRng(1));
    expect(out.election?.won).toBe(true);
    expect(s.politics!.nextElection).toBe(s.turn + 48);
  });

  it("支持率の目標値は0〜100に収まり、公約の候補は3つまで", () => {
    const s = rich();
    s.rank = "town";
    const a = analyzeCity(s);
    const t = approvalTarget(s, a);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(100);
    const offers = makePromiseOffers(s, a, createRng(3));
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(new Set(offers.map((o) => o.kind)).size).toBe(offers.length);
  });

  it("チャレンジ中は選挙がない", () => {
    let s = createNewGame("C", 1, { scenario: "debt" });
    s = advanceMonth(s)!.state;
    expect(s.politics).toBeNull();
  });
});

describe("季節と天気", () => {
  it("同じゲーム・同じ月なら同じ天気で、メインの乱数を使わない", () => {
    const s = createNewGame("W", 9);
    const seed = s.rngSeed;
    expect(weatherOf(s)).toBe(weatherOf(s));
    expect(s.rngSeed).toBe(seed);
  });

  it("夏に雪は降らず、冬〜春に台風は来ない", () => {
    const s = blankState();
    for (let turn = 0; turn < 12 * 200; turn++) {
      const w = weatherAt(s, turn);
      const season = seasonOf(turn);
      if (season === "summer") expect(w === "snow" || w === "heavySnow").toBe(false);
      if (season === "winter" || season === "spring") expect(w).not.toBe("typhoon");
    }
  });

  it("大雪の月は除雪費がかかる", () => {
    const s = createNewGame("W", 9);
    let turn = 0;
    while (weatherAt(s, turn) !== "heavySnow") turn++;
    s.turn = turn;
    expect(analyzeCity(s).budget.expense.snow).toBeGreaterThan(0);
  });
});

describe("ランクに合わせた呼び名", () => {
  it("村のうちは「村長」、町は「町長」、市から上は「市長」", () => {
    expect(mayorTitle("village")).toBe("村長");
    expect(mayorTitle("town")).toBe("町長");
    expect(mayorTitle("city")).toBe("市長");
    expect(mayorTitle("megacity")).toBe("市長");
  });

  it("始めたときのニュースは、村なので「村長」", () => {
    const s = createNewGame("N", 1);
    expect(s.rank).toBe("village");
    expect(s.news[0].title).toContain("村長");
    expect(s.news.some((n) => n.title.includes("町長"))).toBe(false);
  });

  it("選挙のニュースもランクに合わせる（市なら市長選挙）", () => {
    const s = rich();
    s.rank = "city";
    s.politics = { ...initPolitics(0), approval: 80, nextElection: s.turn };
    processPolitics(s, analyzeCity(s), createRng(1));
    expect(s.news[0].title).toContain("市長選挙");
  });
});
