// 目標（実績）：最終目標を一つに固定せず、プレイヤーごとに違う「街のスタイル」を目指せるようにする。

import type { CityAnalysis } from "./analysis";
import { getRank, rankIndex } from "./progression";
import { cityScore } from "./score";
import type { BuildingType, GameState } from "./types";

export interface GoalDef {
  id: string;
  title: string;
  emoji: string;
  description: string;
  reward: number;
  /** 達成度（0〜1。1 で達成） */
  progress: (s: GameState, a: CityAnalysis) => number;
}

const ratio = (v: number, target: number) => Math.max(0, Math.min(1, v / target));

function zoneWorkers(s: GameState, a: CityAnalysis, type: "commercial" | "industrial"): number {
  let n = 0;
  s.tiles.forEach((t, i) => {
    if (t.building?.type === type) n += a.employment.workersAt[i];
  });
  return Math.round(n);
}

/** 人口条件つきの目標：人口が足りないうちは 99% で止める */
function gated(pop: number, need: number, value: number): number {
  return pop >= need ? value : Math.min(0.99, Math.min(value, ratio(pop, need)));
}

export const GOALS: GoalDef[] = [
  {
    id: "surplus",
    title: "黒字経営",
    emoji: "💰",
    description: "12か月連続で月次収支を黒字にする",
    reward: 500_000,
    progress: (s) => ratio(s.surplusStreak, 12),
  },
  {
    id: "happy",
    title: "幸せな街",
    emoji: "😊",
    description: "人口500人以上で満足度80%以上",
    reward: 600_000,
    progress: (_s, a) => gated(a.population, 500, ratio(a.cityHappiness, 80)),
  },
  {
    id: "green",
    title: "緑の街",
    emoji: "🌳",
    description: "人口500人以上で環境80以上",
    reward: 600_000,
    progress: (_s, a) => gated(a.population, 500, ratio(a.cityEnvironment, 80)),
  },
  {
    id: "highrise",
    title: "マンションの街",
    emoji: "🏢",
    description: "レベル3以上の住宅（マンション）を5棟",
    reward: 800_000,
    progress: (s) => ratio(s.tiles.filter((t) => t.building?.type === "residential" && t.building.level >= 3).length, 5),
  },
  {
    id: "commerce",
    title: "商業都市",
    emoji: "🛍️",
    description: "商業で働く人を400人に",
    reward: 1_000_000,
    progress: (s, a) => ratio(zoneWorkers(s, a, "commercial"), 400),
  },
  {
    id: "industry",
    title: "工業都市",
    emoji: "🏭",
    description: "工業で働く人を500人に",
    reward: 1_000_000,
    progress: (s, a) => ratio(zoneWorkers(s, a, "industrial"), 500),
  },
  {
    id: "fullEmployment",
    title: "完全雇用",
    emoji: "💼",
    description: "人口1,000人以上で雇用率97%以上",
    reward: 800_000,
    progress: (_s, a) => gated(a.population, 1000, ratio(a.employment.employmentRate, 0.97)),
  },
  {
    id: "safe",
    title: "安心の街",
    emoji: "🛡️",
    description: "人口800人以上で、住民の90%が学校・病院・消防すべての範囲内",
    reward: 1_000_000,
    progress: (s, a) => {
      let covered = 0;
      s.tiles.forEach((t, i) => {
        if (t.building?.type !== "residential") return;
        if (a.coverage.education[i] > 0 && a.coverage.health[i] > 0 && a.coverage.fire[i] > 0) covered += t.building.occupants;
      });
      return gated(a.population, 800, ratio(a.population ? covered / a.population : 0, 0.9));
    },
  },
  {
    id: "smooth",
    title: "渋滞ゼロの街",
    emoji: "🚗",
    description: "人口2,000人以上で混雑度10%以下",
    reward: 1_500_000,
    progress: (_s, a) => gated(a.population, 2000, a.congestion <= 10 ? 1 : ratio(10, a.congestion)),
  },
  {
    id: "pop20k",
    title: "人口2万人の大都会",
    emoji: "🌃",
    description: "人口20,000人",
    reward: 10_000_000,
    progress: (_s, a) => ratio(a.population, 20000),
  },
  {
    id: "gradeS",
    title: "評価Sの街",
    emoji: "🏅",
    description: "街の評価で S（850点以上）をとる",
    reward: 5_000_000,
    progress: (s, a) => ratio(cityScore(s, a).total, 850),
  },
  {
    id: "century",
    title: "100年続く街",
    emoji: "📜",
    description: "財政破綻せずに100年間、町を治める",
    reward: 5_000_000,
    progress: (s) => ratio(s.turn, 1200),
  },
  {
    id: "rich",
    title: "財政豊かな街",
    emoji: "🏦",
    description: "借入なしで資金 ¥20,000,000",
    reward: 0,
    progress: (s) => (s.loan > 0 ? Math.min(0.99, ratio(s.money, 20_000_000)) : ratio(s.money, 20_000_000)),
  },
];

/** 達成した「街のスタイル」の数（ミッションは数えない） */
export function goalsAchieved(s: GameState): number {
  return GOALS.filter((g) => s.achievements.includes(g.id)).length;
}

export function getGoal(id: string): GoalDef | undefined {
  return GOALS.find((g) => g.id === id);
}

/** 新しく達成した目標を記録し、報酬を渡す（draft を直接更新する） */
export function checkGoals(draft: GameState, a: CityAnalysis): string[] {
  const done: string[] = [];
  for (const g of GOALS) {
    if (draft.achievements.includes(g.id)) continue;
    if (g.progress(draft, a) >= 1) {
      draft.achievements.push(g.id);
      draft.money += g.reward;
      done.push(g.id);
    }
  }
  return done;
}

/** 街の個性をひとことで表す称号 */
export function townStyle(s: GameState, a: CityAnalysis): string {
  const rank = getRank(s.rank);
  const com = zoneWorkers(s, a, "commercial");
  const ind = zoneWorkers(s, a, "industrial");
  let adjective = "のどかな";
  let emoji = rank.emoji;
  if (a.population > 0 && a.cityHappiness >= 78) {
    adjective = "笑顔あふれる";
    emoji = "😊";
  } else if (a.cityEnvironment >= 78) {
    adjective = "緑ゆたかな";
    emoji = "🌳";
  } else if (a.congestion >= 40) {
    adjective = "にぎやかすぎる";
    emoji = "🚗";
  } else if (a.cityEnvironment < 50) {
    adjective = "煙たなびく";
    emoji = "🏭";
  } else if (a.population >= 3000) {
    adjective = "活気ある";
  }
  let noun = "住宅";
  if (com > ind * 1.5 && com > 40) noun = "商業";
  else if (ind > com * 1.5 && ind > 40) noun = "工業";
  return `${emoji} ${adjective}${noun}の${rank.name}`;
}

// ---------------- ミッション（序盤の道しるべ） ----------------

export interface MissionDef {
  id: string;
  title: string;
  hint: string;
  /** このミッションで使う建物（ボタンで建設ツールを選べる） */
  tool?: BuildingType;
  reward: number;
  /** 達成度（0〜1） */
  progress: (s: GameState, a: CityAnalysis) => number;
}

/** プレイヤーが自分で建てた建物の数（初期の町にあるものは数えない） */
function builtCount(s: GameState, types: BuildingType[], minLevel = 0): number {
  return s.tiles.filter((t) => t.building && types.includes(t.building.type) && t.building.paid > 0 && t.building.level >= minLevel).length;
}

export const MISSIONS: MissionDef[] = [
  { id: "m:road", title: "道路を3マス延ばそう", hint: "🛣️ 道路を選んで、役所につながる道路の先をなぞろう", tool: "road", reward: 50_000, progress: (s) => ratio(builtCount(s, ["road"]), 3) },
  { id: "m:house", title: "住宅を3つ建てよう", hint: "道路に面した空き地に 🏠 住宅を置こう", tool: "residential", reward: 80_000, progress: (s) => ratio(builtCount(s, ["residential"]), 3) },
  { id: "m:month", title: "「翌月へ」で時間を進めよう", hint: "▶ 翌月へ を押すと、置いた住宅に人が引っ越してくる", reward: 50_000, progress: (s) => (s.turn >= 1 && builtCount(s, ["residential"], 1) > 0 ? 1 : 0) },
  { id: "m:job", title: "お店か工場を建てて仕事を増やそう", hint: "🏪 商業・🏭 工業は働く場所。工場は住宅から離すのがコツ", tool: "commercial", reward: 100_000, progress: (s) => ratio(builtCount(s, ["commercial", "industrial"]), 1) },
  { id: "m:park", title: "公園をつくろう", hint: "🌳 公園の近くの住宅は満足度と環境が上がる", tool: "park", reward: 100_000, progress: (s) => ratio(builtCount(s, ["park", "bigPark"]), 1) },
  { id: "m:service", title: "学校か病院を建てよう", hint: "住民の声で「遠い」と言われている場所の近くに建てると効果的", tool: "school", reward: 200_000, progress: (s) => ratio(builtCount(s, ["school", "hospital"]), 1) },
  { id: "m:grow", title: "自分で建てた住宅を集合住宅（Lv2）に育てよう", hint: "建物をタップすると、育つための条件がわかる", reward: 150_000, progress: (s) => ratio(builtCount(s, ["residential"], 2), 1) },
  { id: "m:pop500", title: "人口500人をめざそう", hint: "住宅と仕事のバランスをとり、満足度を上げよう", reward: 300_000, progress: (_s, a) => ratio(a.population, 500) },
  { id: "m:town", title: "人口1,000人で「町」にランクアップ！", hint: "町になると大通り・バス停・マンションが解禁される", reward: 0, progress: (s, a) => (rankIndex(s.rank) >= 1 ? 1 : ratio(a.population, 1000)) },
];

/** いま取り組むミッション（順番に1つずつ） */
export function currentMission(s: GameState): MissionDef | null {
  return MISSIONS.find((m) => !s.achievements.includes(m.id)) ?? null;
}

/** 達成したミッションを順番に記録して報酬を渡す（新しい状態を返す純粋関数） */
export function claimMissions(s: GameState, a: CityAnalysis): { state: GameState; claimed: MissionDef[] } {
  const claimed: MissionDef[] = [];
  let next = s;
  for (let m = currentMission(next); m && m.progress(next, a) >= 1; m = currentMission(next)) {
    next = { ...next, achievements: [...next.achievements, m.id], money: next.money + m.reward };
    claimed.push(m);
  }
  return { state: next, claimed };
}
