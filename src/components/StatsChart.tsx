"use client";

// 統計グラフ：人口・資金・収支・満足度・支持率・混雑の推移を、期間を切り替えて見る（SVG・外部ライブラリなし）

import { useMemo, useState } from "react";
import { formatDate, formatNumber, formatYen, yearOf, type HistoryPoint } from "@/game";
import { cx } from "./ui";

type Metric = "population" | "money" | "net" | "happiness" | "approval" | "congestion";
type Range = "5y" | "20y" | "all";

const METRICS: Array<{ id: Metric; label: string; color: string; unit: (v: number) => string; get: (p: HistoryPoint) => number | undefined }> = [
  { id: "population", label: "人口", color: "#2563eb", unit: (v) => `${formatNumber(v)}人`, get: (p) => p.population },
  { id: "money", label: "資金", color: "#7c3aed", unit: (v) => formatYen(v, { compact: true }), get: (p) => p.money },
  { id: "net", label: "月の収支", color: "#059669", unit: (v) => formatYen(v, { sign: true, compact: true }), get: (p) => p.net },
  { id: "happiness", label: "満足度", color: "#f59e0b", unit: (v) => `${Math.round(v)}%`, get: (p) => p.happiness },
  { id: "approval", label: "支持率", color: "#e11d48", unit: (v) => `${Math.round(v)}%`, get: (p) => p.approval },
  { id: "congestion", label: "混雑", color: "#64748b", unit: (v) => `${Math.round(v)}%`, get: (p) => p.congestion },
];

const RANGES: Array<{ id: Range; label: string; months: number }> = [
  { id: "5y", label: "5年", months: 60 },
  { id: "20y", label: "20年", months: 240 },
  { id: "all", label: "全部", months: Infinity },
];

const W = 300;
const H = 120;
const PAD = { l: 4, r: 4, t: 8, b: 16 };

export function StatsChart({ history }: { history: HistoryPoint[] }) {
  const [metric, setMetric] = useState<Metric>("population");
  const [range, setRange] = useState<Range>("5y");
  const [hover, setHover] = useState<number | null>(null);
  const def = METRICS.find((m) => m.id === metric)!;

  const points = useMemo(() => {
    const last = history.at(-1)?.turn ?? 0;
    const months = RANGES.find((r) => r.id === range)!.months;
    return history.filter((p) => last - p.turn < months).map((p) => ({ turn: p.turn, v: def.get(p) }));
  }, [history, range, def]);

  const valid = points.filter((p): p is { turn: number; v: number } => p.v !== undefined);
  if (valid.length < 2) {
    return (
      <div>
        <Chips metric={metric} setMetric={setMetric} range={range} setRange={setRange} />
        <p className="py-6 text-center text-[11px] font-bold text-slate-400">{metric === "approval" ? "支持率の記録はこれからたまっていきます" : "記録がまだ少ないので、月を進めるとグラフが出ます"}</p>
      </div>
    );
  }

  const t0 = points[0].turn;
  const t1 = points.at(-1)!.turn;
  const vs = valid.map((p) => p.v);
  const min = Math.min(...vs, metric === "money" || metric === "net" ? 0 : Infinity);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const x = (turn: number) => PAD.l + ((turn - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  // 記録がない区間（古いセーブの支持率など）は線を途切れさせる
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p.v === undefined) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(p.turn).toFixed(1)},${y(p.v).toFixed(1)}`;
    pen = true;
  }
  // 年の目盛り（3〜4本）
  const years = Math.max(1, Math.round((t1 - t0) / 12));
  const step = Math.max(1, Math.ceil(years / 4));
  const ticks: number[] = [];
  for (let yr = yearOf(t0); yr <= yearOf(t1); yr += step) ticks.push((yr - 1) * 12);
  const sel = hover !== null ? valid[hover] : valid.at(-1)!;
  const peak = valid.reduce((a, b) => (b.v > a.v ? b : a));
  const summary = `${def.label}：${formatDate(valid[0].turn)} ${def.unit(valid[0].v)} → ${formatDate(valid.at(-1)!.turn)} ${def.unit(valid.at(-1)!.v)}（最高 ${def.unit(peak.v)}）`;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    valid.forEach((p, k) => {
      if (Math.abs(x(p.turn) - px) < Math.abs(x(valid[best].turn) - px)) best = k;
    });
    setHover(best);
  };

  return (
    <div>
      <Chips metric={metric} setMetric={setMetric} range={range} setRange={setRange} />
      <div className="mt-1 flex items-baseline justify-between text-[11px] font-bold">
        <span className="text-slate-500">{formatDate(sel.turn)}</span>
        <span className="tabular text-sm font-black" style={{ color: def.color }}>
          {def.unit(sel.v)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full touch-pan-y"
        role="img"
        aria-label={summary}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        {min < 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="#e11d48" strokeDasharray="4 4" strokeWidth={1} />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} stroke="#e2e8f0" strokeWidth={1} />
            <text x={x(t)} y={H - 4} fontSize={9} textAnchor={x(t) < 24 ? "start" : x(t) > W - 24 ? "end" : "middle"} fill="#94a3b8" fontWeight={700}>
              {yearOf(t)}年目
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={def.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(sel.turn)} x2={x(sel.turn)} y1={PAD.t} y2={H - PAD.b} stroke={def.color} strokeOpacity={0.35} strokeWidth={1} />
        <circle cx={x(sel.turn)} cy={y(sel.v)} r={3.5} fill={def.color} />
      </svg>
      <div className="flex justify-between text-[10px] font-bold text-slate-400">
        <span>最低 {def.unit(Math.min(...vs))}</span>
        <span>最高 {def.unit(max)}</span>
      </div>
    </div>
  );
}

function Chips({ metric, setMetric, range, setRange }: { metric: Metric; setMetric: (m: Metric) => void; range: Range; setRange: (r: Range) => void }) {
  return (
    <div className="space-y-1">
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {METRICS.map((m) => (
          <button key={m.id} type="button" onClick={() => setMetric(m.id)} aria-pressed={metric === m.id} className={cx("min-h-8 shrink-0 rounded-full px-2.5 text-[11px] font-black", metric === m.id ? "text-white" : "bg-slate-100 text-slate-500")} style={metric === m.id ? { background: m.color } : undefined}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-1">
        {RANGES.map((r) => (
          <button key={r.id} type="button" onClick={() => setRange(r.id)} aria-pressed={range === r.id} className={cx("min-h-7 rounded-full px-2.5 text-[10px] font-black", range === r.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500")}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
