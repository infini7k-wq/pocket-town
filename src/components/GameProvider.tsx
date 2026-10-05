"use client";

// ゲーム状態・自動保存・プレイヤー操作・演出（フロート表示・トースト）を管理する。
// シミュレーションの計算はすべて @/game の純粋関数に任せ、ここでは結果を画面に反映するだけ。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BUILDINGS,
  advanceMonth,
  ECONOMY,
  analyzeCity,
  anchorOf,
  reclaim,
  isRoad,
  borrow,
  claimMissions,
  clearSave,
  createNewGame,
  createRng,
  demolish,
  formatNumber,
  formatYen,
  getEventDef,
  getGoal,
  getRank,
  levelName,
  loadGame,
  makeHallRecord,
  recordHall,
  monthOf,
  placeBuilding,
  repay,
  resolveEvent,
  saveGame,
  setActiveSlot,
  setTax,
  type ActionResult,
  type BuildingType,
  type CityAnalysis,
  type GameState,
  type MonthReport,
  type OutflowReason,
  type RankId,
  type ScenarioResult,
  type TendencyId,
  type TraitId,
  type ZoneType,
} from "@/game";

export type Tool = BuildingType | "inspect" | "bulldoze" | "reclaim";
export type Overlay = "none" | "traffic" | "env" | "happiness" | "park" | "education" | "health" | "fire" | "transit" | "shopping" | "plaza";
export type PanelTab = "voices" | "city" | "finance" | "goals";

/** 施設の効果範囲を表す表示モード */
export const RANGE_OVERLAYS: Overlay[] = ["park", "education", "health", "fire", "transit", "shopping", "plaza"];

export interface Floater {
  id: number;
  tile: number;
  text: string;
  tone: "good" | "bad" | "info" | "gold";
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad";
}

export interface Banner {
  id: number;
  title: string;
  lines: string[];
}

interface GameContextValue {
  state: GameState | null;
  analysis: CityAnalysis | null;
  tool: Tool;
  setTool: (t: Tool) => void;
  /** 住民の声やミッションから建設ツールを選ぶ（スマホでは地図までスクロール） */
  pickTool: (t: Tool) => void;
  selected: number | null;
  select: (i: number | null) => void;
  /** 地図上で一時的に光らせるマス（住民の声の「場所を見る」など） */
  flash: { tile: number; key: number } | null;
  focusTile: (i: number) => void;
  overlay: Overlay;
  setOverlay: (o: Overlay) => void;
  panelTab: PanelTab;
  setPanelTab: (t: PanelTab) => void;
  /** タブを開き、スマホでは画面をそのタブまでスクロールする */
  openPanel: (t: PanelTab) => void;
  /** 地図の表示モードを変え、スマホでは地図までスクロールする */
  showOverlay: (o: Overlay) => void;
  /** マスに対して現在のツールを使う（painting = ドラッグ中の連続設置） */
  applyToolAt: (i: number, painting?: boolean) => void;
  endStroke: () => void;
  /** 任意のアクションを実行する（失敗時はトーストでエラー表示） */
  runAction: (fn: (s: GameState) => ActionResult) => boolean;
  advance: () => void;
  /** 数か月まとめて進める（イベント・ランクアップ・時代の転換があればそこで止まる） */
  advanceMany: (months: number) => void;
  /** 今月の操作を1つ取り消す */
  undo: () => void;
  canUndo: boolean;
  changeTax: (zone: ZoneType, rate: number) => void;
  takeLoan: () => void;
  repayLoan: () => void;
  chooseEventOption: (choiceId: string) => void;
  /** 新しい町を始める（slot = 保存する枠 1〜3） */
  newGame: (name: string, seed: number, scenario: string | undefined, slot: number, choice?: { trait?: TraitId; tendency?: TendencyId }) => void;
  /** いま遊んでいるセーブの枠 */
  slot: number;
  /** いまの街を殿堂に記録する */
  recordToHall: () => void;
  /** チャレンジの結果（ダイアログ表示用） */
  scenarioResult: ScenarioResult | null;
  closeScenarioResult: () => void;
  continueGame: (slot: number) => boolean;
  /** タイトルへ戻る（clear = セーブデータも消す） */
  quitToTitle: (clear?: boolean) => void;
  floaters: Floater[];
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  banner: Banner | null;
  rankUp: RankId | null;
  closeRankUp: () => void;
  /** 時代が変わったときのお知らせ（時代の id） */
  eraShift: string | null;
  closeEraShift: () => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

/** ゲーム開始後のコンポーネント用 */
export function useCity(): { state: GameState; analysis: CityAnalysis } {
  const { state, analysis } = useGame();
  if (!state || !analysis) throw new Error("Game not started");
  return { state, analysis };
}

const MAX_TILE_FLOATERS = 8;

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [tool, setToolState] = useState<Tool>("inspect");
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ tile: number; key: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [panelTab, setPanelTab] = useState<PanelTab>("voices");
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [rankUp, setRankUp] = useState<RankId | null>(null);
  const [eraShift, setEraShift] = useState<string | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [slot, setSlot] = useState(1);
  // 取り消し用：今月の操作の前の状態（月を進めるとリセット）
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const strokeSnapshot = useRef(false);
  const saveWarned = useRef(false);
  // ドラッグで連続設置するとき、同じイベントループ内で最新の状態を使うための参照
  const stateRef = useRef<GameState | null>(null);
  const idRef = useRef(0);
  const strokeError = useRef(false);

  const analysis = useMemo(() => (state ? analyzeCity(state) : null), [state]);

  const nextId = () => ++idRef.current;

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 4500 : 3000);
  }, []);

  // 自動保存（失敗したら一度だけ知らせる。プライベートブラウズや容量不足など）
  useEffect(() => {
    if (!state) return;
    const ok = saveGame(state, slot);
    if (!ok && !saveWarned.current) {
      saveWarned.current = true;
      toast("⚠️ 自動保存できませんでした。プライベートブラウズでは保存されません", "bad");
    }
    if (ok) saveWarned.current = false;
  }, [state, slot, toast]);

  // ブラウザにデータを消さないよう頼む（iPhone の Safari などで長期間遊ぶため）
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  /** 状態を反映する。ミッションを達成していれば報酬もここで受け取る */
  const commit = useCallback(
    (next: GameState | null) => {
      let s = next;
      if (s && !s.gameOver) {
        const r = claimMissions(s, analyzeCity(s));
        s = r.state;
        for (const m of r.claimed) toast(`🎯 ミッション達成「${m.title}」${m.reward > 0 ? ` +${formatYen(m.reward)}` : ""}`, "good");
      }
      stateRef.current = s;
      setState(s);
    },
    [toast],
  );

  const addFloaters = useCallback((items: Array<Omit<Floater, "id">>) => {
    if (items.length === 0) return;
    const withIds = items.map((f) => ({ ...f, id: ++idRef.current }));
    setFloaters((cur) => [...cur.slice(-24), ...withIds]);
    const ids = new Set(withIds.map((f) => f.id));
    setTimeout(() => setFloaters((cur) => cur.filter((f) => !ids.has(f.id))), 1700);
  }, []);

  const setTool = useCallback((t: Tool) => {
    setToolState(t);
    if (t !== "inspect") setSelected(null);
    // 公共施設を選んだら効果範囲を自動表示
    const cov = t !== "inspect" && t !== "bulldoze" && t !== "reclaim" ? BUILDINGS[t].coverage?.kind : undefined;
    setOverlay((o) => {
      if (cov && cov !== "landmark") return cov as Overlay;
      return RANGE_OVERLAYS.includes(o) ? "none" : o;
    });
  }, []);

  const pickTool = useCallback(
    (t: Tool) => {
      setTool(t);
      scrollToOnMobile("city-map");
    },
    [setTool],
  );

  // 地図上の場所を示す（スマホでのスクロールは CityMap が flash を見て行う）
  const focusTile = useCallback(
    (i: number) => {
      setTool("inspect");
      setSelected(i);
      setFlash({ tile: i, key: Date.now() });
    },
    [setTool],
  );

  const openPanel = useCallback((t: PanelTab) => {
    setPanelTab(t);
    scrollToOnMobile("side-panel-tabs");
  }, []);

  const showOverlay = useCallback((o: Overlay) => {
    setOverlay(o);
    scrollToOnMobile("city-map");
  }, []);

  const apply = useCallback(
    (fn: (s: GameState) => ActionResult, opts: { silent?: boolean; stroke?: boolean; noUndo?: boolean } = {}): GameState | null => {
      const cur = stateRef.current;
      if (!cur) return null;
      const r = fn(cur);
      if (!r.ok) {
        if (!opts.silent) toast(r.error, "bad");
        return null;
      }
      if (r.state !== cur && !opts.noUndo) {
        // ドラッグでの連続設置は、ひとまとまりで1回の取り消しにする
        if (!opts.stroke || !strokeSnapshot.current) setUndoStack((u) => [...u.slice(-29), cur]);
        if (opts.stroke) strokeSnapshot.current = true;
      }
      commit(r.state);
      return r.state;
    },
    [commit, toast],
  );

  const applyToolAt = useCallback(
    (i: number, painting = false) => {
      const cur = stateRef.current;
      if (!cur) return;
      if (tool === "inspect") {
        const target = anchorOf(cur, i);
        if (!painting) setSelected((s) => (s === target ? null : target));
        return;
      }
      if (tool === "bulldoze") {
        const b = cur.tiles[i]?.building;
        if (!b) return;
        if (painting && BUILDINGS[b.type].category !== "zone" && !isRoad(b.type)) return; // 公共施設・大型施設はドラッグでは壊さない
        const before = cur.money;
        const next = apply((s) => demolish(s, i), { silent: painting && strokeError.current, stroke: true });
        if (!next) {
          strokeError.current = true;
          return;
        }
        const refund = next.money - before;
        addFloaters([{ tile: i, text: refund > 0 ? `+${formatYen(refund)}` : "撤去", tone: refund > 0 ? "good" : "info" }]);
        if (selected === i) setSelected(null);
        return;
      }
      if (tool === "reclaim") {
        if (cur.tiles[i]?.terrain !== "water" || cur.tiles[i]?.building) return;
        const next = apply((s) => reclaim(s, i), { silent: painting && strokeError.current, stroke: true });
        if (!next) {
          strokeError.current = true;
          return;
        }
        addFloaters([{ tile: i, text: `-${formatYen(ECONOMY.reclaimCost)}`, tone: "bad" }]);
        return;
      }
      if (painting && !BUILDINGS[tool].paintable) return;
      // ドラッグ中は、すでに何か建っているマスを黙ってスキップする（大通りへの道路の置き換えは除く）
      const existing = cur.tiles[i]?.building?.type;
      if (painting && existing && !(tool === "avenue" && existing === "road")) return;
      const before = cur.money;
      const next = apply((s) => placeBuilding(s, tool, i), { silent: painting && strokeError.current, stroke: true });
      if (!next) {
        strokeError.current = true;
        return;
      }
      addFloaters([{ tile: i, text: `-${formatYen(before - next.money)}`, tone: "bad" }]);
    },
    [tool, apply, addFloaters, selected],
  );

  const endStroke = useCallback(() => {
    strokeError.current = false;
    strokeSnapshot.current = false;
  }, []);

  // 取り消しの履歴は ref でも持ち、素早く続けて押しても1つずつ戻るようにする
  const undoRef = useRef<GameState[]>([]);
  /** 前のゲームのダイアログ・選択状態を消す（別の枠を続けたときに残らないように）。setState だけなので毎回作ってよい */
  const clearDialogs = () => {
    setRankUp(null);
    setEraShift(null);
    setScenarioResult(null);
    setBanner(null);
    setSelected(null);
    setFlash(null);
    setUndoStack([]);
    undoRef.current = [];
  };
  useEffect(() => {
    undoRef.current = undoStack;
  }, [undoStack]);
  const undo = useCallback(() => {
    const stack = undoRef.current;
    const prev = stack[stack.length - 1];
    if (!prev) return;
    undoRef.current = stack.slice(0, -1);
    setUndoStack(undoRef.current);
    stateRef.current = prev;
    setState(prev);
    setSelected(null);
    toast("↩️ ひとつ前に戻しました", "info");
  }, [toast]);

  const runAction = useCallback((fn: (s: GameState) => ActionResult) => apply(fn) !== null, [apply]);

  const showMonthFeedback = useCallback(
    (before: GameState, after: GameState, report: MonthReport) => {
      const items: Array<Omit<Floater, "id">> = [];
      for (const c of report.changes.slice(0, MAX_TILE_FLOATERS)) {
        const b = after.tiles[c.tile].building;
        if (!b) continue;
        if (c.kind === "levelUp") items.push({ tile: c.tile, text: `⬆️ ${levelName(b.type, b.level)}`, tone: "gold" });
        else if (c.kind === "built") items.push({ tile: c.tile, text: `🆕 ${levelName(b.type, b.level)}`, tone: "good" });
        else if (c.kind === "levelDown") items.push({ tile: c.tile, text: "⬇️ 縮小", tone: "bad" });
        else if (c.kind === "abandoned") items.push({ tile: c.tile, text: "🏚️ 空き家に", tone: "bad" });
      }
      // 人口の増減が大きい住宅
      const diffs: Array<{ tile: number; d: number }> = [];
      after.tiles.forEach((t, i) => {
        if (t.building?.type !== "residential") return;
        const d = t.building.occupants - (before.tiles[i].building?.type === "residential" ? before.tiles[i].building!.occupants : 0);
        if (Math.abs(d) >= 3 && !items.some((x) => x.tile === i)) diffs.push({ tile: i, d });
      });
      diffs.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      for (const x of diffs.slice(0, Math.max(0, MAX_TILE_FLOATERS - items.length))) {
        items.push({ tile: x.tile, text: `${x.d > 0 ? "+" : ""}${x.d}人`, tone: x.d > 0 ? "good" : "bad" });
      }
      addFloaters(items);

      const pop = report.populationAfter - report.populationBefore;
      const lines = [
        `👥 人口 ${formatNumber(pop, { sign: true })}人（転入 ${report.inflow} / 転出 ${report.outflow}）`,
        `💴 収支 ${formatYen(report.budget.net, { sign: true })}`,
      ];
      const reason = mainOutflowReason(report);
      if (reason) lines.push(reason);
      const ups = report.changes.filter((c) => c.kind === "levelUp").length;
      const built = report.changes.filter((c) => c.kind === "built").length;
      if (built + ups > 0) lines.push(`🏗️ ${built > 0 ? `完成 ${built}件` : ""}${built > 0 && ups > 0 ? "・" : ""}${ups > 0 ? `成長 ${ups}件` : ""}`);
      const bannerId = nextId();
      setBanner({ id: bannerId, title: `📅 ${monthOf(before.turn)}月の結果`, lines });
      setTimeout(() => setBanner((b) => (b?.id === bannerId ? null : b)), 3300);

      const pendingTitle = after.pendingEvent ? getEventDef(after.pendingEvent.eventId)?.title : undefined;
      for (const e of report.events) {
        if (e.kind === "choiceEvent" || (pendingTitle && e.title === pendingTitle)) continue; // 選択式イベントはダイアログで表示する
        if (e.kind === "rankUp") continue; // ランクアップは専用の画面で表示する
        toast(`${e.emoji} ${e.title}`, e.tone === "bad" ? "bad" : "good");
      }
      for (const id of report.achievements) {
        const g = getGoal(id);
        if (g) toast(`🏆 目標達成「${g.title}」${g.reward > 0 ? ` 報酬 ${formatYen(g.reward)}` : ""}`, "good");
      }
      if (report.rankUp) setRankUp(report.rankUp);
      if (report.eraChange) setEraShift(report.eraChange);
      if (report.scenarioResult) setScenarioResult(report.scenarioResult);
      // メガシティ到達とチャレンジの結果は殿堂に記録する
      if (report.rankUp === "megacity" || (report.scenarioResult && report.scenarioResult !== "failed")) {
        recordHall(makeHallRecord(after, analyzeCity(after)));
      }
    },
    [addFloaters, toast],
  );

  const advance = useCallback(() => {
    const cur = stateRef.current;
    if (!cur) return;
    if (cur.pendingEvent && getEventDef(cur.pendingEvent.eventId)?.choices) {
      toast("先にイベントへの対応を決めてください", "bad");
      return;
    }
    const out = advanceMonth(withValidPendingEvent(cur));
    if (!out) return;
    setUndoStack([]);
    commit(out.state);
    showMonthFeedback(cur, out.state, out.report);
  }, [commit, showMonthFeedback, toast]);

  const advanceMany = useCallback(
    (months: number) => {
      const raw = stateRef.current;
      if (!raw) return;
      if (raw.pendingEvent && getEventDef(raw.pendingEvent.eventId)?.choices) {
        toast("先にイベントへの対応を決めてください", "bad");
        return;
      }
      const start = withValidPendingEvent(raw);
      let cur = start;
      let last: { before: GameState; state: GameState; report: MonthReport } | null = null;
      let inflow = 0;
      let outflow = 0;
      let net = 0;
      let done = 0;
      let popStart: number | null = null;
      const missed: string[] = [];
      for (let k = 0; k < months; k++) {
        const out = advanceMonth(cur);
        if (!out) break;
        last = { before: cur, state: out.state, report: out.report };
        popStart ??= out.report.populationBefore;
        inflow += out.report.inflow;
        outflow += out.report.outflow;
        net += out.report.budget.net;
        cur = out.state;
        done++;
        // 大事なできごとがあれば、そこで止めて見せる
        const r = out.report;
        if (cur.pendingEvent || cur.gameOver || r.rankUp || r.eraChange || r.scenarioResult || r.events.some((e) => e.tone === "bad")) break;
        // ミッションの報酬は毎月受け取る
        const claimed = claimMissions(cur, analyzeCity(cur));
        cur = claimed.state;
        missed.push(...claimed.claimed.map((m) => `🎯 ミッション達成「${m.title}」${m.reward > 0 ? ` +${formatYen(m.reward)}` : ""}`));
        for (const id of r.achievements) {
          const goal = getGoal(id);
          if (goal) missed.push(`🏆 目標達成「${goal.title}」${goal.reward > 0 ? ` 報酬 ${formatYen(goal.reward)}` : ""}`);
        }
        for (const e of r.events) if (e.tone === "good") missed.push(`${e.emoji} ${e.title}`);
      }
      if (!last) return;
      setUndoStack([]);
      commit(last.state);
      showMonthFeedback(last.before, last.state, last.report);
      // 途中の月のうれしい知らせも、まとめて知らせる（多すぎるときは件数だけ）
      if (missed.length > 3) toast(`✨ ほかにも${missed.length}件のうれしい知らせがありました（ニュースで見られます）`, "good");
      else for (const text of missed) toast(text, "good");
      if (done > 1) {
        const pop = last.report.populationAfter - (popStart ?? last.report.populationBefore);
        const bannerId = nextId();
        setBanner({
          id: bannerId,
          title: `⏩ ${done}か月進めました`,
          lines: [`👥 人口 ${formatNumber(pop, { sign: true })}人（転入 ${inflow} / 転出 ${outflow}）`, `💴 収支の合計 ${formatYen(net, { sign: true })}`, ...(done < months ? ["⚠️ 大事なできごとがあったので止めました"] : [])],
        });
        setTimeout(() => setBanner((b) => (b?.id === bannerId ? null : b)), 3800);
      }
    },
    [commit, showMonthFeedback, toast],
  );

  // 税率はスライダーで細かく動くので、取り消しの履歴には積まない
  const changeTax = useCallback((zone: ZoneType, rate: number) => void apply((s) => setTax(s, zone, rate), { noUndo: true }), [apply]);

  const takeLoan = useCallback(() => {
    const next = apply((s) => borrow(s));
    if (next) toast("💳 お金を借りました", "good");
  }, [apply, toast]);

  const repayLoan = useCallback(() => {
    const next = apply((s) => repay(s));
    if (next) toast("💳 返済しました", "good");
  }, [apply, toast]);

  const chooseEventOption = useCallback(
    (choiceId: string) => {
      const cur = stateRef.current;
      if (!cur) return;
      const r = resolveEvent(cur, analyzeCity(cur), choiceId, createRng(cur.rngSeed ^ 0x9e3779b9));
      if (!r.ok) {
        toast(r.error, "bad");
        return;
      }
      // イベントの選択は取り消せない（選び直しできないように）
      setUndoStack([]);
      commit(r.state);
      if (r.message) toast(r.message, "good");
    },
    [commit, toast],
  );

  const newGame = useCallback(
    (name: string, seed: number, scenario: string | undefined, target: number, choice: { trait?: TraitId; tendency?: TendencyId } = {}) => {
      setSlot(target);
      setActiveSlot(target);
      commit(createNewGame(name, seed, { scenario, ...choice }));
      clearDialogs();
      setToolState("inspect");
      setSelected(null);
      setOverlay("none");
      setPanelTab("voices");
      setHelpOpen(true);
    },
    [commit],
  );

  const continueGame = useCallback((target: number) => {
    const saved = loadGame(target);
    if (!saved) return false;
    setSlot(target);
    setActiveSlot(target);
    commit(withValidPendingEvent(saved));
    clearDialogs();
    setToolState("inspect");
    return true;
  }, [commit]);

  const recordToHall = useCallback(() => {
    const cur = stateRef.current;
    if (!cur) return;
    recordHall(makeHallRecord(cur, analyzeCity(cur)));
    toast("🏛️ 殿堂に記録しました（タイトル画面で見られます）", "good");
  }, [toast]);

  const quitToTitle = useCallback((clear = false) => {
    if (clear) clearSave(slot);
    commit(null);
    clearDialogs();
  }, [commit, slot]);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      analysis,
      tool,
      setTool,
      pickTool,
      selected,
      select: setSelected,
      flash,
      focusTile,
      overlay,
      setOverlay,
      panelTab,
      setPanelTab,
      openPanel,
      showOverlay,
      applyToolAt,
      endStroke,
      runAction,
      advance,
      advanceMany,
      undo,
      canUndo: undoStack.length > 0,
      changeTax,
      takeLoan,
      repayLoan,
      chooseEventOption,
      newGame,
      slot,
      recordToHall,
      scenarioResult,
      closeScenarioResult: () => setScenarioResult(null),
      continueGame,
      quitToTitle,
      floaters,
      toasts,
      toast,
      banner,
      rankUp,
      closeRankUp: () => setRankUp(null),
      eraShift,
      closeEraShift: () => setEraShift(null),
      helpOpen,
      setHelpOpen,
    }),
    [state, analysis, tool, setTool, pickTool, selected, flash, focusTile, overlay, panelTab, openPanel, showOverlay, applyToolAt, endStroke, runAction, advance, advanceMany, undo, undoStack.length, changeTax, takeLoan, repayLoan, chooseEventOption, newGame, slot, recordToHall, scenarioResult, continueGame, quitToTitle, floaters, toasts, toast, banner, rankUp, eraShift, helpOpen],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/** 選択肢を表示できないイベント（古いセーブ・不明な id）が残っていたら取り除く。残ると翌月へ進めなくなる */
function withValidPendingEvent(s: GameState): GameState {
  if (!s.pendingEvent || getEventDef(s.pendingEvent.eventId)?.choices) return s;
  return { ...s, pendingEvent: null };
}

/** スマホ（1列表示）のときだけ、要素まで画面をスクロールする */
function scrollToOnMobile(id: string) {
  if (typeof window === "undefined" || window.innerWidth >= 1024) return;
  // タブの切り替えが画面に反映されてからスクロールする
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
}

const OUTFLOW_TEXT: Record<OutflowReason, string> = {
  jobless: "仕事がなくて",
  unhappy: "住みにくくて",
  churn: "転勤・進学などで",
  noRoad: "道路がなくて",
  decline: "建物が縮小・空き家になって",
  event: "できごとの影響で",
};

/** 転出の主な理由（ふだんの入れ替わり以外で目立つものがあれば1行で） */
export function mainOutflowReason(report: MonthReport): string | null {
  const reasons = report.outflowReasons;
  if (!reasons) return null;
  const top = (Object.entries(reasons) as Array<[OutflowReason, number]>).filter(([k]) => k !== "churn").sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 5 || top[1] < report.outflow * 0.3) return null;
  return `🚪 ${OUTFLOW_TEXT[top[0]]}${top[1]}人が転出`;
}

export function rankLabel(id: RankId): string {
  const r = getRank(id);
  return `${r.emoji} ${r.name}`;
}
