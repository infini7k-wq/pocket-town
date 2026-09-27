"use client";

import { useState, useSyncExternalStore } from "react";
import {
  HALL_KEY,
  SAVE_SLOTS,
  SCENARIOS,
  clearSave,
  getActiveSlot,
  slotKey,
  transferTargets,
  type GameState,
  TRAITS,
  TRAIT_IDS,
  TRAIT_PROJECTS,
  TENDENCIES,
  TENDENCY_IDS,
  isHardCombo,
  townStory,
  type TendencyId,
  type TraitId,
  BUILDINGS,
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

/** 3つの枠の保存データ（変化を検知するため、文字列をつないだものをスナップショットにする） */
const SEP = "\u0000";
function readSlotsRaw(): string {
  return Array.from({ length: SAVE_SLOTS }, (_, k) => readKey(slotKey(k + 1)) ?? "").join(SEP);
}

interface SlotView {
  slot: number;
  save: GameState | null;
  unreadable: boolean;
}

export function StartScreen() {
  const { newGame, continueGame } = useGame();
  const [, setVersion] = useState(0);
  const slotsRaw = useSyncExternalStore(subscribe, readSlotsRaw, () => "");
  const hallRaw = useSyncExternalStore(subscribe, () => readKey(HALL_KEY), () => null);
  const slots: SlotView[] = slotsRaw.split(SEP).map((raw, k) => {
    const save = raw ? parseSave(raw) : null;
    return { slot: k + 1, save, unreadable: !!raw && !save };
  });
  const hasAnySave = slots.some((x) => x.save || x.unreadable);
  const hall = parseHall(hallRaw);
  const stars = bestStars(hall);
  const [showNew, setShowNew] = useState(false);
  // 新しい町を保存する枠（最初は空いている枠、なければ最後に遊んだ枠）
  const [target, setTarget] = useState(() => slots.find((x) => !x.save && !x.unreadable)?.slot ?? getActiveSlot());
  const targetSave = slots[target - 1]?.save ?? null;
  const startNew = (slot: number) => {
    setTarget(slot);
    setShowNew(true);
  };
  const remove = (x: SlotView) => {
    const label = x.save ? `「${x.save.townName}」（${formatDate(x.save.turn)}）` : "読み込めないデータ";
    if (!window.confirm(`枠${x.slot}の${label}を削除します。元に戻せません。よろしいですか？\n（殿堂の記録は残ります）`)) return;
    clearSave(x.slot);
    setVersion((v) => v + 1);
  };
  const [name, setName] = useState("");
  const [seed, setSeed] = useState(() => randomSeed());
  const [mode, setMode] = useState<Mode>("free");
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = mode === "challenge" ? getScenario(scenarioId) : undefined;
  // 町のタイプ：自分で選ぶか、おまかせ（ランダム）
  const [traitChoice, setTraitChoice] = useState<TraitId | "random">("random");
  const [tendencyChoice, setTendencyChoice] = useState<TendencyId | null>(null);
  // おまかせで「別の町を探す」ときは、4つのタイプを一巡するまで同じタイプを出さない
  const [seenTraits, setSeenTraits] = useState<TraitId[]>([]);
  const choice = { trait: traitChoice === "random" ? undefined : traitChoice, tendency: tendencyChoice ?? undefined };
  const preview = previewTown(seed, scenario?.id, choice);
  const trait = TRAITS[preview.profile.trait];
  const tendency = TENDENCIES[preview.profile.tendency];
  const forcedTrait = scenario?.trait;
  const forcedTendency = scenario?.tendency;
  const reroll = () => {
    setTendencyChoice(null);
    if (traitChoice !== "random" || forcedTrait) {
      setSeed(randomSeed());
      return;
    }
    const seen = seenTraits.length + 1 >= TRAIT_IDS.length ? [] : [...seenTraits, preview.profile.trait];
    let next = randomSeed();
    for (let k = 0; k < 40; k++) {
      const t = previewTown(next).profile.trait;
      if (!seen.includes(t) && t !== preview.profile.trait) break;
      next = randomSeed();
    }
    setSeenTraits(seen);
    setSeed(next);
  };
  const cycleTendency = () => {
    const idx = TENDENCY_IDS.indexOf(preview.profile.tendency);
    setTendencyChoice(TENDENCY_IDS[(idx + 1) % TENDENCY_IDS.length]);
  };

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
          {hasAnySave && !showNew && (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-black text-slate-700">💾 セーブデータ</h2>
                <span className="text-[11px] font-bold text-slate-400">{SAVE_SLOTS}つまで保存できます</span>
              </div>
              <ul className="space-y-2">
                {slots.map((x) => (
                  <li key={x.slot}>
                    {x.save ? (
                      <div className="flex items-stretch gap-1.5">
                        <button
                          type="button"
                          onClick={() => continueGame(x.slot)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-sky-50 p-3 text-left ring-1 ring-sky-200 transition hover:bg-sky-100 active:scale-[0.99]"
                        >
                          <span className="text-3xl" aria-hidden>
                            {getRank(x.save.rank).emoji}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-bold text-blue-600">
                              枠{x.slot} ・ 続きから{x.save.scenario ? `（🎯${getScenario(x.save.scenario.id)?.title ?? ""}）` : ""}
                            </span>
                            <span className="block truncate text-base font-black text-slate-800">{x.save.townName}</span>
                            <span className="tabular block truncate text-[11px] font-bold text-slate-500">
                              {formatDate(x.save.turn)} ・ 人口 {formatNumber(population(x.save))}人 ・ {formatYen(x.save.money, { compact: true })}
                              {x.save.gameOver && " ・ 財政破綻"}
                            </span>
                          </span>
                          <span className="text-lg text-blue-600" aria-hidden>
                            ▶
                          </span>
                        </button>
                        <button type="button" onClick={() => remove(x)} className="shrink-0 rounded-2xl px-2.5 text-lg text-slate-300 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-500" aria-label={`枠${x.slot}を削除`}>
                          🗑️
                        </button>
                      </div>
                    ) : x.unreadable ? (
                      <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-[11px] font-bold leading-relaxed text-amber-800 ring-1 ring-amber-200">
                        <span className="min-w-0 flex-1">⚠️ 枠{x.slot}：読み込めないデータです（新しいバージョンで保存されたか、壊れている可能性）。ここで新しく始めても、元のデータは別の場所に退避されます。</span>
                        <button type="button" onClick={() => startNew(x.slot)} className="shrink-0 rounded-full bg-white px-2.5 py-1 font-black text-amber-800 ring-1 ring-amber-300">
                          新しく始める
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startNew(x.slot)}
                        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-3 text-left text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <span className="text-2xl" aria-hidden>
                          ＋
                        </span>
                        <span className="text-sm font-black">枠{x.slot}：空き（新しい町をつくる）</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {slots.every((x) => x.save || x.unreadable) && (
                <Button size="lg" className="w-full" onClick={() => startNew(getActiveSlot())}>
                  新しい町をつくる（どれかの枠に上書き）
                </Button>
              )}
            </>
          )}

          {(!hasAnySave || showNew) && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                // 選んだ枠にデータがあるときは、上書きしてよいか確認する
                if (targetSave && !window.confirm(`枠${target}の町「${targetSave.townName}」（${formatDate(targetSave.turn)}）は上書きされます。\n（殿堂の記録は残ります）\n新しい町を始めますか？`)) return;
                newGame(name, seed, scenario?.id, target, choice);
              }}
            >
              {/* 保存する枠 */}
              {hasAnySave && (
                <div>
                  <div className="text-xs font-black text-slate-500">保存する枠</div>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {slots.map((x) => (
                      <button
                        key={x.slot}
                        type="button"
                        onClick={() => setTarget(x.slot)}
                        aria-pressed={target === x.slot}
                        className={cx("rounded-xl px-2 py-1.5 text-left ring-1 transition", target === x.slot ? "bg-blue-50 ring-2 ring-blue-400" : "bg-white ring-slate-200")}
                      >
                        <div className="text-[10px] font-bold text-slate-400">枠{x.slot}</div>
                        <div className={cx("truncate text-xs font-black", x.save ? "text-slate-700" : "text-emerald-600")}>{x.save ? x.save.townName : x.unreadable ? "読めないデータ" : "空き"}</div>
                      </button>
                    ))}
                  </div>
                  {targetSave && <p className="mt-1 text-[11px] font-bold text-rose-600">⚠️ 枠{target}の「{targetSave.townName}」は上書きされます</p>}
                </div>
              )}

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
                  <span className="text-xs font-bold text-slate-500">町のタイプ</span>
                  <button type="button" onClick={reroll} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-600 shadow-sm ring-1 ring-slate-900/5 hover:bg-blue-50">
                    🎲 別の町を探す
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-1" role="radiogroup" aria-label="町のタイプ">
                  {(["random", ...TRAIT_IDS] as const).map((id) => {
                    const selected = forcedTrait ? id === forcedTrait : traitChoice === id;
                    const disabled = !!forcedTrait && id !== forcedTrait;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => {
                          setTraitChoice(id);
                          setTendencyChoice(null);
                        }}
                        className={cx(
                          "flex flex-col items-center rounded-xl px-0.5 py-1.5 text-[10px] font-black ring-1 transition disabled:opacity-35",
                          selected ? "bg-white text-slate-800 ring-2 ring-blue-400" : "bg-white/60 text-slate-500 ring-slate-200 hover:bg-white",
                        )}
                      >
                        <span className="text-xl leading-none" aria-hidden>
                          {id === "random" ? "🎲" : TRAITS[id].emoji}
                        </span>
                        <span className="mt-0.5">{id === "random" ? "おまかせ" : TRAITS[id].short}</span>
                      </button>
                    );
                  })}
                </div>
                {forcedTrait && <p className="mt-1 text-[11px] font-bold text-rose-600">このチャレンジは「{TRAITS[forcedTrait].name}」で決まっています</p>}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-4xl" aria-hidden>
                    {trait.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="text-lg font-black text-slate-800">{trait.name}</div>
                    <div className="text-sm font-black leading-snug text-emerald-800">「{townStory(preview.profile.trait, preview.profile.tendency)}」</div>
                    <div className="mt-0.5 text-xs font-bold leading-snug text-slate-500">{trait.description}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/80 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 text-xs font-bold text-slate-600">
                    {tendency.emoji} 住民：<span className="font-black text-slate-800">{tendency.name}</span>
                    <span className="ml-1 text-[11px] text-slate-400">（{tendency.description}）</span>
                    {isHardCombo(preview.profile.trait, preview.profile.tendency) && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-black text-rose-700">⚠️ むずかしめ</span>}
                  </span>
                  {!forcedTendency && (
                    <button type="button" onClick={cycleTendency} className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-200">
                      👥 住民を変える
                    </button>
                  )}
                </div>
                <div className="mt-2 text-[11px] font-black text-amber-700">
                  ✨ この町だけの施設：{BUILDINGS[TRAIT_PROJECTS[preview.profile.trait]].emoji[1]} {BUILDINGS[TRAIT_PROJECTS[preview.profile.trait]].name}（町になると建設できる）
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {!scenario && (
                    <div className="rounded-lg bg-white/80 px-2 py-1">
                      <div className="text-[10px] font-bold text-slate-400">初期資金</div>
                      <div className="tabular text-xs font-black text-slate-700">{formatYen(preview.money)}</div>
                    </div>
                  )}
                  {profileSummary(preview.profile)
                    .filter((p) => p.label !== "住民")
                    .map((p) => (
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
              {hasAnySave && (
                <button type="button" onClick={() => setShowNew(false)} className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600">
                  もどる
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
        <TransferSection hasData={slots.some((x) => x.save) || hall.length > 0} />
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
    const saves = Array.from({ length: SAVE_SLOTS }, (_, k) => parseSave(readKey(slotKey(k + 1))));
    const save = saves[getActiveSlot() - 1] ?? saves.find(Boolean) ?? null;
    const hall = parseHall(readKey(HALL_KEY));
    const c = await exportTransferCode({ save, saves, hall });
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
    // 同じ番号の枠に入るので、中身のある枠は上書きされる
    const overwritten = transferTargets(bundle).filter((slot) => readKey(slotKey(slot)));
    if (overwritten.length > 0 && !window.confirm(`この端末の枠${overwritten.join("・枠")}のセーブは上書きされます。読み込みますか？`)) return;
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
          <p className="leading-relaxed text-slate-500">セーブはブラウザ（とURL）ごとに保存されます。別の端末や新しいURLで続きを遊ぶときは、元の場所で「書き出す」→ 移したい先で「読み込む」をしてください。3つの枠のセーブ（同じ番号の枠に入ります）と殿堂の記録がまとめて移ります。</p>
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
