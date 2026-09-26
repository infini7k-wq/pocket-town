// localStorage によるセーブ・ロード。データには version を持たせ、将来の構造変更は migrate で吸収する。

import { LEGACY_MAP_SIZE, MAP_SIZE, SAVE_VERSION } from "./config";
import { createRng } from "./rng";
import { addForests } from "./state";
import { upsertHall, type HallRecord } from "./hall";
import type { GameState, Tile } from "./types";

export const SAVE_KEY = "pocket-town/save";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function isValid(data: unknown): data is GameState {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<GameState>;
  return (
    typeof d.version === "number" &&
    typeof d.turn === "number" &&
    typeof d.money === "number" &&
    typeof d.width === "number" &&
    typeof d.height === "number" &&
    Array.isArray(d.tiles) &&
    d.tiles.length === d.width * d.height
  );
}

/** v1（16×16）→ v2（24×24、時代・陳情・大型施設）。元の街はマップの中央に置く */
function migrateV1(old: GameState): GameState {
  const O = (MAP_SIZE - LEGACY_MAP_SIZE) / 2;
  const remap = (i: number | undefined) => (i === undefined ? undefined : (Math.floor(i / LEGACY_MAP_SIZE) + O) * MAP_SIZE + (i % LEGACY_MAP_SIZE) + O);
  const rng = createRng(old.rngSeed ^ 0x2545f491);
  const tiles: Tile[] = Array.from({ length: MAP_SIZE * MAP_SIZE }, () => ({ terrain: "grass", building: null }));
  old.tiles.forEach((t, i) => {
    tiles[remap(i)!] = t;
  });
  // 外側の地形：海沿いの町は海を東へ延ばし、それ以外は西に川を流す
  if (old.profile.trait === "coastal") {
    for (let y = 0; y < MAP_SIZE; y++) {
      const oy = Math.min(LEGACY_MAP_SIZE - 1, Math.max(0, y - O));
      let shore = LEGACY_MAP_SIZE;
      for (let x = 0; x < LEGACY_MAP_SIZE; x++) {
        if (old.tiles[oy * LEGACY_MAP_SIZE + x].terrain === "water") {
          shore = x;
          break;
        }
      }
      for (let x = Math.min(MAP_SIZE, shore + O); x < MAP_SIZE; x++) {
        const t = tiles[y * MAP_SIZE + x];
        if (!t.building && (y < O || y >= O + LEGACY_MAP_SIZE || x >= O + LEGACY_MAP_SIZE)) t.terrain = "water";
      }
    }
  } else {
    const phase = rng.range(0, Math.PI * 2);
    for (let y = 0; y < MAP_SIZE; y++) {
      const cx = 1 + Math.round(Math.sin(y / 3.2 + phase));
      for (const x of [cx, cx + 1]) if (x < O) tiles[y * MAP_SIZE + x].terrain = "water";
    }
  }
  addForests(tiles, MAP_SIZE, old.profile, rng, LEGACY_MAP_SIZE / 2);

  const lastReport = old.lastReport
    ? {
        ...old.lastReport,
        budget: { ...old.lastReport.budget, income: { ...old.lastReport.budget.income, facilities: old.lastReport.budget.income.facilities ?? 0 } },
        changes: old.lastReport.changes.map((c) => ({ ...c, tile: remap(c.tile)! })),
        events: old.lastReport.events.map((n) => ({ ...n, tile: remap(n.tile) })),
        eraChange: null,
      }
    : null;
  return {
    ...old,
    version: 2,
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles,
    pendingEvent: old.pendingEvent ? { ...old.pendingEvent, tile: remap(old.pendingEvent.tile) } : null,
    news: old.news.map((n) => ({ ...n, tile: remap(n.tile) })),
    voices: old.voices.map((v) => ({ ...v, tile: remap(v.tile) })),
    lastReport,
    // 長く遊んだ街にもすぐ変化が訪れるよう、1年後の「脱工業化」をすぐに予告する
    era: { id: "growth", since: old.turn, next: { id: "postIndustrial", turn: old.turn + 12, announced: false } },
    requests: [],
    lastRequestTurn: old.turn - 3,
    eventLog: {},
  };
}

/** 古いバージョンのセーブデータを現在の形式に変換する（未知のバージョンは null） */
export function migrateSave(data: GameState): GameState | null {
  if (data.version === SAVE_VERSION) return data;
  if (data.version === 1 && data.width === LEGACY_MAP_SIZE) return migrateSave(migrateV1(data));
  if (data.version === 2) {
    // v3：殿堂用のゲーム ID とチャレンジの状態を追加
    return { ...data, version: 3, gameId: data.gameId ?? `legacy-${data.rngSeed.toString(36)}`, scenario: data.scenario ?? null };
  }
  return null;
}

export function parseSave(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isValid(data)) return null;
    return migrateSave(data);
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): boolean {
  const st = storage();
  if (!st) return false;
  try {
    st.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  return parseSave(storage()?.getItem(SAVE_KEY) ?? null);
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// ---------------- 殿堂（ゲームのセーブとは別に保存） ----------------

export const HALL_KEY = "pocket-town/hall";

export function parseHall(raw: string | null): HallRecord[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? (data.filter((h) => h && typeof h === "object" && typeof (h as HallRecord).gameId === "string") as HallRecord[]) : [];
  } catch {
    return [];
  }
}

export function loadHall(): HallRecord[] {
  return parseHall(storage()?.getItem(HALL_KEY) ?? null);
}

export function recordHall(rec: HallRecord): HallRecord[] {
  const next = upsertHall(loadHall(), rec);
  try {
    storage()?.setItem(HALL_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
