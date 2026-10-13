"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BUILDINGS,
  buildingEmoji,
  checkDemolish,
  checkPlacement,
  checkReclaim,
  busStopBoost,
  busStyle,
  stationRange,
  cityProblems,
  computeRailNetwork,
  dragDemolishable,
  isTrackTile,
  isTrackStation,
  isStationType,
  hasStation,
  lineStyle,
  stationWorking,
  effectiveRadius,
  isUpgradeTarget,
  isZone,
  neighbors4,
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
  type CityAnalysis,
  type CoverageKind,
  type GameState,
  seasonOf,
  weatherOf,
} from "@/game";
import { RANGE_OVERLAYS, useCity, useGame, type Overlay, type Tool } from "../GameProvider";
import { cx } from "../ui";
import { TileView } from "./TileView";
import { WeatherLayer } from "../Weather";

const VIEW_MODES: Array<{ id: Overlay; label: string; icon: string }> = [
  { id: "none", label: "通常", icon: "🗺️" },
  { id: "traffic", label: "交通", icon: "🚗" },
  { id: "lines", label: "路線", icon: "🚆" },
  { id: "land", label: "地価", icon: "💴" },
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
  park: "公園2マス・大きな公園4マス・森林公園6マス",
  education: "学校4マス・大学8マス（2×2は建物の端から）",
  health: "病院5マス",
  fire: "消防署5マス",
  transit: "バス停3マス（路線でターミナル・駅に直通なら4マス）・バスターミナル5マス・新幹線駅7マス（駅4マスは「路線」で表示）",
  shopping: "コンビニ・スーパー3マス・デパート4マス・複合ビル5マス・ランドマークビル6マス・アーケード商店街5マス",
  plaza: "広場3マス",
};

/** 地図の枠の内側の余白（角のマスが切れないように） */
const FRAME = 6;
/** スマホでタップしやすいマスの大きさ（これより小さいと自動で拡大） */
const MIN_TOUCH_TILE = 24;
/** 拡大したときのマスの大きさの上限 */
const MAX_TILE = 64;

const TRAFFIC_COLORS = ["", "rgba(34,197,94,0.75)", "rgba(245,158,11,0.8)", "rgba(239,68,68,0.85)"];

/** 0〜100 を赤→黄→緑に */
/** 地価の色：安い（薄い紫）→ 高い（濃い紫） */
function landColor(v: number): string {
  const t = Math.max(0, Math.min(1, v / 100));
  return `hsla(275, 70%, ${78 - t * 40}%, ${0.15 + t * 0.6})`;
}

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
  const { tool, selected, flash, overlay, setOverlay, applyToolAt, applyZonesAt, endStroke, floaters, banner, focusTile, toast } = useGame();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /** 拡大率（null = 自動：スマホなどでマスが小さすぎるときだけ拡大） */
  const [zoom, setZoom] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mouseHover, setHover] = useState<number | null>(null);
  const painting = useRef(false);
  const rectStart = useRef<number | null>(null);
  const rectToolAtStart = useRef<Tool | null>(null);
  const lastTile = useRef<number | null>(null);
  // スマホ：公共施設などは「1回目で確認・2回目で建設」
  const [pendingTap, setPendingTap] = useState<{ tool: string; tile: number } | null>(null);
  const pending = pendingTap && pendingTap.tool === tool ? pendingTap.tile : null;
  const hover = mouseHover ?? pending;
  const [draft, setDraft] = useState<{ tool: string; tiles: number[]; noRoad?: number } | null>(null);
  // 住宅・商業・工業は「四角でまとめて」置く（オフにすると、なぞった道のりだけ）
  const [zoneRect, setZoneRectState] = useState(readZoneRect);
  const setZoneRect = (v: boolean) => {
    setZoneRectState(v);
    saveZoneRect(v);
  };
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
  // ピンチ・Ctrl+ホイールで変えられる拡大率の範囲（全体表示〜3倍。マスは最大64px）
  const maxScale = fit > 0 ? Math.max(1, Math.min(Math.max(3, autoZoom), MAX_TILE / fit)) : 1;
  /** ピンチなどで拡大率を変えたあと、指（カーソル）の下の場所がずれないようにスクロールを合わせる */
  const pendingZoom = useRef<{ ox: number; oy: number; ratio: number; x: number; y: number } | null>(null);

  // 拡大したときは、町の中心（役所）が見えるようにスクロールする（ピンチで拡大したときは指の位置を基準にする）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomed || pendingZoom.current) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoomed, cols]);

  // 拡大率を確定したら、一時的な CSS の拡大を外し、指の位置が同じ場所に来るようにスクロールする
  useLayoutEffect(() => {
    const p = pendingZoom.current;
    const grid = gridRef.current;
    const sc = scrollRef.current;
    if (grid) {
      grid.style.transform = "";
      grid.style.transformOrigin = "";
    }
    if (!p || !sc) return;
    pendingZoom.current = null;
    const r = sc.getBoundingClientRect();
    sc.scrollLeft = FRAME + p.ox * p.ratio - (p.x - r.left);
    sc.scrollTop = FRAME + p.oy * p.ratio - (p.y - r.top);
  }, [size]);

  /** 拡大率を変える（基準の画面位置 x,y と、その位置の地図上の座標 ox,oy） */
  const applyZoom = (next: number, x: number, y: number, ox: number, oy: number) => {
    const target = Math.max(1, Math.min(maxScale, next));
    const nextSize = Math.max(14, Math.floor(fit * target));
    if (nextSize === size) {
      const grid = gridRef.current;
      if (grid) grid.style.transform = "";
      return;
    }
    pendingZoom.current = { ox, oy, ratio: nextSize / size, x, y };
    setZoom(target);
  };

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

  // 「次の困りごとへ」：押すたびに、前に見せた場所の次の困りごとへ移る（一覧が変わっても続きから）
  const problems = useMemo(() => cityProblems(state, analysis), [state, analysis]);
  const lastProblem = useRef(-1);
  const nextProblem = () => {
    if (problems.length === 0) return;
    // 前に見せた順番の次へ（直した困りごとが一覧から消えても、だいたい続きから）
    const idx = (lastProblem.current + 1) % problems.length;
    const p = problems[idx];
    lastProblem.current = idx;
    focusTile(p.tile);
    toast(`${p.emoji} ${p.text}（${idx + 1}/${problems.length}）`, p.kind === "lonelyBus" ? "info" : "bad");
  };

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
    if (tool !== "inspect" && tool !== "bulldoze" && tool !== "reclaim" && hover !== null && (BUILDINGS[tool].coverage || isStationType(tool))) {
      center = hover;
      radius = isStationType(tool) ? stationRange(tool) : BUILDINGS[tool].coverage!.radius;
      bigSize = BUILDINGS[tool].size ?? 1;
    } else if (tool === "inspect" && selected !== null) {
      const b = state.tiles[selected]?.building;
      if (b && b.level === 0 && (BUILDINGS[b.type].category === "project" || b.type === "commercial")) return set;
      const cov = b ? BUILDINGS[b.type].coverage : undefined;
      if (b && (cov || isStationType(b.type))) {
        center = selected;
        // バス停は路線になると範囲が広がる。駅は電車の効き目の範囲
        radius = b.type === "busStop" ? busStopBoost(analysis.busRoutes, state, selected).radius : isStationType(b.type) ? stationRange(b.type, b.level) : effectiveRadius(b);
        bigSize = BUILDINGS[b.type].size ?? 1;
      }
    }
    // 2×2 の施設は、建物の端から数える
    if (center !== null) forEachInRange(center, bigSize, radius, state.width, state.height, (j) => set.add(j));
    return set;
  }, [tool, hover, selected, state, analysis]);

  const preview = useMemo(() => {
    if (hover === null || tool === "inspect") return null;
    if (tool === "reclaim") {
      if (state.tiles[hover]?.terrain !== "water") return null;
      const c = checkReclaim(state, hover);
      return { ok: c.ok, emoji: "🟩", text: c.ok ? `埋め立て ¥${c.cost.toLocaleString("ja-JP")}` : c.reason };
    }
    if (tool === "bulldoze") {
      if (!state.tiles[hover]?.building && !state.tiles[hover]?.track) return null;
      const c = checkDemolish(state, hover);
      return { ok: c.ok, emoji: "🚜", text: c.ok ? (c.refund > 0 ? `撤去 +¥${c.refund.toLocaleString("ja-JP")}` : "撤去") : c.reason };
    }
    // 建てた直後や、すでに建物があるマスではエラーを出さない（大通りへの置き換えだけは案内する）
    const existing = state.tiles[hover]?.building;
    if (tool === "rail" && state.tiles[hover]?.track) return null;
    if (existing && !isUpgradeTarget(tool, existing) && !(isTrackStation(tool) && state.tiles[hover]?.track)) return null;
    if (isRoad(tool) && state.tiles[hover]?.terrain === "water") {
      const c = checkPlacement(state, tool, hover);
      return { ok: c.ok, emoji: "🌉", text: c.ok ? `橋 ¥${c.cost.toLocaleString("ja-JP")}` : c.reason };
    }
    const c = checkPlacement(state, tool, hover);
    // 駅で家などを建て替えるときは、そのことを見せる
    const replace = c.ok && isTrackStation(tool) && existing && isZone(existing.type) ? `${buildingEmoji(existing.type, existing.level)}→${buildingEmoji(tool, 1)} 建て替え ` : "";
    return { ok: c.ok, emoji: buildingEmoji(tool, 1), text: c.ok ? `${replace}¥${c.cost.toLocaleString("ja-JP")}` : c.reason };
  }, [hover, tool, state]);

  const tileAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-i]");
    return el ? Number(el.dataset.i) : null;
  };

  /** なぞって連続で使えるツールか（道路・ゾーン・撤去・埋め立て） */
  const paintTool = tool !== "inspect" && (tool === "bulldoze" || tool === "reclaim" || !!BUILDINGS[tool].paintable);
  /** 四角でまとめて置く道具か（住宅・商業・工業で、四角モードのとき） */
  const rectToolAvailable = tool !== "inspect" && tool !== "bulldoze" && tool !== "reclaim" && isZone(tool);
  const rectTool = zoneRect && rectToolAvailable;

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
  /** 四角の下書き：始点と今のマスを角にした四角（この操作の前の下書きはそのまま残す） */
  const setRectDraft = (a: number, b: number) => {
    const r = rectTiles(state, a, b);
    strokeTiles.current = r.tiles;
    const before = strokeHadBefore.current;
    setDraft({ tool, tiles: [...before, ...r.tiles.filter((j) => !before.includes(j))], noRoad: r.noRoad });
  };
  const confirmDraft = () => {
    if (!draftTiles || draftTiles.length === 0) return;
    // 住宅・商業・工業はまとめて1回で置く（大きな四角でも固まらない）
    if (tool !== "inspect" && tool !== "bulldoze" && tool !== "reclaim" && isZone(tool)) applyZonesAt(draftTiles);
    else draftTiles.forEach((j, k) => applyToolAt(j, k > 0));
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
    if (rectTool) {
      // 四角：ドラッグ中は下書きを見せ、離したときにまとめて建てる
      rectStart.current = i;
      rectToolAtStart.current = tool;
      strokeHadBefore.current = [];
      setRectDraft(i, i);
      return;
    }
    applyToolAt(i, false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const i = tileAt(e.clientX, e.clientY);
    setHover(i);
    if (painting.current && rectTool && rectStart.current !== null && i !== null && i !== lastTile.current) {
      lastTile.current = i;
      setRectDraft(rectStart.current, i);
      return;
    }
    if (painting.current && tool !== "inspect" && i !== null && i !== lastTile.current) {
      // 速く動かしても途切れないよう、前のマスとの間も埋める
      const path = lastTile.current !== null ? gridPath(lastTile.current, i, state.width) : [i];
      lastTile.current = i;
      for (const j of path) applyToolAt(j, true);
    }
  };
  const stopPainting = () => {
    const wasRect = painting.current && rectStart.current !== null;
    painting.current = false;
    lastTile.current = null;
    rectStart.current = null;
    if (wasRect) {
      // 四角の下書きをまとめて建てる（ドラッグ中に道具を変えたら建てない）
      if (rectToolAtStart.current === tool) applyZonesAt(strokeTiles.current);
      strokeTiles.current = [];
      setDraft(null);
    }
    endStroke();
  };

  // ---- タッチ：タップ／なぞって下書き／2本指で移動 ----
  // 指の本数は「地図の上で触れている指」（targetTouches）で数える。下のバーに置いた親指などは数えない
  const startPan = (touches: TouchList) => {
    const [a, b] = [touches[0], touches[1]];
    const sc = scrollRef.current;
    const x = (a.clientX + b.clientX) / 2;
    const y = (a.clientY + b.clientY) / 2;
    const g = gridRef.current?.getBoundingClientRect();
    gesture.current = {
      kind: "pan",
      x,
      y,
      sl: sc?.scrollLeft ?? 0,
      st: sc?.scrollTop ?? 0,
      wy: window.scrollY,
      d0: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      s0: scale,
      ox: g ? x - g.left : 0,
      oy: g ? y - g.top : 0,
      k: 1,
      mx: x,
      my: y,
    };
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
        // 2本目の指：いまのストロークを取り消して、地図を動かす・ピンチで拡大縮小（どの道具でも。3本目が来たら基準を取り直す）
        if (gesture.current.kind === "draw") cancelStroke();
        if (e.cancelable) e.preventDefault();
        startPan(touches);
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
        gesture.current = { kind: "draw", last: i, id: t.identifier, start: i };
        if (rectTool) setRectDraft(i, i);
        else addToDraft([i]);
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
        if (e.cancelable) e.preventDefault();
        const [a, b] = [touches[0], touches[1]];
        const mx = (a.clientX + b.clientX) / 2;
        const my = (a.clientY + b.clientY) / 2;
        // ピンチ：指の間の距離の変化で拡大縮小（指を離すまでは CSS で拡大し、マスは描き直さない）
        const k = Math.max(1 / g.s0, Math.min(maxScale / g.s0, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / g.d0));
        const grid = gridRef.current;
        if (grid && Math.abs(k - 1) > 0.04) {
          grid.style.transformOrigin = `${g.ox}px ${g.oy}px`;
          grid.style.transform = `scale(${k})`;
        }
        gesture.current = { ...g, k: Math.abs(k - 1) > 0.04 ? k : 1, mx, my };
        if (Math.abs(k - 1) > 0.04) return; // 拡大縮小している間は動かさない
        const dx = mx - g.x;
        const dy = my - g.y;
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
        gesture.current = { ...g, last: i, moved: true };
        if (rectTool) {
          setRectDraft(g.start, i);
          return;
        }
        const path = gridPath(g.last, i, state.width);
        strokeTiles.current = [...strokeTiles.current, ...path];
        addToDraft(path);
      } else if (g.kind === "tap") {
        const t = e.touches[0];
        if (t && Math.hypot(t.clientX - g.x, t.clientY - g.y) > 10) gesture.current = { kind: "none" };
      }
    },
    end(e: TouchEvent) {
      const remaining = e.targetTouches.length;
      const cur = gesture.current;
      // ピンチの指を離したら、拡大率を確定する
      if (cur.kind === "pan" && cur.k !== 1 && remaining < 2) {
        applyZoom(cur.s0 * cur.k, cur.mx, cur.my, cur.ox, cur.oy);
        gesture.current = { kind: "none" }; // 残った指で続けて動かさない（全部離してからやり直す）
      }
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
        if (!g.moved && stroke.length === 1 && strokeHadBefore.current.length === 1 && strokeHadBefore.current[0] === stroke[0]) confirmDraft();
      }
      strokeTiles.current = [];
    },
    wheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const g = gridRef.current?.getBoundingClientRect();
      if (!g) return;
      applyZoom(scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, e.clientX - g.left, e.clientY - g.top);
    },
    cancel() {
      if (gesture.current.kind === "draw") cancelStroke();
      if (gridRef.current) gridRef.current.style.transform = "";
      gesture.current = { kind: "none" };
      strokeTiles.current = [];
    },
  };
  /** いまのストロークでなぞった分だけ、下書きから取り除く */
  const cancelStroke = () => {
    const stroke = strokeTiles.current;
    const before = strokeHadBefore.current;
    // 下書きを、この操作の前に戻す（四角の「飛ばしたマス」の数も消す）
    setDraft((d) => {
      if (!d) return d;
      const tiles = d.tiles.filter((j) => !stroke.includes(j) || before.includes(j));
      return tiles.length > 0 ? { tool: d.tool, tiles } : null;
    });
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
    // iPhone の Safari：地図の上での2本指の拡大（ページ全体の拡大）を止める
    const gesture = (e: Event) => e.preventDefault();
    el.addEventListener("gesturestart", gesture, { passive: false } as AddEventListenerOptions);
    el.addEventListener("gesturechange", gesture, { passive: false } as AddEventListenerOptions);
    // PC：Ctrl+ホイール（トラックパッドのピンチ）でカーソルの位置を基準に拡大縮小
    const wheel = (e: WheelEvent) => touchRef.current.wheel(e);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", gesture);
      el.removeEventListener("gesturechange", gesture);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
    };
  }, []);

  const covKind = RANGE_OVERLAYS.includes(overlay) ? (overlay as CoverageKind) : null;
  const season = seasonOf(state.turn);
  const weather = weatherOf(state);
  const railTiles = useMemo(() => railTilesFor(state), [state]);
  // 路線図：バス路線が通る道路（マス → 路線番号）
  const busTiles = useMemo(() => {
    const m = new Map<number, number>();
    if (overlay !== "lines") return m;
    for (const p of analysis.busRoutes.paths) for (const j of p.tiles) if (!m.has(j)) m.set(j, p.route);
    return m;
  }, [overlay, analysis]);

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
      const roadMask = road ? neighborMask(state, i, (j) => isRoad(state.tiles[j].building?.type)) : 0;
      // 線路は建物の上に重ねて描く。地図の端の線路は、となり町へ続くように外へ延ばす（駅のマスは駅の絵だけ）
      const railMask = t.track && !isTrackStation(b?.type) ? neighborMask(state, i, (j) => isTrackTile(state, j), true) : undefined;
      const locked = !isUnlockedTile(state, i);
      const { ov, dim } = locked ? NO_OVERLAY : tileOverlay(state, analysis, i, overlay, covKind, busTiles);
      const badge = tileBadge(state, analysis, i);
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
          railMask={railMask}
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
          railStrip={railTiles.get(i)}
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
        {problems.length > 0 && (
          <button
            type="button"
            onClick={nextProblem}
            className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-300"
            title="道路がない・つながっていない・電車が来ない・空き家・渋滞などの場所を、押すたびに順番に見せます"
          >
            🔎 次の困りごと<span className="tabular rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{problems.length}</span>
          </button>
        )}
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
            className="season-map relative grid"
            data-season={season}
            data-overlay={overlay === "none" ? "off" : "on"}
            style={{
              gridTemplateColumns: `repeat(${cols}, ${size}px)`,
              width: size * cols,
              background: "var(--grass-b)",
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

        {!zoomed && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: size * cols + FRAME * 2 }}>
            <WeatherLayer season={season} weather={weather} hidden={overlay !== "none"} />
          </div>
        )}
        {rectToolAvailable && (
          <button
            type="button"
            onClick={() => setZoneRect(!zoneRect)}
            className={cx("absolute left-2 top-2 z-30 rounded-full px-3 py-1.5 text-xs font-black shadow-lg ring-1", zoneRect ? "bg-blue-600 text-white ring-blue-700" : "bg-white/95 text-slate-700 ring-slate-900/10")}
            aria-pressed={zoneRect}
            title={zoneRect ? "オン：四角でまとめて置きます（押すと、なぞった道のりだけに置く）" : "オフ：なぞった道のりだけに置きます（押すと四角でまとめて置く）"}
          >
            ⬜ 四角でまとめて{zoneRect ? "：オン" : "：オフ"}
          </button>
        )}
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
          {moveMode ? "✋ 地図を動かすモード：1本指で地図・画面を動かせます。なぞるときは地図の右上の ✏️ を押してください" : rectTool ? "指で四角を描くと、道路に面したマスをまとめて下書き → 下の「✓ 建設」で確定。地図を動かすときは2本指、または地図の右上の ✋" : "なぞると下書き → 下の「✓ 建設」で確定。地図を動かすときは2本指、または地図の右上の ✋"}
        </p>
      )}
      {draftTiles && draftSim && (draftTiles.length > 0 || !!draft?.noRoad) && (
        <div className="fixed inset-x-2 bottom-[calc(156px+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-2xl bg-slate-900/95 px-3 py-2 text-white shadow-2xl lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:w-[30rem] lg:-translate-x-1/2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-black">
              {draftSim.label} {draftSim.ok.size}マス
              {draftSim.bad.size > 0 && <span className="ml-1 text-rose-300">（{draftSim.bad.size}マスは不可）</span>}
              {draft?.noRoad ? <span className="ml-1 text-slate-400">（道路に面していない{draft.noRoad}マスは飛ばします）</span> : null}
              {draftSim.skipped > 0 && <span className="ml-1 text-slate-400">（{draftSim.skipped}マスは{tool === "bulldoze" ? "ドラッグでは撤去しないので" : tool === "reclaim" ? "水辺ではないので" : tool === "rail" ? "すでに線路があるので" : "すでに建物があるので"}飛ばします）</span>}
            </div>
            <div className="tabular text-[11px] font-bold text-slate-300">
              {draftSim.cost >= 0 ? `費用 ${formatYen(draftSim.cost)}` : `返金 +${formatYen(-draftSim.cost)}`}
              {draftSim.bridges > 0 && <span className="ml-1">🌉 {tool === "rail" ? "川の上" : "橋"}{draftSim.bridges}</span>}
              {draftSim.reason && <span className="ml-1 text-rose-300">{draftSim.reason}</span>}
            </div>
            {draftSim.unlinked && <div className="text-[11px] font-bold text-amber-300">⚠️ まだ駅につながっていません（線路の上の、道路に面した空き地か家の場所に駅を置くと電車が走ります）</div>}
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
    title = "建物は最大5段階に育ちます（4段目は「市」、5段目は「メガシティ」で大型プロジェクトの近く）。右下の数字がレベルです。";
    items = (
      <>
        <span>🏠 戸建て → 🏘️ 集合住宅 → 🏢 マンション → 🌇 タワーマンション → 🌆 超高層レジデンス</span>
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
  } else if (overlay === "lines") {
    title = "鉄道とバスの路線図です。線路は駅どうし・地図の端（となり町）とつなぐと電車が走り、駅から4マス以内の車が大きく減ります。バス停は道路で8マス以内のバス停・ターミナル・駅と自動で路線になり、よく効くようになります。";
    items = (
      <>
        <Swatch color="#e11d48">電車が走る路線</Swatch>
        <Swatch color="#94a3b8">駅のない線路</Swatch>
        <Swatch color="#0ea5e9">バス路線（路線ごとに色分け）</Swatch>
        <span>🚫 電車が走っていない駅</span>
      </>
    );
  } else if (overlay === "land") {
    title = "場所ごとの地価（土地の人気）です。公園・学校・お店・駅・水辺・大型施設の近くで上がり、騒音・汚れた空気・渋滞で下がります。地価の高い場所の住宅とお店ほど税収が多くなります（最大±15%）。";
    items = (
      <>
        <Swatch color={landColor(15)}>安い</Swatch>
        <Swatch color={landColor(50)}>ふつう</Swatch>
        <Swatch color={landColor(90)}>とても高い</Swatch>
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

/** 「四角でまとめて」の設定（端末に覚えておく。読めない・書けないときは四角） */
function readZoneRect(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem("pocket-town/zone-rect") !== "off";
  } catch {
    return true;
  }
}
function saveZoneRect(v: boolean) {
  try {
    window.localStorage.setItem("pocket-town/zone-rect", v ? "on" : "off");
  } catch {
    // 保存できなくても、この画面の間は切り替わる
  }
}

/** となりのマスのつながり（上=1, 右=2, 下=4, 左=8）。edge = 地図の外もつながっているとみなす */
function neighborMask(state: GameState, i: number, on: (j: number) => boolean, edge = false): number {
  const { x, y } = toXY(i, state.width);
  let m = 0;
  if (y === 0 ? edge : on(i - state.width)) m |= 1;
  if (x === state.width - 1 ? edge : on(i + 1)) m |= 2;
  if (y === state.height - 1 ? edge : on(i + state.width)) m |= 4;
  if (x === 0 ? edge : on(i - 1)) m |= 8;
  return m;
}

const NO_OVERLAY: { ov?: string; dim: boolean } = { dim: false };

/** 表示モードごとのマスの色（ov）と、暗くするか（dim） */
function tileOverlay(state: GameState, a: CityAnalysis, i: number, overlay: Overlay, covKind: CoverageKind | null, busTiles: Map<number, number>): { ov?: string; dim: boolean } {
  const t = state.tiles[i];
  const b = t.building;
  if (overlay === "lines") {
    // 路線図：線路は路線の色、バスが走る道路は路線の色で薄く、それ以外は暗く
    const lineId = a.rail.lineOf[i];
    if (lineId >= 0) return { ov: `${lineStyle(state, a.rail, lineId).color}${a.rail.lines[lineId].working ? "99" : "55"}`, dim: false };
    const bus = busTiles.get(i) ?? a.busRoutes.routeOf.get(i);
    if (bus !== undefined) return { ov: `${busStyle(a.busRoutes, bus).color}${busTiles.has(i) ? "66" : "aa"}`, dim: false };
    if (a.rail.ride[i] > 0) return { ov: `rgba(225,29,72,${0.08 + a.rail.ride[i] * 0.12})`, dim: false };
    return { dim: true };
  }
  if (t.terrain === "water") return NO_OVERLAY;
  if (overlay === "traffic") return isRoad(b?.type) ? { ov: TRAFFIC_COLORS[a.traffic.level[i]], dim: false } : { dim: true };
  if (overlay === "env") return { ov: scaleColor(a.env[i]), dim: false };
  if (overlay === "land") return { ov: landColor(a.landValue[i]), dim: false };
  if (overlay === "happiness") return b?.type === "residential" ? { ov: scaleColor(a.happiness[i], 0.65), dim: false } : { dim: true };
  if (covKind) {
    const v = a.coverage[covKind][i];
    return v > 0 ? { ov: `rgba(37,99,235,${0.15 + v * 0.4})`, dim: false } : NO_OVERLAY;
  }
  return NO_OVERLAY;
}

/** 建物の右上の印（⛔ 道路なし・⚠️ つながっていない・🚫 電車が来ない） */
function tileBadge(state: GameState, a: CityAnalysis, i: number): "noRoad" | "disconnected" | "noLine" | undefined {
  const b = state.tiles[i].building;
  if (!b || isRoad(b.type)) return undefined;
  const cat = BUILDINGS[b.type].category;
  if (cat === "special" || cat === "rail") return undefined;
  if (!a.net.roadAccess[i]) return "noRoad";
  if (!a.net.connected[i]) return "disconnected";
  if (isStationType(b.type) && !stationWorking(a.rail, i)) return "noLine";
  return undefined;
}

/**
 * 四角の範囲のマス（a と b を対角にした四角）。開発できないマスと、道路に面していない空き地は除く
 * （住宅・お店・工場は道路に面していないと建たないので、四角の内側は自動で飛ばす）。
 */
function rectTiles(state: GameState, a: number, b: number): { tiles: number[]; noRoad: number } {
  const p = toXY(a, state.width);
  const q = toXY(b, state.width);
  const tiles: number[] = [];
  let noRoad = 0;
  for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) {
    for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++) {
      const i = y * state.width + x;
      const t = state.tiles[i];
      if (!t || !isUnlockedTile(state, i) || t.building || t.terrain === "water") continue;
      // 1マスだけを選んだときは、道路がなくても置く（あとで道路を引く人もいる）
      if (a !== b && !neighbors4(i, state.width, state.height).some((j) => isRoad(state.tiles[j].building?.type))) {
        noRoad++;
        continue;
      }
      tiles.push(i);
    }
  }
  return { tiles, noRoad };
}

/**
 * なぞった下書きを、実際に建てた場合の結果として計算する（状態は変えない）。
 * 確定時の applyToolAt と同じルール：すでに建物があるマスは飛ばす、ドラッグでは公共施設を壊さない など。
 */
function simulateStroke(state: GameState, tool: Tool, tiles: number[]) {
  const ok = new Set<number>();
  const bad = new Set<number>();
  if (tool !== "inspect" && tool !== "bulldoze" && tool !== "reclaim" && isZone(tool)) {
    // 住宅・商業・工業は1マスずつ独立なので、状態を複製せずに費用だけ数える（大きな四角でも軽い）
    let money = state.money;
    let skipped = 0;
    let reason: string | undefined;
    for (const i of tiles) {
      if (state.tiles[i]?.building) {
        skipped++;
        continue;
      }
      const c = checkPlacement(money === state.money ? state : { ...state, money }, tool, i);
      if (c.ok) {
        ok.add(i);
        money -= c.cost;
      } else {
        bad.add(i);
        reason ??= c.reason;
      }
    }
    return { ok, bad, skipped, bridges: 0, unlinked: false, cost: state.money - money, reason, label: `${BUILDINGS[tool].emoji[1]} ${BUILDINGS[tool].name}`, emoji: buildingEmoji(tool, 1) };
  }
  let skipped = 0;
  let bridges = 0;
  let cur = state;
  let reason: string | undefined;
  tiles.forEach((i, k) => {
    const painting = k > 0;
    const t = cur.tiles[i];
    if (!t) return;
    let r;
    if (tool === "bulldoze") {
      const b = t.building;
      if ((!b && (painting || !t.track)) || (b && painting && !dragDemolishable(b.type))) {
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
      const existing = t.building;
      if (tool === "rail" && t.track) {
        skipped++;
        return;
      }
      if (existing && !isUpgradeTarget(tool, existing)) {
        skipped++;
        return;
      }
      if ((tool === "rail" || isRoad(tool)) && t.terrain === "water") bridges++;
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
  // 線路：まだ駅につながっていない（電車が走らない）なら知らせる
  let unlinked = false;
  if (tool === "rail" && ok.size > 0) {
    const net = computeRailNetwork(cur);
    unlinked = [...ok].some((i) => { const l = net.lines[net.lineOf[i]]; return !!l && !hasStation(l); });
  }
  return { ok, bad, skipped, bridges, unlinked, cost: state.money - cur.money, reason, label, emoji };
}

type Side = "top" | "right" | "bottom" | "left";
/** 土地を買い足して地図の端から離れても、この距離までは線路を延ばして描く */
const RAIL_MAX_GAP = 4;

/** 新幹線駅（2×2、(x,y) が左上）から線路が出ていく、いちばん近い地図の端 */
function railSideOf(x: number, y: number, w: number, h: number): Side | undefined {
  const d: Array<[Side, number]> = [
    ["left", x],
    ["right", w - 1 - (x + 1)],
    ["top", y],
    ["bottom", h - 1 - (y + 1)],
  ];
  const [side, gap] = d.reduce((a, b) => (b[1] < a[1] ? b : a));
  return gap <= RAIL_MAX_GAP ? side : undefined;
}

/** 駅と地図の端のあいだのマスに描く線路（マスのどの辺に沿って描くか） */
function railTilesFor(state: { tiles: Array<{ building: { type: string } | null }>; width: number; height: number }): Map<number, Side> {
  const out = new Map<number, Side>();
  const w = state.width;
  state.tiles.forEach((t, i) => {
    if (t.building?.type !== "bulletTrain") return;
    const x = i % w;
    const y = Math.floor(i / w);
    const side = railSideOf(x, y, w, state.height);
    if (side === "left") for (let k = 0; k < x; k++) out.set(y * w + k, "bottom").set((y + 1) * w + k, "top");
    if (side === "right") for (let k = x + 2; k < w; k++) out.set(y * w + k, "bottom").set((y + 1) * w + k, "top");
    if (side === "top") for (let k = 0; k < y; k++) out.set(k * w + x, "right").set(k * w + x + 1, "left");
    if (side === "bottom") for (let k = y + 2; k < state.height; k++) out.set(k * w + x, "right").set(k * w + x + 1, "left");
  });
  return out;
}

type TouchGesture =
  | { kind: "none" }
  | { kind: "tap"; x: number; y: number; tile: number; wy: number; sy: number }
  | { kind: "draw"; last: number; id: number; start: number; moved?: boolean }
  | { kind: "pan"; x: number; y: number; sl: number; st: number; wy: number; d0: number; s0: number; ox: number; oy: number; k: number; mx: number; my: number };
