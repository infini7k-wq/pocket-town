"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BUILDINGS,
  buildingEmoji,
  checkDemolish,
  checkPlacement,
  checkReclaim,
  effectiveRadius,
  demolish,
  footprint,
  formatYen,
  placeBuilding,
  reclaim,
  forEachInRange,
  gridPath,
  isRoad,
  isUnlockedTile,
  toXY,
  visibleBounds,
  readyToGrow,
  type BuildingType,
  type CoverageKind,
  type GameState,
} from "@/game";
import { RANGE_OVERLAYS, useCity, useGame, type Overlay, type Tool } from "../GameProvider";
import { cx } from "../ui";
import { TileView } from "./TileView";

const VIEW_MODES: Array<{ id: Overlay; label: string; icon: string }> = [
  { id: "none", label: "通常", icon: "🗺️" },
  { id: "traffic", label: "交通", icon: "🚗" },
  { id: "env", label: "環境", icon: "🌿" },
  { id: "happiness", label: "満足度", icon: "😊" },
];

/** 公共施設の効果範囲の表示（どの施設の範囲か） */
const RANGE_MODES: Array<{ id: Overlay; label: string; icon: string; building: BuildingType }> = [
  { id: "park", label: "公園", icon: "🌳", building: "park" },
  { id: "education", label: "学校", icon: "🏫", building: "school" },
  { id: "health", label: "病院", icon: "🏥", building: "hospital" },
  { id: "fire", label: "消防", icon: "🚒", building: "fireStation" },
  { id: "transit", label: "バス", icon: "🚏", building: "busStop" },
  { id: "shopping", label: "買い物", icon: "🛍️", building: "commercial" },
  { id: "plaza", label: "広場", icon: "⛲", building: "plaza" },
];

/** 範囲モードごとの半径の説明（同じ種類の施設をまとめて） */
const RANGE_RADIUS: Record<string, string> = {
  park: "公園2マス・大きな公園4マス",
  education: "学校4マス・大学8マス（2×2は建物の端から）",
  health: "病院5マス",
  fire: "消防署5マス",
  transit: "バス停3マス・バスターミナル5マス・新幹線駅7マス",
  shopping: "コンビニ・スーパー3マス・デパート4マス・複合ビル5マス",
  plaza: "広場3マス",
};

/** 地図の枠の内側の余白（角のマスが切れないように） */
const FRAME = 6;
/** スマホでタップしやすいマスの大きさ（これより小さいと自動で拡大） */
const MIN_TOUCH_TILE = 24;

const TRAFFIC_COLORS = ["", "rgba(34,197,94,0.75)", "rgba(245,158,11,0.8)", "rgba(239,68,68,0.85)"];

/** 0〜100 を赤→黄→緑に */
function scaleColor(v: number, alpha = 0.55): string {
  const hue = Math.max(0, Math.min(120, (v / 100) * 120));
  return `hsla(${hue}, 80%, 48%, ${alpha})`;
}

const FLOATER_TONE = {
  good: "bg-emerald-500 text-white",
  bad: "bg-rose-500 text-white",
  info: "bg-slate-700 text-white",
  gold: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950",
};

export function CityMap() {
  const { state, analysis } = useCity();
  const { tool, selected, flash, overlay, setOverlay, applyToolAt, endStroke, floaters, banner } = useGame();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /** 拡大率（null = 自動：スマホなどでマスが小さすぎるときだけ拡大） */
  const [zoom, setZoom] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mouseHover, setHover] = useState<number | null>(null);
  const painting = useRef(false);
  const lastTile = useRef<number | null>(null);
  // スマホ：公共施設などは「1回目で確認・2回目で建設」
  const [pendingTap, setPendingTap] = useState<{ tool: string; tile: number } | null>(null);
  const pending = pendingTap && pendingTap.tool === tool ? pendingTap.tile : null;
  const hover = mouseHover ?? pending;
  const [draft, setDraft] = useState<{ tool: string; tiles: number[] } | null>(null);
  const [moveModeState, setMoveModeState] = useState(false);
  // ツールを変えたら下書きは捨てる
  const [draftTool, setDraftTool] = useState(tool);
  if (draftTool !== tool) {
    setDraftTool(tool);
    if (draft) setDraft(null);
    if (moveModeState) setMoveModeState(false);
  }
  // スマホ（タッチ）の操作状態。指の本数は毎回イベントの e.touches から読むので、状態が残りっぱなしにならない
  const gridRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<TouchGesture>({ kind: "none" });
  const strokeTiles = useRef<number[]>([]);
  const strokeHadBefore = useRef<number[]>([]);
  // ✋ 地図を動かすモード（なぞる道具のときに、1本指で地図・画面を動かせる）。道具を変えたら戻す
  const moveMode = moveModeState;
  const setMoveMode = setMoveModeState;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // PC幅では、地図が画面の高さに収まる範囲でできるだけ大きく表示する
    // （上：ヘッダー＋表示切り替え、下：凡例 の高さを差し引く）
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (window.innerWidth < 1024) {
        setWidth(w);
        return;
      }
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 80;
      const avail = window.innerHeight - header - 12 - 36 - 8 - 30 - 16;
      setWidth(Math.min(w, Math.max(420, avail)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("header-resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("header-resize", measure);
    };
  }, []);

  const bounds = visibleBounds(state);
  const cols = bounds.max - bounds.min + 1;
  const inner = Math.max(0, width - FRAME * 2);
  const fit = inner > 0 ? inner / cols : 0;
  const autoZoom = fit > 0 && fit < MIN_TOUCH_TILE && typeof window !== "undefined" && window.innerWidth < 1024 ? MIN_TOUCH_TILE / fit : 1;
  const scale = zoom ?? autoZoom;
  const size = fit > 0 ? Math.max(14, Math.floor(fit * scale)) : 0;
  const zoomed = size * cols > inner + 1;

  // 拡大したときは、町の中心（役所）が見えるようにスクロールする
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomed) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoomed, cols]);

  // 「場所を見る」：スマホでは、そのマスが画面の見える部分（ヘッダーと下のシートの間）の真ん中に来るようにする
  useEffect(() => {
    if (!flash || window.innerWidth >= 1024) return;
    const timer = window.setTimeout(() => {
      const sc = scrollRef.current;
      const t = sc?.querySelector<HTMLElement>(`[data-i="${flash.tile}"]`);
      if (!sc || !t) return;
      let r = t.getBoundingClientRect();
      if (sc.scrollHeight > sc.clientHeight + 1 || sc.scrollWidth > sc.clientWidth + 1) {
        // 拡大中は地図の中もスクロールする
        const s = sc.getBoundingClientRect();
        sc.scrollBy({ left: r.left + r.width / 2 - (s.left + s.width / 2), top: r.top + r.height / 2 - (s.top + s.height / 2) });
        r = t.getBoundingClientRect();
      }
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 80;
      const bottom = document.getElementById("tile-sheet")?.getBoundingClientRect().top ?? document.getElementById("mobile-bar")?.getBoundingClientRect().top ?? window.innerHeight;
      window.scrollBy({ top: r.top + r.height / 2 - (top + bottom) / 2, behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // 大型施設（2×2）を置こうとしているときの4マス
  const footprintTiles = useMemo(() => {
    if (hover === null || tool === "inspect" || tool === "bulldoze" || tool === "reclaim" || BUILDINGS[tool].size !== 2) return null;
    return new Set(footprint(hover, state.width).filter((j) => j < state.tiles.length));
  }, [hover, tool, state]);

  // 効果範囲のプレビュー（公共施設を置こうとしているマス、または選択中の施設）
  const rangeTiles = useMemo(() => {
    const set = new Set<number>();
    let center: number | null = null;
    let radius = 0;
    let bigSize = 1;
    if (tool !== "inspect" && tool !== "bulldoze" && tool !== "reclaim" && hover !== null && BUILDINGS[tool].coverage) {
      center = hover;
      radius = BUILDINGS[tool].coverage!.radius;
      bigSize = BUILDINGS[tool].size ?? 1;
    } else if (tool === "inspect" && selected !== null) {
      const b = state.tiles[selected]?.building;
      if (b && b.level === 0 && (BUILDINGS[b.type].category === "project" || b.type === "commercial")) return set;
      const cov = b ? BUILDINGS[b.type].coverage : undefined;
      if (b && cov) {
        center = selected;
        radius = effectiveRadius(b);
        bigSize = BUILDINGS[b.type].size ?? 1;
      }
    }
    // 2×2 の施設は、建物の端から数える
    if (center !== null) forEachInRange(center, bigSize, radius, state.width, state.height, (j) => set.add(j));
    return set;
  }, [tool, hover, selected, state]);

  const preview = useMemo(() => {
    if (hover === null || tool === "inspect") return null;
    if (tool === "reclaim") {
      if (state.tiles[hover]?.terrain !== "water") return null;
      const c = checkReclaim(state, hover);
      return { ok: c.ok, emoji: "🟩", text: c.ok ? `埋め立て ¥${c.cost.toLocaleString("ja-JP")}` : c.reason };
    }
    if (tool === "bulldoze") {
      if (!state.tiles[hover]?.building) return null;
      const c = checkDemolish(state, hover);
      return { ok: c.ok, emoji: "🚜", text: c.ok ? (c.refund > 0 ? `撤去 +¥${c.refund.toLocaleString("ja-JP")}` : "撤去") : c.reason };
    }
    // 建てた直後や、すでに建物があるマスではエラーを出さない（大通りへの置き換えだけは案内する）
    const existing = state.tiles[hover]?.building;
    if (existing && !(tool === "avenue" && existing.type === "road")) return null;
    if (isRoad(tool) && state.tiles[hover]?.terrain === "water") {
      const c = checkPlacement(state, tool, hover);
      return { ok: c.ok, emoji: "🌉", text: c.ok ? `橋 ¥${c.cost.toLocaleString("ja-JP")}` : c.reason };
    }
    const c = checkPlacement(state, tool, hover);
    return { ok: c.ok, emoji: buildingEmoji(tool, 1), text: c.ok ? `¥${c.cost.toLocaleString("ja-JP")}` : c.reason };
  }, [hover, tool, state]);

  const tileAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-i]");
    return el ? Number(el.dataset.i) : null;
  };

  /** なぞって連続で使えるツールか（道路・ゾーン・撤去・埋め立て） */
  const paintTool = tool !== "inspect" && (tool === "bulldoze" || tool === "reclaim" || !!BUILDINGS[tool].paintable);

  // ---- スマホ：なぞった場所は「下書き」にして、合計費用を見てから確定する（2本指で地図を動かす） ----
  const draftTiles = draft && draft.tool === tool ? draft.tiles : null;
  const draftSim = useMemo(() => (draftTiles ? simulateStroke(state, tool, draftTiles) : null), [draftTiles, state, tool]);
  const addToDraft = (tiles: number[]) => {
    setDraft((d) => {
      const base = d && d.tool === tool ? d.tiles : [];
      const next = [...base];
      for (const j of tiles) if (!next.includes(j)) next.push(j);
      return { tool, tiles: next };
    });
  };
  const confirmDraft = () => {
    if (!draftTiles || draftTiles.length === 0) return;
    draftTiles.forEach((j, k) => applyToolAt(j, k > 0));
    endStroke();
    setDraft(null);
  };

  const onTap = (i: number) => {
    if (tool === "inspect") {
      applyToolAt(i, false);
      endStroke();
      return;
    }
    // なぞる道具（✋ 地図を動かすモード中のタップ）は下書きに加える
    if (paintTool) {
      addToDraft([i]);
      return;
    }
    // 1回目のタップは場所の確認（費用と効果範囲を表示）、同じマスをもう一度タップで建設
    if (pending === i) {
      setPendingTap(null);
      applyToolAt(i, false);
      endStroke();
    } else {
      setPendingTap({ tool, tile: i });
    }
  };

  const capture = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // すでに離れた指などは無視
    }
  };

  // ---- マウス（PC）：押した瞬間に建て、ドラッグで連続設置 ----
  // タッチ（スマホ・タブレット）は下の TouchEvent で扱うので、ここではマウスだけを見る
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const i = tileAt(e.clientX, e.clientY);
    if (i === null) return;
    painting.current = true;
    lastTile.current = i;
    if (tool !== "inspect") capture(e);
    applyToolAt(i, false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const i = tileAt(e.clientX, e.clientY);
    setHover(i);
    if (painting.current && tool !== "inspect" && i !== null && i !== lastTile.current) {
      // 速く動かしても途切れないよう、前のマスとの間も埋める
      const path = lastTile.current !== null ? gridPath(lastTile.current, i, state.width) : [i];
      lastTile.current = i;
      for (const j of path) applyToolAt(j, true);
    }
  };
  const stopPainting = () => {
    painting.current = false;
    lastTile.current = null;
    endStroke();
  };

  // ---- タッチ：タップ／なぞって下書き／2本指で移動 ----
  // 指の本数は「地図の上で触れている指」（targetTouches）で数える。下のバーに置いた親指などは数えない
  const startPan = (touches: TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    const sc = scrollRef.current;
    gesture.current = { kind: "pan", x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, sl: sc?.scrollLeft ?? 0, st: sc?.scrollTop ?? 0, wy: window.scrollY };
  };
  const findTouch = (list: TouchList, id: number): Touch | undefined => {
    for (let k = 0; k < list.length; k++) if (list[k].identifier === id) return list[k];
    return undefined;
  };
  const touchHandlers = {
    start(e: TouchEvent) {
      const touches = e.targetTouches;
      const n = touches.length;
      if (n >= 2) {
        // 2本目の指：いまのストロークを取り消して、地図を動かす（3本目が来たら基準を取り直す）
        if (gesture.current.kind === "draw") cancelStroke();
        if (paintTool && !moveMode) {
          e.preventDefault();
          startPan(touches);
        } else {
          gesture.current = { kind: "none" };
        }
        return;
      }
      const t = e.changedTouches[0] ?? touches[0];
      if (!t) return;
      const i = tileAt(t.clientX, t.clientY);
      if (i === null) {
        gesture.current = { kind: "none" };
        return;
      }
      if (paintTool && !moveMode) {
        e.preventDefault();
        strokeHadBefore.current = draftTiles ?? [];
        strokeTiles.current = [i];
        gesture.current = { kind: "draw", last: i, id: t.identifier };
        addToDraft([i]);
      } else {
        // 指を離したときにタップとして扱う（動かしたら・画面が動いていたらスクロール）
        gesture.current = { kind: "tap", x: t.clientX, y: t.clientY, tile: i, wy: window.scrollY, sy: scrollRef.current?.scrollTop ?? 0 };
      }
    },
    move(e: TouchEvent) {
      const g = gesture.current;
      if (g.kind === "pan") {
        const touches = e.targetTouches;
        if (touches.length < 2) return;
        e.preventDefault();
        const [a, b] = [touches[0], touches[1]];
        const dx = (a.clientX + b.clientX) / 2 - g.x;
        const dy = (a.clientY + b.clientY) / 2 - g.y;
        const sc = scrollRef.current;
        let restY = dy;
        if (sc && (sc.scrollHeight > sc.clientHeight + 1 || sc.scrollWidth > sc.clientWidth + 1)) {
          // 拡大中は地図の中を動かし、端まで来たら残りの分だけ画面全体を動かす
          sc.scrollLeft = g.sl - dx;
          const wantTop = g.st - dy;
          const maxTop = sc.scrollHeight - sc.clientHeight;
          sc.scrollTop = Math.max(0, Math.min(maxTop, wantTop));
          // 地図の中で使い切れなかった指の移動量（dy と同じ向き）
          restY = wantTop < 0 ? -wantTop : wantTop > maxTop ? maxTop - wantTop : 0;
        }
        if (restY !== 0) window.scrollTo({ top: g.wy - restY });
      } else if (g.kind === "draw") {
        e.preventDefault();
        const t = findTouch(e.touches, g.id);
        if (!t) return;
        const i = tileAt(t.clientX, t.clientY);
        if (i === null || i === g.last) return;
        const path = gridPath(g.last, i, state.width);
        gesture.current = { ...g, last: i };
        strokeTiles.current = [...strokeTiles.current, ...path];
        addToDraft(path);
      } else if (g.kind === "tap") {
        const t = e.touches[0];
        if (t && Math.hypot(t.clientX - g.x, t.clientY - g.y) > 10) gesture.current = { kind: "none" };
      }
    },
    end(e: TouchEvent) {
      const remaining = e.targetTouches.length;
      if (remaining > 0) {
        // 2本指の片方を離した：残りが2本以上なら基準を取り直し、1本なら全部離すまで何もしない
        if (gesture.current.kind === "pan" && remaining >= 2) startPan(e.targetTouches);
        else if (gesture.current.kind !== "pan") gesture.current = { kind: "none" };
        return;
      }
      const g = gesture.current;
      gesture.current = { kind: "none" };
      if (g.kind === "tap") {
        const t = e.changedTouches[0];
        // 慣性スクロールを止めただけのタップは無視する
        const scrolled = Math.abs(window.scrollY - g.wy) > 2 || Math.abs((scrollRef.current?.scrollTop ?? 0) - g.sy) > 2;
        if (t && !scrolled && Math.hypot(t.clientX - g.x, t.clientY - g.y) <= 10) {
          e.preventDefault(); // ダブルタップでの拡大などを防ぐ
          onTap(g.tile);
        }
      } else if (g.kind === "draw") {
        // 1マスだけの下書きで、同じマスをもう一度タップしたら確定
        const stroke = strokeTiles.current;
        if (stroke.length === 1 && strokeHadBefore.current.length === 1 && strokeHadBefore.current[0] === stroke[0]) confirmDraft();
      }
      strokeTiles.current = [];
    },
    cancel() {
      if (gesture.current.kind === "draw") cancelStroke();
      gesture.current = { kind: "none" };
      strokeTiles.current = [];
    },
  };
  /** いまのストロークでなぞった分だけ、下書きから取り除く */
  const cancelStroke = () => {
    const stroke = strokeTiles.current;
    const before = strokeHadBefore.current;
    if (stroke.length > 0) setDraft((d) => (d ? { ...d, tiles: d.tiles.filter((j) => !stroke.includes(j) || before.includes(j)) } : d));
    strokeTiles.current = [];
  };
  // イベントリスナーは一度だけ登録し、中身は毎回の描画で最新のものに差し替える
  const touchRef = useRef(touchHandlers);
  useLayoutEffect(() => {
    touchRef.current = touchHandlers;
  });
  useEffect(() => {
    // 地図の枠の余白に触れた2本目の指も拾えるよう、スクロールする枠で受ける
    const el = scrollRef.current;
    if (!el) return;
    const start = (e: TouchEvent) => touchRef.current.start(e);
    const move = (e: TouchEvent) => touchRef.current.move(e);
    const end = (e: TouchEvent) => touchRef.current.end(e);
    const cancel = () => touchRef.current.cancel();
    // preventDefault できるよう passive: false で登録する（React の onTouchMove は passive）
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", cancel);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
    };
  }, []);

  const covKind = RANGE_OVERLAYS.includes(overlay) ? (overlay as CoverageKind) : null;

  // 効果範囲の境界線：範囲のプレビューがあればそれを、なければ表示中の施設の範囲を囲む
  const edgeSet = useMemo(() => {
    if (rangeTiles.size > 0) return rangeTiles;
    if (!covKind) return null;
    const set = new Set<number>();
    analysis.coverage[covKind].forEach((v, i) => {
      if (v > 0) set.add(i);
    });
    return set;
  }, [rangeTiles, covKind, analysis]);
  const edgeOf = (i: number, x: number, y: number): number => {
    if (!edgeSet?.has(i)) return 0;
    // 表示範囲の外は「範囲外」として扱い、地図の端にも線を引く
    let m = 0;
    if (y <= bounds.min || !edgeSet.has(i - state.width)) m |= 1;
    if (x >= bounds.max || !edgeSet.has(i + 1)) m |= 2;
    if (y >= bounds.max || !edgeSet.has(i + state.width)) m |= 4;
    if (x <= bounds.min || !edgeSet.has(i - 1)) m |= 8;
    return m;
  };

  const rows: React.ReactNode[] = [];
  for (let y = bounds.min; y <= bounds.max; y++) {
    for (let x = bounds.min; x <= bounds.max; x++) {
      const i = y * state.width + x;
      const t = state.tiles[i];
      const b = t.building;
      const road = isRoad(b?.type);
      let roadMask = 0;
      if (road) {
        const [up, right, down, left] = [i - state.width, i + 1, i + state.width, i - 1];
        if (y > 0 && isRoad(state.tiles[up].building?.type)) roadMask |= 1;
        if (x < state.width - 1 && isRoad(state.tiles[right].building?.type)) roadMask |= 2;
        if (y < state.height - 1 && isRoad(state.tiles[down].building?.type)) roadMask |= 4;
        if (x > 0 && isRoad(state.tiles[left].building?.type)) roadMask |= 8;
      }
      const locked = !isUnlockedTile(state, i);
      let ov: string | undefined;
      let dim = false;
      if (!locked && t.terrain !== "water") {
        if (overlay === "traffic") {
          if (road) ov = TRAFFIC_COLORS[analysis.traffic.level[i]];
          else dim = true;
        } else if (overlay === "env") ov = scaleColor(analysis.env[i]);
        else if (overlay === "happiness") {
          if (b?.type === "residential") ov = scaleColor(analysis.happiness[i], 0.65);
          else dim = true;
        } else if (covKind) {
          const v = analysis.coverage[covKind][i];
          if (v > 0) ov = `rgba(37,99,235,${0.15 + v * 0.4})`;
        }
      }
      let badge: "noRoad" | "disconnected" | undefined;
      if (b && !road && BUILDINGS[b.type].category !== "special") {
        if (!analysis.net.roadAccess[i]) badge = "noRoad";
        else if (!analysis.net.connected[i]) badge = "disconnected";
      }
      rows.push(
        <TileView
          key={i}
          i={i}
          size={size}
          terrain={t.terrain}
          checker={(x + y) % 2 === 0}
          type={b?.type}
          level={b?.level ?? 0}
          abandoned={b?.abandoned ?? false}
          roadMask={roadMask}
          traffic={road ? analysis.traffic.level[i] : 0}
          locked={locked}
          overlay={ov}
          dim={dim}
          badge={badge}
          selected={selected === i}
          flashKey={flash?.tile === i ? flash.key : undefined}
          preview={draftSim?.ok.has(i) ? "ok" : draftSim?.bad.has(i) ? "bad" : (footprintTiles ? footprintTiles.has(i) : hover === i) && preview ? (preview.ok ? "ok" : "bad") : undefined}
          previewEmoji={draftSim?.ok.has(i) ? draftSim.emoji : hover === i && preview?.ok ? preview.emoji : undefined}
          bigSize={b ? BUILDINGS[b.type].size : undefined}
          railSide={b?.type === "bulletTrain" ? railSideOf(x, y, state.width, state.height) : undefined}
          buildLeft={b?.buildLeft}
          inRange={rangeTiles.has(i)}
          rangeEdge={edgeSet ? edgeOf(i, x, y) : undefined}
          covMark={edgeSet && b?.type === "residential" && b.level > 0 ? (edgeSet.has(i) ? "in" : "out") : undefined}
          soon={overlay === "none" && !!b && b.level > 0 && BUILDINGS[b.type].category === "zone" && readyToGrow(state, i, analysis)}
        />,
      );
    }
  }

  const hoverPos = hover !== null ? toXY(hover, state.width) : null;

  return (
    <div id="city-map" className="flex flex-col gap-2" style={{ scrollMarginTop: "calc(var(--header-h, 80px) + 8px)" }}>
      {/* 表示切り替え */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1">
        {VIEW_MODES.map((o) => (
          <ModeChip key={o.id} active={overlay === o.id} onClick={() => setOverlay(o.id)} icon={o.icon} label={o.label} />
        ))}
        <span className="ml-1 shrink-0 text-[10px] font-bold text-slate-400">施設の範囲</span>
        {RANGE_MODES.map((o) => (
          <ModeChip key={o.id} active={overlay === o.id} onClick={() => setOverlay(o.id)} icon={o.icon} label={o.label} />
        ))}
        <button
          type="button"
          onClick={() => setZoom(zoomed ? 1 : Math.max(1.6, autoZoom))}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-900/10"
          aria-label={zoomed ? "全体を表示" : "拡大"}
        >
          {zoomed ? "🗺️ 全体" : "🔍 拡大"}
        </button>
      </div>

      <div ref={wrapRef} className="relative w-full">
        <div
          ref={scrollRef}
          className={cx("relative mx-auto rounded-2xl bg-white/85 shadow-lg shadow-emerald-900/10 ring-1 ring-slate-900/5", zoomed ? "no-scrollbar max-h-[72dvh] overflow-auto" : "overflow-hidden")}
          style={{ padding: FRAME, width: zoomed ? "100%" : size * cols + FRAME * 2 || "100%" }}
        >
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${size}px)`,
              width: size * cols,
              background: "#9fd066",
              // 調べる・1マスの施設ではスクロールでき、道路やゾーンはなぞって連続設置できる
              // 調べる・公共施設ではスワイプで地図を動かせ、道路やゾーンはなぞって連続設置できる
              touchAction: paintTool && !moveMode ? "none" : "pan-x pan-y",
              cursor: tool === "inspect" ? "pointer" : tool === "bulldoze" ? "not-allowed" : "crosshair",
            }}
            ref={gridRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopPainting}
            onPointerCancel={stopPainting}
            onPointerLeave={() => {
              setHover(null);
              if (painting.current) stopPainting();
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {size > 0 && rows}
            {/* 数字の演出 */}
            {floaters.map((f) => {
              const { x, y } = toXY(f.tile, state.width);
              if (x < bounds.min || x > bounds.max || y < bounds.min || y > bounds.max) return null;
              return (
                <span
                  key={f.id}
                  className={cx("animate-float-up pointer-events-none absolute z-20 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-black shadow-md", FLOATER_TONE[f.tone])}
                  style={{ left: (x - bounds.min + 0.5) * size, top: (y - bounds.min) * size }}
                >
                  {f.text}
                </span>
              );
            })}
            {/* カーソル位置の建設プレビュー */}
            {hoverPos && preview?.text && (
              <span
                className={cx(
                  "pointer-events-none absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow",
                  preview.ok ? "bg-slate-900/85 text-white" : "bg-rose-600 text-white",
                )}
                style={{ left: (hoverPos.x - bounds.min + 0.5) * size, top: Math.max(0, (hoverPos.y - bounds.min) * size - 22) }}
              >
                {preview.text}
                {pending !== null && preview.ok && "（もう一度タップで建設）"}
              </span>
            )}
          </div>
        </div>

        {paintTool && (
          <button
            type="button"
            onClick={() => setMoveMode((v) => !v)}
            className={cx("absolute right-2 top-2 z-30 hidden rounded-full px-3 py-1.5 text-xs font-black shadow-lg ring-1 pointer-coarse:block", moveMode ? "bg-blue-600 text-white ring-blue-700" : "bg-white/95 text-slate-700 ring-slate-900/10")}
            aria-pressed={moveMode}
          >
            {moveMode ? "✏️ なぞるに戻す" : "✋ 地図を動かす"}
          </button>
        )}
        {banner && (
          <div key={banner.id} className="animate-banner pointer-events-none absolute left-1/2 top-3 z-30 w-[min(92%,22rem)] rounded-2xl bg-white/95 px-4 py-3 text-center shadow-xl ring-1 ring-slate-900/10">
            <div className="text-sm font-black text-slate-800">{banner.title}</div>
            {banner.lines.map((l) => (
              <div key={l} className="tabular mt-0.5 text-xs font-bold text-slate-600">
                {l}
              </div>
            ))}
          </div>
        )}
      </div>
      {paintTool && (
        <p className="hidden px-1 text-[11px] font-bold text-slate-400 pointer-coarse:block">
          {moveMode ? "✋ 地図を動かすモード：1本指で地図・画面を動かせます。なぞるときは地図の右上の ✏️ を押してください" : "なぞると下書き → 下の「✓ 建設」で確定。地図を動かすときは2本指、または地図の右上の ✋"}
        </p>
      )}
      {draftTiles && draftSim && draftTiles.length > 0 && (
        <div className="fixed inset-x-2 bottom-[calc(156px+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-2xl bg-slate-900/95 px-3 py-2 text-white shadow-2xl lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:w-[30rem] lg:-translate-x-1/2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-black">
              {draftSim.label} {draftSim.ok.size}マス
              {draftSim.bad.size > 0 && <span className="ml-1 text-rose-300">（{draftSim.bad.size}マスは不可）</span>}
              {draftSim.skipped > 0 && <span className="ml-1 text-slate-400">（{draftSim.skipped}マスは{tool === "bulldoze" ? "撤去できるものがないので" : tool === "reclaim" ? "水辺ではないので" : "すでに建物があるので"}飛ばします）</span>}
            </div>
            <div className="tabular text-[11px] font-bold text-slate-300">
              {draftSim.cost >= 0 ? `費用 ${formatYen(draftSim.cost)}` : `返金 +${formatYen(-draftSim.cost)}`}
              {draftSim.reason && <span className="ml-1 text-rose-300">{draftSim.reason}</span>}
            </div>
          </div>
          <button type="button" onClick={() => setDraft(null)} className="rounded-full bg-white/15 px-3 py-2 text-xs font-black">
            ✕ やめる
          </button>
          <button type="button" onClick={confirmDraft} disabled={draftSim.ok.size === 0} className="rounded-full bg-orange-500 px-4 py-2 text-xs font-black disabled:opacity-40">
            ✓ 建設
          </button>
        </div>
      )}
      <MapLegend key={overlay} overlay={overlay} hasRange={!covKind || analysis.coverage[covKind].some((v) => v > 0)} />
    </div>
  );
}

function ModeChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition",
        active ? "bg-slate-800 text-white shadow" : "bg-white/80 text-slate-600 ring-1 ring-slate-900/10 hover:bg-white",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function Swatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

/** いまの表示モードが何を表しているかを、文章と色見本で説明する */
function MapLegend({ overlay, hasRange }: { overlay: Overlay; hasRange: boolean }) {
  // 地図を大きく見せるため「通常」表示では1行だけ。色で塗る表示モードでは最初から説明を開く
  const [open, setOpen] = useState(overlay !== "none");
  let title: React.ReactNode;
  let items: React.ReactNode = null;
  if (overlay === "none") {
    title = "建物は最大4段階に育ちます（4段目の超高層は「市」から）。右下の数字がレベルです。";
    items = (
      <>
        <span>🏠 戸建て → 🏘️ 集合住宅 → 🏢 マンション → 🌇 タワーマンション</span>
        <span>✨ もうすぐ育つ</span>
        <span>⛔ 道路に面していない</span>
        <span>⚠️ 役所まで道路がつながっていない</span>
      </>
    );
  } else if (overlay === "traffic") {
    title = "道路の混み具合です。渋滞すると近くの住民の満足度とお店・工場の売り上げが下がります。";
    items = (
      <>
        <Swatch color="#22c55e">空いている</Swatch>
        <Swatch color="#f59e0b">やや混雑</Swatch>
        <Swatch color="#ef4444">渋滞</Swatch>
      </>
    );
  } else if (overlay === "env") {
    title = "空気のきれいさです。工場や渋滞で汚れ、森や公園できれいになります。汚れた場所の住宅は満足度が下がります。";
    items = (
      <>
        <Swatch color="hsl(0,80%,48%)">汚れている</Swatch>
        <Swatch color="hsl(50,80%,48%)">ふつう</Swatch>
        <Swatch color="hsl(120,80%,40%)">きれい</Swatch>
      </>
    );
  } else if (overlay === "happiness") {
    title = "住んでいる人の満足度です（住宅のみ）。低い住宅からは人が出ていき、高い住宅は大きな建物に育ちます。";
    items = (
      <>
        <Swatch color="hsl(0,80%,48%)">不満</Swatch>
        <Swatch color="hsl(50,80%,48%)">ふつう</Swatch>
        <Swatch color="hsl(120,80%,40%)">満足</Swatch>
      </>
    );
  } else {
    const mode = RANGE_MODES.find((m) => m.id === overlay)!;
    const def = BUILDINGS[mode.building];
    const radius = RANGE_RADIUS[mode.id];
    title = (
      <>
        {mode.icon} {mode.label}の効果が届く範囲（{radius}）。{def.effect ?? "住宅から近いほど便利"}。
      </>
    );
    items = hasRange ? (
      <>
        <Swatch color="rgba(37,99,235,0.55)">範囲内（濃いほど効果が強い）</Swatch>
        <span>✓ 届いている住宅</span>
        <span>✗ 届いていない住宅</span>
        <span>📏 直線距離で届く（道路や川をはさんでもOK）</span>
        <span>🛣️ 施設が道路に面し、役所までつながっていないと効果は半分</span>
      </>
    ) : (
      <span className="text-amber-600">まだ{def.name}がないので、効果の届く場所はありません。建てると範囲が青く表示されます。</span>
    );
  }
  return (
    <div className="rounded-xl bg-white/60 px-2.5 py-1 text-[11px] font-bold leading-relaxed text-slate-600">
      <div className="flex items-start gap-2">
        <div className={cx("min-w-0 flex-1", !open && "truncate")}>{title}</div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 text-blue-600 hover:underline" aria-expanded={open}>
          {open ? "閉じる" : "ⓘ 詳しく"}
        </button>
      </div>
      {open && <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">{items}</div>}
    </div>
  );
}

/**
 * なぞった下書きを、実際に建てた場合の結果として計算する（状態は変えない）。
 * 確定時の applyToolAt と同じルール：すでに建物があるマスは飛ばす、ドラッグでは公共施設を壊さない など。
 */
function simulateStroke(state: GameState, tool: Tool, tiles: number[]) {
  const ok = new Set<number>();
  const bad = new Set<number>();
  let skipped = 0;
  let cur = state;
  let reason: string | undefined;
  tiles.forEach((i, k) => {
    const painting = k > 0;
    const t = cur.tiles[i];
    if (!t) return;
    let r;
    if (tool === "bulldoze") {
      const b = t.building;
      if (!b || (painting && BUILDINGS[b.type].category !== "zone" && !isRoad(b.type))) {
        skipped++;
        return;
      }
      r = demolish(cur, i);
    } else if (tool === "reclaim") {
      if (t.terrain !== "water" || t.building) {
        skipped++;
        return;
      }
      r = reclaim(cur, i);
    } else if (tool !== "inspect") {
      const existing = t.building?.type;
      if (existing && !(tool === "avenue" && existing === "road")) {
        skipped++;
        return;
      }
      r = placeBuilding(cur, tool, i);
    } else return;
    if (r.ok) {
      ok.add(i);
      cur = r.state;
    } else {
      bad.add(i);
      reason ??= r.error;
    }
  });
  const label = tool === "bulldoze" ? "🚜 撤去" : tool === "reclaim" ? "🏝️ 埋め立て" : tool === "inspect" ? "" : `${BUILDINGS[tool].emoji[1]} ${BUILDINGS[tool].name}`;
  const emoji = tool === "bulldoze" ? "🚜" : tool === "reclaim" ? "🟩" : tool === "inspect" ? "" : buildingEmoji(tool, 1);
  return { ok, bad, skipped, cost: state.money - cur.money, reason, label, emoji };
}

/** 新幹線駅（2×2、(x,y) が左上）が面している地図の端 */
function railSideOf(x: number, y: number, w: number, h: number): "top" | "right" | "bottom" | "left" | undefined {
  if (x === 0) return "left";
  if (x + 1 === w - 1) return "right";
  if (y === 0) return "top";
  if (y + 1 === h - 1) return "bottom";
  return undefined;
}

type TouchGesture =
  | { kind: "none" }
  | { kind: "tap"; x: number; y: number; tile: number; wy: number; sy: number }
  | { kind: "draw"; last: number; id: number }
  | { kind: "pan"; x: number; y: number; sl: number; st: number; wy: number };
