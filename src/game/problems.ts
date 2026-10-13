// 困りごとの一覧：「次の困りごとへ」ボタンで順番に見せる場所（道路がない・つながっていない・電車が来ない・空き家・渋滞など）

import type { CityAnalysis } from "./analysis";
import { BUILDINGS, isRoad } from "./buildings";
import { neighbors4 } from "./map";
import { besideGroundTrack, isStationType, stationWorking } from "./rail";
import type { GameState } from "./types";

export interface CityProblem {
  tile: number;
  emoji: string;
  text: string;
  kind: "noRoad" | "disconnected" | "noLine" | "abandoned" | "traffic" | "lonelyBus";
}

/** 一度に案内する困りごとの上限（多すぎると巡回しきれない） */
const PROBLEM_LIMIT = 40;

export function cityProblems(state: GameState, a: CityAnalysis): CityProblem[] {
  const out: CityProblem[][] = [[], [], [], [], [], []];
  state.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || isRoad(b.type) || b.type === "annex") return;
    const cat = BUILDINGS[b.type].category;
    if (cat === "special" || cat === "rail") return;
    const name = BUILDINGS[b.type].name;
    if (!a.net.roadAccess[i])
      out[0].push({
        tile: i,
        emoji: "⛔",
        text: besideGroundTrack(state, i) ? `${name}が道路に面していないので使えません（線路は家の入口にならないので、反対側に道路を通そう）` : `${name}が道路に面していないので使えません`,
        kind: "noRoad",
      });
    else if (!a.net.connected[i]) out[1].push({ tile: i, emoji: "⚠️", text: `${name}から役所まで道路がつながっていません（効果が半分）`, kind: "disconnected" });
    else if (isStationType(b.type) && !stationWorking(a.rail, i)) out[2].push({ tile: i, emoji: "🚫", text: `${name}に電車が来ていません（線路でほかの駅か地図の端につなぐ）`, kind: "noLine" });
    if (b.abandoned) out[3].push({ tile: i, emoji: "🏚️", text: b.type === "residential" ? "空き家になっています（満足度を上げると人が戻る）" : b.type === "commercial" ? "空き店舗になっています（お客さんか働き手が足りない）" : "空き工場になっています（注文か働き手が足りない）", kind: "abandoned" });
  });
  // 渋滞：つながった渋滞の道路ごとに、いちばん混んでいるマスを1つだけ
  const seen = new Uint8Array(state.tiles.length);
  state.tiles.forEach((_, i) => {
    if (seen[i] || a.traffic.level[i] !== 3) return;
    let worst = i;
    const queue = [i];
    seen[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const r = queue[q];
      if (a.traffic.ratio[r] > a.traffic.ratio[worst]) worst = r;
      for (const j of neighbors4(r, state.width, state.height)) {
        if (!seen[j] && a.traffic.level[j] === 3) {
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
    out[4].push({ tile: worst, emoji: "🚗", text: "渋滞しています（この道路の詳しい情報で、車を出している建物がわかる）", kind: "traffic" });
  });
  for (const route of a.busRoutes.routes) {
    if (route.length === 1 && state.tiles[route[0]].building?.type === "busStop") {
      out[5].push({ tile: route[0], emoji: "🚏", text: "路線になっていないバス停です（道のり8マス以内にほかのバス停を置くと、よく効く）", kind: "lonelyBus" });
    }
  }
  // 同じ場所は1回だけ（道路のない空き家などは、いちばん大事な理由で案内する）
  const seenTile = new Set<number>();
  return out
    .flat()
    .filter((p) => !seenTile.has(p.tile) && !!seenTile.add(p.tile))
    .slice(0, PROBLEM_LIMIT);
}
