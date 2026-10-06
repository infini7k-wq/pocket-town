// 季節と天気：毎月の天気を、ゲームごと・月ごとに決まった値として求める（保存しない）。
// メインの乱数は使わないので、ほかの抽選の結果は変わらない。

import { createRng } from "./rng";
import type { GameState, Modifier, ModifierEffects } from "./types";

export type Season = "spring" | "summer" | "autumn" | "winter";
export type WeatherId = "sunny" | "cloudy" | "rain" | "longRain" | "heat" | "typhoon" | "snow" | "heavySnow";

export interface WeatherDef {
  id: WeatherId;
  name: string;
  emoji: string;
  effects: ModifierEffects;
}

export const WEATHER_DEFS: Record<WeatherId, WeatherDef> = {
  sunny: { id: "sunny", name: "晴れ", emoji: "☀️", effects: {} },
  cloudy: { id: "cloudy", name: "くもり", emoji: "☁️", effects: {} },
  rain: { id: "rain", name: "雨", emoji: "☔", effects: { traffic: 0.05 } },
  longRain: { id: "longRain", name: "長雨", emoji: "🌧️", effects: { comDemand: -0.05, happiness: -1, traffic: 0.05 } },
  heat: { id: "heat", name: "猛暑", emoji: "🥵", effects: { happiness: -2, healthWeight: 0.3 } },
  typhoon: { id: "typhoon", name: "台風", emoji: "🌀", effects: { comDemand: -0.1, traffic: 0.1, happiness: -1 } },
  snow: { id: "snow", name: "雪", emoji: "🌨️", effects: { traffic: 0.05, roadUpkeep: 0.2 } },
  heavySnow: { id: "heavySnow", name: "大雪", emoji: "☃️", effects: { traffic: 0.15, roadUpkeep: 0.6, comDemand: -0.05, happiness: -1 } },
};

/** 春秋の晴れが2か月続いたときの「行楽日和」の効果 */
const FINE_DAYS: ModifierEffects = { comDemand: 0.05, happiness: 1 };

/** 月ごとの天気の出やすさ（%） */
const MONTHLY: Record<number, Partial<Record<WeatherId, number>>> = {
  3: { sunny: 55, cloudy: 25, rain: 20 },
  4: { sunny: 55, cloudy: 25, rain: 20 },
  5: { sunny: 55, cloudy: 25, rain: 20 },
  6: { sunny: 5, cloudy: 15, rain: 25, longRain: 55 },
  7: { sunny: 35, rain: 15, longRain: 10, heat: 30, typhoon: 10 },
  8: { sunny: 25, rain: 15, heat: 45, typhoon: 15 },
  9: { sunny: 35, cloudy: 20, longRain: 20, typhoon: 25 },
  10: { sunny: 55, cloudy: 20, rain: 15, typhoon: 10 },
  11: { sunny: 55, cloudy: 30, rain: 15 },
  12: { sunny: 40, cloudy: 30, snow: 25, heavySnow: 5 },
  1: { sunny: 30, cloudy: 15, snow: 35, heavySnow: 20 },
  2: { sunny: 35, cloudy: 15, snow: 35, heavySnow: 15 },
};

/** turn 0 = 1年目4月 */
export function monthOfTurn(turn: number): number {
  return ((turn + 3) % 12) + 1;
}

export function seasonOf(turn: number): Season {
  const m = monthOfTurn(turn);
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

export const SEASON_NAMES: Record<Season, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** その月の天気（同じゲーム・同じ月なら必ず同じ） */
export function weatherAt(state: Pick<GameState, "gameId" | "profile">, turn: number): WeatherId {
  const rng = createRng((hash(state.gameId ?? "town") ^ Math.imul(turn + 1, 0x9e3779b1)) >>> 0);
  const odds = { ...MONTHLY[monthOfTurn(turn)] };
  // 海沿いの町は台風が多く、大雪は少ない
  if (state.profile.trait === "coastal") {
    if (odds.typhoon) odds.typhoon *= 1.6;
    if (odds.heavySnow) odds.heavySnow *= 0.5;
  }
  const entries = Object.entries(odds) as Array<[WeatherId, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r < 0) return id;
  }
  return entries[0][0];
}

export function weatherOf(state: Pick<GameState, "gameId" | "profile" | "turn">): WeatherId {
  return weatherAt(state, state.turn);
}

/** 行楽日和（春・秋に晴れが2か月続いた） */
export function isFineDays(state: Pick<GameState, "gameId" | "profile" | "turn">): boolean {
  const s = seasonOf(state.turn);
  return (s === "spring" || s === "autumn") && weatherOf(state) === "sunny" && weatherAt(state, state.turn - 1) === "sunny";
}

/** 今月の天気の効果（分析に加える） */
export function weatherModifiers(state: Pick<GameState, "gameId" | "profile" | "turn">): Modifier[] {
  const w = WEATHER_DEFS[weatherOf(state)];
  if (isFineDays(state)) return [{ id: "weather", label: "行楽日和", emoji: "🌤️", turnsLeft: 1, effects: FINE_DAYS }];
  if (Object.keys(w.effects).length === 0) return [];
  return [{ id: "weather", label: `天気：${w.name}`, emoji: w.emoji, turnsLeft: 1, effects: w.effects }];
}

/** 画面用：今月の天気の名前・絵文字（行楽日和を含む） */
export function weatherLabel(state: Pick<GameState, "gameId" | "profile" | "turn">): { id: WeatherId; name: string; emoji: string } {
  const w = WEATHER_DEFS[weatherOf(state)];
  return isFineDays(state) ? { id: w.id, name: "行楽日和", emoji: "🌤️" } : { id: w.id, name: w.name, emoji: w.emoji };
}
