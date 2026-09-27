import { describe, expect, it } from "vitest";
import { checkPlacement, checkReclaim, demolish, placeBuilding, reclaim } from "../actions";
import { analyzeCity } from "../analysis";
import { BUILDINGS } from "../buildings";
import { ECONOMY, ERAS, LEGACY_MAP_SIZE, MAP_SIZE, RANKS, RES_CAPACITY } from "../config";
import { applyGrowth, nextLevelChecks } from "../growth";
import { ERA_DEFS, advanceEra, getEra, monthsToNextEra } from "../eras";
import { EVENT_DEFS, rollEvent } from "../events";
import { buildableBounds, population } from "../map";
import { processRequests, requestReward } from "../requests";
import { createRng } from "../rng";
import { migrateSave } from "../save";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";
import type { GameState } from "../types";
import { blankState, idx, put, roadRow, unwrap } from "./helpers";

describe("広いマップとランク", () => {
  it("マップは24×24で、ランクごとに 12 → 16 → 24 と広がる", () => {
    const s = createNewGame("A", 1);
    expect(s.width).toBe(MAP_SIZE);
    expect(s.tiles).toHaveLength(MAP_SIZE * MAP_SIZE);
    const sizes = RANKS.map((r) => buildableBounds({ ...s, rank: r.id })).map((b) => b.max - b.min + 1);
    expect(sizes).toEqual([12, 16, 24, 24, 24]);
    expect(RANKS.map((r) => r.id)).toContain("megacity");
  });

  it("初期の町はマップの中央にあり、道路はすべて役所につながっている", () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = createNewGame("A", seed);
      // 役所は町の中心あたり（町並みは回転・反転するので、中央の数マスのどこか）
      const hall = s.tiles.findIndex((t) => t.building?.type === "cityHall");
      const [hx, hy] = [hall % MAP_SIZE, Math.floor(hall / MAP_SIZE)];
      expect(hx >= 9 && hx <= 14 && hy >= 9 && hy <= 14).toBe(true);
      expect(analyzeCity(s).unconnected).toBe(0);
    }
  });

  it("水の上には道路（橋）だけ架けられる", () => {
    const s = blankState();
    s.tiles[idx(s, 4, 4)].terrain = "water";
    const c = checkPlacement(s, "road", idx(s, 4, 4));
    expect(c).toEqual({ ok: true, cost: ECONOMY.bridgeCost });
    const next = unwrap(placeBuilding(s, "road", idx(s, 4, 4)));
    expect(next.tiles[idx(s, 4, 4)].terrain).toBe("water");
    expect(checkPlacement(s, "park", idx(s, 4, 4)).ok).toBe(false);
  });
});

describe("超高層（Lv4）と埋め立て", () => {
  it("市になると、交通と学校の条件を満たした建物が Lv4 に育つ", () => {
    const s = { ...blankState(), rank: "city" as const };
    roadRow(s, 8, 3, 12);
    const home = put(s, 4, 9, "residential", 3, 110);
    const b = s.tiles[home].building!;
    const town = { ...s, rank: "town" as const };
    expect(nextLevelChecks(town, home, analyzeCity(town))!.some((c) => c.label.includes("市") && !c.ok)).toBe(true);
    const checks = () => nextLevelChecks(s, home, analyzeCity(s))!;
    expect(checks().find((c) => c.label.includes("バス停"))?.ok).toBe(false);
    put(s, 5, 9, "busStop");
    put(s, 3, 9, "bigPark");
    put(s, 6, 9, "school");
    put(s, 8, 9, "hospital");
    put(s, 9, 9, "commercial", 2);
    put(s, 10, 9, "fireStation");
    expect(checks().find((c) => c.label.includes("バス停"))?.ok).toBe(true);
    expect(RES_CAPACITY[4]).toBeGreaterThan(RES_CAPACITY[3] * 1.8);
    b.growth = 100;
    b.occupants = 110;
    let grew = false;
    for (let k = 0; k < 20 && !grew; k++) {
      applyGrowth(s, analyzeCity(s), createRng(k));
      grew = b.level === 4;
      b.growth = Math.max(b.growth, 100);
    }
    expect(grew).toBe(true);
    // 5段目はメガシティから
    expect(nextLevelChecks(s, home, analyzeCity(s))!.some((c) => !c.ok && c.label.includes("メガシティ"))).toBe(true);
  });

  it("大きな公園は1マスで半径4マスに効く", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    put(s, 7, 9, "bigPark");
    const a = analyzeCity(s);
    expect(a.coverage.park[idx(s, 7, 12)]).toBeGreaterThan(0);
    expect(BUILDINGS.bigPark.coverage!.radius).toBe(4);
  });

  it("埋め立ては大都市で解禁され、水を陸地に変える", () => {
    const s = blankState();
    s.tiles[idx(s, 4, 4)].terrain = "water";
    expect(checkReclaim({ ...s, rank: "city" }, idx(s, 4, 4)).ok).toBe(false);
    const metro = { ...s, rank: "metropolis" as const };
    const next = unwrap(reclaim(metro, idx(s, 4, 4)));
    expect(next.tiles[idx(s, 4, 4)].terrain).toBe("grass");
    expect(next.money).toBe(metro.money - ECONOMY.reclaimCost);
    expect(checkReclaim(metro, idx(s, 5, 5)).ok).toBe(false); // 陸地は埋め立てられない
  });
});

describe("大型プロジェクト（2×2）", () => {
  function cityWithRoad(): GameState {
    const s = { ...blankState(), rank: "city" as const };
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 7, "residential", 2, 50);
    return s;
  }

  it("市ランクで解禁され、2×2の空き地が必要。1つの街に1つまで", () => {
    const s = cityWithRoad();
    expect(checkPlacement({ ...s, rank: "town" }, "stadium", idx(s, 8, 9)).ok).toBe(false);
    expect(checkPlacement(s, "stadium", idx(s, 8, 9)).ok).toBe(true);
    put(s, 9, 10, "park");
    expect(checkPlacement(s, "stadium", idx(s, 8, 9)).reason).toContain("2×2");
    const built = unwrap(placeBuilding(cityWithRoad(), "stadium", idx(s, 3, 9)));
    expect(checkPlacement(built, "stadium", idx(s, 8, 9)).reason).toContain("1つまで");
  });

  it("数か月の工事を経て完成し、完成すると街全体に効果が出る", () => {
    let s = cityWithRoad();
    s = unwrap(placeBuilding(s, "stadium", idx(s, 8, 9)));
    const anchor = s.tiles[idx(s, 8, 9)].building!;
    expect(anchor).toMatchObject({ level: 0, buildLeft: BUILDINGS.stadium.buildMonths });
    expect(s.tiles[idx(s, 9, 10)].building).toMatchObject({ type: "annex", anchor: idx(s, 8, 9) });
    const before = analyzeCity(s);
    expect(before.budget.income.facilities).toBe(0);
    for (let m = 0; m < BUILDINGS.stadium.buildMonths!; m++) s = advanceMonth({ ...s, pendingEvent: null })!.state;
    expect(s.tiles[idx(s, 8, 9)].building!.level).toBe(1);
    expect(s.news.some((n) => n.title.includes("スタジアムが完成"))).toBe(true);
    const after = analyzeCity(s);
    expect(after.budget.income.facilities).toBeGreaterThan(0);
    expect(after.employment.comSupport).toBeGreaterThan(before.employment.comSupport);
  });

  it("敷地のどこを撤去しても4マスまとめて消える", () => {
    let s = cityWithRoad();
    s = unwrap(placeBuilding(s, "university", idx(s, 8, 9)));
    s = unwrap(demolish(s, idx(s, 9, 10)));
    for (const [x, y] of [[8, 9], [9, 9], [8, 10], [9, 10]]) expect(s.tiles[idx(s, x, y)].building).toBeNull();
  });
});

describe("時代の転換", () => {
  it("8種類の時代があり、転換の1年前に予告される", () => {
    expect(ERA_DEFS.length).toBeGreaterThanOrEqual(8);
    const s = createNewGame("A", 1);
    expect(s.era.id).toBe("growth");
    const next = s.era.next!;
    expect(next.turn).toBe(ERAS.firstLength);
    const draft = structuredClone(s);
    draft.turn = next.turn - ERAS.noticeMonths;
    expect(advanceEra(draft, createRng(1))).toBeNull();
    expect(draft.era.next!.announced).toBe(true);
    expect(monthsToNextEra(draft)).toBe(ERAS.noticeMonths);
    expect(draft.news[0].title).toContain("予告");
    draft.turn = next.turn;
    expect(advanceEra(draft, createRng(1))).toBe(next.id);
    expect(draft.era.id).toBe(next.id);
    expect(draft.era.next!.id).not.toBe(next.id);
  });

  it("脱工業化の時代は工業の需要を大きく下げ、商業を上げる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 50);
    const growth = analyzeCity({ ...s, era: { id: "growth", since: 0, next: null } }).employment;
    const post = analyzeCity({ ...s, era: { id: "postIndustrial", since: 0, next: null } }).employment;
    expect(post.indSupport).toBeLessThan(growth.indSupport * 0.6);
    expect(post.comSupport).toBeGreaterThan(growth.comSupport);
    expect(getEra("postIndustrial").tips.length).toBeGreaterThan(0);
  });
});

describe("陳情・依頼", () => {
  it("条件に合う依頼が届き、達成すると報酬がもらえる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 50);
    s.turn = 12;
    s.lastRequestTurn = 0;
    let draft = structuredClone(s);
    for (let k = 0; draft.requests.length === 0 && k < 50; k++) {
      draft = structuredClone(s);
      processRequests(draft, analyzeCity(draft), createRng(k));
    }
    expect(draft.requests.length).toBe(1);
    // 「公園を2つ増やして」を必ず達成できる形で確認
    const done = structuredClone(s);
    done.requests = [{ id: "parks-1", kind: "parks", base: 0, target: 2, deadline: 30, reward: requestReward(200), createdTurn: 1 }];
    put(done, 3, 10, "park");
    put(done, 4, 10, "park");
    const money = done.money;
    const news = processRequests(done, analyzeCity(done), createRng(99));
    expect(news.some((n) => n.title.startsWith("依頼達成"))).toBe(true);
    expect(done.money).toBe(money + requestReward(200));
    expect(done.requests.some((r) => r.kind === "parks")).toBe(false);
  });

  it("期限を過ぎると失敗し、満足度が下がる", () => {
    const s = blankState();
    s.turn = 20;
    s.requests = [{ id: "parks-1", kind: "parks", base: 0, target: 5, deadline: 20, reward: 100_000, createdTurn: 14 }];
    const news = processRequests(s, analyzeCity(s), createRng(1));
    expect(news.some((n) => n.title.startsWith("依頼失敗"))).toBe(true);
    expect(s.modifiers.some((m) => (m.effects.happiness ?? 0) < 0)).toBe(true);
  });
});

describe("イベントのマンネリ防止", () => {
  it("同じイベントはしばらく起きない", () => {
    const s = createNewGame("A", 3);
    s.turn = 30;
    const draft = structuredClone(s);
    rollEvent(draft, analyzeCity(draft), createRng(1), "subsidy");
    expect(draft.eventLog.subsidy).toBe(30);
    // 強制しない抽選では、クールダウン中の補助金は選ばれない
    for (let k = 0; k < 40; k++) {
      const d2 = structuredClone(draft);
      const n = rollEvent(d2, analyzeCity(d2), createRng(k));
      expect(n?.title).not.toBe("国から補助金");
    }
    expect(EVENT_DEFS.length).toBeGreaterThanOrEqual(35);
  });
});

describe("旧セーブ（v1・16×16）の移行", () => {
  it("街をマップ中央に移し、新しい項目を補う", () => {
    const now = createNewGame("旧町", 5);
    // v1 形式を再現：16×16 の中心部だけ切り出す
    const O = (MAP_SIZE - LEGACY_MAP_SIZE) / 2;
    const oldTiles = [];
    for (let y = 0; y < LEGACY_MAP_SIZE; y++) for (let x = 0; x < LEGACY_MAP_SIZE; x++) oldTiles.push(now.tiles[(y + O) * MAP_SIZE + x + O]);
    const v1 = { ...now, version: 1, width: 16, height: 16, tiles: oldTiles, turn: 200, rank: "city" as const } as unknown as GameState;
    delete (v1 as Partial<GameState>).era;
    delete (v1 as Partial<GameState>).requests;
    const migrated = migrateSave(v1)!;
    expect(migrated.width).toBe(MAP_SIZE);
    expect(population(migrated)).toBe(population(now));
    // 元の町の役所と同じ場所にある
    expect(migrated.tiles.findIndex((t) => t.building?.type === "cityHall")).toBe(now.tiles.findIndex((t) => t.building?.type === "cityHall"));
    expect(migrated.era.next).toMatchObject({ id: "postIndustrial", turn: 212 });
    expect(migrated.requests).toEqual([]);
    expect(advanceMonth(migrated)).not.toBeNull();
  });
});
