"use client";

// 選挙のダイアログ：公約を選ぶ（選挙の12か月前）・選挙の夜の結果

import { choosePromise, deferPromise, DIFFICULTY_NAMES, PROMISE_BONUS, promiseLabel, electionOutlook, formatDate, WIN_LINE } from "@/game";
import { useCity, useGame } from "./GameProvider";
import { Button, Modal, cx } from "./ui";

export function PromiseModal() {
  const { state } = useCity();
  const { dialog, runAction, toast } = useGame();
  const c = state.politics?.campaign;
  if (dialog !== "promise" || !c || !state.politics) return null;
  const outlook = electionOutlook(state.politics.approval);
  const later = () => runAction((s) => deferPromise(s));
  return (
    <Modal label="公約を選ぶ" onClose={later}>
      <div className="bg-gradient-to-br from-sky-500 to-indigo-600 px-6 pb-5 pt-6 text-white">
        <div className="text-4xl" aria-hidden>
          🗳️
        </div>
        <h2 className="mt-1 text-xl font-black">選挙まであと{state.politics.nextElection - state.turn}か月</h2>
        <p className="text-sm font-bold text-white/90">
          町民に約束することを1つ選ぼう（選挙は{formatDate(state.politics.nextElection)}）。いまの支持率 {Math.round(state.politics.approval)}%・{outlook.label}
        </p>
      </div>
      <div className="space-y-2 p-5">
        {c.offers.map((p, k) => (
          <button
            key={p.kind}
            type="button"
            onClick={() => {
              if (runAction((s) => choosePromise(s, k))) toast(`🗳️ 公約「${promiseLabel(p)}」を掲げた`, "good");
            }}
            className="min-h-12 w-full rounded-2xl border-2 border-slate-200 p-3.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-slate-900">{promiseLabel(p)}</span>
              <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black", p.difficulty === 1 ? "bg-emerald-100 text-emerald-700" : p.difficulty === 2 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700")}>
                {DIFFICULTY_NAMES[p.difficulty]}
              </span>
            </div>
            <div className="mt-0.5 text-xs font-bold text-slate-500">
              達成で得票 +{PROMISE_BONUS[p.difficulty]}％／守れないと最大 −6％
            </div>
          </button>
        ))}
        <button type="button" onClick={later} className="min-h-10 w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600">
          あとで決める（政策タブからいつでも選べる）
        </button>
      </div>
    </Modal>
  );
}

const CONFETTI = ["🎉", "✨", "🎊", "⭐", "🗳️", "🌸"];

export function ElectionResultModal() {
  const { state } = useCity();
  const { dialog, electionResult: r, closeElection } = useGame();
  if (dialog !== "election" || !r) return null;
  const opposition = (state.politics?.opposition ?? 0) > 0;
  return (
    <Modal label="選挙の結果" onClose={closeElection}>
      <div className={cx("relative overflow-hidden px-6 pb-6 pt-8 text-center text-white", r.won ? "bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500" : "bg-gradient-to-br from-slate-500 to-slate-700")}>
        {r.won &&
          CONFETTI.map((c, i) => (
            <span key={i} className="animate-confetti absolute text-2xl" style={{ left: `${8 + i * 15}%`, top: 0, animationDelay: `${i * 0.12}s` }} aria-hidden>
              {c}
            </span>
          ))}
        <div className="text-5xl" aria-hidden>
          {r.won ? "🎉" : "😞"}
        </div>
        <h2 className="mt-2 text-2xl font-black">{r.won ? (r.vote >= 100 ? "無投票で当選！" : "再選！") : "落選…"}</h2>
        {r.vote < 100 && <div className="tabular mt-1 text-sm font-bold text-white/90">得票率 {r.vote}%</div>}
      </div>
      <div className="space-y-3 p-5">
        {r.vote < 100 && (
          <div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
              <div className={cx("h-full rounded-full", r.won ? "bg-gradient-to-r from-amber-400 to-rose-500" : "bg-slate-400")} style={{ width: `${r.vote}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-slate-800" style={{ left: `${WIN_LINE}%` }} aria-hidden />
            </div>
            <div className="mt-0.5 text-right text-[10px] font-bold text-slate-400">当選ライン {WIN_LINE}%</div>
          </div>
        )}
        {r.promise && (
          <p className={cx("rounded-xl p-2.5 text-xs font-bold", r.kept ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
            {r.kept ? "✓ 公約を守った" : "✗ 公約を守れなかった"}：{r.promise}
          </p>
        )}
        <ul className="list-disc space-y-0.5 pl-5 text-xs font-bold leading-relaxed text-slate-600">
          {r.won ? (
            <>
              <li>新しい任期への期待で、半年は支持率が上がりやすい</li>
              {r.kept && <li>公約を達成したので交付金が入った</li>}
              {r.landslide && <li>圧勝したので、次の選挙まで条例の枠が1つ増える</li>}
            </>
          ) : (
            <>
              <li>町長は続けられるが、条例はすべて取り消された</li>
              {opposition && <li>1年間は条例の枠が1つ減り、制定費が2倍</li>}
              <li>4年後の選挙で返り咲こう</li>
            </>
          )}
        </ul>
        <Button variant="go" size="lg" className="w-full" onClick={closeElection}>
          {r.won ? "次の任期へ" : "出直す"}
        </Button>
      </div>
    </Modal>
  );
}
