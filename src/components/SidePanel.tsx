"use client";

import {
  BUILDINGS,
  ECONOMY,
  projectsFor,
  cityScore,
  townStory,
  nextAdvice,
  demandLevel,
  DEMAND,
  getScenario,
  weakestPart,
  describeEffects,
  describeRequest,
  getEra,
  monthsToNextEra,
  nextRank,
  GOALS,
  RANKS,
  TENDENCIES,
  TRAITS,
  formatDate,
  formatNumber,
  currentMission,
  formatYen,
  goalsAchieved,
  isBuildingUnlocked,
  loanLimit,
  profileSummary,
  getRank,
  rankIndex,
  townStyle,
  unlocksForRank,
  type CityAnalysis,
  type GameState,
  type ZoneType,
} from "@/game";
import { useState } from "react";
import { mainOutflowReason, useCity, useGame, type PanelTab } from "./GameProvider";
import { Sparkline } from "./Sparkline";
import { Button, Card, ProgressBar, Signed, cx } from "./ui";

const TABS: Array<{ id: PanelTab; label: string; icon: string }> = [
  { id: "voices", label: "住民の声", icon: "💬" },
  { id: "city", label: "街の状況", icon: "📊" },
  { id: "finance", label: "財政", icon: "💴" },
  { id: "goals", label: "目標", icon: "🏆" },
];

export function SidePanel() {
  const { state } = useCity();
  const { panelTab, setPanelTab } = useGame();
  const badVoices = state.voices.filter((v) => v.tone === "bad").length;
  return (
    <div id="side-panel" className="flex flex-col gap-3">
      <ScenarioCard />
      <MissionCard />
      <AdviceCard />
      <RequestsCard />
      <div id="side-panel-tabs" className="grid grid-cols-4 gap-1 rounded-2xl bg-white/70 p-1 ring-1 ring-slate-900/5" style={{ scrollMarginTop: "calc(var(--header-h, 80px) + 8px)" }} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={panelTab === t.id}
            onClick={() => setPanelTab(t.id)}
            className={cx("relative rounded-xl px-1 py-1.5 text-[11px] font-bold transition sm:text-xs", panelTab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            <span className="mr-0.5" aria-hidden>
              {t.icon}
            </span>
            {t.label}
            {t.id === "voices" && badVoices > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white">{badVoices}</span>
            )}
          </button>
        ))}
      </div>
      {panelTab === "voices" && <VoicesPanel />}
      {panelTab === "city" && <CityPanel />}
      {panelTab === "finance" && <FinancePanel />}
      {panelTab === "goals" && <GoalsPanel />}
    </div>
  );
}

// ---------------- ミッション ----------------
function MissionCard() {
  const { state, analysis } = useCity();
  const { pickTool } = useGame();
  const m = currentMission(state);
  if (!m) return <NextGoalCard />;
  const p = m.progress(state, analysis);
  const step = state.achievements.filter((id) => id.startsWith("m:")).length + 1;
  return (
    <section className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 shadow-sm ring-1 ring-amber-200">
      <div className="flex items-center justify-between text-[11px] font-black text-amber-700">
        <span>🎯 ミッション {step}</span>
        {m.reward > 0 && <span className="tabular rounded-full bg-white/80 px-2 py-0.5">報酬 {formatYen(m.reward, { compact: true })}</span>}
      </div>
      <div className="mt-1 text-sm font-black text-slate-800">{m.title}</div>
      <div className="mt-0.5 text-[11px] font-bold leading-snug text-slate-500">{m.hint}</div>
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar value={p} className="h-2 flex-1" color="bg-gradient-to-r from-amber-400 to-orange-500" />
        <span className="tabular text-[11px] font-black text-amber-700">{Math.floor(p * 100)}%</span>
        {m.tool && (
          <button type="button" onClick={() => pickTool(m.tool!)} className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-black text-white shadow-sm hover:bg-orange-600">
            {BUILDINGS[m.tool].emoji[1]} {BUILDINGS[m.tool].name}を選ぶ
          </button>
        )}
      </div>
    </section>
  );
}

/** ミッションを終えたあとの「次の大きな目標」 */
function NextGoalCard() {
  const { state, analysis } = useCity();
  const { pickTool } = useGame();
  const next = nextRank(state.rank);
  const projects = projectsFor(state.profile.trait);
  const project = projects.find((p) => isBuildingUnlocked(p, state.rank) && !state.tiles.some((t) => t.building?.type === p));
  const lockedProject = projects.find((p) => !isBuildingUnlocked(p, state.rank));
  if (!next && !project) return <BeyondCard />;
  return (
    <section className="rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 p-3.5 shadow-sm ring-1 ring-indigo-100">
      <div className="text-[11px] font-black text-indigo-700">🚀 次の大きな目標</div>
      <ul className="mt-1.5 space-y-2">
        {next && (
          <li>
            <div className="flex items-center justify-between text-xs font-black text-slate-800">
              <span>
                {next.emoji} 人口{next.minPopulation.toLocaleString("ja-JP")}人で「{next.name}」へ
              </span>
              <span className="tabular text-[11px] text-slate-500">{Math.round((analysis.population / next.minPopulation) * 100)}%</span>
            </div>
            <ProgressBar value={analysis.population / next.minPopulation} className="mt-1 h-1.5" color="bg-gradient-to-r from-sky-400 to-indigo-500" />
          </li>
        )}
        {project ? (
          <li className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700">
              {BUILDINGS[project].emoji[1]} {BUILDINGS[project].name}を建てて街を大きく変えよう
            </span>
            <button type="button" onClick={() => pickTool(project)} className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-black text-white hover:bg-indigo-700">
              選ぶ
            </button>
          </li>
        ) : (
          lockedProject && (
            <li className="text-[11px] font-bold text-slate-500">
              🔒 {BUILDINGS[lockedProject].emoji[1]} {BUILDINGS[lockedProject].name}などの大型プロジェクトは「{getRank(BUILDINGS[lockedProject].unlockRank).name}」で解禁
            </li>
          )
        )}
        <li className="text-[11px] font-bold text-slate-500">🏆 「目標」タブの街のスタイルにも挑戦しよう</li>
      </ul>
    </section>
  );
}

/** メガシティのあと：街の評価と、残りの目標 */
function BeyondCard() {
  const { state, analysis } = useCity();
  const { openPanel } = useGame();
  const score = cityScore(state, analysis);
  const weak = weakestPart(score);
  const left = GOALS.filter((g) => !state.achievements.includes(g.id)).slice(0, 3);
  return (
    <section className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-3.5 shadow-sm ring-1 ring-violet-100">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-violet-700">🌃 メガシティのその先へ</span>
        <button type="button" onClick={() => openPanel("goals")} className="-my-1 rounded-full bg-white/80 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-white">
          目標タブ →
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={cx("flex h-10 w-10 items-center justify-center rounded-xl text-xl font-black text-white", GRADE_COLOR[score.grade])}>{score.grade}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-slate-800">街の評価 {score.total} / 1000点</div>
          <div className="text-[10px] font-bold text-slate-500">
            伸ばしどころ：{weak.emoji} {weak.label} — {weak.hint}
          </div>
        </div>
      </div>
      {left.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] font-bold text-slate-600">
          {left.map((g) => (
            <li key={g.id}>
              {g.emoji} {g.title}（{g.description}）
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 text-[10px] font-bold text-slate-400">🎯 タイトル画面の「チャレンジ」にも挑戦できます</div>
    </section>
  );
}

const GRADE_COLOR: Record<string, string> = {
  S: "bg-gradient-to-br from-amber-400 to-orange-500",
  A: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
  B: "bg-gradient-to-br from-sky-500 to-blue-600",
  C: "bg-gradient-to-br from-emerald-500 to-teal-600",
  D: "bg-slate-400",
};

// ---------------- 今月のおすすめ ----------------
function AdviceCard() {
  const { state, analysis } = useCity();
  const { pickTool, openPanel, focusTile } = useGame();
  const advice = nextAdvice(state, analysis);
  // ミッション中はミッションのカードが案内するので出さない
  if (!advice || advice.id === "mission") return null;
  return (
    <section className={cx("rounded-2xl p-3 shadow-sm ring-1", advice.urgent ? "bg-rose-50 ring-rose-200" : "bg-white/95 ring-slate-900/5")}>
      <div className={cx("text-[11px] font-black", advice.urgent ? "text-rose-700" : "text-emerald-700")}>{advice.urgent ? "🚨 いますぐ" : "🧭 今月のおすすめ"}</div>
      <div className="mt-0.5 flex items-start gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {advice.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-800">{advice.title}</div>
          <div className="text-[11px] font-bold leading-snug text-slate-500">{advice.detail}</div>
        </div>
      </div>
      {(advice.tool || advice.openTab || advice.tile !== undefined) && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
          {advice.tile !== undefined && (
            <button type="button" onClick={() => focusTile(advice.tile!)} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
              📍 場所を見る
            </button>
          )}
          {advice.tool && (
            <button type="button" onClick={() => pickTool(advice.tool!)} className="rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-black text-white hover:bg-orange-600">
              {BUILDINGS[advice.tool].emoji[1]} {BUILDINGS[advice.tool].name}を選ぶ
            </button>
          )}
          {advice.openTab === "finance" && (
            <button type="button" onClick={() => openPanel("finance")} className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-black text-white hover:bg-violet-700">
              💴 財政を開く
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** スマホ：地図の上に出す1行のおすすめ（タップで対応する建物・画面へ） */
export function AdviceStrip() {
  const { state, analysis } = useCity();
  const { pickTool, openPanel, focusTile } = useGame();
  const advice = nextAdvice(state, analysis);
  if (!advice || advice.id === "steady") return null;
  const act = () => {
    if (advice.tool) pickTool(advice.tool);
    else if (advice.openTab === "finance") {
      openPanel("finance");
    } else if (advice.tile !== undefined) focusTile(advice.tile);
  };
  return (
    <button
      type="button"
      onClick={act}
      className={cx("flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left shadow-sm ring-1 lg:hidden", advice.urgent ? "bg-rose-50 ring-rose-200" : "bg-white/90 ring-slate-900/5")}
    >
      <span className="text-xl leading-none" aria-hidden>
        {advice.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-[10px] font-black", advice.urgent ? "text-rose-700" : "text-emerald-700")}>{advice.urgent ? "🚨 いますぐ" : advice.id === "mission" ? "🎯 ミッション" : "🧭 今月のおすすめ"}</span>
        <span className="block truncate text-xs font-black text-slate-800">{advice.title}</span>
      </span>
      {(advice.tool || advice.openTab) && (
        <span className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-black text-white">{advice.tool ? `${BUILDINGS[advice.tool].emoji[1]} 選ぶ` : "💴 開く"}</span>
      )}
    </button>
  );
}

// ---------------- チャレンジ ----------------
function ScenarioCard() {
  const { state, analysis } = useCity();
  const sc = state.scenario;
  const def = sc ? getScenario(sc.id) : undefined;
  if (!sc || !def) return null;
  const p = def.progress(state, analysis);
  const left = Math.max(0, sc.deadline - state.turn + 1);
  const result = sc.result;
  return (
    <section className={cx("rounded-2xl p-3.5 shadow-sm ring-1", result === "failed" ? "bg-slate-50 ring-slate-200" : result ? "bg-amber-50 ring-amber-200" : "bg-gradient-to-br from-rose-50 to-orange-50 ring-rose-200")}>
      <div className="flex items-center justify-between text-[11px] font-black">
        <span className="text-rose-700">
          {def.emoji} チャレンジ：{def.title}
        </span>
        {!result && (
          <span className={cx("tabular rounded-full px-2 py-0.5", left <= 12 ? "bg-rose-600 text-white" : "bg-white/80 text-rose-700")}>
            残り {Math.floor(left / 12)}年{left % 12}か月
          </span>
        )}
      </div>
      <div className="mt-1 text-xs font-black text-slate-800">🎯 {def.goal}</div>
      {result ? (
        <div className="mt-1.5 text-sm font-black">{result === "failed" ? <span className="text-slate-500">⌛ 時間切れ（そのまま自由に遊べます）</span> : <span className="text-amber-600">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)} 達成！</span>}</div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={p} className="h-2 flex-1" color="bg-gradient-to-r from-rose-400 to-orange-500" />
          <span className="tabular text-[11px] font-black text-rose-700">{Math.floor(p * 100)}%</span>
        </div>
      )}
    </section>
  );
}

// ---------------- 陳情・依頼 ----------------
function RequestsCard() {
  const { state, analysis } = useCity();
  const { pickTool, openPanel } = useGame();
  const views = state.requests.map((r) => describeRequest(r, state, analysis)).filter((v) => v !== null);
  if (views.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white/95 p-3.5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-slate-700">📋 届いている依頼</span>
        <span className="text-[10px] font-bold text-slate-400">期限内にかなえると報酬</span>
      </div>
      <ul className="mt-2 space-y-2.5">
        {views.map((v) => (
          <li key={v.request.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-black text-slate-800">
                  {v.kind.emoji} {v.title}
                </div>
                <div className="text-[10px] font-bold text-slate-400">
                  {v.kind.from}より ・ 報酬 {formatYen(v.request.reward, { compact: true })}
                </div>
              </div>
              <span className={cx("tabular shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", v.monthsLeft <= 2 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
                あと{v.monthsLeft}か月
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ProgressBar value={v.progress} className="h-1.5 flex-1" color={v.done ? "bg-emerald-500" : "bg-gradient-to-r from-sky-400 to-blue-500"} />
              <span className="tabular text-[10px] font-bold text-slate-500">
                いま {v.kind.unit === "円" ? formatYen(v.current, { sign: true, compact: true }) : `${v.current.toLocaleString("ja-JP")}${v.kind.unit}`}
              </span>
              {v.kind.tool && isBuildingUnlocked(v.kind.tool, state.rank) ? (
                <button type="button" onClick={() => pickTool(v.kind.tool!)} className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 hover:bg-orange-100">
                  {BUILDINGS[v.kind.tool].emoji[1]} {BUILDINGS[v.kind.tool].name}
                </button>
              ) : v.kind.id === "surplus" ? (
                <button type="button" onClick={() => openPanel("finance")} className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                  💴 財政
                </button>
              ) : null}
            </div>
            {v.done && <div className="mt-0.5 text-[10px] font-bold text-emerald-600">✅ 達成！月末に報酬を受け取ります</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------- 住民の声 ----------------
function VoicesPanel() {
  const { state, analysis } = useCity();
  const { focusTile, pickTool, openPanel } = useGame();
  return (
    <>
      <Card title="住民の声" icon="💬" action={<span className="text-[11px] font-bold text-slate-400">{formatDate(state.turn)}</span>}>
        <ul className="space-y-2.5">
          {state.voices.map((v) => (
            <li key={v.id} className="flex gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl" aria-hidden>
                {v.face}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-slate-400">{v.persona}</div>
                <div
                  className={cx(
                    "relative mt-0.5 rounded-2xl rounded-tl-sm px-3 py-2 text-[13px] font-bold leading-snug",
                    v.tone === "bad" ? "bg-rose-50 text-rose-900" : v.tone === "good" ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-800",
                  )}
                >
                  「{v.text}」
                </div>
                {v.hint && <div className="mt-1 text-[11px] font-bold text-slate-500">💡 {v.hint}</div>}
                {(v.tile !== undefined || v.tool || v.openTab) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {v.tile !== undefined && (
                      <button type="button" onClick={() => focusTile(v.tile!)} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
                        📍 場所を見る
                      </button>
                    )}
                    {v.tool && isBuildingUnlocked(v.tool, state.rank) && (
                      <button type="button" onClick={() => pickTool(v.tool!)} className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-700 hover:bg-orange-100">
                        {BUILDINGS[v.tool].emoji[1]} {BUILDINGS[v.tool].name}を建てる
                      </button>
                    )}
                    {v.openTab === "finance" && (
                      <button type="button" onClick={() => openPanel("finance")} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100">
                        💴 財政を見る
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <LastReportCard />
      <NewsCard state={state} analysis={analysis} />
    </>
  );
}

function LastReportCard() {
  const { state } = useCity();
  const r = state.lastReport;
  if (!r) {
    return (
      <Card title="はじめの一歩" icon="🌱">
        <p className="text-xs font-bold leading-relaxed text-slate-600">
          建設メニューから建物を選んで地図に置き、<span className="text-orange-600">「翌月へ」</span>で時間を進めましょう。住民の声が街の困りごとを教えてくれます。
        </p>
      </Card>
    );
  }
  const pop = r.populationAfter - r.populationBefore;
  return (
    <Card title={`${formatDate(r.turn)}のまとめ`} icon="📅">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 py-1.5">
          <div className="text-[10px] font-bold text-emerald-700">転入</div>
          <div className="tabular text-base font-black text-emerald-700">+{r.inflow}</div>
        </div>
        <div className="rounded-xl bg-rose-50 py-1.5">
          <div className="text-[10px] font-bold text-rose-700">転出</div>
          <div className="tabular text-base font-black text-rose-700">{r.outflow > 0 ? `-${r.outflow}` : 0}</div>
        </div>
        <div className="rounded-xl bg-slate-50 py-1.5">
          <div className="text-[10px] font-bold text-slate-500">人口</div>
          <Signed value={pop} className="text-base font-black">
            {formatNumber(pop, { sign: true })}
          </Signed>
        </div>
      </div>
      {mainOutflowReason(r) && <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700">{mainOutflowReason(r)}</div>}
      <div className="mt-2 space-y-0.5 text-xs font-bold">
        <div className="flex justify-between">
          <span className="text-slate-500">税収</span>
          <span className="tabular text-emerald-600">+{formatYen(r.budget.income.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">維持費など</span>
          <span className="tabular text-rose-600">-{formatYen(r.budget.expense.total)}</span>
        </div>
        {r.construction > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">建設費</span>
            <span className="tabular text-slate-600">-{formatYen(r.construction)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-100 pt-0.5">
          <span className="text-slate-700">月の収支</span>
          <Signed value={r.budget.net}>{formatYen(r.budget.net, { sign: true })}</Signed>
        </div>
      </div>
    </Card>
  );
}

const NEWS_TONE = { good: "bg-emerald-400", bad: "bg-rose-400", neutral: "bg-sky-400" };

function NewsCard({ state }: { state: GameState; analysis: CityAnalysis }) {
  const { focusTile } = useGame();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const items = state.news.slice(0, showAll ? 12 : 4);
  return (
    <Card title="ニュース" icon="📰" action={<span className="text-[10px] font-bold text-slate-400">タップで詳しく</span>}>
      <ul className="divide-y divide-slate-100">
        {items.map((n, idx) => {
          const expanded = open === idx;
          return (
            <li key={`${n.turn}-${idx}`}>
              <button type="button" onClick={() => setOpen(expanded ? null : idx)} className="flex w-full items-center gap-2 py-1.5 text-left" aria-expanded={expanded}>
                <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", NEWS_TONE[n.tone])} aria-hidden />
                <span className="text-base leading-none" aria-hidden>
                  {n.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{n.title}</span>
                <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatDate(n.turn).replace("年目 ", "年目")}</span>
              </button>
              {expanded && (
                <div className="animate-sheet-in mb-1.5 ml-6 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold leading-snug text-slate-600">
                  {n.body}
                  {n.tile !== undefined && state.tiles[n.tile]?.building && (
                    <button type="button" onClick={() => focusTile(n.tile!)} className="ml-1 text-blue-600 hover:underline">
                      📍 場所を見る
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {state.news.length > 4 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 w-full text-center text-[11px] font-bold text-slate-400 hover:text-slate-600">
          {showAll ? "閉じる" : `過去のニュースも見る（${Math.min(12, state.news.length)}件）`}
        </button>
      )}
    </Card>
  );
}

// ---------------- 街の状況 ----------------
const DEMAND_TONE = { high: "text-emerald-600", some: "text-emerald-600", ok: "text-slate-500", spare: "text-slate-400" };

/** 需要メーター：真ん中の薄い帯が「足りている」。右に伸びるほど不足、左は空きあり */
function DemandBar({ label, value, color, note }: { label: string; value: number; color: string; note: string }) {
  const pct = Math.abs(value) / 2;
  const level = demandLevel(value);
  // -100〜100 を 0〜100% に。「足りている」帯は DEMAND.spare〜DEMAND.some
  const bandLeft = 50 + DEMAND.spare / 2;
  const bandWidth = (DEMAND.some - DEMAND.spare) / 2;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-bold">
        <span className="w-8 shrink-0 text-slate-600">{label}</span>
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="absolute top-0 h-full bg-emerald-100" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
          <div className="absolute left-1/2 top-0 h-full w-px bg-slate-300" />
          <div className={cx("absolute top-0 h-full rounded-full transition-all duration-500", value >= 0 ? color : "bg-slate-400")} style={value >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }} />
        </div>
        <span className={cx("w-16 shrink-0 text-right", DEMAND_TONE[level.tone])}>{level.tone === "ok" ? "✓ " : ""}{level.label}</span>
      </div>
      <div className="ml-10 mt-0.5 text-[10px] font-bold text-slate-400">{note}</div>
    </div>
  );
}

/** 需要メーターの下に出す、ひとこと理由 */
function demandNotes(a: CityAnalysis): Record<ZoneType, string> {
  const emp = a.employment;
  const vacant = Math.max(0, Math.round(emp.housingCapacity - a.population));
  const lots = (v: number, support: number, per: number) => Math.max(1, Math.round(((v / 120) * Math.max(support, 30)) / per));
  return {
    residential: a.demand.residential > DEMAND.some ? `空き部屋が少ない（あと${formatNumber(vacant)}人分）。住宅を建てると人が来る` : `空き部屋 ${formatNumber(vacant)}人分`,
    commercial: a.demand.commercial > DEMAND.some ? `お店があと約${lots(a.demand.commercial, emp.comSupport, 8)}区画分成り立つ` : `お店の数はちょうどいい（お客さん ${Math.round(emp.comEfficiency * 100)}%）`,
    industrial: a.demand.industrial > DEMAND.some ? `工場があと約${lots(a.demand.industrial, emp.indSupport, 14)}区画分成り立つ` : `工場の数はちょうどいい（注文 ${Math.round(emp.indEfficiency * 100)}%）`,
  };
}

function coverageShare(state: GameState, a: CityAnalysis, kind: "park" | "education" | "health" | "fire"): number {
  let covered = 0;
  state.tiles.forEach((t, i) => {
    if (t.building?.type === "residential" && a.coverage[kind][i] > 0) covered += t.building.occupants;
  });
  return a.population > 0 ? covered / a.population : 0;
}

function CityPanel() {
  const { state, analysis: a } = useCity();
  const emp = a.employment;
  const trait = TRAITS[state.profile.trait];
  const pops = state.history.map((h) => h.population);
  const notes = demandNotes(a);
  return (
    <>
      <Card title={townStyle(state, a)} icon="">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <span className="rounded-full bg-sky-100 px-2 py-0.5">
            {trait.emoji} {trait.name}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5">
            {TENDENCIES[state.profile.tendency].emoji} {TENDENCIES[state.profile.tendency].name}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] font-bold text-emerald-800">「{townStory(state.profile.trait, state.profile.tendency)}」</p>
        {pops.length > 1 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500">
              <span>人口の推移</span>
              <span className="tabular">{formatNumber(a.population)}人</span>
            </div>
            <Sparkline values={pops} />
          </div>
        )}
      </Card>

      <EraCard />

      <Card title="足りないもの（建設の需要）" icon="📐">
        <div className="space-y-2">
          <DemandBar label="🏠住宅" value={a.demand.residential} color="bg-emerald-500" note={notes.residential} />
          <DemandBar label="🏪商業" value={a.demand.commercial} color="bg-blue-500" note={notes.commercial} />
          <DemandBar label="🏭工業" value={a.demand.industrial} color="bg-amber-500" note={notes.industrial} />
        </div>
        <p className="mt-2 text-[11px] font-bold text-slate-500">右に伸びるほど足りない（建てるとすぐ埋まる）。真ん中の緑の帯に入れば「足りている」。造成中の区画も数に入ります。</p>
      </Card>

      <Card title="雇用と暮らし" icon="💼">
        <div className="space-y-1 text-xs font-bold">
          <StatRow label="働き手 / 仕事の数" value={`${formatNumber(emp.workers)} / ${formatNumber(emp.jobs)}`} tone={emp.unemployment > 0.08 ? "bad" : emp.jobFillRate < 0.88 ? "warn" : "good"} />
          <StatRow label="失業率" value={`${Math.round(emp.unemployment * 100)}%`} tone={emp.unemployment > 0.08 ? "bad" : "good"} />
          <StatRow label="人手の充足" value={`${Math.round(emp.jobFillRate * 100)}%`} tone={emp.jobFillRate < 0.88 ? "warn" : "good"} />
          <StatRow label="商店のお客さん" value={`${Math.round(emp.comEfficiency * 100)}%`} tone={emp.comEfficiency < 0.85 ? "warn" : "good"} />
          <StatRow label="工場の注文" value={`${Math.round(emp.indEfficiency * 100)}%`} tone={emp.indEfficiency < 0.85 ? "warn" : "good"} />
          <StatRow label="住宅の定員 / 空室率" value={`${formatNumber(emp.housingCapacity)} / ${Math.round(emp.vacancyRate * 100)}%`} tone={emp.vacancyRate < 0.05 ? "warn" : "good"} />
        </div>
      </Card>

      <Card title="町の施設が届いている住民" icon="🏛️">
        <div className="space-y-2">
          {(
            [
              ["park", "🌳 公園"],
              ["education", "🏫 学校"],
              ["health", "🏥 病院"],
              ["fire", "🚒 消防"],
            ] as const
          ).map(([k, label]) => {
            const v = coverageShare(state, a, k);
            return (
              <div key={k}>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">{label}</span>
                  <span className="tabular text-slate-800">{Math.round(v * 100)}%</span>
                </div>
                <ProgressBar value={v} className="mt-0.5 h-1.5" color={v >= 0.8 ? "bg-emerald-500" : v >= 0.5 ? "bg-amber-400" : "bg-rose-400"} />
              </div>
            );
          })}
        </div>
      </Card>

      {state.modifiers.length > 0 && (
        <Card title="いま効いている効果" icon="⏳">
          <ul className="space-y-1">
            {state.modifiers.map((m) => (
              <li key={m.id} className="flex justify-between text-xs font-bold">
                <span className="text-slate-700">
                  {m.emoji} {m.label}
                </span>
                <span className="text-slate-400">あと{m.turnsLeft}か月</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="町の個性" icon="🎲">
        <p className="text-xs font-bold text-slate-600">{trait.description}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {profileSummary(state.profile).map((p) => (
            <div key={p.label} className="rounded-lg bg-slate-50 px-2 py-1">
              <div className="text-[10px] font-bold text-slate-400">{p.label}</div>
              <div className="text-xs font-bold text-slate-700">{p.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function EraCard() {
  const { state } = useCity();
  const era = getEra(state.era.id);
  const left = monthsToNextEra(state);
  const next = state.era.next ? getEra(state.era.next.id) : null;
  return (
    <Card title={`${era.emoji} いまは「${era.name}の時代」`} icon="">
      <p className="text-xs font-bold leading-relaxed text-slate-600">{era.description}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {describeEffects(era.effects).map((e) => (
          <span key={e} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
            {e}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px] font-bold text-slate-500">💡 {era.tips.join("／")}</div>
      {left !== null && next ? (
        <div className="mt-2 rounded-xl bg-violet-600 p-2.5 text-white">
          <div className="text-xs font-black">
            📢 あと{left}か月で「{next.emoji} {next.name}の時代」
          </div>
          <div className="mt-0.5 text-[11px] font-bold text-violet-100">{next.description}</div>
          <div className="mt-0.5 text-[11px] font-bold text-violet-100">備え：{next.tips.join("／")}</div>
        </div>
      ) : (
        <div className="mt-2 text-[11px] font-bold text-slate-400">時代は5〜7年ごとに移り変わります（1年前に予告）</div>
      )}
    </Card>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={cx("tabular", tone === "good" ? "text-slate-800" : tone === "warn" ? "text-amber-600" : "text-rose-600")}>{value}</span>
    </div>
  );
}

// ---------------- 財政 ----------------
const TAX_LABELS: Record<ZoneType, { label: string; icon: string; effect: string }> = {
  residential: { label: "住宅税", icon: "🏠", effect: "上げると満足度が下がり、転出が増える" },
  commercial: { label: "商業税", icon: "🏪", effect: "上げると商業の需要が下がる" },
  industrial: { label: "工業税", icon: "🏭", effect: "上げると工業の需要が下がる" },
};

function FinancePanel() {
  const { state, analysis: a } = useCity();
  const { changeTax, takeLoan, repayLoan } = useGame();
  const b = a.budget;
  const limit = loanLimit(state);
  return (
    <>
      {state.money < 0 && (
        <div className="rounded-2xl bg-rose-600 p-3 text-white shadow">
          <div className="text-sm font-black">⚠️ 資金がマイナスです（{state.debtMonths}/{ECONOMY.bankruptcyMonths}か月）</div>
          <p className="mt-1 text-xs font-bold text-rose-100">このまま{ECONOMY.bankruptcyMonths}か月続くと財政破綻です。お金を借りる・税を上げる・町の施設を撤去する（建設費の40%が戻る）で立て直そう。</p>
        </div>
      )}
      <Card title="税率" icon="🧾">
        <div className="space-y-3">
          {(Object.keys(TAX_LABELS) as ZoneType[]).map((z) => (
            <div key={z}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {TAX_LABELS[z].icon} {TAX_LABELS[z].label}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" className="h-7 w-7 rounded-lg bg-slate-100 font-black text-slate-600 hover:bg-slate-200" onClick={() => changeTax(z, state.taxes[z] - 1)} aria-label={`${TAX_LABELS[z].label}を下げる`}>
                    −
                  </button>
                  <span className={cx("tabular w-10 text-center text-sm font-black", state.taxes[z] > 11 ? "text-rose-600" : state.taxes[z] < 7 ? "text-emerald-600" : "text-slate-800")}>{state.taxes[z]}%</span>
                  <button type="button" className="h-7 w-7 rounded-lg bg-slate-100 font-black text-slate-600 hover:bg-slate-200" onClick={() => changeTax(z, state.taxes[z] + 1)} aria-label={`${TAX_LABELS[z].label}を上げる`}>
                    ＋
                  </button>
                </div>
              </div>
              <input type="range" min={ECONOMY.taxMin} max={ECONOMY.taxMax} value={state.taxes[z]} onChange={(e) => changeTax(z, Number(e.target.value))} className="mt-1 w-full" aria-label={TAX_LABELS[z].label} />
              <p className="text-[10px] font-bold text-slate-400">{TAX_LABELS[z].effect}（標準 {ECONOMY.defaultTax}%）</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="毎月の収支（見込み）" icon="📒">
        <div className="space-y-1 text-xs font-bold">
          <div className="text-[11px] text-slate-400">収入</div>
          <MoneyRow label="🏠 住宅税" value={b.income.residential} />
          <MoneyRow label="🏪 商業税" value={b.income.commercial} />
          <MoneyRow label="🏭 工業税" value={b.income.industrial} />
          {b.income.facilities > 0 && <MoneyRow label="🏟️ 施設収入" value={b.income.facilities} />}
          <div className="pt-1 text-[11px] text-slate-400">支出</div>
          <MoneyRow label="🛣️ 道路の維持費" value={-b.expense.roads} />
          <MoneyRow label="🏛️ 町の施設の維持費" value={-b.expense.services} />
          <MoneyRow label="🗂️ 行政サービス費" value={-b.expense.admin} />
          {b.expense.interest > 0 && <MoneyRow label="💳 利息" value={-b.expense.interest} />}
          <div className="flex justify-between border-t border-slate-100 pt-1 text-sm">
            <span className="text-slate-800">月の収支</span>
            <Signed value={b.net}>{formatYen(b.net, { sign: true })}</Signed>
          </div>
        </div>
        <p className="mt-2 text-[10px] font-bold text-slate-400">行政サービス費は人口が増えるほど1人あたりも高くなります。</p>
      </Card>

      <Card title="借入" icon="💳">
        <div className="flex justify-between text-xs font-bold">
          <span className="text-slate-500">借入残高 / 上限</span>
          <span className="tabular text-slate-800">
            {formatYen(state.loan)} / {formatYen(limit)}
          </span>
        </div>
        <ProgressBar value={state.loan / limit} className="mt-1 h-1.5" color="bg-violet-500" />
        <p className="mt-1 text-[10px] font-bold text-slate-400">月利 {ECONOMY.loanInterest * 100}%。ランクが上がると上限が増えます。</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={takeLoan} disabled={state.loan >= limit || !!state.gameOver}>
            ＋ {formatYen(ECONOMY.loanStep, { compact: true })} 借りる
          </Button>
          <Button size="sm" onClick={repayLoan} disabled={state.loan <= 0 || state.money < Math.min(ECONOMY.loanStep, state.loan)}>
            − {formatYen(Math.min(ECONOMY.loanStep, state.loan || ECONOMY.loanStep), { compact: true })} 返す
          </Button>
        </div>
      </Card>

      {state.history.length > 1 && (
        <Card title="資金の推移" icon="📈">
          <Sparkline values={state.history.map((h) => h.money)} color="#7c3aed" />
        </Card>
      )}
    </>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <Signed value={value}>{formatYen(value, { sign: true })}</Signed>
    </div>
  );
}

// ---------------- 目標 ----------------
function ScoreCard() {
  const { state, analysis } = useCity();
  const { recordToHall } = useGame();
  const score = cityScore(state, analysis);
  const weak = weakestPart(score);
  return (
    <Card title="街の評価" icon="🏅" action={<span className="tabular text-xs font-black text-slate-500">{score.total} / 1000</span>}>
      <div className="flex items-center gap-3">
        <span className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl font-black text-white shadow", GRADE_COLOR[score.grade])}>{score.grade}</span>
        <p className="text-[11px] font-bold leading-relaxed text-slate-500">
          人口だけでなく、住みやすさ・環境・財政・交通なども含めた総合評価です。S（850点）を目指そう。
          <br />
          <span className="text-slate-700">
            伸ばしどころ：{weak.emoji} {weak.label} — {weak.hint}
          </span>
        </p>
      </div>
      <div className="mt-2 space-y-1">
        {score.parts.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-[11px] font-bold">
            <span className="w-16 shrink-0 text-slate-600">
              {p.emoji} {p.label}
            </span>
            <ProgressBar value={p.value / p.max} className="h-1.5 flex-1" color={p.value / p.max >= 0.8 ? "bg-emerald-500" : p.value / p.max >= 0.5 ? "bg-amber-400" : "bg-rose-400"} />
            <span className="tabular w-14 shrink-0 text-right text-slate-500">
              {p.value}/{p.max}
            </span>
          </div>
        ))}
      </div>
      {rankIndex(state.rank) >= 3 && (
        <Button size="sm" className="mt-2 w-full" onClick={recordToHall}>
          🏛️ いまの街を殿堂に記録する
        </Button>
      )}
    </Card>
  );
}

function GoalsPanel() {
  const { state, analysis: a } = useCity();
  const cur = rankIndex(state.rank);
  return (
    <>
      <ScoreCard />
      <Card title="街のランク" icon="🏅">
        <ol className="space-y-2">
          {RANKS.map((r, idx) => (
            <li key={r.id} className={cx("rounded-xl p-2", idx === cur ? "bg-amber-50 ring-1 ring-amber-200" : idx < cur ? "bg-slate-50" : "bg-white")}>
              <div className="flex items-center justify-between">
                <span className={cx("text-sm font-black", idx > cur ? "text-slate-400" : "text-slate-800")}>
                  {r.emoji} {r.name} <span className="text-[11px] font-bold text-slate-400">{r.en}</span>
                </span>
                <span className="tabular text-[11px] font-bold text-slate-500">{idx < cur ? "✅ 達成" : idx === cur ? "いまここ" : `人口 ${r.minPopulation.toLocaleString("ja-JP")}`}</span>
              </div>
              {idx > 0 && (
                <div className="mt-1 text-[11px] font-bold leading-relaxed text-slate-500">
                  {idx > cur ? "🔒 " : ""}
                  {unlocksForRank(r.id, state.profile.trait).join(" / ")}
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <Card title="街のスタイル（目標）" icon="🏆" action={<span className="text-[11px] font-bold text-slate-400">{goalsAchieved(state)}/{GOALS.length}</span>}>
        <p className="mb-2 text-[11px] font-bold text-slate-500">ゴールはひとつではありません。どんな街にするかはあなた次第！</p>
        <ul className="space-y-2">
          {GOALS.map((g) => {
            const done = state.achievements.includes(g.id);
            const p = done ? 1 : g.progress(state, a);
            return (
              <li key={g.id} className={cx("rounded-xl p-2", done ? "bg-emerald-50" : "bg-slate-50")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800">
                    {g.emoji} {g.title}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">{done ? "✅ 達成" : g.reward > 0 ? `報酬 ${formatYen(g.reward, { compact: true })}` : ""}</span>
                </div>
                <div className="text-[11px] font-bold text-slate-500">{g.description}</div>
                {!done && <ProgressBar value={p} className="mt-1 h-1.5" color="bg-gradient-to-r from-sky-400 to-blue-500" />}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
