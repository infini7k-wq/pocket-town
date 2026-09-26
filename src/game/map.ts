// マップモデル：グリッドの座標計算・範囲・近傍探索など、マップ構造に関する基本処理。

import { getRank } from "./progression";
import type { Building, BuildingType, GameState, Tile } from "./types";

export interface Bounds {
  min: number;
  max: number;
}

export function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function toXY(i: number, width: number): { x: number; y: number } {
  return { x: i % width, y: Math.floor(i / width) };
}

/** 上下左右の隣接マス */
export function neighbors4(i: number, width: number, height: number): number[] {
  const { x, y } = toXY(i, width);
  const out: number[] = [];
  if (y > 0) out.push(i - width);
  if (x < width - 1) out.push(i + 1);
  if (y < height - 1) out.push(i + width);
  if (x > 0) out.push(i - 1);
  return out;
}

/** 半径 r（ユークリッド距離）以内のマスを列挙する */
export function forEachInRadius(
  i: number,
  r: number,
  width: number,
  height: number,
  cb: (j: number, dist: number) => void,
): void {
  const { x, y } = toXY(i, width);
  const limit = r + 0.5;
  for (let dy = -r; dy <= r; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= limit) cb(ny * width + nx, d);
    }
  }
}

/** 現在のランクで建設できる範囲（両端を含む） */
export function buildableBounds(state: Pick<GameState, "rank" | "width">): Bounds {
  const size = Math.min(getRank(state.rank).mapSize, state.width);
  const min = Math.floor((state.width - size) / 2);
  return { min, max: min + size - 1 };
}

export function isUnlockedTile(state: Pick<GameState, "rank" | "width">, i: number): boolean {
  const { x, y } = toXY(i, state.width);
  const b = buildableBounds(state);
  return x >= b.min && x <= b.max && y >= b.min && y <= b.max;
}

/** 地図に表示する範囲（建設可能エリア＋外周1マス） */
export function visibleBounds(state: Pick<GameState, "rank" | "width">): Bounds {
  const b = buildableBounds(state);
  return { min: Math.max(0, b.min - 1), max: Math.min(state.width - 1, b.max + 1) };
}

export function population(state: Pick<GameState, "tiles">): number {
  let total = 0;
  for (const t of state.tiles) if (t.building?.type === "residential") total += t.building.occupants;
  return total;
}

export function countBuildings(state: Pick<GameState, "tiles">, type: BuildingType): number {
  let n = 0;
  for (const t of state.tiles) if (t.building?.type === type) n++;
  return n;
}

export function findBuilding(state: Pick<GameState, "tiles">, type: BuildingType): number {
  return state.tiles.findIndex((t) => t.building?.type === type);
}

export function tileBuildings(state: Pick<GameState, "tiles">): Array<{ index: number; tile: Tile; building: Building }> {
  const out: Array<{ index: number; tile: Tile; building: Building }> = [];
  state.tiles.forEach((tile, index) => {
    if (tile.building) out.push({ index, tile, building: tile.building });
  });
  return out;
}

/** 近くに指定した地形があるか */
export function nearTerrain(state: Pick<GameState, "tiles" | "width" | "height">, i: number, terrain: Tile["terrain"], r: number): number {
  let n = 0;
  forEachInRadius(i, r, state.width, state.height, (j) => {
    if (j !== i && state.tiles[j].terrain === terrain) n++;
  });
  return n;
}

/** 2マス間を上下左右のつながりで結ぶマスの列（始点を除き、終点を含む）。ドラッグでの連続設置用 */
export function gridPath(from: number, to: number, width: number): number[] {
  const a = toXY(from, width);
  const b = toXY(to, width);
  const out: number[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    // 斜めには進まず、横か縦に1マスずつ進む
    if (err > 0 || (err === 0 && dx >= dy)) {
      x += sx;
      err -= dy;
    } else {
      y += sy;
      err += dx;
    }
    out.push(y * width + x);
  }
  return out;
}

/** 2×2 の大型施設が占めるマス（左上・右上・左下・右下） */
export function footprint(i: number, width: number): number[] {
  return [i, i + 1, i + width, i + width + 1];
}

/** マスの建物の本体（annex なら本体の左上マス） */
export function anchorOf(state: Pick<GameState, "tiles">, i: number): number {
  const b = state.tiles[i]?.building;
  return b?.type === "annex" && b.anchor !== undefined ? b.anchor : i;
}
