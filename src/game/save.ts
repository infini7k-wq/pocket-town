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
    d.tiles.length === d.width * d.height &&
    typeof d.rank === "string" &&
    !!d.taxes &&
    typeof d.taxes === "object" &&
    !!d.profile &&
    typeof d.profile === "object" &&
    d.tiles.every((t) => !!t && typeof t === "object" && typeof (t as Tile).terrain === "string")
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

// ---------------- セーブの枠（3つまで） ----------------

/** セーブの枠の数 */
export const SAVE_SLOTS = 3;
/** いま遊んでいる枠を覚えておくキー */
export const ACTIVE_SLOT_KEY = "pocket-town/active-slot";

/** 枠ごとの保存キー。枠1は以前からのキーのまま（今までのセーブがそのまま枠1になる） */
export function slotKey(slot: number): string {
  return slot <= 1 ? SAVE_KEY : `${SAVE_KEY}-${slot}`;
}

function clampSlot(slot: number): number {
  return Math.max(1, Math.min(SAVE_SLOTS, Math.round(slot) || 1));
}

export function getActiveSlot(): number {
  return clampSlot(Number(storage()?.getItem(ACTIVE_SLOT_KEY) ?? 1));
}

export function setActiveSlot(slot: number): void {
  try {
    storage()?.setItem(ACTIVE_SLOT_KEY, String(clampSlot(slot)));
  } catch {
    // ignore
  }
}

export interface SlotInfo {
  slot: number;
  save: GameState | null;
  /** データはあるが読めない（新しいバージョンで保存された・壊れている） */
  unreadable: boolean;
}

/** すべての枠の中身 */
export function listSlots(): SlotInfo[] {
  const st = storage();
  return Array.from({ length: SAVE_SLOTS }, (_, k) => {
    const raw = st?.getItem(slotKey(k + 1)) ?? null;
    const save = parseSave(raw);
    return { slot: k + 1, save, unreadable: !!raw && !save };
  });
}

/** 読めないセーブデータ（未来のバージョンなど）を上書きする前に退避しておく場所 */
export const BACKUP_KEY = "pocket-town/save-backup";
const checkedSlots = new Set<number>();

/** 保存済みのデータが読めない場合、上書きで消えないよう別の場所へ退避する（枠ごとに1セッション1回） */
function backupUnreadable(st: Storage, slot: number) {
  if (checkedSlots.has(slot)) return;
  checkedSlots.add(slot);
  const raw = st.getItem(slotKey(slot));
  if (raw && !parseSave(raw)) st.setItem(slot <= 1 ? BACKUP_KEY : `${BACKUP_KEY}-${slot}`, raw);
}

export function saveGame(state: GameState, slot: number = getActiveSlot()): boolean {
  const st = storage();
  if (!st) return false;
  try {
    backupUnreadable(st, slot);
    st.setItem(slotKey(slot), serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot: number = getActiveSlot()): GameState | null {
  return parseSave(storage()?.getItem(slotKey(slot)) ?? null);
}

/** セーブデータはあるのに読めない（壊れている・新しいバージョンで保存された）とき true */
export function hasUnreadableSave(slot: number = getActiveSlot()): boolean {
  const raw = storage()?.getItem(slotKey(slot)) ?? null;
  return !!raw && !parseSave(raw);
}

export function clearSave(slot: number = getActiveSlot()): void {
  try {
    storage()?.removeItem(slotKey(slot));
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

// ---------------- セーブデータの引っ越し（別のURL・別の端末へ） ----------------

const PLAIN_PREFIX = "PT1:";
/** gzip で圧縮した形式（大きな街でもコピーしやすい長さになる） */
const GZIP_PREFIX = "PT2:";

export interface TransferBundle {
  /** いま遊んでいる枠のセーブ（古い形式との互換用） */
  save: GameState | null;
  /** 枠1〜3のセーブ（index = 枠 − 1） */
  saves?: Array<GameState | null>;
  hall: HallRecord[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** セーブと殿堂を1つの文字列にまとめる（コピーして別の URL・端末に貼り付けられる） */
export async function exportTransferCode(bundle: TransferBundle): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  if (typeof CompressionStream !== "undefined") return GZIP_PREFIX + bytesToBase64(await pipe(bytes, new CompressionStream("gzip")));
  return PLAIN_PREFIX + bytesToBase64(bytes);
}

/** 引っ越し用の文字列を読み取る。形式が違えば null */
export async function parseTransferCode(code: string): Promise<TransferBundle | null> {
  const trimmed = code.trim().replace(/\s+/g, "");
  try {
    let json: string;
    if (trimmed.startsWith(GZIP_PREFIX)) json = new TextDecoder().decode(await pipe(base64ToBytes(trimmed.slice(GZIP_PREFIX.length)), new DecompressionStream("gzip")));
    else if (trimmed.startsWith(PLAIN_PREFIX)) json = new TextDecoder().decode(base64ToBytes(trimmed.slice(PLAIN_PREFIX.length)));
    else return null;
    const data = JSON.parse(json) as Partial<TransferBundle>;
    const save = data.save ? parseSave(JSON.stringify(data.save)) : null;
    const saves = Array.isArray(data.saves) ? data.saves.slice(0, SAVE_SLOTS).map((x) => (x ? parseSave(JSON.stringify(x)) : null)) : undefined;
    const hall = parseHall(JSON.stringify(data.hall ?? []));
    if (!save && !saves?.some(Boolean) && hall.length === 0) return null;
    return { save, saves, hall };
  } catch {
    return null;
  }
}

/** 引っ越し先で上書きされる枠（中身のある枠だけ） */
export function transferTargets(bundle: TransferBundle): number[] {
  if (bundle.saves) return bundle.saves.flatMap((x, k) => (x ? [k + 1] : []));
  return bundle.save ? [getActiveSlot()] : [];
}

/** 引っ越しデータを取り込む（セーブは同じ枠に上書き、殿堂は追加） */
export function importTransfer(bundle: TransferBundle): void {
  if (bundle.saves) bundle.saves.forEach((x, k) => x && saveGame(x, k + 1));
  else if (bundle.save) saveGame(bundle.save);
  const st = storage();
  if (!st) return;
  let hall = loadHall();
  for (const rec of [...bundle.hall].reverse()) hall = upsertHall(hall, rec);
  try {
    st.setItem(HALL_KEY, JSON.stringify(hall));
  } catch {
    // ignore
  }
}
