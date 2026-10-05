// 街の評価：人口だけでなく、住みやすさ・環境・財政・交通・雇用・目標から総合的に採点する（1000点満点）。
// メガシティになった後も「より良い街」を目指せるようにするための指標。

import type { CityAnalysis } from "./analysis";
import { goalsAchieved } from "./goals";
import { rankIndex } from "./progression";
import type { GameState } from "./types";

export interface ScorePart {
  id: string;
  label: string;
  emoji: string;
  value: number;
  max: number;
  /** 伸ばすためのヒント */
  hint: string;
}

export interface CityScore {
  total: number;
  grade: "S" | "A" | "B" | "C" | "D";
  parts: ScorePart[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const GRADE_THRESHOLDS: Array<[CityScore["grade"], number]> = [
  ["S", 850],
  ["A", 700],
  ["B", 550],
  ["C", 400],
  ["D", 0],
];

export function cityScore(s: GameState, a: CityAnalysis): CityScore {
  const parts: ScorePart[] = [
    {
      id: "population",
      label: "人口",
      emoji: "👥",
      max: 300,
      value: 300 * clamp01(a.population / 20000),
      hint:
        rankIndex(s.rank) >= rankIndex("megacity")
          ? "土地の買い足しと、大型プロジェクトの近くの5段目の建物で、人口2万人を目指そう"
          : rankIndex(s.rank) >= rankIndex("city")
            ? "超高層（Lv4）・埋め立てで人口を増やし、人口2万人を目指そう"
            : "住宅と仕事を増やして、次のランクへ（ランクが上がると高い建物や広い土地が使える）",
    },
    {
      id: "happiness",
      label: "満足度",
      emoji: "😊",
      max: 200,
      value: 200 * clamp01((a.cityHappiness - 50) / 40),
      hint: "公園・学校・病院の範囲を広げ、騒音と渋滞を減らそう",
    },
    {
      id: "environment",
      label: "環境",
      emoji: "🌿",
      max: 150,
      value: 150 * clamp01((a.cityEnvironment - 40) / 45),
      hint: rankIndex(s.rank) >= rankIndex("town") ? "工場を住宅から離し、大きな公園を増やそう" : "工場を住宅から離し、公園を増やそう",
    },
    {
      id: "finance",
      label: "財政",
      emoji: "💴",
      max: 100,
      value: (a.budget.net > 0 ? 50 : a.budget.net === 0 ? 25 : 0) + (s.loan === 0 ? 50 : 50 * clamp01(1 - s.loan / 10_000_000)),
      hint: "月の収支を黒字にし、借入を返そう",
    },
    {
      id: "traffic",
      label: "交通",
      emoji: "🚗",
      max: 100,
      value: 100 * clamp01((40 - a.congestion) / 40),
      hint: rankIndex(s.rank) >= rankIndex("city") ? "大通り・バス停・バスターミナルで渋滞を減らそう" : rankIndex(s.rank) >= rankIndex("town") ? "大通り・バス停で渋滞を減らそう" : "並行する道路をつくり、建物の反対側にも道路を通そう",
    },
    {
      id: "employment",
      label: "雇用",
      emoji: "💼",
      max: 50,
      value: 50 * clamp01((a.employment.employmentRate - 0.85) / 0.12),
      hint: "仕事と働き手のバランスをとろう",
    },
    {
      id: "goals",
      label: "目標",
      emoji: "🏆",
      max: 100,
      value: Math.min(100, goalsAchieved(s) * 8),
      hint: "「目標」タブの街のスタイルを達成しよう",
    },
  ].map((p) => ({ ...p, value: Math.round(p.value) }));
  const total = Math.min(1000, parts.reduce((sum, p) => sum + p.value, 0));
  const grade = GRADE_THRESHOLDS.find(([, min]) => total >= min)![0];
  return { total, grade, parts };
}

/** いちばん伸びしろのある項目 */
export function weakestPart(score: CityScore): ScorePart {
  return [...score.parts].sort((x, y) => x.value / x.max - y.value / y.max)[0];
}
