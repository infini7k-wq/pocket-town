"use client";

// 天気：日付の横のチップ（タップで影響と来月の予報）と、地図に重ねる雨・雪などの演出

import { useEffect, useMemo, useRef, useState } from "react";
import { WEATHER_DEFS, describeEffects, formatDate, seasonOf, weatherAt, weatherLabel, weatherModifiers, type Season, type WeatherId } from "@/game";
import { useCity } from "./GameProvider";
import { cx } from "./ui";

export function WeatherChip({ className }: { className?: string }) {
  const { state, analysis } = useCity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const w = weatherLabel(state);
  const effects = weatherModifiers(state).flatMap((m) => describeEffects(m.effects));
  const next = WEATHER_DEFS[weatherAt(state, state.turn + 1)];
  const snow = analysis.budget.expense.snow ?? 0;

  // 外側をタップしたら閉じる
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`天気：${w.name}。タップで影響を見る`}
        className={cx("tabular flex min-h-10 items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-xs font-bold text-slate-600", className)}
      >
        <span aria-hidden>{w.emoji}</span>
        {formatDate(state.turn)}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-2xl bg-white p-3 text-left shadow-xl ring-1 ring-slate-900/10">
          <div className="text-sm font-black text-slate-800">
            {w.emoji} 今月の天気：{w.name}
          </div>
          <div className="mt-1 text-[11px] font-bold leading-relaxed text-slate-600">{effects.length > 0 ? effects.join("・") : "特に影響はない"}</div>
          {snow > 0 && <div className="mt-0.5 text-[11px] font-bold text-rose-600">除雪費 −¥{snow.toLocaleString("ja-JP")}（今月）</div>}
          <div className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] font-bold text-slate-500">
            来月の予報：{next.emoji} {next.name}
          </div>
        </div>
      )}
    </div>
  );
}

/** 地図に重ねる天気の色と、雨・雪・花びらなどの粒（動きを減らす設定では粒を出さない） */
export function WeatherLayer({ season, weather, hidden }: { season: Season; weather: WeatherId; hidden: boolean }) {
  const particles = useMemo(() => {
    const kind = weather === "snow" || weather === "heavySnow" ? "snow" : weather === "rain" || weather === "longRain" || weather === "typhoon" ? "rain" : season === "spring" && (weather === "sunny" || weather === "cloudy") ? "petal" : season === "autumn" && weather === "sunny" ? "leaf" : null;
    if (!kind) return [];
    const n = kind === "snow" ? (weather === "heavySnow" ? 22 : 14) : kind === "rain" ? (weather === "typhoon" ? 18 : 12) : kind === "petal" ? 8 : 6;
    // 位置と速さは決まった値で（再描画のたびに変わらないように）
    return Array.from({ length: n }, (_, k) => ({ kind, left: (k * 37) % 100, delay: ((k * 53) % 40) / 10, duration: kind === "rain" ? 0.7 + ((k * 7) % 5) / 10 : 5 + ((k * 13) % 40) / 10 }));
  }, [season, weather]);
  if (hidden) return null;
  const tint = weather === "typhoon" ? "rgba(30,41,59,.16)" : weather === "rain" || weather === "longRain" ? "rgba(71,85,105,.10)" : weather === "snow" || weather === "heavySnow" ? "rgba(255,255,255,.10)" : weather === "cloudy" ? "rgba(71,85,105,.06)" : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden rounded-2xl" style={{ contain: "strict" }} aria-hidden>
      {tint && <div className="absolute inset-0" style={{ background: tint }} />}
      {weather === "heat" && <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 90% 0%, rgba(251,146,60,.16), transparent 60%)" }} />}
      <div className="wx-particles absolute inset-0">
        {particles.map((p, k) => (
          <span
            key={k}
            className={cx("absolute top-0 block", p.kind === "rain" ? "wx-rain" : "wx-fall")}
            style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
          >
            {p.kind === "petal" ? "🌸" : p.kind === "leaf" ? "🍁" : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export function seasonOfState(turn: number): Season {
  return seasonOf(turn);
}
