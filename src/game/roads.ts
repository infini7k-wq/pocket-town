// 道路ネットワーク：各マスが道路に面しているか、役所（中心地）まで道路でつながっているかを計算する。

import { BUILDINGS, isRoad } from "./buildings";
import { findBuilding, footprint, neighbors4 } from "./map";
import type { GameState } from "./types";

export interface RoadNetwork {
  /** 道路に面している（道路マス自身も true） */
  roadAccess: boolean[];
  /** 役所まで道路でつながっている */
  connected: boolean[];
  /** 役所からの道路距離（道路マスのみ。未到達は -1） */
  distance: number[];
  centerIndex: number;
}

export function computeRoadNetwork(state: Pick<GameState, "tiles" | "width" | "height">): RoadNetwork {
  const { tiles, width, height } = state;
  const n = tiles.length;
  const isRoadAt = (i: number) => isRoad(tiles[i].building?.type);
  const roadAccess = new Array<boolean>(n).fill(false);
  const connected = new Array<boolean>(n).fill(false);
  const distance = new Array<number>(n).fill(-1);

  for (let i = 0; i < n; i++) {
    if (isRoadAt(i)) roadAccess[i] = true;
    else if (tiles[i].building && neighbors4(i, width, height).some(isRoadAt)) roadAccess[i] = true;
  }

  // 役所に隣接する道路から幅優先探索
  const centerIndex = findBuilding(state, "cityHall");
  if (centerIndex >= 0) {
    const queue: number[] = [];
    for (const j of neighbors4(centerIndex, width, height)) {
      if (isRoadAt(j)) {
        distance[j] = 1;
        queue.push(j);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      for (const j of neighbors4(cur, width, height)) {
        if (distance[j] === -1 && isRoadAt(j)) {
          distance[j] = distance[cur] + 1;
          queue.push(j);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (isRoadAt(i)) connected[i] = distance[i] > 0;
      else if (tiles[i].building) connected[i] = neighbors4(i, width, height).some((j) => distance[j] > 0);
    }
    if (roadAccess[centerIndex]) connected[centerIndex] = true;
  }

  // 2×2 の大型施設は、4マスのどれかが道路に面していればよい
  for (let i = 0; i < n; i++) {
    const b = tiles[i].building;
    if (!b || BUILDINGS[b.type].size !== 2) continue;
    const cells = footprint(i, width).filter((j) => j < n);
    roadAccess[i] = cells.some((j) => roadAccess[j]);
    connected[i] = cells.some((j) => connected[j]);
  }

  return { roadAccess, connected, distance, centerIndex };
}
