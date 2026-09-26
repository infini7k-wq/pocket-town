// ゲーム全体で使う型定義。GameState は JSON シリアライズ可能に保つ（localStorage に保存するため）。

export type BuildingType =
  | "road"
  | "avenue"
  | "residential"
  | "commercial"
  | "industrial"
  | "park"
  | "bigPark"
  | "school"
  | "hospital"
  | "fireStation"
  | "cityHall"
  | "busStop"
  | "plaza"
  | "station"
  | "landmark"
  | "stadium"
  | "university"
  | "bulletTrain"
  | "themePark"
  | "airport"
  /** 2×2 の大型施設の、アンカー以外の3マス */
  | "annex";

export type ZoneType = "residential" | "commercial" | "industrial";

export type Terrain = "grass" | "forest" | "water";

export type RankId = "village" | "town" | "city" | "metropolis" | "megacity";

/** 公共施設などが周囲に与える効果の種類 */
export type CoverageKind = "park" | "education" | "health" | "fire" | "transit" | "plaza" | "shopping" | "landmark";

export interface Building {
  type: BuildingType;
  /** ゾーンは 0（造成中）〜3、それ以外は常に 1 */
  level: number;
  /** 住宅の居住者数（住宅以外は 0。働き手は毎月の分析で算出する） */
  occupants: number;
  /** 成長ポイント（-100〜100）。100 で次のレベル、-100 で衰退 */
  growth: number;
  builtTurn: number;
  /** 建設時に支払った金額（撤去時の返金計算用） */
  paid: number;
  /** 空き家化（住宅・店舗・工場が衰退しきった状態） */
  abandoned: boolean;
  /** 大型プロジェクト：完成までの残り月数（建設中のみ） */
  buildLeft?: number;
  /** 2×2 の大型施設の一部（annex）なら、本体（左上）のマス */
  anchor?: number;
}

export interface Tile {
  terrain: Terrain;
  building: Building | null;
}

export type TraitId = "coastal" | "industrial" | "suburban" | "merchant";
export type TendencyId = "families" | "elderly" | "eco" | "balanced";

/** ニューゲーム時にランダムで決まる町の個性 */
export interface TownProfile {
  trait: TraitId;
  tendency: TendencyId;
  /** 地価（建設費の倍率） */
  landValue: number;
  /** 商業需要の倍率 */
  comDemand: number;
  /** 工業需要の倍率 */
  indDemand: number;
  /** 住宅の人気（転入のしやすさ、加算） */
  resAppeal: number;
}

export interface ModifierEffects {
  /** 満足度（加算） */
  happiness?: number;
  /** 環境（加算） */
  env?: number;
  /** 商業需要（倍率の加算、0.2 = +20%） */
  comDemand?: number;
  /** 工業需要（倍率の加算） */
  indDemand?: number;
  /** 転入のしやすさ（加算） */
  resAppeal?: number;
  /** 交通量（倍率の加算） */
  traffic?: number;
  /** 税収（倍率の加算） */
  taxIncome?: number;
  /** 騒音の軽減（0〜1） */
  noiseShield?: number;
  /** 商業の追加雇用枠（大型店の誘致など） */
  extraComJobs?: number;
  /** 商業が支えられる雇用の上乗せ（人数） */
  comSupport?: number;
  /** 工業が支えられる雇用の上乗せ（人数） */
  indSupport?: number;
  /** 学校・病院・環境・公園の効果の倍率（加算、0.5 = +50%） */
  eduWeight?: number;
  healthWeight?: number;
  envWeight?: number;
  parkWeight?: number;
}

/** イベントなどで一定期間かかる効果 */
export interface Modifier {
  id: string;
  label: string;
  emoji: string;
  turnsLeft: number;
  effects: ModifierEffects;
}

export interface PendingEvent {
  eventId: string;
  turn: number;
  /** イベントの対象マス（あれば） */
  tile?: number;
}

export type Tone = "good" | "bad" | "neutral";

export interface NewsItem {
  turn: number;
  emoji: string;
  title: string;
  body: string;
  tone: Tone;
  tile?: number;
}

export interface Voice {
  id: string;
  persona: string;
  face: string;
  text: string;
  tone: Tone;
  /** 解決のヒント */
  hint?: string;
  /** 関係するマス（クリックで地図上に表示） */
  tile?: number;
  /** 解決に役立つ建物（ボタンでその建設ツールを選べる） */
  tool?: BuildingType;
  /** 解決に役立つ画面（税率・融資など） */
  openTab?: "finance";
}

export interface HistoryPoint {
  turn: number;
  population: number;
  money: number;
  happiness: number;
  net: number;
}

export interface BudgetBreakdown {
  income: { residential: number; commercial: number; industrial: number; facilities: number; total: number };
  expense: { roads: number; services: number; admin: number; interest: number; total: number };
  net: number;
}

export interface TileChange {
  tile: number;
  kind: "levelUp" | "levelDown" | "built" | "abandoned" | "destroyed";
  level: number;
}

export interface MonthReport {
  /** 決算した月（進行前の turn） */
  turn: number;
  inflow: number;
  outflow: number;
  populationBefore: number;
  populationAfter: number;
  budget: BudgetBreakdown;
  /** 当月の建設費 */
  construction: number;
  changes: TileChange[];
  events: NewsItem[];
  rankUp: RankId | null;
  achievements: string[];
  /** この月に時代が変わったら、新しい時代の id */
  eraChange: string | null;
  /** この月にチャレンジの結果が出たら、その結果 */
  scenarioResult: ScenarioResult | null;
}

export type ScenarioResult = { turn: number; stars: number } | "failed";

/** チャレンジ（シナリオ）の進行状況 */
export interface ScenarioState {
  id: string;
  startTurn: number;
  /** 期限（この turn の月末まで） */
  deadline: number;
  result: ScenarioResult | null;
}

/** 時代（5〜7年ごとに移り変わり、需要や住民の好みが変わる） */
export interface EraState {
  id: string;
  since: number;
  /** 次の時代（announced = プレイヤーに予告済み） */
  next: { id: string; turn: number; announced: boolean } | null;
}

/** 住民や企業からの期限つきの依頼 */
export interface CityRequest {
  id: string;
  kind: string;
  /** 依頼を受けたときの値（進み具合の計算用） */
  base: number;
  /** 目標値 */
  target: number;
  /** 締め切り（この turn の月末まで） */
  deadline: number;
  reward: number;
  createdTurn: number;
}

export interface GameState {
  version: number;
  townName: string;
  /** 経過月数。0 = 1年目4月 */
  turn: number;
  money: number;
  loan: number;
  taxes: Record<ZoneType, number>;
  width: number;
  height: number;
  tiles: Tile[];
  /** 到達した最高ランク（下がらない） */
  rank: RankId;
  profile: TownProfile;
  modifiers: Modifier[];
  pendingEvent: PendingEvent | null;
  voices: Voice[];
  news: NewsItem[];
  history: HistoryPoint[];
  lastReport: MonthReport | null;
  /** 今月の建設費の合計 */
  monthSpend: number;
  /** 資金がマイナスで月末を迎えた連続月数 */
  debtMonths: number;
  /** 月次収支が黒字の連続月数 */
  surplusStreak: number;
  achievements: string[];
  rngSeed: number;
  gameOver: { reason: string; turn: number } | null;
  era: EraState;
  requests: CityRequest[];
  /** 最後に依頼が届いた turn */
  lastRequestTurn: number;
  /** イベントごとの最後に起きた turn（同じイベントの連続を防ぐ） */
  eventLog: Record<string, number>;
  /** ゲームごとの ID（殿堂の記録に使う） */
  gameId: string;
  /** チャレンジモードのときの状態（フリープレイは null） */
  scenario: ScenarioState | null;
}

export type ActionResult = { ok: true; state: GameState; message?: string } | { ok: false; error: string };
