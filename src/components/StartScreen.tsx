"use client";

import { useState, useSyncExternalStore } from "react";
import {
  HALL_KEY,
  SAVE_KEY,
  SCENARIOS,
  TRAITS,
  bestStars,
  exportTransferCode,
  formatDate,
  importTransfer,
  parseTransferCode,
  formatNumber,
  formatYen,
  getRank,
  getScenario,
  parseHall,
  parseSave,
  population,
  previewTown,
  profileSummary,
  randomSeed,
} from "@/game";
import { useGame } from "./GameProvider";
import { Button, cx } from "./ui";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

const SKYLINE = ["🏠", "🌳", "🏪", "🏘️", "🏫", "🌳", "🏢", "🏥", "🏠", "🌲"];

type Mode = "free" | "challenge";

export function StartScreen() {
  const { newGame, continueGame } = useGame();
  const raw = useSyncExternalStore(subscribe, () => readKey(SAVE_KEY), () => null);
  const hallRaw = useSyncExternalStore(subscribe, () => readKey(HALL_KEY), () => null);
  const saved = parseSave(raw);
  const hall = parseHall(hallRaw);
  const stars = bestStars(hall);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [seed, setSeed] = useState(() => randomSeed());
  const [mode, setMode] = useState<Mode>("free");
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = mode === "challenge" ? getScenario(scenarioId) : undefined;
  const preview = previewTown(seed, scenario?.id);
  const trait = TRAITS[preview.profile.trait];

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-emerald-300/60 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute left-[6%] top-[10%] h-16 w-40 rounded-full bg-white/80 blur-xl" aria-hidden />
      <div className="pointer-events-none absolute right-[8%] top-[22%] h-20 w-56 rounded-full bg-white/70 blur-xl" aria-hidden />

      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <div className="text-center">
          <div className="flex justify-center gap-0.5 text-3xl sm:text-4xl" aria-hidden>
            {SKYLINE.map((e, i) => (
              <span key={i} className="animate-bounce-soft inline-block" style={{ animationDelay: `${i * 0.15}s` }}>
                {e}
              </span>
            ))}
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-800 sm:text-5xl">ポケットタウン</h1>
          <p className="mt-1 text-sm font-bold text-slate-500">小さな町を、自分の判断で育てよう</p>
        </div>

        <div className="mt-8 space-y-3 rounded-3xl bg-white/95 p-5 shadow-xl ring-1 ring-slate-900/5">
          {saved && !showNew && (
            <>
              <button
                type="button"
                onClick={continueGame}
                className="flex w-full items-center gap-3 rounded-2xl bg-sky-50 p-4 text-left ring-1 ring-sky-200 transition hover:bg-sky-100 active:scale-[0.99]"
              >
                <span className="text-4xl" aria-hidden>
                  {getRank(saved.rank).emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-blue-600">続きから{saved.scenario ? `（チャレンジ：${getScenario(saved.scenario.id)?.title ?? ""}）` : ""}</span>
                  <span className="block truncate text-lg font-black text-slate-800">{saved.townName}</span>
                  <span className="tabular block text-xs font-bold text-slate-500">
                    {formatDate(saved.turn)} ・ 人口 {formatNumber(population(saved))}人 ・ {formatYen(saved.money, { compact: true })}
                    {saved.gameOver && " ・ 財政破綻"}
                  </span>
                </span>
                <span className="text-xl text-blue-600" aria-hidden>
                  ▶
                </span>
              </button>
              <Button size="lg" className="w-full" onClick={() => setShowNew(true)}>
                新しい町をつくる
              </Button>
            </>
          )}

          {!saved && raw && (
            <p className="rounded-2xl bg-amber-50 p-3 text-[11px] font-bold leading-relaxed text-amber-800">
              ⚠️ 保存データを読み込めませんでした（新しいバージョンで保存されたか、データが壊れている可能性があります）。新しい町を始めても、元のデータは別の場所に退避されます。
            </p>
          )}
          {(!saved || showNew) && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                // 続きのデータがあるときは、上書きしてよいか確認する
                if (saved && !window.confirm(`いまの町「${saved.townName}」（${formatDate(saved.turn)}）のセーブは上書きされます。\n（殿堂の記録は残ります）\n新しい町を始めますか？`)) return;
                newGame(name, seed, scenario?.id);
              }}
            >
              {/* 遊び方の選択 */}
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
                {(
                  [
                    ["free", "🏘️ フリープレイ"],
                    ["challenge", "🎯 チャレンジ"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cx("rounded-xl py-2 text-sm font-black transition", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "challenge" && (
                <div className="space-y-1.5">
                  {SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setScenarioId(sc.id)}
                      aria-pressed={scenarioId === sc.id}
                      className={cx(
                        "w-full rounded-2xl p-3 text-left ring-1 transition",
                        scenarioId === sc.id ? "bg-rose-50 ring-2 ring-rose-400" : "bg-white ring-slate-200 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-slate-800">
                          {sc.emoji} {sc.title}
                        </span>
                        <span className="shrink-0 text-sm font-black text-amber-500" aria-label={`最高 ${stars[sc.id] ?? 0} つ星`}>
                          {"★".repeat(stars[sc.id] ?? 0)}
                          <span className="text-slate-200">{"★".repeat(3 - (stars[sc.id] ?? 0))}</span>
                        </span>
                      </div>
                      {scenarioId === sc.id && (
                        <>
                          <p className="mt-1 text-[11px] font-bold leading-snug text-slate-500">{sc.story}</p>
                          <p className="mt-1 text-[11px] font-black text-rose-700">🎯 {sc.goal}</p>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <label className="block">
                <span className="text-sm font-black text-slate-700">町の名前</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={16}
                  placeholder="例：ひだまり町"
                  className="mt-1 h-12 w-full rounded-xl border-2 border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-400"
                />
              </label>

              <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-emerald-50 p-4 ring-1 ring-slate-900/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">この町の個性</span>
                  <button type="button" onClick={() => setSeed(randomSeed())} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-600 shadow-sm ring-1 ring-slate-900/5 hover:bg-blue-50">
                    🎲 別の町を探す
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-4xl" aria-hidden>
                    {trait.emoji}
                  </span>
                  <div>
                    <div className="text-lg font-black text-slate-800">{trait.name}</div>
                    <div className="text-xs font-bold leading-snug text-slate-500">{trait.description}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {!scenario && (
                    <div className="rounded-lg bg-white/80 px-2 py-1">
                      <div className="text-[10px] font-bold text-slate-400">初期資金</div>
                      <div className="tabular text-xs font-black text-slate-700">{formatYen(preview.money)}</div>
                    </div>
                  )}
                  {profileSummary(preview.profile).map((p) => (
                    <div key={p.label} className="rounded-lg bg-white/80 px-2 py-1">
                      <div className="text-[10px] font-bold text-slate-400">{p.label}</div>
                      <div className="text-xs font-black text-slate-700">{p.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Button type="submit" variant="go" size="lg" className="w-full">
                {scenario ? `🎯 「${scenario.title}」に挑戦` : "🏘️ この町ではじめる"}
              </Button>
              {saved && (
                <button type="button" onClick={() => setShowNew(false)} className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600">
                  もどる（続きのデータは新しく始めると上書きされます）
                </button>
              )}
            </form>
          )}
        </div>

        {hall.length > 0 && (
          <section className="mt-4 rounded-3xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-900/5">
            <h2 className="text-sm font-black text-slate-700">🏛️ 殿堂（思い出の街）</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {hall.slice(0, 8).map((h) => (
                <li key={h.gameId} className="flex items-center gap-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-base font-black text-white">{h.grade}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-800">
                      {getRank(h.rank).emoji} {h.townName}
                      {h.scenarioId && (
                        <span className="ml-1 text-[11px] font-bold text-rose-600">
                          🎯{getScenario(h.scenarioId)?.title} {"★".repeat(h.stars ?? 0)}
                        </span>
                      )}
                    </div>
                    <div className="tabular truncate text-[11px] font-bold text-slate-500">
                      {Math.ceil(h.turn / 12)}年 ・ 最大人口 {formatNumber(h.peakPopulation)}人 ・ {h.score}点 ・ {h.style}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <TransferSection hasData={!!raw || hall.length > 0} />
        <p className="mt-4 text-center text-[11px] font-bold text-slate-400">データはこのブラウザに自動保存されます</p>
      </div>
    </main>
  );
}

/** セーブデータの引っ越し：別の URL・別の端末に、セーブと殿堂を移す */
function TransferSection({ hasData }: { hasData: boolean }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const makeCode = async () => {
    const save = parseSave(readKey(SAVE_KEY));
    const hall = parseHall(readKey(HALL_KEY));
    const c = await exportTransferCode({ save, hall });
    setCode(c);
    try {
      await navigator.clipboard.writeText(c);
      setMessage({ tone: "good", text: "コピーしました。移したい先のタイトル画面で「読み込む」に貼り付けてください。" });
    } catch {
      setMessage({ tone: "good", text: "下の文字をすべて選択してコピーしてください。" });
    }
  };

  const load = async () => {
    const bundle = await parseTransferCode(input);
    if (!bundle) {
      setMessage({ tone: "bad", text: "読み込めませんでした。コピーした文字を最後まで貼り付けてください。" });
      return;
    }
    if (bundle.save && parseSave(readKey(SAVE_KEY)) && !window.confirm("この端末の今のセーブは上書きされます。読み込みますか？")) return;
    importTransfer(bundle);
    // タイトル画面の表示を更新する
    window.location.reload();
  };

  return (
    <section className="mt-4 rounded-3xl bg-white/80 p-4 shadow ring-1 ring-slate-900/5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span className="text-sm font-black text-slate-700">📦 セーブデータの引っ越し</span>
        <span className="text-xs font-bold text-slate-400">{open ? "閉じる" : "別の端末・URLへ移す"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs font-bold text-slate-600">
          <p className="leading-relaxed text-slate-500">セーブはブラウザ（とURL）ごとに保存されます。別の端末や新しいURLで続きを遊ぶときは、元の場所で「書き出す」→ 移したい先で「読み込む」をしてください。殿堂の記録も一緒に移ります。</p>
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="font-black text-slate-700">① 元の場所で書き出す</div>
            <Button size="sm" className="mt-2 w-full" onClick={makeCode} disabled={!hasData}>
              📤 書き出してコピー
            </Button>
            {code && <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()} className="mt-2 h-20 w-full rounded-xl border border-slate-200 p-2 font-mono text-[10px]" aria-label="書き出したセーブデータ" />}
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="font-black text-slate-700">② 移したい先で読み込む</div>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="PT2: で始まる文字を貼り付け" className="mt-2 h-20 w-full rounded-xl border border-slate-200 p-2 font-mono text-[10px]" aria-label="読み込むセーブデータ" />
            <Button size="sm" variant="primary" className="mt-2 w-full" onClick={load} disabled={!input.trim()}>
              📥 読み込む
            </Button>
          </div>
          {message && <p className={cx("rounded-xl p-2", message.tone === "good" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{message.text}</p>}
        </div>
      )}
    </section>
  );
}
