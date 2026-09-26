// イベントエンジン：街の状態に応じて起きやすさが変わるランダムイベント（うち一部は選択式）。

import type { CityAnalysis } from "./analysis";
import { BUILDINGS, capacityAt, isRoad, isZone } from "./buildings";
import { EVENTS, NEWS_LIMIT } from "./config";
import { countBuildings } from "./map";
import { addModifier } from "./modifiers";
import { getRank, rankIndex } from "./progression";
import type { Rng } from "./rng";
import type { ActionResult, GameState, ModifierEffects, NewsItem, Tone } from "./types";

export interface EventContext {
  state: GameState;
  a: CityAnalysis;
  rng: Rng;
  tile?: number;
}

export interface EventChoice {
  id: string;
  label: string;
  detail: string;
  cost?: (s: GameState) => number;
  apply: (ctx: EventContext) => string;
}

export interface EventDef {
  id: string;
  title: string;
  emoji: string;
  tone: Tone;
  message: (ctx: EventContext) => string;
  /** 起きやすさ（0 なら起きない） */
  weight: (ctx: EventContext) => number;
  /** 対象のマスを選ぶ（必要なイベントのみ。見つからなければ起きない） */
  pickTile?: (ctx: EventContext) => number | undefined;
  apply?: (ctx: EventContext) => string;
  choices?: EventChoice[];
  /** この時代には起きやすい（重み×3） */
  eras?: string[];
  /** 同じイベントが再び起きるまでの月数（指定がなければ標準値） */
  cooldown?: number;
}

const yen = (v: number) => `¥${Math.round(v).toLocaleString("ja-JP")}`;
const monthOf = (turn: number) => ((turn + 3) % 12) + 1;

function modify(s: GameState, id: string, label: string, emoji: string, turns: number, effects: ModifierEffects) {
  s.modifiers = addModifier(s.modifiers, { id, label, emoji, turnsLeft: turns, effects });
}

function pickBuilding(ctx: EventContext, pred: (i: number) => boolean, weight?: (i: number) => number): number | undefined {
  const items: Array<{ i: number; w: number }> = [];
  ctx.state.tiles.forEach((t, i) => {
    if (t.building && pred(i)) items.push({ i, w: weight ? weight(i) : 1 });
  });
  const total = items.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return undefined;
  let r = ctx.rng.next() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.i;
  }
  return items[items.length - 1].i;
}

/** 住民を一定割合だけ減らす（戻り値は減った人数） */
function loseResidents(s: GameState, share: number): number {
  let lost = 0;
  for (const t of s.tiles) {
    const b = t.building;
    if (b?.type !== "residential") continue;
    const n = Math.round(b.occupants * share);
    b.occupants -= n;
    lost += n;
  }
  return lost;
}

function buildingName(s: GameState, i: number | undefined): string {
  const b = i !== undefined ? s.tiles[i]?.building : null;
  return b ? BUILDINGS[b.type].name : "建物";
}

/** 建物を1段階衰退させる（レベル1なら焼失・閉鎖） */
function damageBuilding(s: GameState, i: number): string {
  const b = s.tiles[i].building;
  if (!b) return "";
  if (isZone(b.type) && b.level > 1) {
    b.level -= 1;
    b.growth = 0;
    b.occupants = Math.min(b.occupants, capacityAt(b.type, b.level));
    return `${BUILDINGS[b.type].name}がレベル${b.level}に縮小しました。`;
  }
  if (isZone(b.type)) {
    s.tiles[i].building = null;
    return `${BUILDINGS[b.type].name}が失われ、空き地になりました。`;
  }
  const repair = Math.min(600_000, Math.round((b.paid || BUILDINGS[b.type].cost) * 0.3));
  s.money -= repair;
  return `${BUILDINGS[b.type].name}の修理に ${yen(repair)} かかりました。`;
}

export const EVENT_DEFS: EventDef[] = [
  // ================= 良いイベント =================
  {
    id: "localCompany",
    eras: ["growth"],
    title: "地元企業が進出",
    emoji: "🏢",
    tone: "good",
    message: () => "地元の企業がこの町に拠点を構えることになりました。工場や店の需要が高まります。",
    weight: ({ a }) => (a.population > 200 ? 1 : 0),
    apply: ({ state }) => {
      modify(state, "localCompany", "地元企業の進出", "🏢", 6, { indDemand: 0.35, comDemand: 0.1 });
      return "6か月間、工業需要 +35%・商業需要 +10%";
    },
  },
  {
    id: "popularShop",
    title: "人気店がオープン",
    emoji: "🍰",
    tone: "good",
    message: () => "行列のできる人気店がオープン！街がにぎわっています。",
    weight: () => 1,
    pickTile: (ctx) =>
      pickBuilding(ctx, (i) => {
        const b = ctx.state.tiles[i].building!;
        return b.type === "commercial" && b.level >= 1 && b.level < getRank(ctx.state.rank).maxLevel && !b.abandoned && ctx.a.net.connected[i];
      }),
    apply: ({ state, tile }) => {
      const b = state.tiles[tile!].building!;
      b.level += 1;
      b.growth = 0;
      modify(state, "popularShop", "人気店のにぎわい", "🍰", 3, { happiness: 3 });
      return `お店がレベル${b.level}に成長！3か月間、満足度 +3`;
    },
  },
  {
    id: "schoolPraise",
    title: "学校が高評価",
    emoji: "🏫",
    tone: "good",
    message: () => "町の学校が教育雑誌で紹介されました。子育て世代の注目が集まっています。",
    weight: ({ state }) => (countBuildings(state, "school") > 0 ? 1.2 : 0),
    apply: ({ state }) => {
      modify(state, "schoolPraise", "学校の評判", "🏫", 4, { resAppeal: 0.08, happiness: 2 });
      return "4か月間、転入しやすさUP・満足度 +2";
    },
  },
  {
    id: "tourism",
    eras: ["tourism"],
    title: "観光客が増加",
    emoji: "📸",
    tone: "good",
    message: ({ state }) => (state.profile.trait === "coastal" ? "海の景色がSNSで話題に！観光客が押し寄せています。" : "町並みが話題になり、観光客が増えています。"),
    weight: ({ state, a }) => (a.population > 150 ? (state.profile.trait === "coastal" ? 2.2 : 0.8) : 0),
    apply: ({ state, a }) => {
      const bonus = Math.round((100_000 + a.population * 60) / 1000) * 1000;
      state.money += bonus;
      modify(state, "tourism", "観光ブーム", "📸", 3, { comDemand: 0.3 });
      return `観光収入 +${yen(bonus)}、3か月間 商業需要 +30%`;
    },
  },
  {
    id: "subsidy",
    title: "国から補助金",
    emoji: "💴",
    tone: "good",
    message: () => "まちづくりの取り組みが評価され、国から補助金が交付されました。",
    weight: () => 0.8,
    apply: ({ state, a }) => {
      const v = Math.round((200_000 + a.population * 150) / 1000) * 1000;
      state.money += v;
      return `資金 +${yen(v)}`;
    },
  },
  {
    id: "babyBoom",
    eras: ["babyBoom"],
    title: "ベビーブーム",
    emoji: "👶",
    tone: "good",
    message: () => "住みやすい町で赤ちゃんが次々と誕生しています。",
    weight: ({ a }) => (a.cityHappiness >= 60 && a.employment.vacancyRate > 0.04 && a.population > 100 ? 1 : 0),
    apply: ({ state, a }) => {
      let born = 0;
      state.tiles.forEach((t, i) => {
        const b = t.building;
        if (b?.type !== "residential" || b.abandoned) return;
        const room = Math.floor(capacityAt("residential", b.level) * (a.net.connected[i] ? 1 : 0.5)) - b.occupants;
        const n = Math.max(0, Math.min(room, Math.round(b.occupants * 0.05)));
        b.occupants += n;
        born += n;
      });
      return `人口 +${born}人`;
    },
  },
  {
    id: "tvFeature",
    eras: ["tourism"],
    title: "テレビで紹介",
    emoji: "📺",
    tone: "good",
    message: () => "「住みたい町特集」でこの町が紹介されました！",
    weight: ({ a }) => (a.cityHappiness >= 68 ? 1 : 0),
    apply: ({ state }) => {
      modify(state, "tvFeature", "テレビ効果", "📺", 3, { resAppeal: 0.1, comDemand: 0.15 });
      return "3か月間、転入しやすさUP・商業需要 +15%";
    },
  },
  {
    id: "donation",
    title: "地元の名士から寄付",
    emoji: "🎁",
    tone: "good",
    message: () => "町の発展を願う地元の名士から、まちづくり基金への寄付がありました。",
    weight: () => 0.6,
    apply: ({ state }) => {
      state.money += 300_000;
      return `資金 +${yen(300_000)}`;
    },
  },
  {
    id: "greenVolunteer",
    eras: ["green"],
    title: "緑化ボランティア",
    emoji: "🌱",
    tone: "good",
    message: () => "住民ボランティアが街路樹を植えてくれました。",
    weight: ({ a }) => (a.cityEnvironment < 70 ? 1 : 0.2),
    apply: ({ state }) => {
      modify(state, "greenVolunteer", "緑化ボランティア", "🌱", 6, { env: 6 });
      return "6か月間、環境 +6";
    },
  },

  // ================= 悪いイベント =================
  {
    id: "fire",
    title: "火災発生",
    emoji: "🔥",
    tone: "bad",
    message: ({ state, tile }) => `${buildingName(state, tile)}で火災が発生しました。`,
    weight: ({ a }) => 0.15 + a.fireRisk * 1.6,
    pickTile: (ctx) =>
      pickBuilding(
        ctx,
        (i) => {
          const b = ctx.state.tiles[i].building!;
          return !isRoad(b.type) && BUILDINGS[b.type].category !== "special" && b.level > 0 && ctx.a.coverage.fire[i] < 0.75;
        },
        (i) => 1 - ctx.a.coverage.fire[i],
      ),
    apply: ({ state, a, tile }) => {
      const covered = a.coverage.fire[tile!] > 0;
      if (covered) return "消防隊が駆けつけ、ぼやで済みました。消防署の範囲を広げると安心です。";
      return `${damageBuilding(state, tile!)} 消防署があれば被害を防げたかもしれません。`;
    },
  },
  {
    id: "factoryAccident",
    title: "工場事故",
    emoji: "💥",
    tone: "bad",
    message: () => "工場で事故が発生し、周辺に煙が広がりました。",
    weight: () => 0.8,
    pickTile: (ctx) =>
      pickBuilding(ctx, (i) => {
        const b = ctx.state.tiles[i].building!;
        return b.type === "industrial" && b.level >= 1 && !b.abandoned;
      }),
    apply: ({ state, tile }) => {
      const text = damageBuilding(state, tile!);
      modify(state, "factoryAccident", "工場事故の影響", "💥", 4, { env: -8, happiness: -3 });
      return `${text} 4か月間、環境 -8・満足度 -3`;
    },
  },
  {
    id: "trafficJam",
    title: "渋滞が悪化",
    emoji: "🚗",
    tone: "bad",
    message: () => "道路工事の影響で、あちこちで渋滞が起きています。",
    weight: ({ a }) => (a.congestion > 12 ? 1.2 : 0),
    apply: ({ state }) => {
      modify(state, "trafficJam", "道路工事の渋滞", "🚗", 2, { traffic: 0.3 });
      return "2か月間、交通量 +30%";
    },
  },
  {
    id: "recession",
    eras: ["stagnation"],
    title: "景気後退",
    emoji: "📉",
    tone: "bad",
    message: () => "全国的な景気の冷え込みが町にも波及しています。",
    weight: ({ state }) => (state.turn >= 6 ? 0.6 : 0),
    apply: ({ state }) => {
      modify(state, "recession", "景気後退", "📉", 4, { taxIncome: -0.12, comDemand: -0.15, indDemand: -0.25 });
      return "4か月間、税収 -12%・商業需要 -15%・工業需要 -25%";
    },
  },
  {
    id: "powerOutage",
    title: "大規模停電",
    emoji: "🔌",
    tone: "bad",
    message: () => "送電設備のトラブルで、町全体が一時停電しました。",
    weight: () => 0.4,
    apply: ({ state }) => {
      modify(state, "powerOutage", "停電の影響", "🔌", 1, { indDemand: -0.3, happiness: -3 });
      return "1か月間、工業需要 -30%・満足度 -3";
    },
  },
  {
    id: "epidemic",
    eras: ["aging"],
    title: "感染症が流行",
    emoji: "🤧",
    tone: "bad",
    message: () => "季節性の感染症が町で流行しています。",
    weight: ({ a }) => (a.population > 300 ? 0.6 : 0),
    apply: ({ state, a }) => {
      const covered = state.tiles.reduce((n, t, i) => n + (t.building?.type === "residential" && a.coverage.health[i] > 0 ? t.building.occupants : 0), 0);
      const share = a.population > 0 ? covered / a.population : 0;
      if (share >= 0.6) {
        modify(state, "epidemic", "感染症", "🤧", 1, { happiness: -1 });
        return "病院のおかげで被害は最小限に抑えられました。";
      }
      const lost = loseResidents(state, 0.02);
      modify(state, "epidemic", "感染症", "🤧", 2, { happiness: -6 });
      return `療養のため ${lost}人が町を離れ、2か月間 満足度 -6。病院があれば防げます。`;
    },
  },
  {
    id: "typhoon",
    title: "台風が直撃",
    emoji: "🌀",
    tone: "bad",
    message: () => "大型の台風が町を直撃しました。",
    weight: ({ state }) => ([7, 8, 9, 10].includes(monthOf(state.turn)) ? (state.profile.trait === "coastal" ? 2.5 : 0.8) : 0),
    apply: ({ state }) => {
      const roads = countBuildings(state, "road") + countBuildings(state, "avenue");
      const cost = Math.round((100_000 + roads * 3_000) / 1000) * 1000;
      state.money -= cost;
      modify(state, "typhoon", "台風の被害", "🌀", 1, { happiness: -2 });
      return `復旧費 ${yen(cost)}、満足度 -2`;
    },
  },
  {
    id: "youthExodus",
    title: "若者が都会へ流出",
    emoji: "🚶",
    tone: "bad",
    message: () => "仕事が見つからない若者たちが、都会へ引っ越し始めています。",
    weight: ({ a }) => (a.employment.unemployment > 0.12 && a.population > 100 ? 2 : 0),
    apply: ({ state }) => {
      const lost = loseResidents(state, 0.04);
      return `人口 -${lost}人。商業・工業を増やして雇用を作りましょう。`;
    },
  },
  {
    id: "waterPipe",
    title: "水道管が破裂",
    emoji: "💧",
    tone: "bad",
    message: () => "古い水道管が破裂し、緊急の修理が必要になりました。",
    weight: ({ state }) => (state.turn >= 4 ? 0.5 : 0),
    apply: ({ state }) => {
      state.money -= 150_000;
      return `修理費 ${yen(150_000)}`;
    },
  },

  // ================= 選択式イベント =================
  {
    id: "mall",
    title: "大型ショッピングモールから進出提案",
    emoji: "🛍️",
    tone: "neutral",
    message: () => "大手デベロッパーから、郊外型の大型ショッピングモールを出店したいと提案がありました。",
    weight: ({ state, a }) => (a.population >= 500 && !state.modifiers.some((m) => m.id === "mall") ? 1 : 0),
    choices: [
      {
        id: "accept",
        label: "誘致する",
        detail: "協力金 +¥300,000 / 雇用 +60 / 商業税UP / 交通量 +20% / 地元商店の需要 -10%（2年間）",
        apply: ({ state }) => {
          state.money += 300_000;
          modify(state, "mall", "ショッピングモール", "🛍️", 24, { extraComJobs: 60, traffic: 0.2, comDemand: -0.1, happiness: 2 });
          return "モールがオープン！雇用と税収が増えたが、道路は混みそうです。";
        },
      },
      {
        id: "decline",
        label: "断る",
        detail: "地元の商店街から感謝される（商業需要 +5%・6か月）",
        apply: ({ state }) => {
          modify(state, "mallDeclined", "商店街の活気", "🏮", 6, { comDemand: 0.05 });
          return "地元の商店街から感謝の声が届きました。";
        },
      },
    ],
  },
  {
    id: "factoryOffer",
    eras: ["growth"],
    title: "工場誘致の打診",
    emoji: "🏗️",
    tone: "neutral",
    message: () => "大手メーカーが、この町に取引先の工場群を増やしたいと打診してきました。",
    weight: ({ a }) => (a.population >= 300 && a.employment.indJobs > 0 ? 0.9 : 0),
    choices: [
      {
        id: "accept",
        label: "受け入れる",
        detail: "協力金 +¥500,000 / 工業需要 +40% / 環境 -6（1年間）",
        apply: ({ state }) => {
          state.money += 500_000;
          modify(state, "factoryOffer", "工場誘致", "🏗️", 12, { indDemand: 0.4, env: -6 });
          return "工場の注文が増えます。工業を増やすチャンス！";
        },
      },
      {
        id: "decline",
        label: "環境を優先して断る",
        detail: "満足度 +2（3か月）",
        apply: ({ state }) => {
          modify(state, "factoryDeclined", "環境を守る決断", "🍃", 3, { happiness: state.profile.tendency === "eco" ? 4 : 2 });
          return "環境を大切にする姿勢が住民に評価されました。";
        },
      },
    ],
  },
  {
    id: "noiseComplaint",
    title: "住民から騒音苦情",
    emoji: "📢",
    tone: "bad",
    message: () => "工場の近くに住む住民から「うるさくて眠れない」と苦情が寄せられています。",
    weight: ({ state, a }) => (state.tiles.some((t, i) => t.building?.type === "residential" && t.building.occupants > 0 && a.noise[i] > 5) ? 1.4 : 0),
    pickTile: ({ state, a }) => {
      let best: number | undefined;
      state.tiles.forEach((t, i) => {
        if (t.building?.type === "residential" && t.building.occupants > 0 && a.noise[i] > 5 && (best === undefined || a.noise[i] > a.noise[best])) best = i;
      });
      return best;
    },
    choices: [
      {
        id: "wall",
        label: "防音壁を設置する",
        detail: "¥200,000 / 騒音 -60%（1年間）",
        cost: () => 200_000,
        apply: ({ state }) => {
          state.money -= 200_000;
          modify(state, "noiseWall", "防音壁", "🧱", 12, { noiseShield: 0.6 });
          return "防音壁で騒音がやわらぎました。";
        },
      },
      {
        id: "ignore",
        label: "様子を見る",
        detail: "満足度 -4（3か月）",
        apply: ({ state }) => {
          modify(state, "noiseIgnored", "騒音への不満", "😠", 3, { happiness: -4 });
          return "住民の不満がたまっています…。住宅と工場を離すのが根本的な解決です。";
        },
      },
    ],
  },
  {
    id: "roadDecay",
    title: "道路の老朽化",
    emoji: "🚧",
    tone: "bad",
    message: () => "開通から年数がたった道路で、ひび割れや穴が目立つようになりました。",
    weight: ({ state }) => (state.turn >= 8 && countBuildings(state, "road") >= 20 && !state.modifiers.some((m) => m.id === "roadDecay") ? 0.8 : 0),
    choices: [
      {
        id: "repair",
        label: "補修する",
        detail: "道路1マスあたり ¥4,000",
        cost: (s) => countBuildings(s, "road") * 4_000,
        apply: ({ state }) => {
          const cost = countBuildings(state, "road") * 4_000;
          state.money -= cost;
          return `${yen(cost)} をかけて道路を補修しました。`;
        },
      },
      {
        id: "postpone",
        label: "先送りする",
        detail: "交通量 +20%・満足度 -3（6か月）",
        apply: ({ state }) => {
          modify(state, "roadDecay", "道路の老朽化", "🕳️", 6, { traffic: 0.2, happiness: -3 });
          return "でこぼこ道で渋滞が起きやすくなりました。";
        },
      },
    ],
  },
  {
    id: "festival",
    eras: ["tourism"],
    title: "夏祭り開催の相談",
    emoji: "🏮",
    tone: "neutral",
    message: () => "町内会から「今年は盛大に夏祭りをやりたい」と相談がありました。",
    weight: ({ state, a }) => ([7, 8].includes(monthOf(state.turn)) && a.population > 100 ? 3 : 0),
    choices: [
      {
        id: "support",
        label: "補助金を出す",
        detail: "¥150,000 / 満足度 +8・商業需要 +10%（3か月）",
        cost: () => 150_000,
        apply: ({ state }) => {
          state.money -= 150_000;
          modify(state, "festival", "夏祭りの余韻", "🎆", 3, { happiness: 8, comDemand: 0.1 });
          return "盛大な夏祭りで町が一つになりました！";
        },
      },
      {
        id: "skip",
        label: "今年は見送る",
        detail: "小規模に開催（満足度 +1・1か月）",
        apply: ({ state }) => {
          modify(state, "festival", "小さなお祭り", "🏮", 1, { happiness: 1 });
          return "こぢんまりとしたお祭りが開かれました。";
        },
      },
    ],
  },
  {
    id: "parkRequest",
    title: "緑を増やしてほしいという署名",
    emoji: "✍️",
    tone: "neutral",
    message: () => "「もっと緑のある街に」という住民の署名が集まりました。",
    weight: ({ a }) => (a.population > 250 && a.cityEnvironment < 68 ? 1 : 0),
    choices: [
      {
        id: "fund",
        label: "緑化基金をつくる",
        detail: "¥250,000 / 環境 +5・満足度 +4（6か月）",
        cost: () => 250_000,
        apply: ({ state }) => {
          state.money -= 250_000;
          modify(state, "greenFund", "緑化基金", "🌳", 6, { env: 5, happiness: 4 });
          return "街に花壇や街路樹が増えました。";
        },
      },
      {
        id: "decline",
        label: "見送る",
        detail: "満足度 -3（3か月）",
        apply: ({ state }) => {
          modify(state, "greenDeclined", "署名を見送り", "😞", 3, { happiness: -3 });
          return "住民はがっかりしています。公園を建てて応えましょう。";
        },
      },
    ],
  },
  {
    id: "redevelopment",
    title: "再開発業者からの提案",
    emoji: "🏗️",
    tone: "neutral",
    message: () => "デベロッパーから「古い住宅地を一気にマンションに建て替えたい」と提案がありました。",
    weight: ({ state }) => (rankIndex(state.rank) >= 1 ? 0.8 : 0),
    pickTile: (ctx) =>
      pickBuilding(ctx, (i) => {
        const b = ctx.state.tiles[i].building!;
        return b.type === "residential" && b.level === 1 && !b.abandoned && ctx.a.net.connected[i];
      }),
    choices: [
      {
        id: "accept",
        label: "許可する",
        detail: "対象の住宅が一気にマンション（Lv3）に / 反対の声で満足度 -2（3か月）",
        apply: ({ state, tile }) => {
          const b = state.tiles[tile!].building!;
          b.level = 3;
          b.growth = 0;
          modify(state, "redevelopment", "再開発への反発", "🪧", 3, { happiness: -2 });
          return "真新しいマンションが完成し、入居者の募集が始まりました。";
        },
      },
      {
        id: "decline",
        label: "町並みを守る",
        detail: "変化なし",
        apply: () => "昔ながらの町並みが守られました。",
      },
    ],
  },
  {
    id: "solar",
    eras: ["green"],
    title: "ソーラーパネル補助事業",
    emoji: "☀️",
    tone: "neutral",
    message: () => "県から、公共施設の屋根にソーラーパネルを設置する補助事業の案内が届きました。",
    weight: ({ a }) => (a.population > 400 ? 0.6 : 0),
    choices: [
      {
        id: "join",
        label: "参加する",
        detail: "¥300,000 / 環境 +6（2年間）",
        cost: () => 300_000,
        apply: ({ state }) => {
          state.money -= 300_000;
          modify(state, "solar", "ソーラーパネル", "☀️", 24, { env: 6 });
          return "クリーンな電力で町の環境が良くなります。";
        },
      },
      { id: "skip", label: "見送る", detail: "変化なし", apply: () => "今回は見送りました。" },
    ],
  },
  {
    id: "university",
    title: "大学キャンパスの誘致",
    emoji: "🎓",
    tone: "neutral",
    message: () => "大学が新しいキャンパスの候補地としてこの市を検討しています。",
    weight: ({ state }) => (rankIndex(state.rank) >= 2 && !state.modifiers.some((m) => m.id === "university") ? 0.8 : 0),
    choices: [
      {
        id: "invite",
        label: "誘致する",
        detail: "¥1,500,000 / 転入しやすさUP・商業需要 +20%・満足度 +3（2年間）",
        cost: () => 1_500_000,
        apply: ({ state }) => {
          state.money -= 1_500_000;
          modify(state, "university", "大学キャンパス", "🎓", 24, { resAppeal: 0.1, comDemand: 0.2, happiness: 3 });
          return "学生たちで街がにぎやかになりました！";
        },
      },
      { id: "decline", label: "見送る", detail: "変化なし", apply: () => "キャンパスは隣の市に決まりました。" },
    ],
  },
  {
    id: "taxPetition",
    title: "減税を求める陳情",
    emoji: "🪧",
    tone: "bad",
    message: () => "市民団体から「住民税が高すぎる」と減税を求める陳情が届きました。",
    weight: ({ state }) => (state.taxes.residential >= 11 ? 1.5 : 0),
    choices: [
      {
        id: "cut",
        label: "住宅税を2%下げる",
        detail: "満足度 +3（2か月）",
        apply: ({ state }) => {
          state.taxes.residential = Math.max(0, state.taxes.residential - 2);
          modify(state, "taxCut", "減税への感謝", "🙏", 2, { happiness: 3 });
          return `住宅税を ${state.taxes.residential}% に下げました。`;
        },
      },
      {
        id: "keep",
        label: "据え置く",
        detail: "満足度 -4（3か月）",
        apply: ({ state }) => {
          modify(state, "taxKept", "増税への不満", "😤", 3, { happiness: -4 });
          return "住民の不満が高まっています。";
        },
      },
    ],
  },
  {
    id: "startup",
    eras: ["digital"],
    title: "スタートアップの誘致",
    emoji: "🚀",
    tone: "neutral",
    message: () => "若い起業家たちが、この町にオフィスを構えたいと相談に来ました。",
    weight: ({ state, a }) => (countBuildings(state, "school") > 0 && a.population > 600 ? 0.7 : 0),
    choices: [
      {
        id: "support",
        label: "起業支援をする",
        detail: "¥400,000 / 商業需要 +30%（1年間）",
        cost: () => 400_000,
        apply: ({ state }) => {
          state.money -= 400_000;
          modify(state, "startup", "スタートアップ", "🚀", 12, { comDemand: 0.3 });
          return "新しいオフィスの需要が生まれました。商業を増やしましょう。";
        },
      },
      { id: "skip", label: "見送る", detail: "変化なし", apply: () => "起業家たちは別の町へ向かいました。" },
    ],
  },

  // ================= 大きなイベント（街の流れを変える） =================
  {
    id: "bigEmployer",
    title: "大企業が撤退を検討",
    emoji: "🏭",
    tone: "bad",
    cooldown: 48,
    eras: ["postIndustrial", "stagnation"],
    message: () => "町でいちばん大きな取引先の企業が、工場とオフィスの撤退を検討しているという知らせが入りました。",
    weight: ({ state, a }) => (state.turn >= 24 && a.employment.indJobs + a.employment.comJobs >= 300 ? 0.7 : 0),
    choices: [
      {
        id: "keep",
        label: "補助金で引き留める",
        detail: "人口に応じた補助金を払う / 撤退は回避され、満足度 +2（6か月）",
        cost: (s) => Math.max(800_000, Math.round((s.tiles.reduce((n, t) => n + (t.building?.type === "residential" ? t.building.occupants : 0), 0) * 300) / 10_000) * 10_000),
        apply: ({ state }) => {
          const cost = Math.max(800_000, Math.round((state.tiles.reduce((n, t) => n + (t.building?.type === "residential" ? t.building.occupants : 0), 0) * 300) / 10_000) * 10_000);
          state.money -= cost;
          modify(state, "bigEmployerKept", "雇用を守った", "🤝", 6, { happiness: 2 });
          return `${yen(cost)} の補助金で撤退を食い止めました。`;
        },
      },
      {
        id: "accept",
        label: "撤退を受け入れる",
        detail: "工業の需要 -35%・商業の需要 -10%（1年間）。空いた土地は別の使い道に",
        apply: ({ state }) => {
          modify(state, "bigEmployerLeft", "大企業の撤退", "📦", 12, { indDemand: -0.35, comDemand: -0.1 });
          return "工場の注文が大きく減ります。失業に注意し、商業や公園への建て替えを考えましょう。";
        },
      },
    ],
  },
  {
    id: "earthquake",
    title: "大地震が発生",
    emoji: "🌋",
    tone: "bad",
    cooldown: 96,
    message: () => "強い地震が町を襲いました。",
    weight: ({ state, a }) => (state.turn >= 24 && a.population > 500 ? 0.18 : 0),
    apply: ({ state, a, rng }) => {
      const targets = state.tiles
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.building && !isRoad(t.building.type) && BUILDINGS[t.building.type].category !== "special" && t.building.level > 0);
      const count = Math.min(targets.length, 3 + Math.floor(a.population / 1500));
      let damaged = 0;
      for (let k = 0; k < count; k++) {
        const pick = targets.splice(Math.floor(rng.next() * targets.length), 1)[0];
        if (!pick) break;
        // 消防署の範囲内なら被害を防げることが多い
        if (a.coverage.fire[pick.i] > 0 && rng.chance(0.7)) continue;
        damageBuilding(state, pick.i);
        damaged++;
      }
      const covered = state.tiles.reduce((n, t, i) => n + (t.building?.type === "residential" && a.coverage.health[i] > 0 ? t.building.occupants : 0), 0);
      const lost = a.population > 0 && covered / a.population < 0.6 ? loseResidents(state, 0.02) : 0;
      modify(state, "earthquake", "地震からの復興", "🧱", 3, { happiness: -4 });
      return `${damaged}棟が被害を受けました。${lost > 0 ? `${lost}人が町を離れました（病院が近くにあれば防げます）。` : "病院と消防のおかげで被害は抑えられました。"} 満足度 -4（3か月）`;
    },
  },
  {
    id: "flood",
    title: "大雨で水があふれた",
    emoji: "🌊",
    tone: "bad",
    cooldown: 36,
    message: ({ state }) => (state.profile.trait === "coastal" ? "高潮で海沿いの地区が浸水しました。" : "大雨で川があふれ、川沿いの地区が浸水しました。"),
    weight: ({ state }) => (state.turn >= 12 && [6, 7, 8, 9].includes(monthOf(state.turn)) ? (state.profile.trait === "coastal" ? 1 : 0.7) : 0),
    pickTile: (ctx) =>
      pickBuilding(ctx, (i) => {
        const b = ctx.state.tiles[i].building!;
        if (isRoad(b.type) || BUILDINGS[b.type].category === "special" || b.level === 0) return false;
        const { width, height } = ctx.state;
        const x = i % width;
        const y = Math.floor(i / width);
        return [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height && ctx.state.tiles[ny * width + nx].terrain === "water");
      }),
    apply: ({ state, tile }) => `${damageBuilding(state, tile!)} 水辺の開発には注意が必要です。`,
  },
  {
    id: "rivalCity",
    title: "隣町が大規模ニュータウンを開発",
    emoji: "🏙️",
    tone: "bad",
    cooldown: 60,
    message: () => "隣町が大きなニュータウンを売り出し、若い世帯を呼び込もうとしています。",
    weight: ({ state, a }) => (state.turn >= 36 && a.population >= 800 ? 0.6 : 0),
    choices: [
      {
        id: "compete",
        label: "子育て支援で対抗する",
        detail: "人口に応じた費用 / 転入しやすさUP（1年間）",
        cost: (s) => Math.max(500_000, Math.round((s.tiles.reduce((n, t) => n + (t.building?.type === "residential" ? t.building.occupants : 0), 0) * 200) / 10_000) * 10_000),
        apply: ({ state }) => {
          const cost = Math.max(500_000, Math.round((state.tiles.reduce((n, t) => n + (t.building?.type === "residential" ? t.building.occupants : 0), 0) * 200) / 10_000) * 10_000);
          state.money -= cost;
          modify(state, "rivalCompete", "子育て支援キャンペーン", "👶", 12, { resAppeal: 0.06 });
          return "「子育てするならこの町」が話題になりました。";
        },
      },
      {
        id: "ignore",
        label: "様子を見る",
        detail: "転入しにくくなる（1年間）",
        apply: ({ state }) => {
          modify(state, "rivalCity", "隣町に人気を奪われる", "🏙️", 12, { resAppeal: -0.08 });
          return "若い世帯が隣町に流れています。住みやすさで巻き返しましょう。";
        },
      },
    ],
  },
  {
    id: "expo",
    title: "万博の開催地に立候補しないかと打診",
    emoji: "🎡",
    tone: "neutral",
    cooldown: 120,
    message: () => "国から「次の万博の開催地に立候補しないか」と打診がありました。成功すれば街の名が世界に広まります。",
    weight: ({ state }) => (rankIndex(state.rank) >= 3 && !state.modifiers.some((m) => m.id === "expo") ? 0.5 : 0),
    choices: [
      {
        id: "host",
        label: "立候補して開催する",
        detail: "¥6,000,000 / 1年間、商業の需要 +50%・満足度 +5・転入しやすさUP・交通量 +20%",
        cost: () => 6_000_000,
        apply: ({ state }) => {
          state.money -= 6_000_000;
          modify(state, "expo", "万博開催", "🎡", 12, { comDemand: 0.5, happiness: 5, resAppeal: 0.05, traffic: 0.2 });
          return "万博が開幕！世界中から人が訪れています。";
        },
      },
      { id: "decline", label: "見送る", detail: "変化なし", apply: () => "今回は見送りました。" },
    ],
  },
  {
    id: "remoteWork",
    title: "リモートワークが普及",
    emoji: "🏡",
    tone: "good",
    cooldown: 60,
    eras: ["digital"],
    message: () => "どこでも働ける人が増え、住みやすい町に人が集まり始めています。",
    weight: ({ a }) => (a.cityHappiness >= 60 && a.population > 400 ? 0.4 : 0),
    apply: ({ state }) => {
      modify(state, "remoteWork", "リモートワーク移住", "💻", 12, { resAppeal: 0.08, comDemand: -0.05 });
      return "1年間、転入しやすさが大きくUP（オフィス需要は少し下がる）";
    },
  },
  {
    id: "filmLocation",
    title: "映画のロケ地に選ばれた",
    emoji: "🎬",
    tone: "good",
    cooldown: 48,
    eras: ["tourism"],
    message: () => "話題の映画のロケ地にこの町が選ばれました！",
    weight: ({ a }) => (a.population > 500 && a.cityEnvironment >= 60 ? 0.5 : 0),
    apply: ({ state, a }) => {
      const v = Math.round((a.population * 40) / 1000) * 1000;
      state.money += v;
      modify(state, "filmLocation", "ロケ地巡り", "🎬", 4, { happiness: 4, comDemand: 0.15 });
      return `撮影協力金 +${yen(v)}、4か月間 満足度 +4・商業の需要 +15%`;
    },
  },
  {
    id: "vacantHomes",
    title: "空き家の改修プランの提案",
    emoji: "🔨",
    tone: "neutral",
    cooldown: 24,
    message: () => "工務店組合から「町の空き家をまとめて改修して、また人が住めるようにしたい」と提案がありました。",
    weight: ({ state }) => (state.tiles.filter((t) => t.building?.abandoned).length >= 2 ? 1.5 : 0),
    choices: [
      {
        id: "renovate",
        label: "改修費を補助する",
        detail: "空き家1軒あたり ¥150,000 / すべての空き家が住める状態に戻る",
        cost: (s) => s.tiles.filter((t) => t.building?.abandoned).length * 150_000,
        apply: ({ state }) => {
          let n = 0;
          for (const t of state.tiles) {
            if (t.building?.abandoned) {
              t.building.abandoned = false;
              t.building.growth = 20;
              n++;
            }
          }
          state.money -= n * 150_000;
          return `${n}軒の空き家が生まれ変わりました。`;
        },
      },
      { id: "skip", label: "見送る", detail: "変化なし", apply: () => "空き家はそのままです。" },
    ],
  },
  {
    id: "oldFactories",
    title: "古い工場が次々と閉鎖",
    emoji: "🏚️",
    tone: "bad",
    cooldown: 36,
    eras: ["postIndustrial", "green"],
    message: () => "時代の流れで、古い工場が次々と操業をやめています。",
    weight: ({ state }) => (state.tiles.filter((t) => t.building?.type === "industrial" && t.building.level >= 1 && !t.building.abandoned).length >= 3 ? 0.4 : 0),
    apply: ({ state, rng }) => {
      const factories = state.tiles.filter((t) => t.building?.type === "industrial" && t.building.level >= 1 && !t.building.abandoned);
      let n = 0;
      for (let k = 0; k < 2 && factories.length > 0; k++) {
        const t = factories.splice(Math.floor(rng.next() * factories.length), 1)[0];
        t.building!.abandoned = true;
        t.building!.growth = -50;
        n++;
      }
      return `${n}つの工場が閉鎖され、空き家になりました。撤去して別の使い道を考えましょう。`;
    },
  },
];

export function getEventDef(id: string): EventDef | undefined {
  return EVENT_DEFS.find((e) => e.id === id);
}

function pushNews(s: GameState, item: NewsItem) {
  s.news = [item, ...s.news].slice(0, NEWS_LIMIT);
}

/** 今月のイベントを抽選して反映する（draft を直接更新する）。起きたイベントのニュースを返す */
export function rollEvent(draft: GameState, a: CityAnalysis, rng: Rng, force?: string): NewsItem | null {
  if (!force && (draft.turn < EVENTS.graceTurns || !rng.chance(EVENTS.monthlyChance))) return null;
  const ctx: EventContext = { state: draft, a, rng };
  const log = draft.eventLog ?? {};
  const pool = EVENT_DEFS.filter((e) => (force ? e.id === force : true))
    .filter((e) => force || log[e.id] === undefined || draft.turn - log[e.id] >= (e.cooldown ?? EVENTS.cooldown))
    .map((def) => ({ def, w: def.weight(ctx) * (def.eras?.includes(draft.era?.id) ? 3 : 1) }))
    .filter((x) => x.w > 0);
  if (pool.length === 0) return null;

  // 対象マスが必要なイベントは、見つからなければ候補から外す
  let total = pool.reduce((s, x) => s + x.w, 0);
  for (let attempt = 0; attempt < 4 && pool.length > 0; attempt++) {
    let r = rng.next() * total;
    let chosen = pool[pool.length - 1];
    for (const x of pool) {
      r -= x.w;
      if (r <= 0) {
        chosen = x;
        break;
      }
    }
    const def = chosen.def;
    const tile = def.pickTile ? def.pickTile(ctx) : undefined;
    if (def.pickTile && tile === undefined) {
      pool.splice(pool.indexOf(chosen), 1);
      total -= chosen.w;
      continue;
    }
    const ectx: EventContext = { ...ctx, tile };
    const message = def.message(ectx);
    draft.eventLog = { ...log, [def.id]: draft.turn };
    if (def.choices) {
      draft.pendingEvent = { eventId: def.id, turn: draft.turn, tile };
      const item: NewsItem = { turn: draft.turn, emoji: def.emoji, title: def.title, body: message, tone: def.tone, tile };
      return item;
    }
    const result = def.apply ? def.apply(ectx) : "";
    const item: NewsItem = { turn: draft.turn, emoji: def.emoji, title: def.title, body: `${message} ${result}`.trim(), tone: def.tone, tile };
    pushNews(draft, item);
    return item;
  }
  return null;
}

export interface PendingEventView {
  def: EventDef;
  message: string;
  tile?: number;
  choices: Array<{ id: string; label: string; detail: string; cost: number; affordable: boolean }>;
}

/** UI 用：対応待ちのイベントの表示内容 */
export function describePendingEvent(state: GameState, a: CityAnalysis): PendingEventView | null {
  const p = state.pendingEvent;
  if (!p) return null;
  const def = getEventDef(p.eventId);
  if (!def?.choices) return null;
  const ctx: EventContext = { state, a, rng: { next: () => 0.5 } as Rng, tile: p.tile };
  return {
    def,
    message: def.message(ctx),
    tile: p.tile,
    choices: def.choices.map((c) => {
      const cost = c.cost ? c.cost(state) : 0;
      return { id: c.id, label: c.label, detail: c.detail, cost, affordable: cost <= Math.max(0, state.money) };
    }),
  };
}

export function resolveEvent(state: GameState, a: CityAnalysis, choiceId: string, rng: Rng): ActionResult {
  const p = state.pendingEvent;
  if (!p) return { ok: false, error: "対応待ちのイベントはありません" };
  const def = getEventDef(p.eventId);
  const choice = def?.choices?.find((c) => c.id === choiceId);
  if (!def || !choice) return { ok: false, error: "選択肢が見つかりません" };
  const cost = choice.cost ? choice.cost(state) : 0;
  if (cost > 0 && state.money < cost) return { ok: false, error: "資金が足りません" };
  const draft = structuredClone(state);
  // 対象の建物がなくなっていたら（撤去など）、効果のない選択として扱う
  if (p.tile !== undefined && !draft.tiles[p.tile]?.building) {
    draft.pendingEvent = null;
    return { ok: true, state: draft, message: "対象の建物がなくなったため、話は立ち消えになりました" };
  }
  const result = choice.apply({ state: draft, a, rng, tile: p.tile });
  draft.pendingEvent = null;
  pushNews(draft, { turn: draft.turn, emoji: def.emoji, title: `${def.title}：${choice.label}`, body: result, tone: def.tone === "bad" ? "neutral" : "good", tile: p.tile });
  return { ok: true, state: draft, message: result };
}

