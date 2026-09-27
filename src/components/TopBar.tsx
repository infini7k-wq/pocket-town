"use client";

import { useEffect, useRef } from "react";
import { formatDate, formatNumber, formatYen, getEra, getRank, monthsToNextEra, nextRank, rankProgress, seasonEmoji } from "@/game";
import { useCity, useGame } from "./GameProvider";
import { ProgressBar, cx } from "./ui";

type Status = "good" | "warn" | "bad" | "neutral";

const STATUS_STYLE: Record<Status, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  neutral: "text-slate-800",
};

function Kpi({ icon, label, value, sub, status = "neutral", onClick }: { icon: string; label: string; value: string; sub?: React.ReactNode; status?: Status; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-1.5 rounded-xl bg-white/90 px-2 py-1.5 text-left ring-1 ring-slate-900/5 transition hover:bg-white sm:px-2.5"
    >
      <span className="hidden text-lg leading-none xl:inline" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold leading-tight text-slate-500"><span className="xl:hidden">{icon}</span>{label}</span>
        <span className={cx("tabular block truncate text-[13px] font-black leading-tight sm:text-sm", STATUS_STYLE[status])}>{value}</span>
        {sub && <span className="tabular block truncate text-[10px] font-bold leading-tight">{sub}</span>}
      </span>
    </button>
  );
}

const level = (v: number, good: number, warn: number): Status => (v >= good ? "good" : v >= warn ? "warn" : "bad");

export function TopBar() {
  const { state, analysis: a } = useCity();
  const { advance, advanceMany, undo, canUndo, openPanel, showOverlay, setHelpOpen } = useGame();
  const rank = getRank(state.rank);
  const next = nextRank(state.rank);
  const progress = rankProgress(state);
  const report = state.lastReport;
  const popDelta = report ? report.populationAfter - report.populationBefore : 0;
  const net = a.budget.net;
  const emp = a.employment;
  const headerRef = useRef<HTMLElement>(null);

  // ヘッダーの高さを CSS 変数 --header-h に入れる（地図を画面に収める計算で使う）
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => {
      document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
      window.dispatchEvent(new Event("header-resize"));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-white/60 bg-sky-100/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-2 lg:px-5 xl:flex-row xl:items-center xl:gap-4">
        {/* 町名・ランク */}
        <div className="flex items-center gap-2 xl:w-60 xl:shrink-0">
          <span className="text-3xl leading-none" aria-hidden>
            {rank.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <h1 className="truncate text-base font-black text-slate-800">{state.townName}</h1>
              <span className="shrink-0 rounded-full bg-slate-800 px-1.5 py-px text-[10px] font-bold text-white">
                {rank.name} {rank.en}
              </span>
            </div>
            {next ? (
              <div className="mt-0.5 flex items-center gap-1.5">
                <ProgressBar value={progress.ratio} className="h-1.5 flex-1" color="bg-gradient-to-r from-amber-400 to-orange-500" />
                <span className="tabular shrink-0 text-[10px] font-bold text-slate-500">
                  {next.name}まで {formatNumber(Math.max(0, next.minPopulation - progress.current))}人
                </span>
              </div>
            ) : (
              <div className="text-[10px] font-bold text-amber-600">最高ランク到達！</div>
            )}
            <EraLine />
          </div>
          {/* 狭い画面：日付とヘルプ（PC幅では右端に表示） */}
          <div className="flex items-center gap-1 lg:hidden">
            <span className="tabular rounded-lg bg-white/80 px-2 py-1 text-xs font-bold text-slate-600">
              {seasonEmoji(state.turn)} {formatDate(state.turn)}
            </span>
            <button type="button" onClick={() => setHelpOpen(true)} className="h-7 w-7 rounded-full bg-white/80 text-sm font-black text-slate-600" aria-label="遊び方">
              ?
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-3">
        {/* KPI */}
        <div className="grid flex-1 grid-cols-4 gap-1.5 md:grid-cols-7">
          <Kpi
            icon="👥"
            label="人口"
            value={formatNumber(a.population)}
            sub={report ? <span className={popDelta >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatNumber(popDelta, { sign: true })}</span> : undefined}
            onClick={() => openPanel("city")}
          />
          <Kpi icon="💴" label="資金" value={formatYen(state.money, { compact: true })} status={state.money < 0 ? "bad" : "neutral"} sub={state.loan > 0 ? <span className="text-slate-500">借入 {formatYen(state.loan, { compact: true })}</span> : undefined} onClick={() => openPanel("finance")} />
          <Kpi
            icon="📈"
            label="月の収支"
            value={formatYen(net, { sign: true, compact: true })}
            status={net >= 0 ? "good" : "bad"}
            sub={
              <span className="text-slate-500">
                <span className="text-emerald-600">+{formatYen(a.budget.income.total, { compact: true }).replace("¥", "")}</span> /{" "}
                <span className="text-rose-500">-{formatYen(a.budget.expense.total, { compact: true }).replace("¥", "")}</span>
              </span>
            }
            onClick={() => openPanel("finance")}
          />
          <Kpi icon="😊" label="満足度" value={`${a.cityHappiness}%`} status={level(a.cityHappiness, 70, 50)} onClick={() => showOverlay("happiness")} />
          <Kpi icon="💼" label="雇用率" value={`${Math.round(emp.employmentRate * 100)}%`} status={level(emp.employmentRate * 100, 93, 85)} sub={emp.jobFillRate < 0.9 ? <span className="text-amber-600">人手不足</span> : undefined} onClick={() => openPanel("city")} />
          <Kpi icon="🚗" label="交通混雑" value={`${a.congestion}%`} status={a.congestion < 15 ? "good" : a.congestion < 35 ? "warn" : "bad"} onClick={() => showOverlay("traffic")} />
          <Kpi icon="🌿" label="環境" value={`${a.cityEnvironment}`} status={level(a.cityEnvironment, 65, 45)} onClick={() => showOverlay("env")} />
        </div>

        {/* PC：日付と翌月ボタン */}
        <div className="hidden items-center gap-2 lg:flex">
          <div className="text-right">
            <div className="tabular text-sm font-black text-slate-700">
              {seasonEmoji(state.turn)} {formatDate(state.turn)}
            </div>
            <button type="button" onClick={() => setHelpOpen(true)} className="text-[11px] font-bold text-blue-600 hover:underline">
              ？ 遊び方
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={undo} disabled={!canUndo} title="今月の操作をひとつ取り消す（⌘Z / Ctrl+Z）" className="rounded-lg bg-white/80 px-2 py-0.5 text-[11px] font-black text-slate-600 hover:bg-white disabled:opacity-35">
              ↩️ 戻す
            </button>
            <button type="button" onClick={() => advanceMany(3)} title="3か月まとめて進める（大事なできごとがあれば止まる）" className="rounded-lg bg-orange-100 px-2 py-0.5 text-[11px] font-black text-orange-700 hover:bg-orange-200">
              ⏩ 3か月
            </button>
          </div>
          <NextMonthButton onClick={advance} />
        </div>
        </div>
      </div>
    </header>
  );
}

export function NextMonthButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const { state } = useCity();
  const blocked = !!state.pendingEvent || !!state.gameOver;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={blocked}
      title="翌月へ（Nキー / Enter）"
      className={cx(
        "flex shrink-0 items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-orange-400 to-orange-500 font-black text-white shadow-lg shadow-orange-500/30 transition hover:from-orange-500 hover:to-orange-600 active:scale-95 disabled:opacity-40",
        compact ? "h-14 w-16 flex-col text-[11px]" : "h-12 px-5 text-base",
      )}
    >
      <span className={compact ? "text-xl leading-none" : ""} aria-hidden>
        ▶
      </span>
      翌月へ
    </button>
  );
}

/** いまの時代と、予告された次の時代 */
function EraLine() {
  const { state } = useCity();
  const { openPanel } = useGame();
  const era = getEra(state.era.id);
  const left = monthsToNextEra(state);
  const next = state.era.next ? getEra(state.era.next.id) : null;
  return (
    <button type="button" onClick={() => openPanel("city")} className="mt-0.5 flex max-w-full items-center gap-1 truncate text-left text-[10px] font-bold text-violet-700">
      <span className="truncate">
        {era.emoji} {era.name}の時代
      </span>
      {left !== null && next && (
        <span className="animate-bounce-soft shrink-0 rounded-full bg-violet-600 px-1.5 text-white">
          あと{left}か月で {next.emoji}{next.name}
        </span>
      )}
    </button>
  );
}
