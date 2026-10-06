"use client";

import { useState } from "react";
import { cityScore, describeEffects, describePendingEvent, formatDate, formatNumber, formatYen, getEra, getRank, getScenario, goalsAchieved, mayorTitle, placeWord, unlocksForRank } from "@/game";
import { useCity, useGame } from "./GameProvider";
import { Button, Modal, cx } from "./ui";

const TONE_HEADER = {
  good: "from-emerald-400 to-teal-500",
  bad: "from-rose-400 to-red-500",
  neutral: "from-sky-400 to-indigo-500",
};

export function EventModal() {
  const { state, analysis } = useCity();
  const { chooseEventOption, focusTile, dialog } = useGame();
  const view = describePendingEvent(state, analysis);
  // 地図を見てから決められるよう、ダイアログを一時的にたためる
  const [peek, setPeek] = useState(false);
  // 表示するダイアログは GameProvider の dialog で1つだけ決める
  if (!view || dialog !== "event") return null;
  if (peek) {
    return (
      <button
        type="button"
        onClick={() => setPeek(false)}
        className="animate-sheet-in fixed left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-2xl"
        style={{ top: "calc(var(--header-h, 80px) + 12px)" }}
      >
        {view.def.emoji} 「{view.def.title}」に戻って決める
      </button>
    );
  }
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
        <button
          type="button"
          onClick={() => {
            if (view.tile !== undefined) focusTile(view.tile);
            setPeek(true);
          }}
          className="text-xs font-bold text-blue-600 hover:underline"
        >
          {view.tile !== undefined ? "📍 対象の場所を地図で見る" : "🗺️ 地図を見てから決める"}
        </button>
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
  const { rankUp, closeRankUp, state, dialog } = useGame();
  if (!rankUp || dialog !== "rankUp") return null;
  const rank = getRank(rankUp);
  const unlocks = unlocksForRank(rankUp, state?.profile.trait);
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
  const { eraShift, closeEraShift, dialog } = useGame();
  if (!eraShift || dialog !== "era") return null;
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
  const { scenarioResult, closeScenarioResult, quitToTitle, dialog } = useGame();
  const def = state.scenario ? getScenario(state.scenario.id) : undefined;
  if (!scenarioResult || !def || dialog !== "scenario") return null;
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
  { icon: "🛣️", title: "道路をつなぐ", body: "建物は道路に面していないと使えません。道路は役所までつなげよう。なぞると連続で置けます。" },
  { icon: "🏠", title: "住む・働く場所をつくる", body: "住宅・お店・工場は、土地を用意すると翌月に住民や会社が建てます（維持費なし）。公園・学校などの「町の施設」は町のお金で建て、毎月維持費がかかります。「🧭 今月のおすすめ」を見れば次にやることがわかります。" },
  { icon: "▶", title: "翌月へ進める", body: "人の出入り・税収・建物の成長・できごとが1か月分進みます。「⏩ 3か月」でまとめて進めることもできます。" },
  { icon: "💬", title: "住民の声を聞く", body: "困りごとと解決のヒントを教えてくれます。「📍 場所を見る」で問題の場所、ボタンで必要な建物を選べます。" },
];

const HELP_TIPS = [
  "仕事が足りない → 商業・工業を建てる。働き手が足りない → 住宅を建てる。",
  "お金が足りないときは、税率・借入・町の施設の撤去（建設費の40%が戻る）で立て直せます。",
  "5〜7年ごとに「時代」が変わり、求められるものが変わります。予告が出たら備えよう。",
  "📋 依頼を期限内にかなえると報酬がもらえます。「町」になると町の個性の専用施設、「市」になると大型プロジェクト（2×2）も建てられます。",
  "間違えて置いたら「↩️ 戻す」。今月の操作なら取り消せます。",
];

/** 置き方のコツ（ベストプラクティス） */
const PLACEMENT_TIPS: Array<{ icon: string; title: string; body: string }> = [
  { icon: "🌳", title: "住宅のとなりには公園", body: "公園は安く、2マス先の家まで満足度と空気をよくします。大きな公園は4マス先まで、効き目も1.3倍。" },
  { icon: "🛍️", title: "お店は住宅から3マス以内", body: "近くにお店があると買い物が便利になり満足度が上がります（騒音なし）。周りに住む人が多いほどスーパー・デパートに育ち、⛲広場の近くなら育ちやすくなります。" },
  { icon: "🏭", title: "工場は住宅から3マス以上はなす", body: "騒音は2マス先、煙は3マス先まで届きます（4マスはなせば煙も安心）。間に大きな公園を置くと騒音が半分になります。" },
  { icon: "🏫", title: "学校・病院は住宅地の真ん中に", body: "学校は4マス、病院・消防署は5マス先まで届きます。1つで広くカバーできる場所を選ぼう。" },
  { icon: "🚏", title: "バス停は大きな建物の近くに", body: "タワーマンションや複合ビル（Lv4）には、バス停（3マス）かバスターミナル（5マス）の範囲が必要です。" },
  { icon: "🛣️", title: "道路は格子状に、抜け道も", body: "車は建物のとなりの道路にだけ出ます。大きな建物が並ぶ通りは大通りにし、建物の反対側にも道路を通そう。混んでいる道路をタップすると、車を出している建物がわかります。" },
];

const RANGE_TIPS = [
  "効果は「直線距離」で届きます。道路・川・ほかの建物をはさんでも届きます。",
  "施設は道路に面していないと効果がありません。役所まで道路がつながっていないと効果は半分です。",
  "中心ほど効果が強く、範囲の端では半分になります。",
  "2×2 の大型施設（大学など）は、建物の端から数えます。",
  "地図の上の「施設の範囲」を選ぶと、届いている家に ✓、届いていない家に ✗ がつきます。",
  "建てる前は紫の枠で、置いたときに届く範囲がわかります。",
];

const EXAMPLE_ROWS = ["🏠🏠🌳🏠🏠🏪🏠", "🛣️🛣️🛣️🛣️🛣️🛣️🛣️", "🏠🏪🏫🏠🚏🏠🌳", "🛣️🛣️🛣️🛣️🛣️🛣️🛣️", "🌳🌳🌳🌳🌳🌳🌳", "🛣️🛣️🛣️🛣️🛣️🛣️🛣️", "🏭🏭🏭🏭🏭🏭🏭"];

type HelpPage = "start" | "placement" | "range";

export function HelpModal() {
  const { helpOpen, setHelpOpen, state } = useGame();
  const [page, setPage] = useState<HelpPage>("start");
  const rank = state?.rank ?? "village";
  if (!helpOpen) return null;
  const pages: Array<{ id: HelpPage; label: string }> = [
    { id: "start", label: "🔰 はじめに" },
    { id: "placement", label: "🏘️ 置き方のコツ" },
    { id: "range", label: "📡 効果範囲" },
  ];
  return (
    <Modal label="遊び方" onClose={() => setHelpOpen(false)}>
      <div className="bg-gradient-to-br from-sky-400 to-emerald-400 px-6 pb-5 pt-6 text-white">
        <div className="text-4xl" aria-hidden>
          🏘️
        </div>
        <h2 className="mt-1 text-xl font-black">ようこそ、{mayorTitle(rank)}さん！</h2>
        <p className="text-sm font-bold text-white/90">小さな{placeWord(rank)}を、あなたの判断で育てましょう。</p>
      </div>
      <div className="flex gap-1 border-b border-slate-100 px-4 pt-3" role="tablist">
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={page === p.id}
            onClick={() => setPage(p.id)}
            className={cx("rounded-t-xl px-3 py-1.5 text-xs font-black", page === p.id ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-5">
        {page === "start" && (
          <>
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
          </>
        )}
        {page === "placement" && (
          <>
            <div className="rounded-2xl bg-emerald-50 p-3">
              <div className="text-xs font-black text-emerald-800">よい配置の例</div>
              <div className="mt-1.5 flex gap-3">
                <div className="shrink-0 font-mono text-base leading-[1.35]" aria-label="住宅の間に公園とお店、学校を置き、緑の帯と道路をはさんで工場をはなした例">
                  {EXAMPLE_ROWS.map((r, i) => (
                    <div key={i}>{r}</div>
                  ))}
                </div>
                <ul className="space-y-1 text-[11px] font-bold leading-snug text-emerald-900">
                  <li>住宅のすき間に 🌳公園・🏪お店</li>
                  <li>🏫学校と🚏バス停は住宅地の中に</li>
                  <li>🌳緑の帯と道路をはさんで、🏭工場は4マス先</li>
                </ul>
              </div>
            </div>
            <ul className="space-y-2.5">
              {PLACEMENT_TIPS.map((t) => (
                <li key={t.title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg" aria-hidden>
                    {t.icon}
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-800">{t.title}</div>
                    <div className="text-xs font-bold leading-relaxed text-slate-500">{t.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {page === "range" && (
          <>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold text-slate-700">
              {[
                ["🌳 公園", "2マス"],
                ["🏞️ 大きな公園", "4マス"],
                ["🛍️ お店（買い物）", "3〜6マス"],
                ["🏫 学校", "4マス"],
                ["🎓 大学（2×2）", "8マス"],
                ["🏥 病院", "5マス"],
                ["🚒 消防署", "5マス"],
                ["🚏 バス停", "3マス"],
                ["🚌 バスターミナル", "5マス"],
                ["⛲ 広場", "3マス"],
                ["🗼 シンボルタワー", "7マス"],
                ["🚄 新幹線駅（2×2）", "7マス"],
                ["🏟️ スタジアム（2×2）", "5マス"],
                ["🎢 テーマパーク（2×2）", "6マス"],
                ["🌲 森林公園など専用施設（2×2）", "5〜6マス"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1">
                  <span>{k}</span>
                  <span className="tabular text-blue-700">{v}</span>
                </div>
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs font-bold leading-relaxed text-slate-600">
              {RANGE_TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
        <div className="hidden rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-500 lg:block">⌨️ ショートカット：1〜9・0 で建設ツール、B で撤去、Esc で「調べる」、N / Enter で翌月へ、⌘Z / Ctrl+Z で戻す</div>
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
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-1.5 px-3" style={{ top: "calc(var(--header-h, 80px) + 8px)" }} aria-live="polite">
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
