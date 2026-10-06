import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { EVENTS } from "../config";
import { EVENT_DEFS, describePendingEvent, resolveEvent, rollEvent } from "../events";
import { createRng } from "../rng";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";
import { blankState, put, roadRow, unwrap } from "./helpers";

describe("ランダムイベント", () => {
  it("20種類以上あり、IDは重複せず、選択式もある", () => {
    expect(EVENT_DEFS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EVENT_DEFS.map((e) => e.id)).size).toBe(EVENT_DEFS.length);
    expect(EVENT_DEFS.filter((e) => e.choices).length).toBeGreaterThanOrEqual(8);
    expect(EVENT_DEFS.filter((e) => e.tone === "good").length).toBeGreaterThanOrEqual(5);
    expect(EVENT_DEFS.filter((e) => e.tone === "bad").length).toBeGreaterThanOrEqual(5);
  });

  it("同じシードなら同じ展開になる（再現性）", () => {
    let a = createNewGame("A", 42);
    let b = createNewGame("A", 42);
    for (let m = 0; m < 24; m++) {
      a = advanceMonth({ ...a, pendingEvent: null })!.state;
      b = advanceMonth({ ...b, pendingEvent: null })!.state;
    }
    expect(a.news).toEqual(b.news);
    expect(a.money).toBe(b.money);
  });

  it("最初の数か月はイベントが起きない", () => {
    const s = createNewGame("A", 3);
    const draft = structuredClone(s);
    for (let k = 0; k < 20; k++) expect(rollEvent(draft, analyzeCity(draft), createRng(k))).toBeNull();
    expect(EVENTS.graceTurns).toBeGreaterThan(0);
  });

  it("即時イベントは効果とニュースを反映する", () => {
    const s = createNewGame("A", 3);
    const draft = structuredClone(s);
    const before = draft.money;
    const news = rollEvent(draft, analyzeCity(draft), createRng(1), "subsidy");
    expect(news?.title).toBe("国から補助金");
    expect(draft.money).toBeGreaterThan(before);
    expect(draft.news[0].title).toBe("国から補助金");
  });

  it("火災は消防署の範囲外の建物で起こり、被害が出る", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const i = put(s, 4, 9, "residential", 2, 40);
    const draft = structuredClone(s);
    rollEvent(draft, analyzeCity(draft), createRng(5), "fire");
    expect(draft.tiles[i].building?.level ?? 0).toBeLessThan(2);
  });

  it("選択式イベントは対応するまで翌月に進めず、選んだ結果が反映される", () => {
    // 夏祭りは7〜8月にしか起きないので、7月（turn 3）にする
    const summer = { ...createNewGame("A", 3), turn: 3 };
    const r = advanceMonth(summer, { forceEvent: "festival" })!;
    expect(r.state.pendingEvent?.eventId).toBe("festival");
    expect(advanceMonth(r.state)).toBeNull();
    const view = describePendingEvent(r.state, analyzeCity(r.state))!;
    expect(view.choices.map((c) => c.id)).toEqual(["support", "skip"]);
    const resolved = unwrap(resolveEvent(r.state, analyzeCity(r.state), "support", createRng(1)));
    expect(resolved.pendingEvent).toBeNull();
    expect(resolved.money).toBe(r.state.money - 150_000);
    expect(resolved.modifiers.some((m) => m.id === "festival")).toBe(true);
  });

  it("お金が足りない選択肢は選べない", () => {
    const s = { ...createNewGame("A", 3), turn: 3 };
    const r = advanceMonth(s, { forceEvent: "festival" })!.state;
    const poor = { ...r, money: 1000 };
    expect(resolveEvent(poor, analyzeCity(poor), "support", createRng(1)).ok).toBe(false);
    expect(resolveEvent(poor, analyzeCity(poor), "skip", createRng(1)).ok).toBe(true);
  });

  it("大型モールの誘致は雇用を増やし、交通量も増やす", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 50);
    s.pendingEvent = { eventId: "mall", turn: 0 };
    const before = analyzeCity(s);
    const after = unwrap(resolveEvent(s, before, "accept", createRng(1)));
    const a = analyzeCity(after);
    expect(a.employment.jobs).toBeGreaterThan(before.employment.jobs);
    expect(a.fx.traffic).toBeGreaterThan(0);
  });
});
