// 鉄道とバス路線：線路のつながり（路線）・駅の効き目・バス停の路線を、毎回の分析で計算する（保存はしない）。

import { BUILDINGS, isPassengerStation, isRoad } from "./buildings";
import { forEachInRadius, neighbors4, toXY } from "./map";
import type { RoadNetwork } from "./roads";
import type { GameState } from "./types";

export const RAIL = {
  /** 駅の効き目が届く範囲（マス） */
  radius: 4,
  /** 駅のそばの建物の車を最大でどれだけ減らすか */
  cut: 0.6,
  /** バスと鉄道を重ねても、車はここまでしか減らない（7割減まで） */
  floor: 0.3,
  /** 乗客1人あたりの運賃 */
  fare: 120,
  /** 川や海の上に線路を引く費用（1マス） */
  bridgeCost: 250_000,
  /** 貨物駅の効き目が届く範囲（マス）と、工場の車を減らす割合 */
  freightRadius: 5,
  freightCut: 0.5,
  /** 駅が育つのに必要な1か月の乗客（index = 次のレベル） */
  stationRiders: [0, 0, 150, 400],
};

/** バス路線：道のりでこのマス数以内のバス停どうしが1つの路線になる */
const BUS_LINK = 8;

export interface RailLine {
  id: number;
  tiles: number[];
  /** 旅客の駅 */
  stations: number[];
  /** 貨物駅 */
  freight: number[];
  /** 地図の端（となり町）につながっている */
  edge: boolean;
  /** 完成した新幹線駅につながっている */
  shinkansen: boolean;
  /** 電車が走る（駅が1つ以上、かつ結節点が2つ以上） */
  working: boolean;
  /** 効き目の強さ（0〜1） */
  strength: number;
}

export interface RailNetwork {
  /** マスごとの路線番号（-1 = 線路ではない） */
  lineOf: Int16Array;
  lines: RailLine[];
  /** マスごとの「駅の効き目」（0〜1） */
  ride: Float32Array;
  /** マスごとの、いちばん効いている駅（-1 = なし。乗客をどの駅に数えるか） */
  rideFrom: Int32Array;
  /** 電車が走る貨物駅の範囲内のマス（1 = 工場の車が減る） */
  freightArea: Uint8Array;
}

export interface BusRoutes {
  /** 停留所（バス停・バスターミナル・駅）ごとの路線番号 */
  routeOf: Map<number, number>;
  /** 路線ごとの停留所 */
  routes: number[][];
  /** 停留所どうしを結ぶ道路の道のり（表示用） */
  paths: Array<{ route: number; tiles: number[] }>;
  /** 路線にバスターミナルか駅が入っている（直通） */
  hub: boolean[];
}

/** 線路として連結するマスか（線路・新幹線駅） */
export function isTrackTile(s: GameState, i: number): boolean {
  const t = s.tiles[i];
  if (!t) return false;
  if (t.track) return true;
  const b = t.building;
  if (b?.type === "bulletTrain") return true;
  return b?.type === "annex" && b.anchor !== undefined && s.tiles[b.anchor]?.building?.type === "bulletTrain";
}

/** となりに、建物のない線路か駅があるか（「線路は道路の代わりにならない」案内に使う） */
export function besideTrack(s: GameState, i: number): boolean {
  return neighbors4(i, s.width, s.height).some((j) => {
    const t = s.tiles[j];
    return !!t.track && (!t.building || isStationType(t.building.type));
  });
}

function onEdge(s: GameState, i: number): boolean {
  const { x, y } = toXY(i, s.width);
  return x === 0 || y === 0 || x === s.width - 1 || y === s.height - 1;
}

export function computeRailNetwork(s: GameState): RailNetwork {
  const n = s.tiles.length;
  const lineOf = new Int16Array(n).fill(-1);
  const lines: RailLine[] = [];
  for (let start = 0; start < n; start++) {
    if (lineOf[start] !== -1 || !isTrackTile(s, start)) continue;
    const id = lines.length;
    const line: RailLine = { id, tiles: [], stations: [], freight: [], edge: false, shinkansen: false, working: false, strength: 0 };
    const queue = [start];
    lineOf[start] = id;
    while (queue.length) {
      const i = queue.pop()!;
      line.tiles.push(i);
      const b = s.tiles[i].building;
      if (isPassengerStation(b?.type)) line.stations.push(i);
      if (b?.type === "freightStation") line.freight.push(i);
      // 新幹線駅（2×2 のどのマスでも）
      const anchor = b?.type === "annex" ? b.anchor : i;
      const bullet = anchor !== undefined ? s.tiles[anchor]?.building : undefined;
      if ((b?.type === "bulletTrain" || b?.type === "annex") && bullet?.type === "bulletTrain" && bullet.level > 0) line.shinkansen = true;
      // 地図の端まで来ていれば、となり町とつながる
      if (onEdge(s, i)) line.edge = true;
      for (const j of neighbors4(i, s.width, s.height)) {
        if (lineOf[j] === -1 && isTrackTile(s, j)) {
          lineOf[j] = id;
          queue.push(j);
        }
      }
    }
    const nodes = line.stations.length + line.freight.length + (line.edge ? 1 : 0) + (line.shinkansen ? 1 : 0);
    line.working = line.stations.length + line.freight.length >= 1 && nodes >= 2;
    line.strength = line.working ? Math.min(1, 0.4 + 0.15 * nodes) : 0;
    lines.push(line);
  }
  // 電車が走る駅のまわりの効き目（駅に近いほど強い）
  const ride = new Float32Array(n);
  const rideFrom = new Int32Array(n).fill(-1);
  const freightArea = new Uint8Array(n);
  for (const line of lines) {
    if (!line.working) continue;
    for (const st of line.stations) {
      // 大きな駅は少し強く、駅ビルは範囲も1マス広い
      const level = s.tiles[st].building?.level ?? 1;
      const radius = stationRadius(level);
      const strength = Math.min(1, line.strength + 0.1 * Math.max(0, level - 1));
      forEachInRadius(st, radius, s.width, s.height, (j, d) => {
        const v = strength * (0.75 + 0.25 * (1 - Math.min(1, d / radius)));
        if (v > ride[j]) {
          ride[j] = v;
          rideFrom[j] = st;
        }
      });
    }
    for (const f of line.freight) forEachInRadius(f, RAIL.freightRadius, s.width, s.height, (j) => (freightArea[j] = 1));
  }
  return { lineOf, lines, ride, rideFrom, freightArea };
}

/** 駅の効き目の範囲（旅客の駅は乗客の範囲、貨物駅は工場の範囲。駅でなければ 0） */
export function stationRange(type: string | undefined, level = 1): number {
  if (type === "freightStation") return RAIL.freightRadius;
  if (type === "railStation") return stationRadius(level);
  return 0;
}

/** 駅の種類（駅・貨物駅） */
export function isStationType(t: string | undefined): boolean {
  return t === "railStation" || t === "freightStation";
}

/** 駅（旅客・貨物）がある路線か */
export function hasStation(line: Pick<RailLine, "stations" | "freight">): boolean {
  return line.stations.length + line.freight.length > 0;
}

/** 旅客の駅の効き目が届く範囲（駅ビルは1マス広い） */
export function stationRadius(level: number): number {
  return RAIL.radius + (level >= 3 ? 1 : 0);
}

/** 駅（駅・貨物駅）が動いているか（電車が走る路線にあるか） */
export function stationWorking(rail: RailNetwork, i: number): boolean {
  const id = rail.lineOf[i];
  return id >= 0 && !!rail.lines[id]?.working;
}

function isStop(s: GameState, i: number): boolean {
  const t = s.tiles[i].building?.type;
  return t === "busStop" || t === "station" || t === "railStation";
}

/** バス路線：道路をたどって近くの停留所どうしを自動でつなぐ */
export function computeBusRoutes(s: GameState, net: RoadNetwork): BusRoutes {
  const stops: number[] = [];
  s.tiles.forEach((_, i) => {
    if (isStop(s, i) && net.roadAccess[i]) stops.push(i);
  });
  const parent = new Map<number, number>(stops.map((i) => [i, i]));
  const find = (i: number): number => {
    let r = i;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    return r;
  };
  const paths: Array<{ a: number; b: number; tiles: number[] }> = [];
  for (const a of stops) {
    // 停留所に面した道路から、道のり BUS_LINK マスまで広げる
    const from = new Map<number, number>();
    const dist = new Map<number, number>();
    const queue: number[] = [];
    for (const r of neighbors4(a, s.width, s.height)) {
      if (isRoad(s.tiles[r].building?.type) && !dist.has(r)) {
        dist.set(r, 0);
        from.set(r, -1);
        queue.push(r);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const r = queue[q];
      const d = dist.get(r)!;
      for (const j of neighbors4(r, s.width, s.height)) {
        // 駅・ターミナルどうしはバス路線にしない（バス停が1つは入っている組だけ）
        const withBusStop = s.tiles[a].building?.type === "busStop" || s.tiles[j].building?.type === "busStop";
        if (j !== a && isStop(s, j) && j > a && net.roadAccess[j] && withBusStop) {
          // 見つけた停留所：路線をつなぎ、表示用の道のりを残す
          if (find(j) !== find(a) || !paths.some((p) => (p.a === a && p.b === j) || (p.a === j && p.b === a))) {
            const tiles: number[] = [];
            for (let k: number = r; k !== -1; k = from.get(k)!) tiles.push(k);
            paths.push({ a, b: j, tiles: tiles.reverse() });
            parent.set(find(j), find(a));
          }
        }
        if (d + 1 > BUS_LINK || dist.has(j) || !isRoad(s.tiles[j].building?.type)) continue;
        dist.set(j, d + 1);
        from.set(j, r);
        queue.push(j);
      }
    }
  }
  const rootId = new Map<number, number>();
  const routeOf = new Map<number, number>();
  const routes: number[][] = [];
  for (const i of stops) {
    const root = find(i);
    if (!rootId.has(root)) {
      rootId.set(root, routes.length);
      routes.push([]);
    }
    const id = rootId.get(root)!;
    routes[id].push(i);
    routeOf.set(i, id);
  }
  const hub = routes.map((r) => r.some((i) => s.tiles[i].building?.type !== "busStop"));
  return { routeOf, routes, paths: paths.map((p) => ({ route: routeOf.get(p.a)!, tiles: p.tiles })), hub };
}

/** バス停の効き目の補正（路線になっていると強く、ターミナル・駅につながると範囲も広い） */
export function busStopBoost(routes: BusRoutes | undefined, s: GameState, i: number): { strength: number; radius: number } {
  const base = BUILDINGS.busStop.coverage!;
  const id = routes?.routeOf.get(i);
  if (!routes || id === undefined) return { strength: base.strength, radius: base.radius };
  const busStops = routes.routes[id].filter((j) => s.tiles[j].building?.type === "busStop").length;
  return { strength: busStops >= 2 || routes.hub[id] ? 0.85 : base.strength, radius: base.radius + (routes.hub[id] ? 1 : 0) };
}

/** 路線の名前と色（駅のある路線に順番に割り当てる。1本目は「町名＋本線」） */
const LINE_STYLES = [
  { name: "", color: "#e11d48" },
  { name: "みどり線", color: "#16a34a" },
  { name: "あお線", color: "#2563eb" },
  { name: "きいろ線", color: "#ca8a04" },
  { name: "むらさき線", color: "#9333ea" },
  { name: "みずいろ線", color: "#0891b2" },
];

/** 線路の路線名と色（駅のない線路は灰色） */
export function lineStyle(s: Pick<GameState, "townName">, rail: RailNetwork, id: number): { name: string; color: string } {
  const line = rail.lines[id];
  if (!line || !hasStation(line)) return { name: "駅のない線路", color: "#94a3b8" };
  const k = rail.lines.slice(0, id).filter(hasStation).length;
  const st = LINE_STYLES[k % LINE_STYLES.length];
  const name = k === 0 ? `${s.townName.replace(/(村|町|市)$/, "")}本線` : `${st.name}${k >= LINE_STYLES.length ? Math.floor(k / LINE_STYLES.length) + 1 : ""}`;
  return { name, color: st.color };
}

const BUS_STYLES = [
  { name: "青バス", color: "#0ea5e9" },
  { name: "赤バス", color: "#f43f5e" },
  { name: "緑バス", color: "#22c55e" },
  { name: "黄バス", color: "#eab308" },
  { name: "紫バス", color: "#a855f7" },
  { name: "橙バス", color: "#f97316" },
];

/** バス路線の名前と色（停留所が2つ以上の路線に順番に割り当てる） */
export function busStyle(routes: BusRoutes, id: number): { name: string; color: string } {
  const k = routes.routes.slice(0, id).filter((r) => r.length >= 2).length;
  const st = BUS_STYLES[k % BUS_STYLES.length];
  return { name: `${st.name}${k >= BUS_STYLES.length ? Math.floor(k / BUS_STYLES.length) + 1 : ""}`, color: st.color };
}
