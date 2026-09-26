"use client";

import { cityScore, describeEffects, describePendingEvent, formatDate, formatNumber, formatYen, getEra, getRank, getScenario, goalsAchieved, unlocksForRank } from "@/game";
import { useCity, useGame } from "./GameProvider";
import { Button, Modal, cx } from "./ui";

const TONE_HEADER = {
  good: "from-emerald-400 to-teal-500",
  bad: "from-rose-400 to-red-500",
  neutral: "from-sky-400 to-indigo-500",
};

export function EventModal() {
  const { state, analysis } = useCity();
  const { chooseEventOption, focusTile, rankUp, eraShift, scenarioResult } = useGame();
  const view = describePendingEvent(state, analysis);
  if (!view || state.gameOver || rankUp || eraShift || scenarioResult) return null;
  return (
    <Modal label={view.def.title}>
      <div className={cx("bg-gradient-to-br px-6 pb-5 pt-6 text-white", TONE_HEADER[view.def.tone])}>
        <div className="text-[11px] font-bold text-white/80">📰 {formatDate(state.turn - 1)} のできごと</div>
        <div className="mt-2 flex items-center gap-3">
          <span className="animate-bounce-soft text-5xl" aria-hidden>
            {view.def.emoji}
          </span>
          <h2 className="text-xl font-black leading-snug">{view.def.title}</h2>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-sm font-bold leading-relaxed text-slate-700">{view.message}</p>
        {view.tile !== undefined && (
          <button type="button" onClick={() => focusTile(view.tile!)} className="text-xs font-bold text-blue-600 hover:underline">
            📍 対象の場所を地図で見る
          </button>
        )}
        <div className="text-xs font-bold text-slate-500">どうしますか？</div>
        <div className="space-y-2">
          {view.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!c.affordable}
              onClick={() => chooseEventOption(c.id)}
              className="w-full rounded-2xl border-2 border-slate-200 p-3.5 text-left transition hover:border-blue-400 hover:bg-blue-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-slate-900">{c.label}</span>
                {c.cost > 0 && <span className="tabular shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{formatYen(c.cost)}</span>}
              </div>
              <div className="mt-0.5 text-xs font-bold text-slate-500">{c.detail}</div>
              {!c.affordable && <div className="mt-0.5 text-xs font-bold text-rose-600">資金が足りません</div>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const CONFETTI = ["🎉", "✨", "🎊", "⭐", "🏠", "🏢", "🌳"];

export function RankUpModal() {
  const { rankUp, closeRankUp } = useGame();
  if (!rankUp) return null;
  const rank = getRank(rankUp);
  const unlocks = unlocksForRank(rankUp);
  return (
    <Modal label="ランクアップ" onClose={closeRankUp}>
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-300 via-orange-400 to-pink-500 px-6 pb-6 pt-8 text-center text-white">
        {CONFETTI.map((c, i) => (
          <span key={i} className="animate-confetti absolute text-2xl" style={{ left: `${8 + i * 13}%`, top: 0, animationDelay: `${i * 0.12}s` }} aria-hidden>
            {c}
          </span>
        ))}
        <div className="animate-pop-in text-6xl" aria-hidden>
          {rank.emoji}
        </div>
        <div className="mt-2 text-sm font-bold text-white/90">RANK UP!</div>
        <h2 className="text-3xl font-black">{rank.name}になりました！</h2>
        <div className="text-sm font-bold text-white/90">{rank.en}</div>
      </div>
      <div className="space-y-3 p-5">
        {rank.reward > 0 && <div className="rounded-2xl bg-amber-50 p-3 text-center text-sm font-black text-amber-800">🎁 お祝い金 {formatYen(rank.reward)}</div>}
        {rankUp === "megacity" && (
          <div className="rounded-2xl bg-violet-50 p-3 text-xs font-bold leading-relaxed text-violet-900">
            <div className="text-sm font-black">🏛️ この街は殿堂入りしました！</div>
            タイトル画面の「殿堂」に記録が残ります。ここから先は——
            <ul className="mt-1 list-disc pl-4">
              <li>🏅 街の評価で S（850点）を目指す</li>
              <li>🌃 人口2万人・📜 100年続く街</li>
              <li>🎯 チャレンジ（シナリオ）に挑戦する</li>
            </ul>
          </div>
        )}
        <div>
          <div className="text-xs font-bold text-slate-500">新しく解禁されたもの</div>
          <ul className="mt-1 space-y-1">
            {unlocks.map((u) => (
              <li key={u} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                {u}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="go" size="lg" className="w-full" onClick={closeRankUp}>
          街づくりを続ける
        </Button>
      </div>
    </Modal>
  );
}

export function EraModal() {
  const { eraShift, closeEraShift, rankUp } = useGame();
  if (!eraShift || rankUp) return null;
  const era = getEra(eraShift);
  return (
    <Modal label="時代の転換" onClose={closeEraShift}>
      <div className="bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 px-6 pb-6 pt-8 text-center text-white">
        <div className="text-sm font-bold text-white/85">時代が変わった</div>
        <div className="animate-pop-in mt-1 text-6xl" aria-hidden>
          {era.emoji}
        </div>
        <h2 className="mt-2 text-2xl font-black">「{era.name}の時代」</h2>
        <p className="mt-1 text-sm font-bold text-white/90">{era.description}</p>
      </div>
      <div className="space-y-3 p-5">
        <div>
          <div className="text-xs font-bold text-slate-500">この時代の変化</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {describeEffects(era.effects).map((e) => (
              <span key={e} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">
                {e}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3">
          <div className="text-xs font-black text-amber-800">💡 この時代の攻略</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs font-bold text-amber-900">
            {era.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <Button variant="go" size="lg" className="w-full" onClick={closeEraShift}>
          新しい時代へ
        </Button>
      </div>
    </Modal>
  );
}

export function ScenarioResultModal() {
  const { state, analysis } = useCity();
  const { scenarioResult, closeScenarioResult, quitToTitle } = useGame();
  const def = state.scenario ? getScenario(state.scenario.id) : undefined;
  if (!scenarioResult || !def) return null;
  const failed = scenarioResult === "failed";
  const score = cityScore(state, analysis);
  return (
    <Modal label="チャレンジの結果" onClose={closeScenarioResult}>
      <div className={cx("px-6 pb-6 pt-8 text-center text-white", failed ? "bg-gradient-to-br from-slate-500 to-slate-700" : "bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500")}>
        <div className="text-sm font-bold text-white/85">
          {def.emoji} {def.title}
        </div>
        {failed ? (
          <h2 className="mt-2 text-3xl font-black">⌛ 時間切れ</h2>
        ) : (
          <>
            <div className="animate-pop-in mt-2 text-5xl tracking-widest">
              {"★".repeat(scenarioResult.stars)}
              <span className="text-white/40">{"★".repeat(3 - scenarioResult.stars)}</span>
            </div>
            <h2 className="mt-1 text-2xl font-black">チャレンジ達成！</h2>
            <div className="text-sm font-bold text-white/90">{Math.ceil((scenarioResult.turn - state.scenario!.startTurn + 1) / 12)}年目で達成</div>
          </>
        )}
      </div>
      <div className="space-y-3 p-5">
        <p className="text-sm font-bold text-slate-600">🎯 {def.goal}</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-[10px] font-bold text-slate-500">人口</div>
            <div className="tabular font-black">{formatNumber(analysis.population)}人</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-[10px] font-bold text-slate-500">街の評価</div>
            <div className="tabular font-black">
              {score.grade}（{score.total}点）
            </div>
          </div>
        </div>
        {!failed && <p className="text-center text-xs font-bold text-slate-500">🏛️ 殿堂に記録しました</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => quitToTitle(false)}>タイトルへ</Button>
          <Button variant="go" onClick={closeScenarioResult}>
            このまま遊ぶ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function GameOverModal() {
  const { state, analysis } = useCity();
  const { quitToTitle } = useGame();
  if (!state.gameOver) return null;
  const peak = Math.max(...state.history.map((h) => h.population), analysis.population);
  return (
    <Modal label="ゲームオーバー">
      <div className="bg-gradient-to-br from-slate-600 to-slate-800 px-6 pb-6 pt-8 text-center text-white">
        <div className="text-5xl" aria-hidden>
          🏚️
        </div>
        <h2 className="mt-2 text-2xl font-black">財政破綻</h2>
        <p className="mt-1 text-sm font-bold text-slate-200">{state.gameOver.reason}</p>
      </div>
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-[10px] font-bold text-slate-500">在任期間</div>
            <div className="tabular font-black">{state.turn}か月</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-[10px] font-bold text-slate-500">最大人口</div>
            <div className="tabular font-black">{formatNumber(peak)}人</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2">
            <div className="text-[10px] font-bold text-slate-500">達成目標</div>
            <div className="tabular font-black">{goalsAchieved(state)}個</div>
          </div>
        </div>
        <Button variant="go" size="lg" className="w-full" onClick={() => quitToTitle(true)}>
          タイトルへ戻る
        </Button>
      </div>
    </Modal>
  );
}

const HELP_STEPS = [
  { icon: "🛣️", title: "道路をつなぐ", body: "建物は道路に面していないと機能しません。道路は役所までつなげましょう。ドラッグで連続して置けます。" },
  { icon: "🏠", title: "住む・働く場所をつくる", body: "住宅・商業・工業の土地を用意すると、翌月に住民や会社が建物を建てます。「街の状況」の需要メーターが高いものが狙い目。" },
  { icon: "▶", title: "翌月へ進める", body: "人口の転入・転出、税収、建物の成長、イベントが1か月分進みます。" },
  { icon: "💬", title: "住民の声を聞く", body: "困りごとと解決のヒントを教えてくれます。「場所を見る」で問題の場所がわかります。" },
];

const HELP_TIPS = [
  "仕事が足りない → 商業・工業を建てる。働き手が足りない → 住宅を建てる。",
  "工場は住宅から2マス以上離すと騒音の苦情が減ります。",
  "公園は安くて満足度と環境の両方に効きます。",
  "マンション（住宅Lv3）には学校と、町ランク（人口1,000人）が必要です。",
  "渋滞したら並行する道路、町になったら大通りやバス停で解消。",
  "お金が足りないときは税率・融資・公共施設の売却で立て直せます。",
  "5〜7年ごとに「時代」が変わり、求められるものが変わります。予告が出たら備えましょう。",
  "📋 依頼を期限内にかなえると報酬がもらえます。市になると大型プロジェクト（2×2）も建てられます。",
  "川や海には道路（橋）を架けられます。",
];

export function HelpModal() {
  const { helpOpen, setHelpOpen } = useGame();
  if (!helpOpen) return null;
  return (
    <Modal label="遊び方" onClose={() => setHelpOpen(false)}>
      <div className="bg-gradient-to-br from-sky-400 to-emerald-400 px-6 pb-5 pt-6 text-white">
        <div className="text-4xl" aria-hidden>
          🏘️
        </div>
        <h2 className="mt-1 text-xl font-black">ようこそ、町長さん！</h2>
        <p className="text-sm font-bold text-white/90">小さな町を、あなたの判断で育てましょう。</p>
      </div>
      <div className="space-y-4 p-5">
        <ol className="space-y-2.5">
          {HELP_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl" aria-hidden>
                {s.icon}
              </div>
              <div>
                <div className="text-sm font-black text-slate-800">
                  {i + 1}. {s.title}
                </div>
                <div className="text-xs font-bold leading-relaxed text-slate-500">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-2xl bg-amber-50 p-3">
          <div className="text-xs font-black text-amber-800">💡 コツ</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] font-bold leading-relaxed text-amber-900">
            {HELP_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="hidden rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-500 lg:block">⌨️ ショートカット：1〜9・0 で建設ツール、B で撤去、Esc で「調べる」、N / Enter で翌月へ</div>
        <Button variant="go" size="lg" className="w-full" onClick={() => setHelpOpen(false)}>
          はじめる
        </Button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[128px] z-[60] flex flex-col items-center gap-1.5 px-3 lg:top-20" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "animate-sheet-in max-w-md rounded-full px-4 py-2 text-center text-xs font-bold shadow-lg",
            t.tone === "bad" ? "bg-rose-600 text-white" : t.tone === "good" ? "bg-emerald-600 text-white" : "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
