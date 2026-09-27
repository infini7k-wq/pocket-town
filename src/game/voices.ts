// 住民の声：シミュレーションの状態から「いま街で起きている問題・良いこと」を住民のセリフとして生成する。
// 単なるランダム文章ではなく、プレイヤーに問題点と解決のヒントを伝える UI として使う。
// 困りごとが解決すると、同じ住民がお礼を言う（問題 → 解決 → 感謝 の流れ）。

import type { CityAnalysis } from "./analysis";
import { BUILDINGS, isProject, isRoad, isZone } from "./buildings";
import { ECONOMY, GROWTH } from "./config";
import { getEra } from "./eras";
import { formatYen } from "./format";
import { nextLevelChecks } from "./growth";
import { forEachInRadius, isUnlockedTile, neighbors4 } from "./map";
import { getRank, isBuildingUnlocked, rankIndex } from "./progression";
import type { Rng } from "./rng";
import type { BuildingType, GameState, MonthReport, Tone, Voice } from "./types";

interface Candidate {
  id: string;
  severity: number;
  tone: Tone;
  persona: keyof typeof PERSONAS;
  text: string;
  hint?: string;
  tile?: number;
  tool?: BuildingType;
  openTab?: "finance";
}

const PERSONAS = {
  worker: { persona: "会社員（30代）", face: "👨‍💼" },
  jobSeeker: { persona: "求職中（20代）", face: "😟" },
  parent: { persona: "子育て中の親", face: "👩‍👧" },
  elder: { persona: "お年寄り", face: "👴" },
  shop: { persona: "商店主", face: "👨‍🍳" },
  factory: { persona: "工場長", face: "👷" },
  student: { persona: "学生", face: "🎒" },
  newcomer: { persona: "引っ越してきたい人", face: "🧳" },
  resident: { persona: "住民", face: "🙂" },
  kid: { persona: "子ども", face: "🧒" },
};

/** 困りごとが解決したときのお礼（id は困りごとの声の id） */
const THANKS: Record<string, { persona: keyof typeof PERSONAS; text: string }> = {
  unemployment: { persona: "jobSeeker", text: "やっと仕事が見つかった！町長、ありがとう！" },
  laborShortage: { persona: "shop", text: "働き手が増えて、お店が回るようになったよ！" },
  noise: { persona: "resident", text: "静かになって、ぐっすり眠れるようになった！" },
  pollution: { persona: "resident", text: "空気がきれいになった気がする！" },
  hospital: { persona: "elder", text: "病院が近くなって安心だよ。ありがとう。" },
  school: { persona: "parent", text: "学校に通いやすくなって助かるわ！" },
  park: { persona: "kid", text: "近くで遊べるようになった！" },
  shopping: { persona: "parent", text: "買い物が便利になったわ！" },
  traffic: { persona: "worker", text: "渋滞が減って、朝がラクになった！" },
  deficit: { persona: "worker", text: "財政が持ち直したみたいで、ひと安心。" },
  debt: { persona: "worker", text: "財政破綻の心配がなくなって、本当によかった！" },
  noRoad: { persona: "newcomer", text: "道路ができて、家が建てられた！" },
  disconnected: { persona: "resident", text: "道路が街の中心までつながって便利になった！" },
  housing: { persona: "newcomer", text: "やっと引っ越してこられた！" },
  growthBlocked: { persona: "resident", text: "まわりの建物がどんどん大きくなってきた！" },
  fire: { persona: "elder", text: "消防署ができて、ひと安心だよ。" },
  taxHigh: { persona: "worker", text: "税金が下がって助かる！" },
};

/** 条件を満たす住宅のうち、住民がもっとも多いマス */
function worstResidential(state: GameState, pred: (i: number) => boolean): { tile?: number; share: number } {
  let best = -1;
  let bestPop = -1;
  let affected = 0;
  let total = 0;
  state.tiles.forEach((t, i) => {
    const b = t.building;
    if (b?.type !== "residential" || b.level === 0) return;
    total += b.occupants;
    if (!pred(i)) return;
    affected += b.occupants;
    if (b.occupants > bestPop) {
      bestPop = b.occupants;
      best = i;
    }
  });
  return { tile: best >= 0 ? best : undefined, share: total > 0 ? affected / total : 0 };
}

function recentlyBuilt(state: GameState, type: string): number | undefined {
  const i = state.tiles.findIndex((t) => t.building?.type === type && t.building.builtTurn >= state.turn - 1 && t.building.builtTurn > 0);
  return i >= 0 ? i : undefined;
}

const man = (v: number) => formatYen(v, { compact: true });

/** 公共施設のヒント：維持費を添え、今の収支で赤字になるなら先に稼ぐよう伝える */
function facilityHint(type: BuildingType, a: CityAnalysis, base: string): { hint: string; affordable: boolean } {
  const upkeep = BUILDINGS[type].upkeep;
  const affordable = a.budget.net >= upkeep;
  const hint = `${base}（維持費 ${man(upkeep)}/月）` + (affordable ? "" : "。今の収支だと赤字になるので、先に住宅やお店を増やそう");
  return { hint, affordable };
}

/** 成長を止めている条件を集計する */
function growthBlockers(state: GameState, a: CityAnalysis): { key: string; count: number; tile: number } | null {
  const maxLevel = getRank(state.rank).maxLevel;
  const counts = new Map<string, { count: number; tile: number }>();
  state.tiles.forEach((t, i) => {
    const b = t.building;
    if (!b || !isZone(b.type) || b.level === 0 || b.abandoned || b.level >= maxLevel) return;
    if (b.growth < GROWTH.threshold[b.level] * 0.5) return;
    for (const c of nextLevelChecks(state, i, a) ?? []) {
      if (c.ok) continue;
      const key = c.label.includes("学校")
        ? "school"
        : c.label.includes("バス停")
          ? "transit"
          : c.label.includes("満足度")
            ? "happiness"
            : c.label.includes("環境")
              ? "env"
              : c.label.includes("お客さん")
                ? "customers"
                : c.label.includes("働き手") || c.label.includes("人手")
                  ? "workers"
                  : c.label.includes("渋滞")
                    ? "traffic"
                    : null;
      if (!key) continue;
      const cur = counts.get(key) ?? { count: 0, tile: i };
      cur.count++;
      counts.set(key, cur);
    }
  });
  let best: { key: string; count: number; tile: number } | null = null;
  for (const [key, v] of counts) if (!best || v.count > best.count) best = { key, ...v };
  return best && best.count >= 2 ? best : null;
}

/** 道路に面した空き地の数（建てられる土地） */
export function buildableLots(state: GameState, a: CityAnalysis): number {
  let n = 0;
  state.tiles.forEach((t, i) => {
    if (t.building || t.terrain === "water" || !isUnlockedTile(state, i)) return;
    if (neighbors4(i, state.width, state.height).some((j) => isRoad(state.tiles[j].building?.type) && a.net.connected[j])) n++;
  });
  return n;
}

export function voiceCandidates(state: GameState, a: CityAnalysis, report: MonthReport | null): Candidate[] {
  const out: Candidate[] = [];
  const emp = a.employment;
  const pop = a.population;
  const tendency = state.profile.tendency;
  const rank = rankIndex(state.rank);
  const net = a.budget.net;

  // ---------- お金（いちばん大事なので最優先） ----------
  if (state.money < 0) {
    const left = Math.max(1, ECONOMY.bankruptcyMonths - state.debtMonths);
    out.push({ id: "debt", openTab: "finance", severity: 200, tone: "bad", persona: "worker", text: `資金がマイナス！あと${left}か月で財政破綻してしまう…`, hint: "お金を借りる・税を少し上げる・町の施設を撤去する（建設費の40%が戻る）で立て直そう" });
  } else if (net < 0) {
    const left = Math.floor(state.money / -net);
    out.push({
      id: "deficit",
      openTab: "finance",
      severity: Math.min(150, 45 + Math.max(0, 24 - left) * 4),
      tone: "bad",
      persona: "worker",
      text: left < 60 ? `毎月 ${man(-net)} の赤字…このままだと約${left}か月でお金が尽きるよ。` : `毎月 ${man(-net)} の赤字が続いているみたい。`,
      hint: "税を少し上げるか、住宅やお店を増やして税収を上げよう",
    });
  }

  // ---------- 仕事 ----------
  const indNeeded = a.demand.industrial >= a.demand.commercial;
  if (pop > 0 && emp.unemployment > 0.05) {
    const left = report?.outflowReasons?.jobless ?? 0;
    const kind = indNeeded ? "工業" : "商業";
    out.push({
      id: "unemployment",
      tool: indNeeded ? "industrial" : "commercial",
      severity: 40 + emp.unemployment * 400,
      tone: "bad",
      persona: "jobSeeker",
      text: left >= 5 ? `仕事がなくて、先月${left}人が街を出ていったよ…` : "仕事が見つからない…この街で働きたいのに。",
      hint: `${kind}を建てて働く場所を増やそう（いま求められているのは${kind}）`,
    });
  }
  if (emp.jobs > 20 && emp.jobFillRate < 0.88) {
    out.push({ id: "laborShortage", tool: "residential", severity: (0.92 - emp.jobFillRate) * 300, tone: "bad", persona: "shop", text: "人手が足りなくて、お店が回らないよ。", hint: "住宅を増やして働き手を呼ぼう" });
  }

  // ---------- 騒音・空気 ----------
  let noisiest = -1;
  let noisyPeople = 0;
  state.tiles.forEach((t, i) => {
    if (t.building?.type !== "residential" || t.building.occupants === 0 || a.noise[i] <= 5) return;
    noisyPeople += t.building.occupants;
    if (noisiest < 0 || a.noise[i] > a.noise[noisiest]) noisiest = i;
  });
  if (noisiest >= 0) {
    let airport = false;
    forEachInRadius(noisiest, 3, state.width, state.height, (j) => {
      if (state.tiles[j].building?.type === "airport") airport = true;
    });
    const share = pop > 0 ? noisyPeople / pop : 0;
    out.push({
      id: "noise",
      severity: 15 + share * 80 + Math.min(20, a.noise[noisiest]),
      tone: "bad",
      persona: "resident",
      text: airport ? "飛行機の音がうるさくて眠れない！" : "工場の騒音がひどい！夜も眠れない。",
      hint: airport ? "空港のまわり3マスには住宅を建てないようにしよう" : "騒音は工場から2マス先まで届く。住宅と工場は3マス以上はなすか、間に大きな公園を置こう（騒音が半分に）",
      tile: noisiest,
    });
  }
  const dirty = worstResidential(state, (i) => a.env[i] < 45);
  if (dirty.tile !== undefined) {
    out.push({ id: "pollution", tool: "park", severity: 25 + dirty.share * 40, tone: "bad", persona: tendency === "eco" ? "parent" : "resident", text: "最近、空気が悪い気がする…。", hint: "工場の煙は3マス先まで届く。工場から離すか、公園を増やそう", tile: dirty.tile });
  }

  // ---------- 公共施設（序盤は高い施設を一斉に求めない） ----------
  const noHospital = worstResidential(state, (i) => a.coverage.health[i] === 0);
  if ((pop > 600 || rank >= 1) && noHospital.share > 0.35) {
    const h = facilityHint("hospital", a, "病院を建てよう。範囲5マス");
    out.push({ id: "hospital", tool: "hospital", severity: noHospital.share * (tendency === "elderly" ? 60 : 40) * (h.affordable ? 1 : 0.5), tone: "bad", persona: "elder", text: "病院が遠すぎる。何かあったら心配だよ。", hint: h.hint, tile: noHospital.tile });
  }
  const noSchool = worstResidential(state, (i) => a.coverage.education[i] === 0);
  if (pop > 350 && noSchool.share > 0.35) {
    const h = facilityHint("school", a, "学校を建てよう。範囲4マス、マンションに育つ条件にもなる");
    out.push({ id: "school", tool: "school", severity: noSchool.share * (tendency === "families" ? 55 : 36) * (h.affordable ? 1 : 0.5), tone: "bad", persona: "parent", text: "子どもを通わせる学校が近くにないの。", hint: h.hint, tile: noSchool.tile });
  }
  if (pop > 150) {
    const noPark = worstResidential(state, (i) => a.coverage.park[i] === 0);
    if (noPark.share > 0.45) {
      out.push({ id: "park", tool: rank >= 1 ? "bigPark" : "park", severity: noPark.share * 32, tone: "bad", persona: "kid", text: "近くに遊べる公園がほしいな。", hint: rank >= 1 ? "公園は2マス先、大きな公園は4マス先まで効く（大きな公園は効き目も1.3倍）" : "公園は安くて、2マス先の家まで効く", tile: noPark.tile });
    }
    const noShop = worstResidential(state, (i) => a.coverage.shopping[i] === 0);
    if (noShop.share > 0.35) {
      out.push({ id: "shopping", tool: "commercial", severity: noShop.share * 30, tone: "bad", persona: "parent", text: "買い物できるお店が近くになくて不便。", hint: "家から3マス以内にお店を建てよう（隣でも大丈夫）", tile: noShop.tile });
    }
  }
  if (a.fireRisk > 0.5 && (pop > 800 || rank >= 1)) {
    const h = facilityHint("fireStation", a, "消防署を建てると火事が起きにくくなる");
    out.push({ id: "fire", tool: "fireStation", severity: a.fireRisk * 30 * (h.affordable ? 1 : 0.5), tone: "bad", persona: "elder", text: "近くに消防署がなくて、火事が心配。", hint: h.hint });
  }

  // ---------- 交通・税・道路 ----------
  if (a.congestion > 20) {
    let worst = -1;
    a.traffic.ratio.forEach((r, i) => {
      if (r > 0 && (worst < 0 || r > a.traffic.ratio[worst])) worst = i;
    });
    out.push({
      id: "traffic",
      tool: rank >= 1 ? "busStop" : "road",
      severity: a.congestion * 1.2,
      tone: "bad",
      persona: "worker",
      text: "朝の渋滞がひどくて会社に遅刻しそう。",
      hint: rank >= 1 ? "並行する道路・大通り・バス停で車を分散しよう" : "並行する道路をつくろう（「町」になると大通りとバス停が使える）",
      tile: worst >= 0 ? worst : undefined,
    });
  }
  if (state.taxes.residential >= 12) {
    out.push({ id: "taxHigh", openTab: "finance", severity: (state.taxes.residential - 9) * 7, tone: "bad", persona: "worker", text: "税金が高すぎる！引っ越しを考えちゃう。", hint: "住宅税を下げると満足度が上がる" });
  }
  const unzoned = state.tiles.findIndex((t, i) => t.building && isZone(t.building.type) && !a.net.roadAccess[i]);
  if (unzoned >= 0) {
    out.push({ id: "noRoad", tool: "road", severity: 50, tone: "bad", persona: "newcomer", text: "土地はあるのに道路がなくて、家が建てられない。", hint: "建物は道路に面していないと使えない", tile: unzoned });
  } else {
    const disconnected = state.tiles.findIndex((t, i) => t.building && !isRoad(t.building.type) && BUILDINGS[t.building.type].category !== "special" && a.net.roadAccess[i] && !a.net.connected[i]);
    if (disconnected >= 0) {
      out.push({ id: "disconnected", tool: "road", severity: 42, tone: "bad", persona: "resident", text: "うちの前の道、街の中心までつながってないんだよね。", hint: "道路を役所までつなげよう（つながるまで効果が半分）", tile: disconnected });
    }
  }

  // ---------- お店・工場の過不足 ----------
  const unemploymentShown = out.some((c) => c.id === "unemployment");
  if (emp.comJobs > 10 && emp.comEfficiency < 0.8 && !unemploymentShown) {
    out.push({ id: "comOversupply", tool: "residential", severity: (0.9 - emp.comEfficiency) * 160, tone: "bad", persona: "shop", text: "お客さんが来ない…お店が多すぎるのかな。", hint: "住宅を増やしてお客さんを呼ぼう" });
  }
  if (emp.indJobs > 10 && emp.indEfficiency < 0.8) {
    const decline = a.fx.indDemand < -0.1;
    out.push({
      id: "indOversupply",
      tool: decline ? undefined : "residential",
      severity: (0.9 - emp.indEfficiency) * 150,
      tone: "bad",
      persona: "factory",
      text: "注文が減って工場がヒマなんだ。",
      hint: decline ? "工場の注文が減る時代。工場をマスで調べて、商業に建て替えよう" : "工場が多すぎる。住宅を増やすか、工業税を少し下げよう",
    });
  }

  // ---------- 成長が止まっている・土地がない ----------
  const blocked = growthBlockers(state, a);
  if (blocked) {
    const n = blocked.count;
    const map: Record<string, { text: string; hint: string; tool?: BuildingType; persona: keyof typeof PERSONAS }> = {
      school: { persona: "parent", text: `マンションに建て替えたいのに、学校が遠くて…（${n}棟が待っているよ）`, hint: "学校（範囲4マス）や大学（範囲8マス）の近くの住宅がマンションに育つ", tool: "school" },
      transit: { persona: "worker", text: `タワーマンションや複合ビルは、バス停かバスターミナルが近くにないと建たないんだって（${n}棟）`, hint: "バス停（範囲3マス）やバスターミナル（範囲5マス）を置こう", tool: isBuildingUnlocked("busStop", state.rank) ? "busStop" : "road" },
      happiness: { persona: "resident", text: `住みやすさが足りなくて、家を大きくできないみたい（${n}棟）`, hint: "公園・学校・病院の範囲を広げ、騒音や渋滞を減らそう", tool: rank >= 1 ? "bigPark" : "park" },
      env: { persona: "resident", text: `空気が悪くて、大きな家が建たないみたい（${n}棟）`, hint: "工場から離すか、公園を増やして空気をきれいにしよう", tool: "park" },
      customers: { persona: "shop", text: `お客さんが足りなくて、お店を大きくできないよ（${n}棟）`, hint: "住宅を増やしてお客さんを呼ぼう", tool: "residential" },
      workers: { persona: "factory", text: `人手が足りなくて、建物を大きくできないんだ（${n}棟）`, hint: "住宅を増やして働き手を呼ぼう", tool: "residential" },
      traffic: { persona: "shop", text: `前の道が渋滞していて、建物を大きくできないよ（${n}棟）`, hint: "大通りやバス停で渋滞を減らそう", tool: isBuildingUnlocked("avenue", state.rank) ? "avenue" : "road" },
    };
    const m = map[blocked.key];
    if (m) out.push({ id: "growthBlocked", severity: 30 + Math.min(40, n * 2), tone: "bad", persona: m.persona, text: m.text, hint: m.hint, tool: m.tool, tile: blocked.tile });
  }
  if (a.demand.residential > 20 && buildableLots(state, a) === 0) {
    out.push({
      id: "noLand",
      tool: rank >= 3 ? undefined : "road",
      severity: 45,
      tone: "bad",
      persona: "newcomer",
      text: "住みたい人はいるのに、建てる土地がもうないみたい。",
      hint:
        rank >= 3
          ? "埋め立てで土地を増やすか、建て替え・超高層化で人を増やそう"
          : rank >= 2
            ? "空き地に道路を引くか、バス停の近くで超高層化しよう"
            : "道路を延ばして新しい土地を開こう（ランクアップで建設エリアも広がる）",
    });
  }

  if (emp.vacancyRate < 0.05 && a.demand.residential > 25) {
    out.push({ id: "housing", tool: "residential", severity: 34, tone: "bad", persona: "newcomer", text: "この街に住みたいのに、空いている家がない！", hint: "住宅を増やそう" });
  }
  const abandoned = state.tiles.findIndex((t) => t.building?.abandoned);
  if (abandoned >= 0) {
    const type = state.tiles[abandoned].building!.type;
    const what = type === "residential" ? "空き家" : type === "commercial" ? "空き店舗" : "空き工場";
    out.push({ id: "abandoned", severity: 30, tone: "bad", persona: "elder", text: `${what}が増えてきて、さみしいねえ。`, hint: "まわりの住みやすさを上げると戻る。建て替えや撤去もできる", tile: abandoned });
  }

  // ---------- 時代の流れ（予告は節目の月だけ） ----------
  const next = state.era.next;
  if (next?.announced && next.turn > state.turn && [12, 6, 3, 1].includes(next.turn - state.turn)) {
    const e = getEra(next.id);
    out.push({ id: "eraSoon", severity: 36, tone: "neutral", persona: "worker", text: `あと${next.turn - state.turn}か月で「${e.name}の時代」が来るらしいよ。`, hint: e.tips[0] });
  }
  if (report?.eraChange) {
    const e = getEra(report.eraChange);
    out.push({ id: "eraNow", severity: 55, tone: "neutral", persona: "resident", text: `「${e.name}の時代」がはじまったね。街もこれから変わっていくのかな。`, hint: e.tips.join("／") });
  }

  // ---------- 良いこと ----------
  if (pop > 0 && a.cityHappiness >= 72) {
    out.push({ id: "happy", severity: 22 + (a.cityHappiness - 72), tone: "good", persona: "resident", text: "この街は住みやすい！ずっと住みたいな。" });
  }
  const park = recentlyBuilt(state, "park") ?? recentlyBuilt(state, "bigPark");
  if (park !== undefined) out.push({ id: "newPark", severity: 30, tone: "good", persona: "kid", text: "新しい公園ができてうれしい！", tile: park });
  const school = recentlyBuilt(state, "school");
  if (school !== undefined) out.push({ id: "newSchool", severity: 32, tone: "good", persona: "parent", text: "近くに学校ができて安心したわ。", tile: school });
  const hospital = recentlyBuilt(state, "hospital");
  if (hospital !== undefined) out.push({ id: "newHospital", severity: 32, tone: "good", persona: "elder", text: "病院が近くにできて、ひと安心だよ。", tile: hospital });
  const bus = recentlyBuilt(state, "busStop") ?? recentlyBuilt(state, "station");
  if (bus !== undefined) out.push({ id: "newTransit", severity: 28, tone: "good", persona: "student", text: "通学が楽になった！", tile: bus });
  const up = report?.changes.find((c) => c.kind === "levelUp" && state.tiles[c.tile].building?.type === "residential");
  if (up) {
    out.push({
      id: "levelUp",
      severity: up.level >= 3 ? 34 : 24,
      tone: "good",
      persona: "resident",
      text: up.level === 5 ? "超高層レジデンスが完成！街のどこからでも見えるよ！" : up.level === 4 ? "タワーマンションが建った！景色が最高だって！" : up.level === 3 ? "新しいマンションが建った！街が都会になってきた。" : "近所に集合住宅が建って、にぎやかになってきた。",
      tile: up.tile,
    });
  }
  const comUp = report?.changes.find((c) => c.kind === "levelUp" && state.tiles[c.tile].building?.type === "commercial");
  if (comUp) out.push({ id: "comUp", severity: 22, tone: "good", persona: "shop", text: "お店が大きくなったよ！ぜひ来てね。", tile: comUp.tile });
  if (pop > 100 && emp.employmentRate >= 0.97 && emp.jobFillRate >= 0.85) {
    out.push({ id: "jobs", severity: 18, tone: "good", persona: "jobSeeker", text: "仕事がすぐに見つかった！" });
  }
  if (pop > 100 && a.cityEnvironment >= 78) {
    out.push({ id: "clean", severity: 18, tone: "good", persona: "parent", text: "空気がおいしくて、緑の多い街だね。" });
  }
  if (state.taxes.residential <= 6) {
    out.push({ id: "taxLow", severity: 16, tone: "good", persona: "worker", text: "税金が安くて助かる〜。" });
  }
  if (pop > 1500 && a.congestion < 8) {
    out.push({ id: "smooth", severity: 14, tone: "good", persona: "worker", text: "道が空いていて通勤が快適！" });
  }
  const project = report?.changes.find((c) => c.kind === "built" && isProject(state.tiles[c.tile].building?.type));
  if (project) {
    const def = BUILDINGS[state.tiles[project.tile].building!.type];
    out.push({ id: "projectDone", severity: 58, tone: "good", persona: "kid", text: `${def.name}ができた！${def.emoji[1]} ずっと楽しみにしてたんだ！`, tile: project.tile });
  }
  const underway = state.tiles.findIndex((t) => isProject(t.building?.type) && (t.building?.buildLeft ?? 0) > 0);
  if (underway >= 0) {
    const b = state.tiles[underway].building!;
    out.push({ id: "projectWork", severity: 20, tone: "neutral", persona: "worker", text: `${BUILDINGS[b.type].name}の工事、あと${b.buildLeft}か月で完成だって。楽しみ！`, tile: underway });
  }
  if (report?.rankUp) {
    const r = getRank(report.rankUp);
    out.push({ id: "rankUp", severity: 60, tone: "good", persona: "kid", text: `うちの街、「${r.name}」になったんだって！すごい！` });
  }
  return out;
}

/**
 * 今月の声を選ぶ。
 * - 重要度の高い順に最大 max 件
 * - 同じ建物で解決できる声は1件にまとめる
 * - 先月の困りごとが解決していれば、お礼の声を出す
 * - 良い声が1つもなければ1枠を良い声にする（褒められる体験も大事）
 */
export function generateVoices(state: GameState, a: CityAnalysis, rng: Rng, report: MonthReport | null, prev: Voice[] = [], max = 4): Voice[] {
  const all = voiceCandidates(state, a, report);
  const currentIds = new Set(all.map((c) => c.id));
  for (const v of prev) {
    const thanks = v.tone === "bad" ? THANKS[v.id] : undefined;
    if (thanks && !currentIds.has(v.id)) all.push({ id: `thanks-${v.id}`, severity: 48, tone: "good", persona: thanks.persona, text: thanks.text });
  }
  const candidates = all.map((c) => ({ ...c, score: c.severity + rng.range(0, 8) })).sort((x, y) => y.score - x.score);

  const picked: typeof candidates = [];
  const usedTools = new Set<string>();
  for (const c of candidates) {
    if (picked.length >= max) break;
    const key = c.tone === "bad" ? (c.tool ?? c.openTab) : undefined;
    if (key && usedTools.has(key)) continue;
    if (key) usedTools.add(key);
    picked.push(c);
  }
  if (!picked.some((c) => c.tone === "good")) {
    const good = candidates.find((c) => c.tone === "good");
    if (good) picked[Math.min(picked.length, max - 1)] = good;
  }
  if (picked.length === 0) {
    picked.push({ id: "calm", severity: 0, score: 0, tone: "neutral", persona: "resident", text: "のんびりした、いい街だね。" });
  }
  return picked.map((c) => ({
    id: c.id,
    ...PERSONAS[c.persona],
    text: c.text,
    tone: c.tone,
    hint: c.hint,
    tile: c.tile,
    tool: c.tool,
    openTab: c.openTab,
  }));
}
