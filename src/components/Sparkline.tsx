"use client";

/** 小さな折れ線グラフ（SVG・外部ライブラリなし） */
export function Sparkline({ values, color = "#2563eb", height = 48 }: { values: number[]; color?: string; height?: number }) {
  const data = values.slice(-36);
  if (data.length < 2) return null;
  const w = 300;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 1);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 4 - ((v - min) / span) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = height - 4 - ((0 - min) / span) * (height - 8);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-12 w-full" preserveAspectRatio="none" role="img" aria-label="推移グラフ">
      {min < 0 && <line x1={0} x2={w} y1={zeroY} y2={zeroY} stroke="#e11d48" strokeDasharray="4 4" strokeWidth={1} />}
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill={color} />
    </svg>
  );
}
