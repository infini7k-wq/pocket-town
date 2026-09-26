// 殿堂（思い出の街アルバム）：メガシティに到達した街やチャレンジの記録を、ゲームのセーブとは別に残す。

import type { CityAnalysis } from "./analysis";
import { goalsAchieved, townStyle } from "./goals";
import { cityScore } from "./score";
import type { GameState, RankId, TraitId } from "./types";

export interface HallRecord {
  gameId: string;
  townName: string;
  trait: TraitId;
  rank: RankId;
  /** 記録したときの経過月数 */
  turn: number;
  peakPopulation: number;
  score: number;
  grade: string;
  style: string;
  goals: number;
  /** チャレンジなら、その id と星 */
  scenarioId?: string;
  stars?: number;
  /** 記録した日時（ISO 文字列） */
  recordedAt: string;
}

export const HALL_LIMIT = 30;

export function makeHallRecord(s: GameState, a: CityAnalysis, now: Date = new Date()): HallRecord {
  const score = cityScore(s, a);
  const result = s.scenario?.result;
  return {
    gameId: s.gameId,
    townName: s.townName,
    trait: s.profile.trait,
    rank: s.rank,
    turn: s.turn,
    peakPopulation: Math.max(a.population, ...s.history.map((h) => h.population)),
    score: score.total,
    grade: score.grade,
    style: townStyle(s, a),
    goals: goalsAchieved(s),
    scenarioId: s.scenario?.id,
    stars: result && result !== "failed" ? result.stars : undefined,
    recordedAt: now.toISOString(),
  };
}

/** 同じゲームの記録は、より良いもので上書きする（純粋関数） */
export function upsertHall(hall: HallRecord[], rec: HallRecord): HallRecord[] {
  const prev = hall.find((h) => h.gameId === rec.gameId);
  const merged: HallRecord = prev
    ? {
        ...rec,
        peakPopulation: Math.max(prev.peakPopulation, rec.peakPopulation),
        score: Math.max(prev.score, rec.score),
        grade: prev.score > rec.score ? prev.grade : rec.grade,
        stars: Math.max(prev.stars ?? 0, rec.stars ?? 0) || undefined,
      }
    : rec;
  return [merged, ...hall.filter((h) => h.gameId !== rec.gameId)].slice(0, HALL_LIMIT);
}

/** チャレンジごとの最高の星 */
export function bestStars(hall: HallRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of hall) if (h.scenarioId && h.stars) out[h.scenarioId] = Math.max(out[h.scenarioId] ?? 0, h.stars);
  return out;
}
