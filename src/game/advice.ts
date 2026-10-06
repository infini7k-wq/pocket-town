// 今月のおすすめ：いまの街で「次に何をすればいいか」を1つだけ提案する。
// お金の危機 → 序盤のミッション → 住民の声（困りごと） → 需要 → 土地 の順に考える。

import type { CityAnalysis } from "./analysis";
import { BUILDINGS } from "./buildings";
import { DEMAND } from "./config";
import { currentMission } from "./goals";
import { isBuildingUnlocked } from "./progression";
import { POLICY_DEFS, policySlots, policyState, policyStatus } from "./policies";
import type { BuildingType, GameState, ZoneType } from "./types";
import { buildableLots, voiceCandidates } from "./voices";

export interface Advice {
  id: string;
  emoji: string;
  /** 何をするか（短く） */
  title: string;
  /** なぜ・どうやって */
  detail: string;
  tool?: BuildingType;
  openTab?: "finance" | "policy";
  /** 解決に役立つ条例 */
  policy?: string;
  tile?: number;
  /** 急ぎかどうか（赤字・破綻など） */
  urgent?: boolean;
}

/** 困りごとの声 id → おすすめの見出し */
const TITLES: Record<string, { emoji: string; title: string; urgent?: boolean }> = {
  debt: { emoji: "🚨", title: "資金を立て直そう", urgent: true },
  deficit: { emoji: "💴", title: "赤字を止めよう", urgent: true },
  unemployment: { emoji: "💼", title: "働く場所を増やそう" },
  laborShortage: { emoji: "🏠", title: "働き手が足りません" },
  noise: { emoji: "🔊", title: "住宅と工場をはなそう" },
  pollution: { emoji: "🌫️", title: "空気をきれいにしよう" },
  hospital: { emoji: "🏥", title: "病院を建てよう" },
  school: { emoji: "🏫", title: "学校を建てよう" },
  park: { emoji: "🌳", title: "公園を増やそう" },
  shopping: { emoji: "🛍️", title: "住宅の近くにお店を" },
  fire: { emoji: "🚒", title: "消防署を建てよう" },
  traffic: { emoji: "🚗", title: "渋滞を減らそう" },
  taxHigh: { emoji: "💸", title: "住宅税を見直そう" },
  noRoad: { emoji: "🛣️", title: "道路に面するようにしよう", urgent: true },
  disconnected: { emoji: "🛣️", title: "道路を役所までつなごう" },
  comOversupply: { emoji: "🏠", title: "お客さんを増やそう" },
  indOversupply: { emoji: "🏭", title: "工場を見直そう" },
  growthBlocked: { emoji: "⬆️", title: "建物が大きくなる条件をそろえよう" },
  noLand: { emoji: "🗺️", title: "建てる土地をつくろう" },
  housing: { emoji: "🏠", title: "住宅を増やそう" },
  abandoned: { emoji: "🏚️", title: "空き家をなんとかしよう" },
};

const ZONE_ADVICE: Record<ZoneType, { emoji: string; title: string; detail: string }> = {
  residential: { emoji: "🏠", title: "住宅を建てよう", detail: "住みたい人・働き手が足りません。道路ぞいに住宅ゾーンを置こう" },
  commercial: { emoji: "🏪", title: "お店を建てよう", detail: "お店が足りません。住宅から3マス以内に置くと買い物が便利になる" },
  industrial: { emoji: "🏭", title: "工場を建てよう", detail: "工場の注文が増えています。住宅から3マス以上はなして置こう" },
};

/** 困りごとの声を解決しやすい条例で、いま制定できるもの（枠が空いているときだけ） */
export function policyFor(state: GameState, voiceId: string): string | undefined {
  if (policyState(state).active.length >= policySlots(state)) return undefined;
  return POLICY_DEFS.find((d) => d.fixes?.includes(voiceId) && policyStatus(state, d).status === "available")?.id;
}

export function nextAdvice(state: GameState, a: CityAnalysis): Advice | null {
  if (state.gameOver) return null;

  // 1. 困りごと（重要度の高いもの）
  // お金の危機（破綻が近い）は、ほかの困りごとより先に伝える
  const rank = (c: { id: string; severity: number }) => c.severity + (TITLES[c.id]?.urgent && c.severity >= 90 ? 1000 : 0);
  const bad = voiceCandidates(state, a, state.lastReport)
    .filter((c) => c.tone === "bad" && TITLES[c.id] && c.severity >= 35)
    .sort((x, y) => rank(y) - rank(x))[0];
  const fromVoice = (c: NonNullable<typeof bad>): Advice => {
    const t = TITLES[c.id];
    const tool = c.tool && isBuildingUnlocked(c.tool, state.rank) ? c.tool : undefined;
    return { id: c.id, emoji: t.emoji, title: t.title, detail: c.hint ?? c.text, tool, openTab: c.openTab, tile: c.tile, urgent: t.urgent && c.severity >= 90, policy: policyFor(state, c.id) };
  };
  if (bad && rank(bad) >= 1000) return fromVoice(bad);

  // 2. 序盤のミッション（遊び方の案内）があれば、それを優先する
  const mission = currentMission(state);
  if (mission) return { id: "mission", emoji: "🎯", title: mission.title, detail: mission.hint, tool: mission.tool };

  if (bad) return fromVoice(bad);

  // 3. いちばん高い需要（人手不足のときは、お店や工場より先に住宅）
  const zones: ZoneType[] = ["residential", "commercial", "industrial"];
  let top = zones.reduce((best, z) => (a.demand[z] > a.demand[best] ? z : best), zones[0]);
  if (top !== "residential" && a.employment.jobs > 20 && a.employment.jobFillRate < 0.9) top = "residential";
  if (a.demand[top] > DEMAND.high) {
    if (buildableLots(state, a) === 0) {
      const megacity = state.rank === "megacity";
      if (megacity || state.rank === "metropolis") {
        return {
          id: "land",
          emoji: "🗺️",
          title: "建てる土地をつくろう",
          detail: `${BUILDINGS[top].name}を建てたいのに、空き地がありません。${megacity ? "土地の買い足し・" : ""}埋め立て・建て替え（詳細の🔁）で場所をつくろう`,
          tool: undefined,
        };
      }
      return { id: "land", emoji: "🛣️", title: "道路を延ばそう", detail: `${BUILDINGS[top].name}を建てたいのに、道路に面した空き地がありません`, tool: "road" };
    }
    return { id: `demand-${top}`, ...ZONE_ADVICE[top], tool: top };
  }

  // 4. 順調なとき
  return { id: "steady", emoji: "✨", title: "街は順調です", detail: "月を進めて成長を待とう。公園や学校の範囲を広げると、建物がもっと大きくなる" };
}
