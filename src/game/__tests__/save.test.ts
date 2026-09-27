import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_VERSION } from "../config";
import { SAVE_KEY, clearSave, loadGame, migrateSave, parseSave, saveGame, serialize } from "../save";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe("セーブ・ロード", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("セーブの枠は3つ。枠1は以前からのキーで、枠ごとに別々に保存・削除できる", async () => {
    const { listSlots, setActiveSlot, getActiveSlot, slotKey } = await import("../save");
    const a = createNewGame("枠1町", 1);
    const b = createNewGame("枠3町", 3);
    saveGame(a, 1);
    saveGame(b, 3);
    expect(slotKey(1)).toBe(SAVE_KEY);
    expect(listSlots().map((x) => x.save?.townName ?? null)).toEqual(["枠1町", null, "枠3町"]);
    setActiveSlot(3);
    expect(getActiveSlot()).toBe(3);
    expect(loadGame()?.townName).toBe("枠3町");
    clearSave(3);
    expect(loadGame(3)).toBeNull();
    expect(loadGame(1)?.townName).toBe("枠1町");
  });

  it("引っ越しデータは3つの枠をまとめて移し、同じ番号の枠に入る", async () => {
    const { exportTransferCode, parseTransferCode, importTransfer, transferTargets } = await import("../save");
    const a = createNewGame("A町", 1);
    const c = createNewGame("C町", 2);
    const code = await exportTransferCode({ save: a, saves: [a, null, c], hall: [] });
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    const bundle = (await parseTransferCode(code))!;
    expect(transferTargets(bundle)).toEqual([1, 3]);
    importTransfer(bundle);
    expect(loadGame(1)?.townName).toBe("A町");
    expect(loadGame(2)).toBeNull();
    expect(loadGame(3)?.townName).toBe("C町");
  });

  it("保存した状態をそのまま読み込める", () => {
    let s = createNewGame("セーブ町", 7);
    s = advanceMonth(s)!.state;
    expect(saveGame(s)).toBe(true);
    expect(loadGame()).toEqual(s);
  });

  it("データにはバージョンがある", () => {
    const s = createNewGame("A", 1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(JSON.parse(serialize(s)).version).toBe(SAVE_VERSION);
  });

  it("壊れたデータ・形式が違うデータは読み込まない", () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave("{broken")).toBeNull();
    expect(parseSave(JSON.stringify({ hello: 1 }))).toBeNull();
    const s = createNewGame("A", 1);
    expect(parseSave(JSON.stringify({ ...s, tiles: s.tiles.slice(1) }))).toBeNull();
  });

  it("未知のバージョンは読み込まない（移行処理の入口）", () => {
    const s = createNewGame("A", 1);
    expect(migrateSave({ ...s, version: 999 })).toBeNull();
    expect(migrateSave(s)).toBe(s);
  });

  it("セーブを消せる", () => {
    saveGame(createNewGame("A", 1));
    clearSave();
    expect(loadGame()).toBeNull();
    expect((window as unknown as { localStorage: MemoryStorage }).localStorage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe("セーブデータの引っ越し", () => {
  it("セーブと殿堂を文字列にして、別の場所で読み込める", async () => {
    const { exportTransferCode, parseTransferCode } = await import("../save");
    const s = createNewGame("引っ越し町", 9);
    const code = await exportTransferCode({ save: s, hall: [] });
    expect(code.startsWith("PT2:")).toBe(true);
    // 圧縮で元の JSON よりずっと短くなる
    expect(code.length).toBeLessThan(JSON.stringify(s).length / 3);
    const back = await parseTransferCode(`  ${code}\n`);
    expect(back?.save).toEqual(s);
    expect(await parseTransferCode("でたらめ")).toBeNull();
    expect(await parseTransferCode("PT2:!!!")).toBeNull();
  });
});
