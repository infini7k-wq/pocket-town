"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BuildMenu, BuildPalette, useTools } from "./BuildMenu";
import { GameProvider, useGame } from "./GameProvider";
import { CityMap } from "./map/CityMap";
import { EraModal, EventModal, GameOverModal, HelpModal, RankUpModal, ScenarioResultModal, Toasts } from "./Modals";
import { ElectionResultModal, PromiseModal } from "./ElectionModals";
import { AdviceStrip, SidePanel } from "./SidePanel";
import { StartScreen } from "./StartScreen";
import { TileInfo } from "./TileInfo";
import { TopBar } from "./TopBar";
import { Card } from "./ui";

const noopSubscribe = () => () => {};

export default function GameApp() {
  // localStorage と乱数を使うため、描画はクライアントでのみ行う
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return <GameProvider>{mounted ? <Screens /> : <Splash />}</GameProvider>;
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-5xl" aria-label="読み込み中">
      <span className="animate-bounce-soft">🏘️</span>
    </div>
  );
}

function Screens() {
  const { state } = useGame();
  return state ? <GameScreen /> : <StartScreen />;
}

function useShortcuts() {
  const { setTool, advance, undo, helpOpen, setHelpOpen, closeRankUp, closeEraShift, closeScenarioResult, closeElection, dialog } = useGame();
  const tools = useTools();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 閉じられるダイアログ（お知らせ）は Esc で閉じる。選択が必要なダイアログ（イベント・公約）は閉じない
      if (e.key === "Escape" && (helpOpen || dialog === "rankUp" || dialog === "era" || dialog === "scenario" || dialog === "election")) {
        setHelpOpen(false);
        if (dialog === "rankUp") closeRankUp();
        if (dialog === "era") closeEraShift();
        if (dialog === "scenario") closeScenarioResult();
        if (dialog === "election") closeElection();
        return;
      }
      if (helpOpen || dialog) return;
      if (e.key === "Escape") setTool("inspect");
      else if (e.key === "b" || e.key === "B") setTool("bulldoze");
      else if (e.key === "r" || e.key === "R") {
        const t = tools.find((x) => x.id === "reclaim");
        if (t && !t.locked) setTool("reclaim");
      }
      else if (e.key === "n" || e.key === "N" || (e.key === "Enter" && target === document.body)) {
        e.preventDefault();
        advance();
      } else if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === "0" ? 10 : Number(e.key);
        const t = tools[idx];
        if (t && !t.locked) setTool(t.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool, advance, undo, tools, helpOpen, setHelpOpen, closeRankUp, closeEraShift, closeScenarioResult, closeElection, dialog]);
}

function GameScreen() {
  const { selected, select, quitToTitle, setHelpOpen, slot } = useGame();
  useShortcuts();
  return (
    <div className="min-h-dvh pb-44 lg:pb-8">
      <TopBar />
      <main className="mx-auto max-w-[1680px] px-3 pt-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_300px] xl:grid-cols-[auto_minmax(0,1fr)_340px] lg:gap-4 lg:px-4">
        <div className="hidden lg:block">
          <BuildPalette />
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:self-start" style={{ top: "calc(var(--header-h, 80px) + 12px)" }}>
          <AdviceStrip />
          <CityMap />
          <BuildMenu />
        </div>
        <aside className="mt-4 flex flex-col gap-3 lg:mt-0">
          {selected !== null && (
            <Card className="hidden lg:block">
              <TileInfo onClose={() => select(null)} />
            </Card>
          )}
          <SidePanel />
          <div className="flex justify-center gap-4 py-2 text-xs font-bold text-slate-400">
            <button type="button" onClick={() => setHelpOpen(true)} className="hover:text-slate-600">
              ？ 遊び方
            </button>
            <button type="button" onClick={() => quitToTitle(false)} className="hover:text-slate-600">
              🏠 タイトルへ（枠{slot}に自動保存済み）
            </button>
          </div>
        </aside>
      </main>

      {/* スマホ：選択したマスの詳細はボトムシートで */}
      {selected !== null && (
        <div id="tile-sheet" className="animate-sheet-in fixed inset-x-2 bottom-[calc(150px+env(safe-area-inset-bottom))] z-40 max-h-[36dvh] overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-slate-900/10 lg:hidden">
          <TileInfo onClose={() => select(null)} />
        </div>
      )}

      <Toasts />
      <EventModal />
      <RankUpModal />
      <EraModal />
      <ScenarioResultModal />
      <GameOverModal />
      <PromiseModal />
      <ElectionResultModal />
      <HelpModal />
    </div>
  );
}
