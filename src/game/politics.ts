// 支持率と選挙：4年ごと（4月）に町長選挙。12か月前に公約を選び、支持率と公約の達成で当落が決まる。
// 落選してもゲームオーバーにはしない（条例が白紙になり、しばらく「新町長の方針」で動きにくくなる）。

import type { CityAnalysis } from "./analysis";
import { getRank } from "./progression";
import { requestReward } from "./requests";
import type { Rng } from "./rng";
import { policyState } from "./policies";
import type { ActionResult, CampaignPromise, GameState, NewsItem, PoliticsState } from "./types";
import { NEWS_LIMIT } from "./config";
import { formatDate } from "./format";

/** 選挙の間隔（月） */
export const ELECTION_INTERVAL = 48;
/** 公約の候補が出る、選挙の何か月前か */
export const CAMPAIGN_LEAD = 12;
/** 当選ライン（得票率） */
export const WIN_LINE = 50;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** turn 以降で最初の4月（turn % 12 === 0 が4月） */
function aprilAtOrAfter(turn: number): number {
  return Math.ceil(turn / 12) * 12;
}

export function initPolitics(turn: number, lead = ELECTION_INTERVAL): PoliticsState {
  return { approval: 55, nextElection: aprilAtOrAfter(turn + lead), term: 1, campaign: null, opposition: 0, lastResult: null };
}

// ---------------- 公約 ----------------

interface PromiseKind {
  id: string;
  emoji: string;
  label: (target: number) => string;
  value: (s: GameState, a: CityAnalysis) => number;
  /** 達成の向き：大きいほどよい（up）か、小さいほどよい（down）か */
  dir: "up" | "down";
  /** 候補を作る（作れないときは null）。難易度ごとに目標を変える */
  make: (s: GameState, a: CityAnalysis, d: 1 | 2 | 3) => number | null;
}

export const PROMISE_KINDS: PromiseKind[] = [
  {
    id: "population",
    emoji: "👥",
    label: (t) => `人口を${t.toLocaleString("ja-JP")}人に`,
    value: (_s, a) => a.population,
    dir: "up",
    make: (_s, a, d) => (a.population >= 200 ? Math.round((a.population * [1.12, 1.16, 1.22][d - 1]) / 50) * 50 : null),
  },
  {
    id: "happiness",
    emoji: "😊",
    label: (t) => `満足度を${t}%以上に`,
    value: (_s, a) => a.cityHappiness,
    dir: "up",
    make: (_s, a, d) => (a.cityHappiness < 90 ? Math.min(92, a.cityHappiness + [3, 5, 8][d - 1]) : null),
  },
  {
    id: "congestion",
    emoji: "🚗",
    label: (t) => `交通混雑を${t}%以下に`,
    value: (_s, a) => a.congestion,
    dir: "down",
    make: (_s, a, d) => (a.congestion >= 15 ? Math.max(5, a.congestion - [6, 10, 15][d - 1]) : null),
  },
  {
    id: "environment",
    emoji: "🌿",
    label: (t) => `環境を${t}以上に`,
    value: (_s, a) => a.cityEnvironment,
    dir: "up",
    make: (_s, a, d) => (a.cityEnvironment < 86 ? Math.min(88, a.cityEnvironment + [3, 5, 8][d - 1]) : null),
  },
  {
    id: "employment",
    emoji: "💼",
    label: (t) => `雇用率を${t}%以上に`,
    value: (_s, a) => Math.round(a.employment.employmentRate * 100),
    dir: "up",
    make: (_s, a, d) => (a.employment.unemployment > 0.05 ? [94, 96, 98][d - 1] : null),
  },
  {
    id: "loan",
    emoji: "💳",
    label: () => "借入を完済する",
    value: (s) => s.loan,
    dir: "down",
    make: (s, a, d) => (s.loan > 0 && d === (s.loan > a.budget.income.total * 12 ? 3 : 2) ? 0 : null),
  },
  {
    id: "surplus",
    emoji: "💴",
    label: (t) => `月の収支を+¥${Math.round(t / 10_000).toLocaleString("ja-JP")}万以上に`,
    value: (_s, a) => a.budget.net,
    dir: "up",
    make: (_s, a, d) => Math.round(Math.max(a.budget.net * [1.2, 1.5, 2][d - 1], a.budget.net + [50_000, 100_000, 200_000][d - 1], 100_000) / 10_000) * 10_000,
  },
];

export function getPromiseKind(id: string): PromiseKind | undefined {
  return PROMISE_KINDS.find((k) => k.id === id);
}

export function promiseLabel(p: CampaignPromise): string {
  const k = getPromiseKind(p.kind);
  return k ? `${k.emoji} ${k.label(p.target)}` : p.kind;
}

/** 公約の進み具合（0〜1） */
export function promiseProgress(p: CampaignPromise, s: GameState, a: CityAnalysis): number {
  const k = getPromiseKind(p.kind);
  if (!k) return 0;
  const v = k.value(s, a);
  if (k.dir === "up") return p.target === p.base ? (v >= p.target ? 1 : 0) : clamp((v - p.base) / (p.target - p.base), 0, 1);
  return p.base === p.target ? (v <= p.target ? 1 : 0) : clamp((p.base - v) / (p.base - p.target), 0, 1);
}

export const PROMISE_BONUS: Record<1 | 2 | 3, number> = { 1: 6, 2: 8, 3: 10 };
export const DIFFICULTY_NAMES: Record<1 | 2 | 3, string> = { 1: "かんたん", 2: "ふつう", 3: "むずかしい" };

/** 公約の候補（かんたん・ふつう・むずかしいを1つずつ、なるべく違う種類で） */
export function makePromiseOffers(s: GameState, a: CityAnalysis, rng: Rng): CampaignPromise[] {
  const out: CampaignPromise[] = [];
  const used = new Set<string>();
  for (const d of [1, 2, 3] as const) {
    const pool = PROMISE_KINDS.filter((k) => !used.has(k.id)).flatMap((k) => {
      const target = k.make(s, a, d);
      return target === null ? [] : [{ kind: k.id, base: k.value(s, a), target, difficulty: d }];
    });
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(rng.next() * pool.length)];
    used.add(pick.kind);
    out.push(pick);
  }
  return out;
}

// ---------------- 支持率 ----------------

export interface ApprovalFactor {
  label: string;
  value: number;
}

/** 支持率の目標値の内訳（50 が基準） */
export function approvalFactors(s: GameState, a: CityAnalysis): ApprovalFactor[] {
  const out: ApprovalFactor[] = [];
  const add = (label: string, v: number) => {
    if (Math.abs(v) >= 0.5) out.push({ label, value: round1(v) });
  };
  add("満足度", clamp((a.cityHappiness - 65) * 0.9, -25, 25));
  add("住宅税", -(s.taxes.residential - 9) * 1.5);
  add("お店・工場の税", -((s.taxes.commercial + s.taxes.industrial) / 2 - 9) * 0.5);
  add("失業", -clamp((a.employment.unemployment - 0.05) * 150, 0, 15));
  add("渋滞", -clamp((a.congestion - 10) * 0.2, 0, 10));
  add("財政", s.money < 0 ? -10 : a.budget.net < 0 ? -4 : 0);
  add("借金", -clamp((s.loan / Math.max(1, getRank(s.rank).loanLimit)) * 8, 0, 8));
  const past = s.history.length >= 13 ? s.history[s.history.length - 13].population : s.history[0]?.population;
  if (past) add("人口の伸び", clamp(((a.population - past) / past) * 25, -6, 5));
  add("条例・できごと", a.fx.approval);
  const p = s.politics?.campaign?.promise;
  if (p) add("公約の進み具合", (promiseProgress(p, s, a) - 0.5) * 6);
  return out;
}

export function approvalTarget(s: GameState, a: CityAnalysis): number {
  return clamp(50 + approvalFactors(s, a).reduce((sum, f) => sum + f.value, 0), 0, 100);
}

/** 選挙の見込み */
export function electionOutlook(approval: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (approval >= 58) return { label: "当選しそう", tone: "good" };
  if (approval >= 45) return { label: "接戦", tone: "warn" };
  return { label: "落選しそう", tone: "bad" };
}

// ---------------- 毎月の処理 ----------------

export interface PoliticsOutcome {
  events: NewsItem[];
  election: { won: boolean; vote: number; kept: boolean | null; landslide: boolean; promise: string | null } | null;
  campaignStart: boolean;
}

function news(draft: GameState, item: NewsItem, events: NewsItem[]) {
  draft.news = [item, ...draft.news].slice(0, NEWS_LIMIT);
  events.push(item);
}

/** 月末に支持率を更新し、公約の候補・世論調査・選挙を進める（draft を直接更新） */
export function processPolitics(draft: GameState, a: CityAnalysis, rng: Rng): PoliticsOutcome {
  const out: PoliticsOutcome = { events: [], election: null, campaignStart: false };
  const inScenario = !!draft.scenario && !draft.scenario.result;
  // 古いセーブ・チャレンジ：始まったら（終わったら）、4年後に最初の選挙
  if (draft.politics === undefined) draft.politics = inScenario ? null : initPolitics(draft.turn);
  if (draft.politics === null) {
    if (!inScenario) draft.politics = initPolitics(draft.turn, 36);
    else return out;
  }
  const pol: PoliticsState = { ...draft.politics };
  draft.politics = pol;

  // 支持率：毎月、目標値の25%ずつ近づく
  pol.approval = round1(clamp(pol.approval + (approvalTarget(draft, a) - pol.approval) * 0.25, 0, 100));
  if (pol.opposition > 0) pol.opposition -= 1;

  const left = pol.nextElection - draft.turn;
  // 12か月前：公約の候補
  if (left <= CAMPAIGN_LEAD && left > 0 && !pol.campaign) {
    const offers = getRank(draft.rank).id === "village" ? [] : makePromiseOffers(draft, a, rng);
    pol.campaign = { offers, promise: null, seen: offers.length === 0 };
    if (offers.length > 0) {
      out.campaignStart = true;
      news(draft, { turn: draft.turn, emoji: "🗳️", title: `町長選挙まであと約1年`, body: `選挙は${formatDate(pol.nextElection)}。公約を1つ選ぼう。達成すると得票が増えます。`, tone: "neutral" }, out.events);
    }
  }
  // 6か月前：世論調査
  if (left === 6) {
    const o = electionOutlook(pol.approval);
    news(draft, { turn: draft.turn, emoji: "📊", title: `世論調査：支持率 ${Math.round(pol.approval)}%（${o.label}）`, body: "選挙まであと6か月です。", tone: o.tone === "bad" ? "bad" : "neutral" }, out.events);
  }
  // 選挙
  if (left <= 0) {
    const promise = pol.campaign?.promise ?? null;
    const progress = promise ? promiseProgress(promise, draft, a) : 0;
    const kept = promise ? progress >= 1 : null;
    const uncontested = getRank(draft.rank).id === "village" && !promise;
    const bonus = promise ? (kept ? PROMISE_BONUS[promise.difficulty] : -(1 - progress) * 6) : 0;
    const vote = uncontested ? 100 : Math.round(clamp(pol.approval + 3 + bonus + rng.range(-3, 3), 5, 95));
    const won = vote >= WIN_LINE;
    const landslide = won && !uncontested && vote >= 65 && kept === true;
    const ps = policyState(draft);
    if (won) {
      pol.term += 1;
      draft.modifiers = [...draft.modifiers.filter((m) => m.id !== "newTerm"), { id: "newTerm", label: "新しい任期への期待", emoji: "🎉", turnsLeft: 6, effects: { approval: 5 } }];
      let reward = 0;
      if (kept) {
        reward = Math.round((requestReward(a.population, a.budget.income.total) * 1.5) / 10_000) * 10_000;
        draft.money += reward;
      }
      draft.policies = { ...ps, bonusSlot: landslide };
      news(
        draft,
        {
          turn: draft.turn,
          emoji: "🎉",
          title: uncontested ? "町長選挙：無投票で当選" : `町長選挙：当選（得票率 ${vote}%）`,
          body: `${pol.term}期目に入りました。${kept ? `公約を達成し、交付金 ¥${reward.toLocaleString("ja-JP")}。` : ""}${landslide ? "圧勝したので、条例の枠が1つ増えました（次の選挙まで）。" : ""}`,
          tone: "good",
        },
        out.events,
      );
    } else {
      // 落選：条例は白紙、しばらく「新町長の方針」
      draft.policies = { ...ps, active: [], bonusSlot: false };
      pol.approval = 45;
      pol.opposition = 12;
      news(
        draft,
        {
          turn: draft.turn,
          emoji: "😞",
          title: `町長選挙：落選（得票率 ${vote}%）`,
          body: "新しい町長の方針で、条例はすべて取り消されました。1年間は条例の枠が1つ減り、制定費が2倍になります。4年後の返り咲きを目指そう。",
          tone: "bad",
        },
        out.events,
      );
    }
    out.election = { won, vote, kept, landslide, promise: promise ? promiseLabel(promise) : null };
    pol.lastResult = { turn: draft.turn, won, vote, kept };
    pol.nextElection += ELECTION_INTERVAL;
    pol.campaign = null;
  }
  return out;
}

// ---------------- プレイヤーの操作 ----------------

/** 公約を選ぶ */
export function choosePromise(s: GameState, index: number): ActionResult {
  const c = s.politics?.campaign;
  const p = c?.offers[index];
  if (!s.politics || !c || !p) return { ok: false, error: "選べる公約がありません" };
  if (c.promise) return { ok: false, error: "公約はすでに決まっています" };
  return { ok: true, state: { ...s, politics: { ...s.politics, campaign: { ...c, promise: p, seen: true } } }, message: `🗳️ 公約「${promiseLabel(p)}」を掲げました` };
}

/** 公約をあとで決める（ダイアログを閉じる） */
export function deferPromise(s: GameState): ActionResult {
  const c = s.politics?.campaign;
  if (!s.politics || !c) return { ok: true, state: s };
  return { ok: true, state: { ...s, politics: { ...s.politics, campaign: { ...c, seen: true } } } };
}

/** 公約を選ぶダイアログを出すべきか */
export function shouldOfferPromise(s: GameState): boolean {
  const c = s.politics?.campaign;
  return !!c && !c.seen && !c.promise && c.offers.length > 0 && !s.gameOver;
}
