// 住民の声：シミュレーションの状態から「いま街で起きている問題・良いこと」を住民のセリフとして生成する。
// 単なるランダム文章ではなく、プレイヤーに問題点と解決のヒントを伝える UI として使う。

import type { CityAnalysis } from "./analysis";
import { BUILDINGS, isProject, isRoad, isZone } from "./buildings";
import { getEra } from "./eras";
import { rankIndex } from "./progression";
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
  shop: { persona: "商店主", face: "🧑‍🍳" },
  factory: { persona: "工場長", face: "👷" },
  student: { persona: "学生", face: "🧑‍🎓" },
  newcomer: { persona: "転入希望者", face: "🧳" },
  resident: { persona: "住民", face: "🙂" },
  kid: { persona: "子ども", face: "🧒" },
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

export function voiceCandidates(state: GameState, a: CityAnalysis, report: MonthReport | null): Candidate[] {
  const out: Candidate[] = [];
  const emp = a.employment;
  const pop = a.population;
  const tendency = state.profile.tendency;

  // ---------- 問題 ----------
  if (pop > 0 && emp.unemployment > 0.08) {
    out.push({ id: "unemployment", tool: "commercial", severity: emp.unemployment * 320, tone: "bad", persona: "jobSeeker", text: "仕事が見つからない…この町で働きたいのに。", hint: "商業・工業を建てて、働く場所を増やそう" });
  }
  if (emp.jobs > 20 && emp.jobFillRate < 0.88) {
    out.push({ id: "laborShortage", tool: "residential", severity: (0.92 - emp.jobFillRate) * 300, tone: "bad", persona: "shop", text: "人手が足りなくて、お店が回らないよ。", hint: "住宅を増やして働き手を呼ぼう" });
  }
  let noisiest = -1;
  state.tiles.forEach((t, i) => {
    if (t.building?.type === "residential" && t.building.occupants > 0 && a.noise[i] > 5 && (noisiest < 0 || a.noise[i] > a.noise[noisiest])) noisiest = i;
  });
  if (noisiest >= 0) {
    out.push({ id: "noise", tool: "park", severity: 18 + a.noise[noisiest] * 2, tone: "bad", persona: "resident", text: "工場の騒音がひどい！夜も眠れない。", hint: "住宅と工業は2マス以上離すか、間に公園を", tile: noisiest });
  }
  const dirty = worstResidential(state, (i) => a.env[i] < 45);
  if (dirty.tile !== undefined) {
    out.push({ id: "pollution", tool: "park", severity: 25 + dirty.share * 40, tone: "bad", persona: tendency === "eco" ? "parent" : "resident", text: "最近、空気が悪い気がする…。", hint: "工業から離すか、公園・森で環境を改善しよう", tile: dirty.tile });
  }
  if (pop > 150) {
    const noHospital = worstResidential(state, (i) => a.coverage.health[i] === 0);
    if (noHospital.share > 0.35) {
      out.push({ id: "hospital", tool: "hospital", severity: noHospital.share * (tendency === "elderly" ? 60 : 40), tone: "bad", persona: "elder", text: "病院が遠すぎる。何かあったら心配だよ。", hint: "病院を建てよう（範囲5マス）", tile: noHospital.tile });
    }
    const noSchool = worstResidential(state, (i) => a.coverage.education[i] === 0);
    if (noSchool.share > 0.35) {
      out.push({ id: "school", tool: "school", severity: noSchool.share * (tendency === "families" ? 55 : 36), tone: "bad", persona: "parent", text: "子どもを通わせる学校が近くにないの。", hint: "学校を建てよう（マンションへの成長にも必要）", tile: noSchool.tile });
    }
    const noPark = worstResidential(state, (i) => a.coverage.park[i] === 0);
    if (noPark.share > 0.45) {
      out.push({ id: "park", tool: "park", severity: noPark.share * 32, tone: "bad", persona: "kid", text: "近くに遊べる公園がほしいな。", hint: "公園は安くて満足度と環境の両方に効く", tile: noPark.tile });
    }
    const noShop = worstResidential(state, (i) => a.coverage.shopping[i] === 0);
    if (noShop.share > 0.35) {
      out.push({ id: "shopping", tool: "commercial", severity: noShop.share * 30, tone: "bad", persona: "parent", text: "買い物できるお店が近くになくて不便。", hint: "住宅の近く（3マス以内）に商業を", tile: noShop.tile });
    }
  }
  if (a.congestion > 20) {
    let worst = -1;
    a.traffic.ratio.forEach((r, i) => {
      if (r > 0 && (worst < 0 || r > a.traffic.ratio[worst])) worst = i;
    });
    out.push({ id: "traffic", tool: rankIndex(state.rank) >= 1 ? "busStop" : "road", severity: a.congestion * 1.2, tone: "bad", persona: "worker", text: "朝の渋滞がひどくて会社に遅刻しそう。", hint: "並行する道路・大通り・バス停で交通を分散しよう", tile: worst >= 0 ? worst : undefined });
  }
  if (state.taxes.residential >= 12) {
    out.push({ id: "taxHigh", openTab: "finance", severity: (state.taxes.residential - 9) * 7, tone: "bad", persona: "worker", text: "税金が高すぎる！引っ越しを考えちゃう。", hint: "住宅税を下げると満足度が上がる" });
  }
  const unzoned = state.tiles.findIndex((t, i) => t.building && isZone(t.building.type) && !a.net.roadAccess[i]);
  if (unzoned >= 0) {
    out.push({ id: "noRoad", tool: "road", severity: 50, tone: "bad", persona: "newcomer", text: "土地はあるのに道路がなくて、家が建てられない。", hint: "建物は道路に面していないと機能しない", tile: unzoned });
  } else {
    const disconnected = state.tiles.findIndex((t, i) => t.building && !isRoad(t.building.type) && BUILDINGS[t.building.type].category !== "special" && a.net.roadAccess[i] && !a.net.connected[i]);
    if (disconnected >= 0) {
      out.push({ id: "disconnected", tool: "road", severity: 42, tone: "bad", persona: "resident", text: "うちの前の道、町の中心までつながってないんだよね。", hint: "道路を役所までつなげよう", tile: disconnected });
    }
  }
  if (emp.comJobs > 10 && emp.comEfficiency < 0.8) {
    out.push({ id: "comOversupply", tool: "residential", severity: (0.9 - emp.comEfficiency) * 160, tone: "bad", persona: "shop", text: "お客さんが来ない…お店が多すぎるのかな。", hint: "人口を増やすか、商業を減らそう" });
  }
  if (emp.indJobs > 10 && emp.indEfficiency < 0.8) {
    out.push({ id: "indOversupply", tool: "residential", severity: (0.9 - emp.indEfficiency) * 150, tone: "bad", persona: "factory", text: "注文が減って工場がヒマなんだ。", hint: "工業が多すぎる。人口を増やすか工業税を下げよう" });
  }
  if (a.fireRisk > 0.5 && pop > 200) {
    out.push({ id: "fire", tool: "fireStation", severity: a.fireRisk * 30, tone: "bad", persona: "elder", text: "近くに消防署がなくて、火事が心配。", hint: "消防署を建てると火災リスクが大きく下がる" });
  }
  if (emp.vacancyRate < 0.05 && a.demand.residential > 25) {
    out.push({ id: "housing", tool: "residential", severity: 34, tone: "bad", persona: "newcomer", text: "この町に住みたいのに、空いている家がない！", hint: "住宅を増やそう" });
  }
  if (state.money < 0) {
    out.push({ id: "debt", openTab: "finance", severity: 70, tone: "bad", persona: "worker", text: "役所の財政、大丈夫なの…？", hint: "増税・融資・公共施設の売却で立て直そう" });
  }
  const abandoned = state.tiles.findIndex((t) => t.building?.abandoned);
  if (abandoned >= 0) {
    out.push({ id: "abandoned", severity: 30, tone: "bad", persona: "elder", text: "空き家が増えてきて、さみしいねえ。", hint: "周りの満足度・需要を改善すると復活する", tile: abandoned });
  }

  // ---------- 時代の流れ ----------
  const next = state.era.next;
  if (next?.announced && next.turn > state.turn) {
    const e = getEra(next.id);
    out.push({ id: "eraSoon", severity: 36, tone: "neutral", persona: "worker", text: `あと${next.turn - state.turn}か月で「${e.name}の時代」になるらしい。${e.description.split("。")[0]}って。`, hint: e.tips[0] });
  }
  if (report?.eraChange) {
    const e = getEra(report.eraChange);
    out.push({ id: "eraNow", severity: 55, tone: "neutral", persona: "resident", text: `「${e.name}の時代」がはじまったね。町もこれから変わっていくのかな。`, hint: e.tips.join("／") });
  }

  // ---------- 良いこと ----------
  if (pop > 0 && a.cityHappiness >= 72) {
    out.push({ id: "happy", severity: 22 + (a.cityHappiness - 72), tone: "good", persona: "resident", text: "この街は住みやすい！ずっと住みたいな。" });
  }
  const park = recentlyBuilt(state, "park");
  if (park !== undefined) out.push({ id: "newPark", severity: 30, tone: "good", persona: "kid", text: "新しい公園ができて嬉しい！", tile: park });
  const school = recentlyBuilt(state, "school");
  if (school !== undefined) out.push({ id: "newSchool", severity: 32, tone: "good", persona: "parent", text: "近くに学校ができて安心したわ。", tile: school });
  const hospital = recentlyBuilt(state, "hospital");
  if (hospital !== undefined) out.push({ id: "newHospital", severity: 32, tone: "good", persona: "elder", text: "病院が近くにできて、ひと安心だよ。", tile: hospital });
  const bus = recentlyBuilt(state, "busStop") ?? recentlyBuilt(state, "station");
  if (bus !== undefined) out.push({ id: "newTransit", severity: 28, tone: "good", persona: "student", text: "通学がバスで楽になった！", tile: bus });
  const up = report?.changes.find((c) => c.kind === "levelUp" && state.tiles[c.tile].building?.type === "residential");
  if (up) {
    out.push({
      id: "levelUp",
      severity: up.level >= 3 ? 34 : 24,
      tone: "good",
      persona: "resident",
      text:
        up.level === 4
          ? "タワーマンションが建った！景色が最高だって！"
          : up.level === 3
            ? "新しいマンションが建った！街が都会になってきた。"
            : "近所に集合住宅が建って、にぎやかになってきた。",
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
    out.push({ id: "rankUp", severity: 60, tone: "good", persona: "kid", text: "うちの街、ランクアップしたんだって！すごい！" });
  }
  return out;
}

export function generateVoices(state: GameState, a: CityAnalysis, rng: Rng, report: MonthReport | null, max = 4): Voice[] {
  const candidates = voiceCandidates(state, a, report).map((c) => ({ ...c, score: c.severity + rng.range(0, 8) }));
  candidates.sort((x, y) => y.score - x.score);
  const picked = candidates.slice(0, max);
  // 良い声が1つもなければ、いちばん良い声と入れ替える（褒められる体験も大事）
  if (!picked.some((c) => c.tone === "good")) {
    const good = candidates.find((c) => c.tone === "good");
    if (good) picked[Math.min(picked.length, max - 1)] = good;
  }
  if (picked.length === 0) {
    picked.push({ id: "calm", severity: 0, score: 0, tone: "neutral", persona: "resident", text: "のんびりした、いい町だね。" });
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
