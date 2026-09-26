// 陳情・依頼：街の状態に合わせて、住民や団体から期限つきの依頼が届く。
// 成功すれば報酬と満足度、失敗すると満足度が下がる。街が完成した後も「次にやること」が生まれ続ける。

import type { CityAnalysis } from "./analysis";
import { PROJECTS, isProject } from "./buildings";
import { NEWS_LIMIT, REQUESTS } from "./config";
import { countBuildings } from "./map";
import { addModifier } from "./modifiers";
import { isBuildingUnlocked, rankIndex } from "./progression";
import type { Rng } from "./rng";
import type { BuildingType, CityRequest, GameState, NewsItem } from "./types";

export interface RequestKind {
  id: string;
  emoji: string;
  /** 依頼主 */
  from: string;
  /** 解決に役立つ建物 */
  tool?: BuildingType;
  eligible: (s: GameState, a: CityAnalysis) => boolean;
  make: (s: GameState, a: CityAnalysis) => { base: number; target: number; months: number };
  value: (s: GameState, a: CityAnalysis) => number;
  lowerIsBetter?: boolean;
  title: (r: CityRequest) => string;
  /** 表示用の単位 */
  unit: string;
}

const round10 = (v: number) => Math.round(v / 10) * 10;
const yen = (v: number) => `¥${Math.round(v).toLocaleString("ja-JP")}`;

function comWorkers(s: GameState, a: CityAnalysis): number {
  let n = 0;
  s.tiles.forEach((t, i) => {
    if (t.building?.type === "commercial") n += a.employment.workersAt[i];
  });
  return Math.round(n);
}

function coverageShare(s: GameState, a: CityAnalysis, kind: "health" | "education"): number {
  let covered = 0;
  s.tiles.forEach((t, i) => {
    if (t.building?.type === "residential" && a.coverage[kind][i] > 0) covered += t.building.occupants;
  });
  return a.population > 0 ? covered / a.population : 0;
}

const highrises = (s: GameState) => s.tiles.filter((t) => t.building?.type === "residential" && t.building.level >= 3).length;
const parkCount = (s: GameState) => countBuildings(s, "park") + countBuildings(s, "bigPark");
const abandonedCount = (s: GameState) => s.tiles.filter((t) => t.building?.abandoned).length;
const projectCount = (s: GameState) => s.tiles.filter((t) => isProject(t.building?.type)).length;

export const REQUEST_KINDS: RequestKind[] = [
  {
    id: "population",
    emoji: "👥",
    from: "商工会",
    tool: "residential",
    unit: "人",
    eligible: (_s, a) => a.population >= 300,
    make: (_s, a) => ({ base: a.population, target: a.population + Math.max(80, round10(a.population * 0.12)), months: 12 }),
    value: (_s, a) => a.population,
    title: (r) => `人口を${r.target.toLocaleString("ja-JP")}人に増やしてほしい`,
  },
  {
    id: "happiness",
    emoji: "😊",
    from: "町内会",
    tool: "park",
    unit: "%",
    eligible: (_s, a) => a.population > 0 && a.cityHappiness < 85,
    make: (_s, a) => ({ base: a.cityHappiness, target: Math.min(90, a.cityHappiness + 6), months: 8 }),
    value: (_s, a) => a.cityHappiness,
    title: (r) => `満足度を${r.target}%以上にしてほしい`,
  },
  {
    id: "traffic",
    emoji: "🚗",
    from: "通勤者の会",
    tool: "busStop",
    unit: "%",
    lowerIsBetter: true,
    eligible: (_s, a) => a.congestion >= 20,
    make: (_s, a) => ({ base: a.congestion, target: Math.max(5, a.congestion - 12), months: 8 }),
    value: (_s, a) => a.congestion,
    title: (r) => `交通の混雑度を${r.target}%以下にしてほしい`,
  },
  {
    id: "employment",
    emoji: "💼",
    from: "ハローワーク",
    tool: "commercial",
    unit: "%",
    eligible: (_s, a) => a.population > 200 && a.employment.unemployment > 0.06,
    make: (_s, a) => ({ base: Math.round(a.employment.employmentRate * 100), target: 95, months: 6 }),
    value: (_s, a) => Math.round(a.employment.employmentRate * 100),
    title: () => "雇用率を95%以上にしてほしい",
  },
  {
    id: "environment",
    emoji: "🌿",
    from: "自然保護の会",
    tool: "park",
    unit: "",
    eligible: (_s, a) => a.population > 300 && a.cityEnvironment < 75,
    make: (_s, a) => ({ base: a.cityEnvironment, target: Math.min(85, a.cityEnvironment + 6), months: 8 }),
    value: (_s, a) => a.cityEnvironment,
    title: (r) => `街の環境を${r.target}以上にしてほしい`,
  },
  {
    id: "parks",
    emoji: "🌳",
    from: "子ども会",
    tool: "park",
    unit: "か所",
    eligible: (_s, a) => a.population > 300,
    make: (s) => ({ base: parkCount(s), target: parkCount(s) + 2, months: 6 }),
    value: (s) => parkCount(s),
    title: () => "公園を2つ増やしてほしい",
  },
  {
    id: "highrise",
    emoji: "🏢",
    from: "不動産協会",
    tool: "school",
    unit: "棟",
    eligible: (s) => rankIndex(s.rank) >= 1,
    make: (s) => ({ base: highrises(s), target: highrises(s) + 3, months: 12 }),
    value: (s) => highrises(s),
    title: () => "マンション（住宅Lv3以上）を3棟増やしてほしい",
  },
  {
    id: "commerce",
    emoji: "🛍️",
    from: "商店街組合",
    tool: "commercial",
    unit: "人",
    eligible: (_s, a) => a.population >= 800,
    make: (s, a) => ({ base: comWorkers(s, a), target: Math.round(comWorkers(s, a) * 1.25 + 20), months: 12 }),
    value: (s, a) => comWorkers(s, a),
    title: (r) => `お店で働く人を${r.target}人にしてほしい`,
  },
  {
    id: "hospital",
    emoji: "🏥",
    from: "医師会",
    tool: "hospital",
    unit: "%",
    eligible: (s, a) => a.population >= 500 && coverageShare(s, a, "health") < 0.8,
    make: (s, a) => ({ base: Math.round(coverageShare(s, a, "health") * 100), target: 90, months: 10 }),
    value: (s, a) => Math.round(coverageShare(s, a, "health") * 100),
    title: () => "住民の9割を病院の範囲内にしてほしい",
  },
  {
    id: "surplus",
    emoji: "💴",
    from: "議会",
    unit: "円",
    eligible: (_s, a) => a.budget.net < 50_000,
    make: (_s, a) => ({ base: a.budget.net, target: 100_000, months: 6 }),
    value: (_s, a) => a.budget.net,
    title: () => "月の収支を +¥100,000 以上にしてほしい",
  },
  {
    id: "abandoned",
    emoji: "🏚️",
    from: "町内会",
    unit: "軒",
    lowerIsBetter: true,
    eligible: (s) => abandonedCount(s) >= 2,
    make: (s) => ({ base: abandonedCount(s), target: 0, months: 8 }),
    value: (s) => abandonedCount(s),
    title: () => "空き家をなくしてほしい",
  },
  {
    id: "project",
    emoji: "🏗️",
    from: "市議会",
    unit: "件",
    eligible: (s) => PROJECTS.some((p) => isBuildingUnlocked(p, s.rank) && countBuildings(s, p) === 0),
    make: (s) => ({ base: projectCount(s), target: projectCount(s) + 1, months: 18 }),
    value: (s) => projectCount(s),
    title: () => "大型プロジェクトを1つ着工してほしい",
  },
];

export function getRequestKind(id: string): RequestKind | undefined {
  return REQUEST_KINDS.find((k) => k.id === id);
}

export function requestReward(population: number): number {
  return Math.round((200_000 + population * 60) / 10_000) * 10_000;
}

export function isRequestDone(r: CityRequest, s: GameState, a: CityAnalysis): boolean {
  const k = getRequestKind(r.kind);
  if (!k) return false;
  const v = k.value(s, a);
  return k.lowerIsBetter ? v <= r.target : v >= r.target;
}

export interface RequestView {
  request: CityRequest;
  kind: RequestKind;
  title: string;
  current: number;
  progress: number;
  monthsLeft: number;
  done: boolean;
}

export function describeRequest(r: CityRequest, s: GameState, a: CityAnalysis): RequestView | null {
  const kind = getRequestKind(r.kind);
  if (!kind) return null;
  const current = kind.value(s, a);
  const span = kind.lowerIsBetter ? r.base - r.target : r.target - r.base;
  const moved = kind.lowerIsBetter ? r.base - current : current - r.base;
  const done = isRequestDone(r, s, a);
  return {
    request: r,
    kind,
    title: kind.title(r),
    current,
    progress: done ? 1 : span > 0 ? Math.max(0, Math.min(1, moved / span)) : 0,
    monthsLeft: Math.max(0, r.deadline - s.turn),
    done,
  };
}

function pushNews(s: GameState, item: NewsItem) {
  s.news = [item, ...s.news].slice(0, NEWS_LIMIT);
}

/** 依頼の達成・失敗の判定と、新しい依頼の受付（draft を直接更新する）。起きたことのニュースを返す */
export function processRequests(draft: GameState, a: CityAnalysis, rng: Rng): NewsItem[] {
  const news: NewsItem[] = [];
  const keep: CityRequest[] = [];
  for (const r of draft.requests) {
    const kind = getRequestKind(r.kind);
    if (!kind) continue;
    const title = kind.title(r);
    if (isRequestDone(r, draft, a)) {
      draft.money += r.reward;
      draft.modifiers = addModifier(draft.modifiers, { id: `promise:${r.id}`, label: "依頼に応えた", emoji: "🤝", turnsLeft: 6, effects: { happiness: 3 } });
      news.push({ turn: draft.turn, emoji: "📋", title: `依頼達成：${title}`, body: `${kind.from}から感謝されました。報酬 ${yen(r.reward)}・満足度 +3（6か月）`, tone: "good" });
    } else if (draft.turn >= r.deadline) {
      draft.modifiers = addModifier(draft.modifiers, { id: `broken:${r.id}`, label: "依頼に応えられず", emoji: "😞", turnsLeft: 4, effects: { happiness: -4 } });
      news.push({ turn: draft.turn, emoji: "📋", title: `依頼失敗：${title}`, body: `期限までに間に合いませんでした。満足度 -4（4か月）`, tone: "bad" });
    } else {
      keep.push(r);
    }
  }
  draft.requests = keep;

  const canReceive =
    draft.requests.length < REQUESTS.maxActive && draft.turn >= REQUESTS.startTurn && draft.turn - draft.lastRequestTurn >= REQUESTS.interval && rng.chance(REQUESTS.chance);
  if (canReceive) {
    const active = new Set(draft.requests.map((r) => r.kind));
    const pool = REQUEST_KINDS.filter((k) => !active.has(k.id) && k.eligible(draft, a));
    if (pool.length > 0) {
      const kind = rng.pick(pool);
      const { base, target, months } = kind.make(draft, a);
      const req: CityRequest = { id: `${kind.id}-${draft.turn}`, kind: kind.id, base, target, deadline: draft.turn + months, reward: requestReward(a.population), createdTurn: draft.turn };
      // すでに達成している依頼は出さない
      if (!isRequestDone(req, draft, a)) {
        draft.requests.push(req);
        draft.lastRequestTurn = draft.turn;
        news.push({ turn: draft.turn, emoji: kind.emoji, title: `新しい依頼：${kind.title(req)}`, body: `${kind.from}より。期限は${months}か月、報酬 ${yen(req.reward)}`, tone: "neutral" });
      }
    }
  }
  for (const n of news) pushNews(draft, n);
  return news;
}
