// シミュレーションエンジン：「翌月へ」で1か月分の処理を順番に実行する。UI からは完全に独立した純粋関数。
//
//   1. 人口変化（転入・転出）
//   2. 税収  3. 維持費・利息
//   4. 建物の成長
//   5. 雇用変化  6. 満足度変化（再分析）
//   7. ランダムイベント
//   → 大型施設の工事・時代の転換・陳情の判定・ランクアップ・目標・財政破綻、住民の声の更新

import { analyzeCity } from "./analysis";
import { BUILDINGS } from "./buildings";
import { advanceEra } from "./eras";
import { processRequests } from "./requests";
import { evaluateScenario } from "./scenarios";
import { ECONOMY, HISTORY_LIMIT, HISTORY_MAX, NEWS_LIMIT, RANKS } from "./config";
import { rollEvent } from "./events";
import { checkGoals, getGoal } from "./goals";
import { applyGrowth } from "./growth";
import { population } from "./map";
import { tickModifiers } from "./modifiers";
import { migrate } from "./population";
import { getRank, nextRank, rankForPopulation, rankIndex } from "./progression";
import { createRng } from "./rng";
import type { GameState, HistoryPoint, MonthReport, NewsItem, OutflowReason } from "./types";
import { generateVoices } from "./voices";
import { weatherOf } from "./weather";
import { processPolitics } from "./politics";

export interface MonthOutcome {
  state: GameState;
  report: MonthReport;
}

export function canAdvance(state: GameState): boolean {
  return !state.gameOver && !state.pendingEvent;
}

export function advanceMonth(state: GameState, options: { forceEvent?: string } = {}): MonthOutcome | null {
  if (!canAdvance(state)) return null;
  const draft = structuredClone(state);
  const rng = createRng(draft.rngSeed);
  const populationBefore = population(draft);
  const events: NewsItem[] = [];

  // 1. 人口変化
  const a0 = analyzeCity(draft);
  const migration = migrate(draft, { net: a0.net, happiness: a0.happiness, employment: a0.employment, fx: a0.fx }, rng);

  // 2〜3. 税収と維持費（転入・転出後の人口で計算）
  const a1 = analyzeCity(draft);
  const budget = a1.budget;
  draft.money += budget.net;
  draft.surplusStreak = budget.net > 0 ? draft.surplusStreak + 1 : 0;

  // 4. 建物の成長と、大型施設の工事
  const growth = applyGrowth(draft, a1, rng);
  draft.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || !b.buildLeft) return;
    b.buildLeft -= 1;
    if (b.buildLeft > 0) return;
    delete b.buildLeft;
    b.level = 1;
    const def = BUILDINGS[b.type];
    growth.changes.push({ tile: i, kind: "built", level: 1 });
    const item: NewsItem = { turn: draft.turn, emoji: def.emoji[1], title: `${def.name}が完成！`, body: def.impact ?? def.description, tone: "good", tile: i };
    draft.news = [item, ...draft.news].slice(0, NEWS_LIMIT);
    events.push(item);
  });

  // 一時的な効果の期限を進める（新しいイベントの効果は丸々効くように、抽選の前に）
  draft.modifiers = tickModifiers(draft.modifiers);

  // 5〜6. 雇用・満足度の再計算、7. ランダムイベント
  const a2 = analyzeCity(draft);
  const event = rollEvent(draft, a2, rng, options.forceEvent);
  if (event) events.push(event);

  // 時代の予告・転換と、陳情・依頼
  const eraChange = advanceEra(draft, rng);
  if (eraChange) events.push(draft.news[0]);
  else if (draft.news[0]?.turn === draft.turn && draft.news[0].kind === "eraNotice") events.push(draft.news[0]);
  events.push(...processRequests(draft, analyzeCity(draft), rng));

  // 月末の判定
  const populationAfter = population(draft);
  let rankUp: MonthReport["rankUp"] = null;
  const reached = rankForPopulation(populationAfter);
  if (rankIndex(reached.id) > rankIndex(draft.rank)) {
    // 一気に複数ランク上がったときは、飛ばしたランクのお祝い金もまとめて渡す
    const reward = RANKS.slice(rankIndex(draft.rank) + 1, rankIndex(reached.id) + 1).reduce((sum, r) => sum + r.reward, 0);
    draft.rank = reached.id;
    draft.money += reward;
    rankUp = reached.id;
    const item: NewsItem = {
      turn: draft.turn,
      emoji: reached.emoji,
      title: `「${reached.name}」にランクアップ！`,
      body: `人口が${reached.minPopulation.toLocaleString("ja-JP")}人を突破しました。お祝い金 ¥${reward.toLocaleString("ja-JP")}`,
      tone: "good",
      kind: "rankUp",
    };
    draft.news = [item, ...draft.news].slice(0, NEWS_LIMIT);
    events.push(item);
  }

  if (draft.money < 0) draft.debtMonths += 1;
  else draft.debtMonths = 0;
  if (draft.debtMonths >= ECONOMY.bankruptcyMonths) {
    draft.gameOver = { reason: `資金がマイナスのまま${ECONOMY.bankruptcyMonths}か月が過ぎ、財政破綻しました。`, turn: draft.turn };
    draft.pendingEvent = null;
  }

  const final = analyzeCity(draft);
  const scenarioResult = evaluateScenario(draft, final);
  // 支持率・公約・選挙
  const politics = draft.gameOver ? null : processPolitics(draft, final, rng);
  if (politics) events.push(...politics.events);
  const achievements = checkGoals(draft, final);
  for (const id of achievements) {
    const g = getGoal(id);
    if (!g) continue;
    const item: NewsItem = {
      turn: draft.turn,
      emoji: g.emoji,
      title: `目標達成「${g.title}」`,
      body: g.reward > 0 ? `報酬 ¥${g.reward.toLocaleString("ja-JP")}` : g.description,
      tone: "good",
    };
    draft.news = [item, ...draft.news].slice(0, NEWS_LIMIT);
  }

  // 転入・転出の合計が実際の人口の増減と一致するよう、イベントによる増減を加える
  let inflow = migration.inflow + growth.movedIn;
  let outflow = migration.outflow + growth.movedOut;
  const diff = populationAfter - populationBefore - (inflow - outflow);
  if (diff > 0) inflow += diff;
  else outflow -= diff;
  const outflowReasons: Partial<Record<OutflowReason, number>> = { ...migration.reasons };
  if (growth.movedOut > 0) outflowReasons.decline = growth.movedOut;
  if (diff < 0) outflowReasons.event = -diff;

  const report: MonthReport = {
    turn: state.turn,
    inflow,
    outflow,
    populationBefore,
    populationAfter,
    budget,
    construction: draft.monthSpend,
    changes: growth.changes,
    events,
    rankUp,
    achievements,
    eraChange,
    scenarioResult,
    outflowReasons,
    weather: weatherOf(state),
    election: politics?.election ?? null,
    campaignStart: politics?.campaignStart ?? false,
  };

  draft.turn += 1;
  draft.monthSpend = 0;
  draft.lastReport = report;
  draft.history = compactHistory([
    ...draft.history,
    {
      turn: draft.turn,
      population: populationAfter,
      money: draft.money,
      happiness: final.cityHappiness,
      net: budget.net,
      approval: draft.politics ? Math.round(draft.politics.approval) : undefined,
      congestion: final.congestion,
      unemployment: Math.round(final.employment.unemployment * 1000) / 10,
    },
  ]);
  draft.peakPopulation = Math.max(draft.peakPopulation ?? 0, populationAfter, ...state.history.map((h) => h.population));
  draft.voices = generateVoices(draft, final, rng, report, state.voices);
  draft.rngSeed = rng.seed;
  return { state: draft, report };
}

/** 直近 HISTORY_LIMIT か月は毎月の記録を残し、それより古いものは年1回（4月）分だけ残す */
export function compactHistory(h: HistoryPoint[]): HistoryPoint[] {
  const cut = h.length - HISTORY_LIMIT;
  return h.filter((p, k) => k >= cut || p.turn % 12 === 0).slice(-HISTORY_MAX);
}

/** 次のランクまでの進み具合（0〜1） */
export function rankProgress(state: GameState): { current: number; next: number | null; ratio: number } {
  const pop = population(state);
  const cur = getRank(state.rank);
  const next = nextRank(state.rank);
  if (!next) return { current: pop, next: null, ratio: 1 };
  const span = next.minPopulation - cur.minPopulation;
  return { current: pop, next: next.minPopulation, ratio: Math.max(0, Math.min(1, (pop - cur.minPopulation) / span)) };
}
