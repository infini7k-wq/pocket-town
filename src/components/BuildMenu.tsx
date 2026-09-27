"use client";

import { useState } from "react";
import { BUILD_ORDER, BUILDINGS, ECONOMY, TRAIT_PROJECTS, buildCost, formatYen, getRank, isBuildingUnlocked, projectsFor, rankIndex } from "@/game";
import { useCity, useGame, type Tool } from "./GameProvider";
import { NextMonthButton } from "./TopBar";
import { cx } from "./ui";

interface ToolDef {
  id: Tool;
  emoji: string;
  name: string;
  cost?: number;
  locked?: string;
  hint: string;
}

export function useTools(): ToolDef[] {
  const { state } = useCity();
  // 地価の影響を見せるため、森ではない代表的なマスの価格を出す
  const sample = state.tiles.findIndex((t) => t.terrain === "grass" && !t.building);
  return [
    { id: "inspect", emoji: "👆", name: "調べる", hint: "マスをタップして詳細を見る" },
    ...[...BUILD_ORDER, TRAIT_PROJECTS[state.profile.trait]].map((type): ToolDef => {
      const def = BUILDINGS[type];
      const unlocked = isBuildingUnlocked(type, state.rank);
      return {
        id: type,
        emoji: def.emoji[1],
        name: def.name,
        cost: buildCost(state, type, Math.max(0, sample)),
        locked: unlocked ? undefined : `${getRank(def.unlockRank).name}で解禁`,
        hint:
          def.description +
          (def.size === 2 ? `｜2×2・工事${def.buildMonths}か月` : "") +
          (def.coverage && def.coverage.kind !== "shopping" ? `｜範囲${def.coverage.radius}マス` : "") +
          (def.upkeep ? `｜維持${formatYen(def.upkeep, { compact: true })}/月` : "") +
          (type === "road" ? "｜水の上は橋になる" : ""),
      };
    }),
    { id: "bulldoze", emoji: "🚜", name: "撤去", hint: "壊す。今月建てた物は全額、町の施設・大型は建設費の40%が戻る（住宅・お店・工場は0）" },
    {
      id: "reclaim",
      emoji: "🏝️",
      name: "埋め立て",
      cost: ECONOMY.reclaimCost,
      locked: rankIndex(state.rank) >= rankIndex("metropolis") ? undefined : "大都市で解禁",
      hint: "海や川のマスを陸地に変えて、建設できる土地を増やす（なぞって連続でできる）",
    },
  ];
}

/** ツールボタンの title（ショートカットキーの案内つき） */
function toolTitle(t: ToolDef, idx: number): string {
  const key = t.id === "inspect" ? "（Escキー）" : t.id === "bulldoze" ? "（Bキー）" : idx <= 10 ? `（${idx % 10}キー）` : "";
  return `${t.name}${key}${t.locked ? ` — ${t.locked}` : ""}\n${t.hint}`;
}

function costLabel(t: ToolDef): string {
  if (t.locked) return `🔒${t.locked}`;
  return t.cost !== undefined ? formatYen(t.cost, { compact: true }) : "";
}

/** スマホのメニューの分類 */
const MOBILE_GROUPS: Array<{ id: string; label: string; ids: Tool[] }> = [
  { id: "basic", label: "道路・土地", ids: ["road", "avenue", "residential", "commercial", "industrial"] },
  { id: "service", label: "町の施設", ids: ["park", "bigPark", "school", "hospital", "fireStation", "busStop", "plaza", "station", "landmark"] },
  { id: "project", label: "大型", ids: ["reclaim"] },
];

/** 分類ごとの建物（大型プロジェクトは町の個性の専用施設を含める） */
function withProjects<T extends { ids: Tool[] }>(groups: T[], isProjectGroup: (g: T) => boolean, projects: Tool[]): T[] {
  return groups.map((g) => (isProjectGroup(g) ? { ...g, ids: [...projects, ...g.ids] } : g));
}
const PINNED: Tool[] = ["inspect", "bulldoze"];

/** スマホ：画面下のバー（調べる・撤去は常に左に固定、ほかは分類タブで切り替え） */
export function BuildMenu() {
  const { tool, setTool, advance, advanceMany, undo, canUndo } = useGame();
  const { state } = useCity();
  const tools = useTools();
  const groups = withProjects(MOBILE_GROUPS, (g) => g.id === "project", projectsFor(state.profile.trait));
  const current = tools.find((t) => t.id === tool);
  const [group, setGroup] = useState(() => groups.find((g) => g.ids.includes(tool))?.id ?? "basic");
  // 住民の声などから別の分類の建物が選ばれたら、その分類のタブに切り替える
  const [prevTool, setPrevTool] = useState(tool);
  if (prevTool !== tool) {
    setPrevTool(tool);
    const g = groups.find((x) => x.ids.includes(tool));
    if (g && g.id !== group) setGroup(g.id);
  }
  const shown = groups.find((g) => g.id === group) ?? groups[0];
  const pinned = tools.filter((t) => PINNED.includes(t.id));
  const list = shown.ids.map((id) => tools.find((t) => t.id === id)).filter((t): t is ToolDef => !!t);

  const toolButton = (t: ToolDef, compact = false) => {
    const idx = tools.indexOf(t);
    return (
            <button
              key={t.id}
              type="button"
              onClick={() => (t.locked ? undefined : setTool(t.id))}
              aria-pressed={tool === t.id}
              aria-disabled={!!t.locked}
              title={toolTitle(t, idx)}
              className={cx(
                "relative flex h-16 shrink-0 flex-col items-center justify-center rounded-xl text-center transition",
                compact ? "w-[48px]" : "w-[58px]",
                tool === t.id ? "-translate-y-0.5 bg-blue-600 text-white shadow-md shadow-blue-600/30" : "bg-slate-50 text-slate-700 ring-1 ring-slate-900/5 hover:bg-white",
                t.locked && "cursor-not-allowed opacity-50 grayscale",
              )}
            >
              <span className="text-2xl leading-none" aria-hidden>
                {t.emoji}
              </span>
              <span className="mt-0.5 text-[10px] font-bold leading-tight">{t.name}</span>
              <span className={cx("tabular text-[9px] font-bold leading-tight", tool === t.id ? "text-blue-100" : "text-slate-400")}>{costLabel(t)}</span>
            </button>
    );
  };

  return (
    <div id="mobile-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="flex items-start gap-2 px-3 pt-1.5">
        <p className="line-clamp-2 min-w-0 flex-1 text-[11px] font-bold leading-snug text-slate-500">
          <span className="text-slate-800">
            {current?.emoji} {current?.name}
          </span>
          {current?.cost !== undefined && <span className="tabular ml-1 text-blue-600">{formatYen(current.cost)}</span>}
          <span className="ml-1.5">{current?.hint}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={undo} disabled={!canUndo} className="h-7 rounded-full bg-slate-100 px-2.5 text-[11px] font-black text-slate-600 disabled:opacity-35" aria-label="ひとつ戻す">
            ↩️ 戻す
          </button>
          <button type="button" onClick={() => advanceMany(3)} className="h-7 rounded-full bg-orange-100 px-2.5 text-[11px] font-black text-orange-700" aria-label="3か月進める">
            ⏩ 3か月
          </button>
        </div>
      </div>
      <div className="mt-1 flex gap-1 px-2" role="tablist" aria-label="建物の種類">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={cx("rounded-full px-3 py-1 text-[11px] font-black transition", group === g.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500")}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <div className="flex shrink-0 gap-1 border-r border-slate-200 pr-1.5">{pinned.map((t) => toolButton(t, true))}</div>
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto" role="toolbar" aria-label="建設メニュー">
          {list.map((t) => toolButton(t))}
        </div>
        <NextMonthButton onClick={advance} compact />
      </div>
    </div>
  );
}

/** PC：地図の左に縦に並べるパレット（種類ごとにまとめて2列） */
const PALETTE_GROUPS: Array<{ label: string; note?: string; ids: Tool[] }> = [
  { label: "操作", ids: ["inspect", "bulldoze", "reclaim"] },
  { label: "道路", note: "建物は道路に面していないと使えない", ids: ["road", "avenue"] },
  { label: "住む・働く場所（民間）", note: "土地を用意すると住民や会社が建てて育てる。維持費なし", ids: ["residential", "commercial", "industrial"] },
  { label: "町の施設", note: "町のお金で建て、毎月維持費を払う。範囲内の住民が喜ぶ", ids: ["park", "bigPark", "school", "hospital", "fireStation", "busStop", "plaza", "station", "landmark"] },
  { label: "大型プロジェクト（2×2）", note: "数か月の工事で完成し、街全体が変わる。1つの街に1つずつ", ids: [] },
];

export function BuildPalette() {
  const { tool, setTool } = useGame();
  const { state } = useCity();
  const tools = useTools();
  const groups = withProjects(PALETTE_GROUPS, (g) => g.label.startsWith("大型"), projectsFor(state.profile.trait));
  const current = tools.find((t) => t.id === tool);

  return (
    <nav
      className="no-scrollbar sticky flex w-[188px] flex-col gap-1.5 overflow-y-auto rounded-2xl bg-white/85 p-2 shadow-sm ring-1 ring-slate-900/5"
      style={{ top: "calc(var(--header-h, 80px) + 12px)", maxHeight: "calc(100dvh - var(--header-h, 80px) - 24px)" }}
      aria-label="建設メニュー"
    >
      {current && (
        <div className="rounded-xl bg-blue-50 p-2">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-xs font-black text-slate-800">
              {current.emoji} {current.name}
            </span>
            {current.cost !== undefined && <span className="tabular shrink-0 text-[10px] font-black text-blue-600">{formatYen(current.cost, { compact: true })}</span>}
          </div>
          <p className="mt-0.5 text-[10px] font-bold leading-snug text-slate-500">{current.hint}</p>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.label}>
          <div className="mb-0.5 px-0.5">
            <div className="text-[10px] font-black text-slate-500">{g.label}</div>
            {g.note && <div className="text-[9px] font-bold leading-tight text-slate-400">{g.note}</div>}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {g.ids.map((id) => {
              const idx = tools.findIndex((t) => t.id === id);
              const t = tools[idx];
              if (!t) return null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => (t.locked ? undefined : setTool(t.id))}
                  aria-pressed={tool === t.id}
                  aria-disabled={!!t.locked}
                  title={toolTitle(t, idx)}
                  className={cx(
                    "flex min-h-[54px] flex-col items-center justify-center rounded-xl px-0.5 py-1 text-center transition",
                    tool === t.id ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : "bg-slate-50 text-slate-700 ring-1 ring-slate-900/5 hover:bg-white hover:ring-blue-300",
                    t.locked && "cursor-not-allowed opacity-45 grayscale",
                  )}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {t.emoji}
                  </span>
                  <span className="mt-0.5 text-[10px] font-bold leading-[1.15]">{t.name}</span>
                  <span className={cx("tabular text-[9px] font-bold leading-tight", tool === t.id ? "text-blue-100" : "text-slate-400")}>{costLabel(t)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
