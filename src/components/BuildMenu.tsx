"use client";

import { BUILD_ORDER, BUILDINGS, ECONOMY, PROJECTS, buildCost, formatYen, getRank, isBuildingUnlocked, rankIndex } from "@/game";
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
    ...BUILD_ORDER.map((type): ToolDef => {
      const def = BUILDINGS[type];
      const unlocked = isBuildingUnlocked(type, state.rank);
      return {
        id: type,
        emoji: type === "avenue" ? "🛤️" : def.emoji[1],
        name: def.name,
        cost: buildCost(state, type, Math.max(0, sample)),
        locked: unlocked ? undefined : `${getRank(def.unlockRank).name}で解禁`,
        hint:
          (def.size === 2 ? `【2×2・工事${def.buildMonths}か月・1つの街に1つ】` : "") +
          def.description +
          (def.coverage && def.coverage.kind !== "shopping" ? `（範囲 ${def.coverage.radius}マス）` : "") +
          (def.upkeep ? ` / 維持費 ${formatYen(def.upkeep)}/月` : "") +
          (type === "road" ? " / 水の上は橋になる" : ""),
      };
    }),
    { id: "bulldoze", emoji: "🚜", name: "撤去", hint: "建物を壊す。今月建てたものは全額返金、公共施設は40%で売却" },
    {
      id: "reclaim",
      emoji: "🌊",
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

/** スマホ：画面下の横スクロールのバー */
export function BuildMenu() {
  const { tool, setTool, advance } = useGame();
  const tools = useTools();
  const current = tools.find((t) => t.id === tool);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="truncate px-3 pt-1.5 text-[11px] font-bold text-slate-500">
        <span className="text-slate-800">
          {current?.emoji} {current?.name}
        </span>
        {current?.cost !== undefined && <span className="tabular ml-1 text-blue-600">{formatYen(current.cost)}</span>}
        <span className="ml-1.5">{current?.hint}</span>
      </div>
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto" role="toolbar" aria-label="建設メニュー">
          {tools.map((t, idx) => (
            <button
              key={t.id}
              type="button"
              onClick={() => (t.locked ? undefined : setTool(t.id))}
              aria-pressed={tool === t.id}
              aria-disabled={!!t.locked}
              title={toolTitle(t, idx)}
              className={cx(
                "relative flex h-16 w-[62px] shrink-0 flex-col items-center justify-center rounded-xl text-center transition",
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
          ))}
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
  { label: "住む・働く場所", note: "土地を用意すると、住民や会社が建物を建てて育てる", ids: ["residential", "commercial", "industrial"] },
  { label: "公共施設", note: "町が建てて維持費を払う。周りの住民が喜ぶ", ids: ["park", "bigPark", "school", "hospital", "fireStation", "busStop", "plaza", "station", "landmark"] },
  { label: "大型プロジェクト（2×2）", note: "数か月の工事で完成し、街全体が変わる", ids: PROJECTS },
];

export function BuildPalette() {
  const { tool, setTool } = useGame();
  const tools = useTools();
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
      {PALETTE_GROUPS.map((g) => (
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
