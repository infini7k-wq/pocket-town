// 条例（政策カード）：町長が町の方針を決める。枠はランクで増え、効果には必ず代わりに悪くなることがある。

import { scaledCost } from "./events";
import { getEra } from "./eras";
import { population } from "./map";
import { rankIndex } from "./progression";
import type { ActionResult, GameState, Modifier, ModifierEffects, PolicyState, RankId } from "./types";

export type PolicyCategory = "life" | "economy" | "environment";

export interface PolicyDef {
  id: string;
  name: string;
  emoji: string;
  category: PolicyCategory;
  /** ひとことの説明 */
  description: string;
  /** よくなること・悪くなること（表示用） */
  pros: string[];
  cons: string[];
  effects: ModifierEffects;
  /** 住民1人あたりの毎月の費用 */
  perCapita: number;
  /** 支持率への影響 */
  approval: number;
  unlockRank: RankId;
  /** この時代には効果が上乗せされる */
  eraBonus?: { era: string; effects: ModifierEffects; note: string }[];
  /** 建物の高さの上限（景観保全など） */
  levelCap?: number;
  /** 同時に制定できない条例 */
  excludes?: string[];
  /** この条例で解決しやすい住民の声の id */
  fixes?: string[];
}

export const POLICY_DEFS: PolicyDef[] = [
  {
    id: "noCar",
    name: "ノーマイカー運動",
    emoji: "🚲",
    category: "environment",
    description: "車の通勤を控えてもらう",
    pros: ["交通量 −12%"],
    cons: ["お店の客 −5%", "支持率 −1"],
    effects: { traffic: -0.12, comDemand: -0.05 },
    perCapita: 0,
    approval: -1,
    unlockRank: "village",
    eraBonus: [{ era: "green", effects: { approval: 3 }, note: "エコの時代は支持率 +3" }],
    fixes: ["traffic"],
  },
  {
    id: "childcare",
    name: "子育て応援",
    emoji: "👶",
    category: "life",
    description: "子育て世帯に手当を出す",
    pros: ["引っ越してくる人が増える", "学校の効果 +30%", "支持率 +2"],
    cons: ["住民1人あたり ¥25/月"],
    effects: { resAppeal: 0.04, eduWeight: 0.3 },
    perCapita: 25,
    approval: 2,
    unlockRank: "village",
    eraBonus: [{ era: "babyBoom", effects: { resAppeal: 0.03 }, note: "子育てブームの時代は効果アップ" }],
    fixes: ["school", "housing"],
  },
  {
    id: "shopping",
    name: "商店街振興",
    emoji: "🏮",
    category: "economy",
    description: "お店のイベントやポイントを支援する",
    pros: ["お店の客 +15%"],
    cons: ["交通量 +5%", "住民1人あたり ¥15/月"],
    effects: { comDemand: 0.15, traffic: 0.05 },
    perCapita: 15,
    approval: 0,
    unlockRank: "village",
    eraBonus: [{ era: "tourism", effects: { comDemand: 0.1 }, note: "観光ブームの時代は効果アップ" }],
    fixes: ["comOversupply", "shopping"],
  },
  {
    id: "greening",
    name: "緑化推進",
    emoji: "🌲",
    category: "environment",
    description: "街路樹や屋上緑化を進める",
    pros: ["空気 +4", "公園の効果 +20%", "支持率 +1"],
    cons: ["工場の注文 −10%", "住民1人あたり ¥10/月"],
    effects: { env: 4, parkWeight: 0.2, indDemand: -0.1 },
    perCapita: 10,
    approval: 1,
    unlockRank: "village",
    eraBonus: [{ era: "green", effects: { approval: 2 }, note: "エコの時代は支持率 +2" }],
    excludes: ["factoryZone"],
    fixes: ["pollution", "park"],
  },
  {
    id: "health",
    name: "健康長寿",
    emoji: "👴",
    category: "life",
    description: "健康診断や体操教室を広める",
    pros: ["病院の効果 +40%", "満足度 +2", "支持率 +2"],
    cons: ["住民1人あたり ¥35/月"],
    effects: { healthWeight: 0.4, happiness: 2 },
    perCapita: 35,
    approval: 2,
    unlockRank: "town",
    eraBonus: [{ era: "aging", effects: { approval: 3 }, note: "高齢化の時代は支持率 +3" }],
    fixes: ["hospital"],
  },
  {
    id: "factoryZone",
    name: "企業誘致特区",
    emoji: "🏭",
    category: "economy",
    description: "工場に税の優遇をして呼び込む",
    pros: ["工場の注文 +25%", "工場の仕事 +60人分"],
    cons: ["空気 −4", "税収 −5%", "支持率 −1"],
    effects: { indDemand: 0.25, indSupport: 60, env: -4, taxIncome: -0.05 },
    perCapita: 0,
    approval: -1,
    unlockRank: "town",
    eraBonus: [
      { era: "growth", effects: { indDemand: 0.1 }, note: "高度成長の時代は効果アップ" },
      { era: "postIndustrial", effects: { approval: -3 }, note: "脱工業化の時代は支持率 −3" },
      { era: "green", effects: { approval: -3 }, note: "エコの時代は支持率 −3" },
    ],
    excludes: ["greening"],
    fixes: ["unemployment"],
  },
  {
    id: "disaster",
    name: "防災まちづくり",
    emoji: "🧯",
    category: "life",
    description: "防災訓練と建物の耐震化を進める",
    pros: ["火事・地震・洪水・台風が起きにくい（半分）", "満足度 +1", "支持率 +1"],
    cons: ["住民1人あたり ¥15/月"],
    effects: { disasterShield: 0.5, happiness: 1 },
    perCapita: 15,
    approval: 1,
    unlockRank: "town",
    fixes: ["fire"],
  },
  {
    id: "reform",
    name: "行財政改革",
    emoji: "✂️",
    category: "economy",
    description: "町の施設の運営を見直して節約する",
    pros: ["町の施設の維持費 −15%"],
    cons: ["満足度 −3", "支持率 −3"],
    effects: { serviceUpkeep: -0.15, happiness: -3 },
    perCapita: 0,
    approval: -3,
    unlockRank: "town",
    eraBonus: [{ era: "stagnation", effects: { approval: 3 }, note: "低成長の時代は支持率 +3" }],
    fixes: ["deficit", "debt"],
  },
  {
    id: "quiet",
    name: "静かな住宅地",
    emoji: "🔇",
    category: "life",
    description: "工場の夜間の操業や騒音を規制する",
    pros: ["騒音 −30%", "支持率 +1"],
    cons: ["工場の注文 −8%", "住民1人あたり ¥10/月"],
    effects: { noiseShield: 0.3, indDemand: -0.08 },
    perCapita: 10,
    approval: 1,
    unlockRank: "town",
    fixes: ["noise"],
  },
  {
    id: "density",
    name: "容積率緩和",
    emoji: "🏗️",
    category: "economy",
    description: "高い建物を建てやすくする",
    pros: ["建物が育つ確率 +20%"],
    cons: ["交通量 +10%", "空気 −2", "支持率 −1"],
    effects: { levelUpChance: 0.2, traffic: 0.1, env: -2 },
    perCapita: 0,
    approval: -1,
    unlockRank: "city",
    excludes: ["landscape"],
    fixes: ["growthBlocked"],
  },
  {
    id: "landscape",
    name: "景観保全",
    emoji: "🏯",
    category: "environment",
    description: "街並みを守り、高い建物を制限する",
    pros: ["満足度 +3", "空気 +3", "お店の客 +5%", "支持率 +2"],
    cons: ["建物は3段目まで（4段目以上は建たない）"],
    effects: { happiness: 3, env: 3, comDemand: 0.05 },
    perCapita: 0,
    approval: 2,
    unlockRank: "city",
    levelCap: 3,
    eraBonus: [{ era: "tourism", effects: { comDemand: 0.1 }, note: "観光ブームの時代は効果アップ" }],
    excludes: ["density"],
  },
  {
    id: "tourism",
    name: "観光振興",
    emoji: "📸",
    category: "economy",
    description: "観光の宣伝と案内所を整える",
    pros: ["お店の客 +20%", "お店の仕事 +20人分"],
    cons: ["交通量 +15%", "空気 −2", "住民1人あたり ¥30/月"],
    effects: { comDemand: 0.2, extraComJobs: 20, traffic: 0.15, env: -2 },
    perCapita: 30,
    approval: 0,
    unlockRank: "city",
    eraBonus: [{ era: "tourism", effects: { comDemand: 0.15 }, note: "観光ブームの時代は効果アップ" }],
    fixes: ["comOversupply"],
  },
  {
    id: "revenue",
    name: "財源確保",
    emoji: "💹",
    category: "economy",
    description: "使用料や手数料を見直して収入を増やす",
    pros: ["税収 +5%"],
    cons: ["引っ越してくる人が少し減る", "支持率 −2"],
    effects: { taxIncome: 0.05, resAppeal: -0.02 },
    perCapita: 0,
    approval: -2,
    unlockRank: "city",
    fixes: ["deficit"],
  },
  {
    id: "freeTransit",
    name: "公共交通無料化",
    emoji: "🚇",
    category: "life",
    description: "バスと電車を無料にする",
    pros: ["交通量 −25%", "満足度 +2", "支持率 +2"],
    cons: ["住民1人あたり ¥35/月"],
    effects: { traffic: -0.25, happiness: 2 },
    perCapita: 35,
    approval: 2,
    unlockRank: "metropolis",
    fixes: ["traffic"],
  },
  {
    id: "techZone",
    name: "IT・学術特区",
    emoji: "💻",
    category: "economy",
    description: "研究所やIT企業を集める",
    pros: ["学校の効果 +50%", "お店の客 +10%", "お店の仕事 +150人分"],
    cons: ["住民1人あたり ¥30/月"],
    effects: { eduWeight: 0.5, comDemand: 0.1, comSupport: 150 },
    perCapita: 30,
    approval: 0,
    unlockRank: "metropolis",
    eraBonus: [{ era: "digital", effects: { comDemand: 0.15 }, note: "IT革命の時代は効果アップ" }],
    fixes: ["school"],
  },
  {
    id: "global",
    name: "国際都市宣言",
    emoji: "🌐",
    category: "economy",
    description: "海外からの人や会社を呼び込む",
    pros: ["引っ越してくる人が増える", "お店の客 +20%", "支持率 +1"],
    cons: ["交通量 +15%", "満足度 −1", "住民1人あたり ¥30/月"],
    effects: { resAppeal: 0.04, comDemand: 0.2, traffic: 0.15, happiness: -1 },
    perCapita: 30,
    approval: 1,
    unlockRank: "megacity",
  },
];

export const POLICY_CATEGORY_NAMES: Record<PolicyCategory, string> = { life: "暮らし", economy: "経済", environment: "環境" };

/** 廃止したあと同じ条例を出し直せるまでの月数 */
export const POLICY_COOLDOWN = 12;
/** 制定してからこの月数以内に廃止すると「朝令暮改」で支持率が下がる */
export const POLICY_FLIPFLOP = 6;

const SLOTS_BY_RANK: Record<RankId, number> = { village: 1, town: 2, city: 3, metropolis: 4, megacity: 5 };

export function getPolicy(id: string): PolicyDef | undefined {
  return POLICY_DEFS.find((p) => p.id === id);
}

export function policyState(s: Pick<GameState, "policies">): PolicyState {
  return s.policies ?? { active: [], cooldowns: {}, bonusSlot: false };
}

/** 条例の枠の数（落選後の「新町長の方針」の間は1つ減る） */
export function policySlots(s: Pick<GameState, "rank" | "policies" | "politics">): number {
  const base = SLOTS_BY_RANK[s.rank] + (policyState(s).bonusSlot ? 1 : 0);
  return Math.max(1, base - ((s.politics?.opposition ?? 0) > 0 ? 1 : 0));
}

export function isPolicyUnlocked(def: PolicyDef, rank: RankId): boolean {
  return rankIndex(rank) >= rankIndex(def.unlockRank);
}

/** 毎月の費用（住民1人あたり × 人口） */
export function policyUpkeep(def: PolicyDef, s: Pick<GameState, "tiles">): number {
  return Math.round((def.perCapita * population(s)) / 100) * 100;
}

/** 制定にかかる費用（月額の3か月分。月額のない条例は規模に合わせた事務費） */
export function policyEnactCost(def: PolicyDef, s: GameState): number {
  const base = def.perCapita > 0 ? Math.max(100_000, Math.round((def.perCapita * population(s) * 3) / 10_000) * 10_000) : scaledCost(s, 100_000);
  return (s.politics?.opposition ?? 0) > 0 ? base * 2 : base;
}

/** 制定中の条例の効果（時代の上乗せと支持率を含む） */
export function policyModifiers(s: Pick<GameState, "policies" | "era">): Modifier[] {
  return policyState(s).active.flatMap(({ id }) => {
    const def = getPolicy(id);
    if (!def) return [];
    const bonus = def.eraBonus?.find((b) => b.era === s.era?.id);
    const out: Modifier[] = [{ id: `policy:${id}`, label: `条例：${def.name}`, emoji: def.emoji, turnsLeft: 1, effects: { ...def.effects, approval: def.approval } }];
    if (bonus) out.push({ id: `policy:${id}:era`, label: `${def.name}（${getEra(bonus.era).name}の時代）`, emoji: def.emoji, turnsLeft: 1, effects: bonus.effects });
    return out;
  });
}

/** 条例による建物の高さの上限（なければ 99） */
export function policyLevelCap(s: Pick<GameState, "policies">): number {
  let cap = 99;
  for (const { id } of policyState(s).active) cap = Math.min(cap, getPolicy(id)?.levelCap ?? 99);
  return cap;
}

/** 条例の毎月の費用の合計 */
export function totalPolicyUpkeep(s: Pick<GameState, "policies" | "tiles">): number {
  return policyState(s).active.reduce((sum, { id }) => {
    const def = getPolicy(id);
    return sum + (def ? policyUpkeep(def, s) : 0);
  }, 0);
}

export type PolicyStatus = "active" | "available" | "cooldown" | "locked" | "excluded";

export function policyStatus(s: GameState, def: PolicyDef): { status: PolicyStatus; monthsLeft?: number; reason?: string } {
  const ps = policyState(s);
  if (ps.active.some((a) => a.id === def.id)) return { status: "active" };
  if (!isPolicyUnlocked(def, s.rank)) return { status: "locked", reason: `「${rankName(def.unlockRank)}」で解禁` };
  const until = ps.cooldowns[def.id];
  if (until !== undefined && until > s.turn) return { status: "cooldown", monthsLeft: until - s.turn, reason: `あと${until - s.turn}か月で出し直せる` };
  const clash = def.excludes?.find((x) => ps.active.some((a) => a.id === x));
  if (clash) return { status: "excluded", reason: `「${getPolicy(clash)?.name}」とは同時に出せない` };
  return { status: "available" };
}

function rankName(id: RankId): string {
  return { village: "村", town: "町", city: "市", metropolis: "大都市", megacity: "メガシティ" }[id];
}

/** 条例を制定する（replaceId を指定すると、その条例と入れ替える） */
export function enactPolicy(s: GameState, id: string, replaceId?: string): ActionResult {
  const def = getPolicy(id);
  if (!def) return { ok: false, error: "条例が見つかりません" };
  if (s.gameOver) return { ok: false, error: "ゲームは終了しています" };
  let base = s;
  if (replaceId) {
    const r = revokePolicy(s, replaceId);
    if (!r.ok) return r;
    base = r.state;
  }
  const st = policyStatus(base, def);
  if (st.status !== "available") return { ok: false, error: st.status === "active" ? "すでに制定しています" : (st.reason ?? "制定できません") };
  const ps = policyState(base);
  if (ps.active.length >= policySlots(base)) return { ok: false, error: "条例の枠がいっぱいです（入れ替えるか、廃止してください）" };
  const cost = policyEnactCost(def, base);
  if (base.money < cost) return { ok: false, error: `資金が足りません（¥${cost.toLocaleString("ja-JP")} 必要）` };
  const next: GameState = {
    ...base,
    money: base.money - cost,
    monthSpend: base.monthSpend + cost,
    policies: { ...ps, active: [...ps.active, { id, since: base.turn }] },
  };
  return { ok: true, state: next, message: `📜 「${def.name}」を制定しました -¥${cost.toLocaleString("ja-JP")}` };
}

/** 条例を廃止する（出し直せるのは12か月後。制定して6か月以内なら支持率が下がる） */
export function revokePolicy(s: GameState, id: string): ActionResult {
  const ps = policyState(s);
  const entry = ps.active.find((a) => a.id === id);
  if (!entry) return { ok: false, error: "この条例は制定されていません" };
  if (s.gameOver) return { ok: false, error: "ゲームは終了しています" };
  const def = getPolicy(id);
  const flipflop = s.turn - entry.since < POLICY_FLIPFLOP;
  const modifiers = flipflop ? [...s.modifiers.filter((m) => m.id !== "flipflop"), { id: "flipflop", label: "朝令暮改", emoji: "🌀", turnsLeft: 6, effects: { approval: -3 } }] : s.modifiers;
  const next: GameState = {
    ...s,
    modifiers,
    policies: { ...ps, active: ps.active.filter((a) => a.id !== id), cooldowns: { ...ps.cooldowns, [id]: s.turn + POLICY_COOLDOWN } },
  };
  return { ok: true, state: next, message: `📜 「${def?.name ?? id}」を廃止しました${flipflop ? "（すぐに廃止したので支持率 −3）" : ""}` };
}
