"use client";

// 政策タブ：選挙（支持率・公約）と条例

import { useState } from "react";
import {
  POLICY_CATEGORY_NAMES,
  POLICY_DEFS,
  approvalFactors,
  approvalTarget,
  choosePromise,
  electionOutlook,
  enactPolicy,
  formatDate,
  formatYen,
  getEra,
  getPolicy,
  policyEnactCost,
  policySlots,
  policyState,
  policyStatus,
  policyUpkeep,
  promiseLabel,
  promiseProgress,
  revokePolicy,
  shouldOfferPromise,
  WIN_LINE,
  mayorTitle,
  type PolicyCategory,
  type PolicyDef,
} from "@/game";
import { useCity, useGame } from "./GameProvider";
import { Card, ProgressBar, cx } from "./ui";

export function PolicyPanel() {
  return (
    <>
      <ElectionCard />
      <PolicySlots />
      <PolicyList />
    </>
  );
}

/** カード列の先頭に出す1行：公約がまだ決まっていない */
export function PromiseCard() {
  const { state } = useCity();
  const { openPolicy } = useGame();
  const c = state.politics?.campaign;
  if (!c || c.promise || c.offers.length === 0 || shouldOfferPromise(state)) return null;
  return (
    <button type="button" onClick={() => openPolicy()} className="flex min-h-11 w-full items-center gap-2 rounded-2xl bg-indigo-50 px-3 py-2 text-left ring-1 ring-indigo-200">
      <span className="text-xl" aria-hidden>
        🗳️
      </span>
      <span className="min-w-0 flex-1 text-xs font-black text-indigo-800">公約がまだ決まっていない（選挙まであと{(state.politics?.nextElection ?? 0) - state.turn}か月）</span>
      <span className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-black text-white">選ぶ</span>
    </button>
  );
}

function ElectionCard() {
  const { state, analysis } = useCity();
  const { runAction, toast } = useGame();
  const pol = state.politics;
  if (pol === undefined) {
    return (
      <Card title={`次の${mayorTitle(state.rank)}選挙`} icon="🗳️">
        <p className="text-xs font-bold text-slate-500">翌月から支持率の集計が始まります。</p>
      </Card>
    );
  }
  if (pol === null) {
    return (
      <Card title={`${mayorTitle(state.rank)}選挙`} icon="🗳️">
        <p className="text-xs font-bold text-slate-500">チャレンジ中は選挙がありません（結果が出たあと、3年後に最初の選挙）。条例は使えます。</p>
      </Card>
    );
  }
  const left = pol.nextElection - state.turn;
  const outlook = electionOutlook(pol.approval);
  const factors = approvalFactors(state, analysis).sort((p, q) => Math.abs(q.value) - Math.abs(p.value));
  const target = approvalTarget(state, analysis);
  const c = pol.campaign;
  const promise = c?.promise;
  return (
    <Card title={`次の${mayorTitle(state.rank)}選挙`} icon="🗳️" action={<span className="text-[11px] font-bold text-slate-400">{pol.term}期目</span>}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold text-slate-500">支持率</div>
          <div className={cx("tabular text-3xl font-black", outlook.tone === "good" ? "text-emerald-600" : outlook.tone === "warn" ? "text-amber-600" : "text-rose-600")}>{Math.round(pol.approval)}%</div>
        </div>
        <div className="text-right text-[11px] font-bold text-slate-500">
          <div>
            あと{Math.floor(left / 12) > 0 ? `${Math.floor(left / 12)}年` : ""}
            {left % 12}か月（{formatDate(pol.nextElection)}）
          </div>
          <div className={cx("font-black", outlook.tone === "good" ? "text-emerald-600" : outlook.tone === "warn" ? "text-amber-600" : "text-rose-600")}>見込み：{outlook.label}</div>
        </div>
      </div>
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cx("h-full rounded-full", outlook.tone === "good" ? "bg-emerald-500" : outlook.tone === "warn" ? "bg-amber-400" : "bg-rose-500")} style={{ width: `${pol.approval}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-slate-700" style={{ left: `${WIN_LINE}%` }} aria-hidden />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] font-bold text-slate-400">
        <span>来月の向かう先 {Math.round(target)}%</span>
        <span>当選ライン {WIN_LINE}%</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {factors.slice(0, 8).map((f) => (
          <span key={f.label} className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", f.value > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
            {f.label} {f.value > 0 ? "+" : "−"}
            {Math.abs(Math.round(f.value))}
          </span>
        ))}
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
        <div className="text-[11px] font-black text-slate-600">📣 公約</div>
        {promise ? (
          <>
            <div className="mt-0.5 text-sm font-black text-slate-800">{promiseLabel(promise)}</div>
            <div className="mt-1 flex items-center gap-2">
              <ProgressBar value={promiseProgress(promise, state, analysis)} className="h-1.5 flex-1" color="bg-gradient-to-r from-sky-400 to-indigo-500" />
              <span className="tabular text-[11px] font-black text-indigo-700">{Math.floor(promiseProgress(promise, state, analysis) * 100)}%</span>
            </div>
          </>
        ) : c && c.offers.length > 0 ? (
          <div className="mt-1 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500">まだ決まっていない。選挙までに達成すると得票が増える</div>
            {c.offers.map((p, k) => (
              <button
                key={p.kind}
                type="button"
                onClick={() => {
                  if (runAction((s) => choosePromise(s, k))) toast(`🗳️ 公約「${promiseLabel(p)}」を掲げた`, "good");
                }}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-indigo-300"
              >
                <span>{promiseLabel(p)}</span>
                <span className="shrink-0 text-[10px] text-indigo-600">これにする</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] font-bold text-slate-500">選挙の12か月前に、公約の候補が届きます</div>
        )}
      </div>

      {pol.lastResult && (
        <div className="mt-2 text-[11px] font-bold text-slate-500">
          前回：{pol.lastResult.won ? "当選" : "落選"}（{pol.lastResult.vote >= 100 ? "無投票" : `得票率 ${pol.lastResult.vote}%`}）
        </div>
      )}
      {pol.opposition > 0 && <p className="mt-2 rounded-xl bg-slate-100 p-2 text-[11px] font-bold text-slate-600">⏸ 新しい{mayorTitle(state.rank)}の方針：あと{pol.opposition}か月は条例の枠が1つ減り、制定費が2倍</p>}
      {state.history.length > 2 && <ApprovalNote />}
    </Card>
  );
}

function ApprovalNote() {
  return <p className="mt-2 text-[10px] font-bold text-slate-400">支持率は毎月、「向かう先」に少しずつ近づきます。満足度・税・失業・赤字・条例・公約の進み具合で変わります。</p>;
}

function PolicySlots() {
  const { state } = useCity();
  const { runAction, toast, openPolicy } = useGame();
  const ps = policyState(state);
  const max = policySlots(state);
  const total = 5 + (ps.bonusSlot ? 1 : 0);
  return (
    <Card title={`条例 ${ps.active.length}/${max}枠`} icon="📜">
      <ul className="space-y-1.5" role="list">
        {Array.from({ length: Math.max(max, Math.min(total, max + 1)) }, (_, k) => {
          const a = ps.active[k];
          const def = a ? getPolicy(a.id) : undefined;
          if (def) {
            return (
              <li key={def.id} className="flex min-h-11 items-center gap-2 rounded-xl bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200">
                <span className="text-xl" aria-hidden>
                  {def.emoji}
                </span>
                <button type="button" onClick={() => openPolicy(def.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-xs font-black text-slate-800">{def.name}</div>
                  <div className="truncate text-[10px] font-bold text-slate-500">{def.perCapita > 0 ? `毎月 ${formatYen(policyUpkeep(def, state), { compact: true })}` : "毎月の費用なし"}</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (runAction((s) => revokePolicy(s, def.id))) toast(`📜 「${def.name}」を廃止した（↩️で戻せる）`, "info");
                  }}
                  className="min-h-9 shrink-0 rounded-full bg-white px-3 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-600"
                >
                  廃止
                </button>
              </li>
            );
          }
          return k < max ? (
            <li key={`empty-${k}`} className="flex min-h-11 items-center rounded-xl border-2 border-dashed border-slate-200 px-3 text-xs font-bold text-slate-400">
              空き（下から選んで制定しよう）
            </li>
          ) : (
            <li key={`lock-${k}`} className="flex min-h-11 items-center rounded-xl bg-slate-50 px-3 text-xs font-bold text-slate-400">
              🔒 ランクが上がると枠が増える
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PolicyList() {
  const { state, analysis } = useCity();
  const { runAction, toast, policyFocus } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const [cat, setCat] = useState<PolicyCategory | "all">("all");
  const [replacing, setReplacing] = useState<string | null>(null);
  // おすすめなどから開かれたら、そのカードを開く
  const [lastFocus, setLastFocus] = useState(policyFocus?.key);
  if (policyFocus && policyFocus.key !== lastFocus) {
    setLastFocus(policyFocus.key);
    setOpen(policyFocus.id);
    setCat("all");
  }
  const ps = policyState(state);
  const full = ps.active.length >= policySlots(state);
  const list = POLICY_DEFS.filter((d) => cat === "all" || d.category === cat);

  const enact = (def: PolicyDef, replaceId?: string) => {
    if (runAction((s) => enactPolicy(s, def.id, replaceId))) {
      toast(`📜 「${def.name}」を制定した（↩️で戻せる）`, "good");
      setReplacing(null);
    }
  };

  return (
    <Card title="使える条例" icon="🗂️" action={<span className="text-[10px] font-bold text-slate-400">タップで詳しく</span>}>
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(["all", "life", "economy", "environment"] as const).map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className={cx("min-h-8 shrink-0 rounded-full px-3 text-[11px] font-black", cat === c ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500")}>
            {c === "all" ? "すべて" : POLICY_CATEGORY_NAMES[c]}
          </button>
        ))}
      </div>
      <ul className="mt-1 space-y-1.5">
        {list.map((def) => {
          const st = policyStatus(state, def);
          const expanded = open === def.id;
          const cost = policyEnactCost(def, state);
          const upkeep = policyUpkeep(def, state);
          const bonus = def.eraBonus?.find((b) => b.era === state.era.id);
          const focused = policyFocus?.id === def.id;
          return (
            <li key={def.id} id={`policy-${def.id}`} style={{ scrollMarginTop: "calc(var(--header-h, 80px) + 8px)" }}>
              <PolicyItemFrame focused={focused}>
                <button type="button" onClick={() => setOpen(expanded ? null : def.id)} aria-expanded={expanded} className={cx("flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left", (st.status === "locked" || st.status === "cooldown" || st.status === "excluded") && "opacity-55")}>
                  <span className="text-xl" aria-hidden>
                    {def.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-slate-800">
                      {def.name}
                      {st.status === "active" && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">制定中</span>}
                      {bonus && <span className="ml-1 rounded-full bg-violet-100 px-1.5 text-[10px] text-violet-700">時代に合う</span>}
                    </span>
                    <span className="block truncate text-[10px] font-bold text-slate-500">{st.status === "locked" || st.status === "cooldown" || st.status === "excluded" ? st.reason : def.description}</span>
                  </span>
                </button>
                {expanded && (
                  <div className="border-t border-slate-100 px-2.5 pb-2.5 pt-2">
                    <div className="flex flex-wrap gap-1">
                      {def.pros.map((p) => (
                        <span key={p} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          ＋ {p}
                        </span>
                      ))}
                      {def.cons.map((c) => (
                        <span key={c} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                          − {c}
                        </span>
                      ))}
                    </div>
                    {def.eraBonus && (
                      <div className="mt-1.5 text-[10px] font-bold text-violet-700">
                        {def.eraBonus.map((b) => `${getEra(b.era).emoji}${b.note}`).join("／")}
                      </div>
                    )}
                    {st.status !== "active" && (
                      <div className="mt-1.5 text-[11px] font-bold text-slate-600">
                        制定費 {formatYen(cost)}
                        {upkeep > 0 && `・毎月 ${formatYen(upkeep)}（月の収支 ${formatYen(analysis.budget.net, { sign: true, compact: true })} → ${formatYen(analysis.budget.net - upkeep, { sign: true, compact: true })}）`}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] font-bold text-slate-400">廃止すると12か月は出し直せない。制定して6か月以内に廃止すると支持率 −3</div>
                    {st.status === "available" && !full && (
                      <button type="button" onClick={() => enact(def)} disabled={state.money < cost} className="mt-2 min-h-10 w-full rounded-xl bg-amber-500 text-sm font-black text-white disabled:opacity-40">
                        {state.money < cost ? "資金が足りない" : `制定する（${formatYen(cost, { compact: true })}）`}
                      </button>
                    )}
                    {st.status === "available" && full && (
                      <div className="mt-2">
                        {replacing === def.id ? (
                          <div className="space-y-1">
                            <div className="text-[11px] font-black text-slate-600">枠がいっぱい。どれと入れ替える？</div>
                            {ps.active.map((a) => {
                              const cur = getPolicy(a.id);
                              return cur ? (
                                <button key={a.id} type="button" onClick={() => enact(def, a.id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg bg-white px-2.5 text-left text-xs font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-amber-300">
                                  {cur.emoji} {cur.name} をやめて入れ替える
                                </button>
                              ) : null;
                            })}
                            <button type="button" onClick={() => setReplacing(null)} className="min-h-9 w-full text-[11px] font-bold text-slate-400">
                              やめる
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setReplacing(def.id)} disabled={state.money < cost} className="min-h-10 w-full rounded-xl bg-amber-500 text-sm font-black text-white disabled:opacity-40">
                            {state.money < cost ? "資金が足りない" : `入れ替える（${formatYen(cost, { compact: true })}）`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </PolicyItemFrame>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** おすすめから開かれたカードを光らせる枠（光は GameProvider が少しあとに消す） */
function PolicyItemFrame({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return <div className={cx("overflow-hidden rounded-xl bg-white ring-1 transition", focused ? "ring-2 ring-amber-400" : "ring-slate-200")}>{children}</div>;
}
