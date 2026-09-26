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
