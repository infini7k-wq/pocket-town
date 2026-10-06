// チャレンジ（シナリオ）：特別な状況から、期限つきの目標を目指すモード。
// 早く達成するほど星が多い（★1〜3）。達成・失敗のあとも、そのまま自由に遊び続けられる。

import type { CityAnalysis } from "./analysis";
import { capacityAt, isZone } from "./buildings";
import { NEWS_LIMIT } from "./config";
import { population } from "./map";
import { rankIndex } from "./progression";
import type { Rng } from "./rng";
import type { GameState, ScenarioResult, TendencyId, TraitId } from "./types";

export interface ScenarioDef {
  id: string;
  title: string;
  emoji: string;
  /** 始まりの状況 */
  story: string;
  /** 目標（短い説明） */
  goal: string;
  /** 制限時間（年） */
  years: number;
  /** 町の個性を固定する場合 */
  trait?: TraitId;
  /** 住民の傾向を固定する場合 */
  tendency?: TendencyId;
  /** 初期の町に手を加える（draft を直接更新） */
  setup: (s: GameState, rng: Rng) => void;
  /** 達成度（0〜1。1 で達成） */
  progress: (s: GameState, a: CityAnalysis) => number;
  /** 星の数（指定がなければ、残り時間で決める） */
  stars?: (s: GameState, used: number) => number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function zones(s: GameState) {
  return s.tiles.filter((t) => t.building && isZone(t.building.type) && t.building.level > 0);
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "debt",
    title: "借金からの再建",
    emoji: "💸",
    story: "前の村長が残したのは、上限いっぱいの借金と空っぽの金庫。このままでは財政破綻してしまう。",
    goal: "5年以内に借入を完済し、資金 ¥4,000,000 をためる",
    years: 5,
    setup: (s) => {
      s.money = 200_000;
      s.loan = 2_000_000;
      // 税収の要だった商店が1軒つぶれている
      const shop = s.tiles.find((t) => t.building?.type === "commercial");
      if (shop?.building) {
        shop.building.abandoned = true;
        shop.building.growth = -40;
      }
    },
    progress: (s) => 0.5 * clamp01(1 - s.loan / 2_000_000) + 0.5 * (s.loan === 0 ? clamp01(s.money / 4_000_000) : 0),
  },
  {
    id: "depopulated",
    title: "限界集落を救え",
    emoji: "👴",
    story: "若者が去り、空き家ばかりになった村。お年寄りの多い「高齢化の時代」に、もう一度にぎわいを取り戻せるか。",
    goal: "5年以内に人口800人",
    years: 5,
    tendency: "elderly",
    setup: (s) => {
      for (const t of s.tiles) {
        const b = t.building;
        if (b?.type === "residential") b.occupants = Math.round(capacityAt("residential", b.level) * 0.3);
      }
      s.profile = { ...s.profile, resAppeal: s.profile.resAppeal - 0.03 };
      s.era = { id: "aging", since: 0, next: { id: "babyBoom", turn: 60, announced: false } };
    },
    progress: (_s, a) => clamp01(a.population / 800),
  },
  {
    id: "greenRevival",
    title: "工業の町を緑の町に",
    emoji: "🏭",
    story: "煙突の煙で空がかすむ工業の町。住民の健康のため、緑あふれる町に生まれ変わらせたい。",
    goal: "8年以内に、人口1,200人・環境75以上",
    years: 8,
    trait: "industrial",
    setup: (s) => {
      // 商店を工場に変え、環境の悪い町から始める
      for (const t of s.tiles) {
        const b = t.building;
        if (b?.type === "commercial") {
          b.type = "industrial";
          b.level = 2;
        }
      }
    },
    progress: (_s, a) => Math.min(clamp01(a.population / 1200), clamp01(a.cityEnvironment / 75)),
  },
  {
    id: "recovery",
    title: "災害からの復興",
    emoji: "🌋",
    story: "大地震で町の半分が空き家になってしまった。資金も少ない中、町を立て直そう。",
    goal: "5年以内に、人口600人・空き家ゼロ",
    years: 5,
    setup: (s, rng) => {
      s.money = 1_500_000;
      for (const t of zones(s)) {
        if (rng.chance(0.5)) {
          t.building!.abandoned = true;
          t.building!.occupants = 0;
          t.building!.growth = -40;
        }
      }
    },
    progress: (s, a) => {
      const abandoned = s.tiles.filter((t) => t.building?.abandoned).length;
      return Math.min(clamp01(a.population / 600), abandoned === 0 ? 1 : 0.95);
    },
  },
  {
    id: "ecoCity",
    title: "環境都市コンテスト",
    emoji: "🌿",
    story: "国の「環境都市コンテスト」にエントリー。大きく、きれいで、住みやすい街をつくろう。",
    goal: "12年以内に、人口3,000人・環境80以上・満足度80%以上",
    years: 12,
    trait: "suburban",
    setup: () => {},
    progress: (_s, a) => Math.min(clamp01(a.population / 3000), clamp01(a.cityEnvironment / 80), clamp01(a.cityHappiness / 80)),
  },
  {
    id: "speedrun",
    title: "メガシティ最短記録",
    emoji: "⏱️",
    story: "ふつうの小さな町から、どれだけ早くメガシティ（人口15,000人）になれるか。腕の見せどころ。",
    goal: "40年以内にメガシティへ（18年以内で★3・25年以内で★2）",
    years: 40,
    setup: () => {},
    progress: (s) => (rankIndex(s.rank) >= rankIndex("megacity") ? 1 : Math.min(0.99, population(s) / 15000)),
    stars: (_s, used) => (used <= 18 * 12 ? 3 : used <= 25 * 12 ? 2 : 1),
  },
];

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((d) => d.id === id);
}

/** 残り時間で星を決める（半分以内で★3、3/4以内で★2） */
export function starsFor(def: ScenarioDef, s: GameState, used: number): number {
  if (def.stars) return def.stars(s, used);
  const limit = def.years * 12;
  return used <= limit * 0.5 ? 3 : used <= limit * 0.75 ? 2 : 1;
}

/** 月末にチャレンジの達成・失敗を判定する（draft を直接更新）。結果が出たらそれを返す */
export function evaluateScenario(draft: GameState, a: CityAnalysis): ScenarioResult | null {
  const sc = draft.scenario;
  if (!sc || sc.result) return null;
  const def = getScenario(sc.id);
  if (!def) return null;
  let result: ScenarioResult | null = null;
  if (def.progress(draft, a) >= 1) {
    const used = draft.turn - sc.startTurn + 1;
    result = { turn: draft.turn, stars: starsFor(def, draft, used) };
    draft.news = [
      { turn: draft.turn, emoji: "🎯", title: `チャレンジ達成「${def.title}」${"★".repeat(result.stars)}`, body: `${Math.ceil(used / 12)}年目で達成しました。このまま自由に遊び続けられます。`, tone: "good" as const },
      ...draft.news,
    ].slice(0, NEWS_LIMIT);
  } else if (draft.turn >= sc.deadline) {
    result = "failed";
    draft.news = [
      { turn: draft.turn, emoji: "⌛", title: `チャレンジ失敗「${def.title}」`, body: "期限までに目標に届きませんでした。このまま自由に遊び続けられます。", tone: "bad" as const },
      ...draft.news,
    ].slice(0, NEWS_LIMIT);
  }
  if (result) sc.result = result;
  return result;
}
