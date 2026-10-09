"use client";

import {
  BUILDINGS,
  GROWTH,
  HAPPINESS,
  MAX_LEVEL,
  capacityAt,
  checkDemolish,
  demolish,
  effectiveCapacity,
  forEachInRange,
  formatYen,
  checkRebuild,
  rebuild,
  growthScore,
  happinessContext,
  happinessFactors,
  isRoad,
  isUnlockedTile,
  isZone,
  jobsAt,
  levelName,
  nextLevelChecks,
  roadCapacity,
  toXY,
  anchorOf,
  buildingEmoji,
  footprint,
  neighbors4,
  tripsFor,
  RAIL,
  busStopBoost,
  busStyle,
  lineStyle,
  rankIndex,
  type CityAnalysis,
  type GameState,
  type BuildingType,
  type CoverageKind,
} from "@/game";
import { useCity, useGame } from "./GameProvider";
import { Button, ProgressBar, cx } from "./ui";

const TRAFFIC_TEXT = ["", "空いている", "やや混雑", "渋滞"];

/** 住宅に届いているかを見せる施設 */
const NEARBY: Array<{ kind: CoverageKind; icon: string; label: string }> = [
  { kind: "shopping", icon: "🛍️", label: "買い物" },
  { kind: "park", icon: "🌳", label: "公園" },
  { kind: "education", icon: "🏫", label: "学校" },
  { kind: "health", icon: "🏥", label: "病院" },
  { kind: "fire", icon: "🚒", label: "消防" },
  { kind: "transit", icon: "🚏", label: "バス" },
];
const ZONES: BuildingType[] = ["residential", "commercial", "industrial"];
const TRAFFIC_COLOR = ["", "text-emerald-600", "text-amber-600", "text-rose-600"];
const TERRAIN_TEXT = { grass: "草地", forest: "森（建設時に伐採費 ¥10,000）", water: "水辺（建設不可）" };

/** 線路・駅の路線の状態（路線名・電車が走るか・つながっている先） */
function LineRows({ state, a, i }: { state: GameState; a: CityAnalysis; i: number }) {
  const id = a.rail.lineOf[i];
  const line = a.rail.lines[id];
  if (!line) return null;
  const st = lineStyle(state, a.rail, id);
  const links = [line.stations.length > 0 && `駅${line.stations.length}`, line.edge && "となり町", line.shinkansen && "新幹線駅"].filter(Boolean).join("・");
  return (
    <>
      <Row label="路線">
        <span style={{ color: st.color }}>■</span> {st.name}
      </Row>
      <Row label="つながっている先">{links || "なし"}</Row>
      <Row label="電車">{line.working ? <span className="text-emerald-600">✓ 走っている（効き目 {Math.round(line.strength * 100)}%）</span> : <span className="text-amber-600">✗ まだ走っていない</span>}</Row>
      {!line.working && (
        <p className="mt-1 rounded-xl bg-amber-50 p-2 text-[11px] font-bold leading-relaxed text-amber-800">
          {line.stations.length === 0 ? "🚉 線路の上（道路に面した場所）に鉄道駅を置くと電車が走ります。" : "🛤️ 線路をのばして、ほかの駅か地図の端（となり町）につなぐと電車が走ります。"}
        </p>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="tabular text-right font-bold text-slate-800">{children}</span>
    </div>
  );
}

function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const v = Math.round(value);
  const color = v >= 70 ? "bg-emerald-500" : v >= 50 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="py-1">
      <div className="flex justify-between text-xs font-bold">
        <span className="text-slate-500">{label}</span>
        <span className="tabular text-slate-800">{v}</span>
      </div>
      <ProgressBar value={v / max} className="mt-0.5 h-1.5" color={color} />
    </div>
  );
}

/** 道路のとなりにある建物のうち、この道路に多く車を出しているもの（上位3つ） */
function trafficSources(state: GameState, a: CityAnalysis, road: number) {
  const seen = new Set<number>();
  const out: Array<{ tile: number; emoji: string; name: string; trips: number; roads: number; transit: boolean }> = [];
  for (const j of neighbors4(road, state.width, state.height)) {
    const anchor = anchorOf(state, j);
    const b = state.tiles[anchor]?.building;
    if (!b || isRoad(b.type) || seen.has(anchor)) continue;
    seen.add(anchor);
    const trips = tripsFor(state, anchor, a.employment, a.coverage, a.fx, a.rail);
    if (trips <= 0) continue;
    const cells = BUILDINGS[b.type].size === 2 ? footprint(anchor, state.width) : [anchor];
    const roads = new Set(cells.flatMap((c) => neighbors4(c, state.width, state.height)).filter((k) => isRoad(state.tiles[k].building?.type))).size;
    out.push({ tile: anchor, emoji: buildingEmoji(b.type, b.level), name: levelName(b.type, b.level), trips: trips / Math.max(1, roads), roads, transit: a.coverage.transit[anchor] > 0 || a.rail.ride[anchor] > 0 });
  }
  return out.sort((p, q) => q.trips - p.trips).slice(0, 3);
}

export function TileInfo({ onClose }: { onClose: () => void }) {
  const { state, analysis: a } = useCity();
  const { selected, toast, runAction, showOverlay } = useGame();
  if (selected === null) return null;
  const i = selected;
  const tile = state.tiles[i];
  const b = tile.building;
  const { x, y } = toXY(i, state.width);
  const unlocked = isUnlockedTile(state, i);

  const header = (emoji: string, title: string, sub?: string) => (
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-3xl" aria-hidden>
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-black text-slate-800">{title}</div>
        {sub && <div className="text-xs font-bold text-slate-500">{sub}</div>}
      </div>
      <button type="button" onClick={onClose} className="-mr-1 -mt-1 h-8 w-8 rounded-full text-lg text-slate-400 hover:bg-slate-100" aria-label="閉じる">
        ×
      </button>
    </div>
  );

  const factors = happinessFactors(state, i, happinessContext(a))
    .filter((f) => Math.abs(f.value) >= 1)
    .sort((p, q) => Math.abs(q.value) - Math.abs(p.value))
    .slice(0, 8);
  const factorList = (
    <div className="mt-1 flex flex-wrap gap-1">
      {factors.map((f) => (
        <span key={f.label} className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", f.value > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {f.label} {f.value > 0 ? "+" : ""}
          {Math.round(f.value)}
        </span>
      ))}
    </div>
  );

  const roadStatus = b && !isRoad(b.type) && b.type !== "cityHall" && (
    <Row label="道路">
      {!a.net.roadAccess[i] ? <span className="text-rose-600">⛔ 道路に面していない</span> : !a.net.connected[i] ? <span className="text-amber-600">⚠️ 役所につながっていない</span> : <span className="text-emerald-600">✓ 接続OK</span>}
    </Row>
  );

  let body: React.ReactNode;

  if (!b) {
    const h = HAPPINESS.base + factors.reduce((s, f) => s + f.value, 0);
    body = (
      <>
        {header(tile.terrain === "water" ? "🌊" : tile.terrain === "forest" ? "🌲" : "🟩", unlocked ? "空き地" : "未開発エリア", `(${x}, ${y}) ${TERRAIN_TEXT[tile.terrain]}`)}
        {!unlocked && <p className="mt-2 rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-600">🔒 街のランクが上がると開発できるようになります。</p>}
        {unlocked && tile.terrain !== "water" && (
          <div className="mt-2">
            <p className="text-[11px] font-bold text-slate-500">ここに住宅を建てた場合の目安</p>
            <Meter label="満足度（見込み）" value={Math.max(0, Math.min(100, h))} />
            <Meter label="環境" value={a.env[i]} />
            {factorList}
          </div>
        )}
      </>
    );
  } else if (isRoad(b.type)) {
    const cap = roadCapacity(b.type);
    const lv = a.traffic.level[i];
    const sources = trafficSources(state, a, i);
    const busHere = [...new Set(a.busRoutes.paths.filter((p) => p.tiles.includes(i)).map((p) => p.route))];
    body = (
      <>
        {header(b.type === "avenue" ? BUILDINGS.avenue.emoji[1] : "🛣️", BUILDINGS[b.type].name, `(${x}, ${y})`)}
        <div className="mt-2">
          <Row label="交通状態">
            <span className={TRAFFIC_COLOR[lv]}>{TRAFFIC_TEXT[lv]}</span>
          </Row>
          <Row label="交通量 / 容量">
            {Math.round(a.traffic.load[i])} / {cap}
          </Row>
          <Row label="役所への接続">{a.net.connected[i] ? <span className="text-emerald-600">✓ つながっている</span> : <span className="text-rose-600">✗ つながっていない</span>}</Row>
          <Row label="維持費">{formatYen(BUILDINGS[b.type].upkeep + (b.rail ? BUILDINGS.rail.upkeep : 0))}/月</Row>
          {b.rail && <Row label="踏切">🚧 電車待ちで流れが{Math.round((1 - RAIL.crossing) * 100)}%悪い</Row>}
          {busHere.length > 0 && (
            <Row label="バス路線">
              {busHere.map((r) => (
                <span key={r} className="ml-1" style={{ color: busStyle(a.busRoutes, r).color }}>
                  {busStyle(a.busRoutes, r).name}
                </span>
              ))}
            </Row>
          )}
          {b.rail && <LineRows state={state} a={a} i={i} />}
          {sources.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] font-bold text-slate-500">この道路に車を出している建物（となりのマス）</div>
              <ul className="mt-1 space-y-0.5">
                {sources.map((src) => (
                  <li key={src.tile} className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>
                      {src.emoji} {src.name}
                      {src.roads > 1 && <span className="ml-1 text-slate-400">（{src.roads}本の道路に分散）</span>}
                      {src.transit && <span className="ml-1 text-emerald-600">🚏</span>}
                    </span>
                    <span className="tabular">{Math.round(src.trips)}台</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lv >= 2 && (
            <div className="mt-2 rounded-xl bg-rose-50 p-2 text-[11px] font-bold leading-relaxed text-rose-700">
              <div>💡 渋滞の減らし方</div>
              <ul className="mt-0.5 list-disc pl-4">
                <li>車は建物のとなりの道路にだけ出る。建物の反対側にも道路を通すと、車が分かれる</li>
                <li>{state.rank === "village" ? "町になると大通り（道路の約2.5倍）が使える" : "大通りに置き換える（道路の約2.5倍の車が通れる）"}</li>
                <li>{state.rank === "village" ? "町になるとバス停が使える（範囲内の車が最大5割減）" : "バス停・バスターミナルの範囲に入れると、範囲内の建物の車が4〜5割減る（施設は道路に面して置く）"}</li>
                <li>交差する道路を増やすと、車がほかの道路に流れる</li>
                {rankIndex(state.rank) >= rankIndex("city") && <li>線路を敷いて鉄道駅を置くと、駅から4マス以内の車が最大6割減る（駅どうしか地図の端につなぐ）</li>}
              </ul>
            </div>
          )}
        </div>
      </>
    );
  } else if (b.type === "rail") {
    body = (
      <>
        {header("🛤️", tile.terrain === "water" ? "鉄橋" : "線路", `(${x}, ${y})`)}
        <p className="mt-2 text-xs font-bold text-slate-600">{BUILDINGS.rail.description}</p>
        <div className="mt-1">
          <LineRows state={state} a={a} i={i} />
          <Row label="維持費">{formatYen(BUILDINGS.rail.upkeep)}/月</Row>
        </div>
      </>
    );
  } else if (isZone(b.type)) {
    const checks = nextLevelChecks(state, i, a);
    const threshold = GROWTH.threshold[b.level] || 100;
    const score = growthScore(state, i, a);
    const isRes = b.type === "residential";
    const cap = isRes ? effectiveCapacity(state, i, a.net) : 0;
    const workers = a.employment.workersAt[i];
    const jobs = jobsAt(b.type, b.level);
    body = (
      <>
        {header(b.abandoned ? "🏚️" : BUILDINGS[b.type].emoji[b.level], b.abandoned ? (b.type === "residential" ? "空き家" : b.type === "commercial" ? "空き店舗" : "空き工場") : levelName(b.type, b.level), `${BUILDINGS[b.type].name} ・ Lv${b.level} ・ (${x}, ${y})`)}
        <div className="mt-2">
          {isRes ? (
            <Row label="住民">
              {b.occupants} / {Math.floor(cap)}人{cap < capacityAt("residential", b.level) && <span className="ml-1 text-amber-600">(定員減)</span>}
            </Row>
          ) : (
            <>
              <Row label="従業員">
                {Math.round(workers)} / {jobs}人
              </Row>
              <Row label={b.type === "commercial" ? "お客さんの充足" : "注文の充足"}>{Math.round((b.type === "commercial" ? a.employment.comEfficiency : a.employment.indEfficiency) * 100)}%</Row>
            </>
          )}
          {roadStatus}
          {isRes && <Meter label="満足度" value={a.happiness[i]} />}
          <Meter label="環境" value={a.env[i]} />
          {isRes && factorList}
          {isRes && b.level > 0 && (
            <div className="mt-2">
              <div className="text-[11px] font-bold text-slate-500">この家に届いている施設（タップで範囲を表示）</div>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {NEARBY.map((n) => {
                  const ok = a.coverage[n.kind][i] > 0;
                  return (
                    <button
                      key={n.kind}
                      type="button"
                      onClick={() => showOverlay(n.kind as Parameters<typeof showOverlay>[0])}
                      className={cx("rounded-lg px-1.5 py-1 text-[11px] font-bold", ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400")}
                    >
                      {ok ? "✓" : "✗"} {n.icon} {n.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {b.type === "industrial" && b.level > 0 && <p className="mt-1 text-[11px] font-bold text-amber-700">🏭 周囲3マスの環境を下げ、2マス以内の住宅に騒音</p>}
        </div>
        {b.level > 0 && !b.abandoned && checks && (
          <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600">次のレベル：{levelName(b.type, b.level + 1)}</span>
              <span className={cx("tabular", score >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {score >= 0 ? "▲ 成長中" : "▼ 衰退中"}
              </span>
            </div>
            <ProgressBar value={Math.max(0, b.growth) / threshold} className="mt-1 h-2" color={score >= 0 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-rose-400"} />
            <ul className="mt-2 space-y-0.5">
              {checks.map((c) => (
                <li key={c.label} className={cx("text-[11px] font-bold", c.ok ? "text-emerald-700" : "text-slate-500")}>
                  {c.ok ? "✅" : "⬜"} {c.label}
                </li>
              ))}
            </ul>
          </div>
        )}
        {b.level === 0 && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-800">🚧 造成中。{a.net.roadAccess[i] ? "来月には建物が完成します。" : "道路に面していないので建物が建ちません！"}</p>}
        {b.abandoned && <p className="mt-2 rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-600">周辺の満足度や需要が改善すると、また人が戻ってきます。</p>}
        {b.level === MAX_LEVEL && <p className="mt-2 text-xs font-bold text-violet-600">⭐ 最大レベルです</p>}
      </>
    );
  } else {
    const def = BUILDINGS[b.type];
    let covered = 0;
    // バス停は路線になると範囲が広がる。鉄道駅は電車の効き目の範囲
    const radius = b.type === "busStop" ? busStopBoost(a.busRoutes, state, i).radius : b.type === "railStation" ? RAIL.radius : (def.coverage?.radius ?? 0);
    if (def.coverage || b.type === "railStation") {
      forEachInRange(i, def.size ?? 1, radius, state.width, state.height, (j) => {
        const t = state.tiles[j].building;
        if (t?.type === "residential") covered += t.occupants;
      });
    }
    const route = a.busRoutes.routeOf.get(i);
    const routeStops = route !== undefined ? a.busRoutes.routes[route].length : 0;
    body = (
      <>
        {header(b.level === 0 && def.category === "project" ? "🏗️" : def.emoji[1], def.name, `(${x}, ${y})${def.size === 2 ? " ・ 2×2" : ""}`)}
        <p className="mt-2 text-xs font-bold text-slate-600">{def.description}</p>
        {def.effect && (def.coverage || b.type === "railStation") && (
          <p className="mt-2 rounded-xl bg-sky-50 p-2 text-[11px] font-bold leading-relaxed text-sky-800">
            📡 効果範囲（地図の紫の枠・{def.size === 2 ? "建物の端から" : "半径"}{radius}マス。道路や川をはさんでも届く）：{def.effect}
          </p>
        )}
        <div className="mt-1">
          {roadStatus}
          {(def.coverage || b.type === "railStation") && <Row label="効果範囲">{radius}マス</Row>}
          {(def.coverage || b.type === "railStation") && <Row label="範囲内の住民">{covered.toLocaleString("ja-JP")}人</Row>}
          {b.type === "railStation" && <LineRows state={state} a={a} i={i} />}
          {route !== undefined && (routeStops >= 2 || b.type === "busStop") && (
            <Row label="バス路線">
              {routeStops >= 2 ? (
                <span style={{ color: busStyle(a.busRoutes, route).color }}>
                  {busStyle(a.busRoutes, route).name}（停留所{routeStops}）{a.busRoutes.hub[route] && b.type === "busStop" ? "・ターミナル/駅に直通" : ""}
                </span>
              ) : (
                <span className="text-slate-400">ひとりぼっち（道のり8マス以内にほかの停留所がない）</span>
              )}
            </Row>
          )}
          <Row label="雇用">{jobsAt(b.type, 1)}人</Row>
          <Row label="維持費">{formatYen(def.upkeep)}/月</Row>
        </div>
        {b.type === "cityHall" && <p className="mt-2 rounded-xl bg-violet-50 p-2 text-[11px] font-bold text-violet-700">🏛️ すべての建物は道路で役所につながっていると、最大の力を発揮します。</p>}
        {def.category === "project" && (
          <div className={cx("mt-2 rounded-xl p-2.5 text-[11px] font-bold leading-relaxed", b.level === 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
            {b.level === 0 ? `🏗️ 工事中：あと${b.buildLeft ?? 0}か月で完成（工事中は維持費なし）` : "✅ 完成済み"}
            <div className="mt-0.5">完成すると：{def.impact}</div>
          </div>
        )}
      </>
    );
  }

  const del = checkDemolish(state, i);
  const rebuildTo = b && isZone(b.type) ? ZONES.filter((z) => z !== b.type) : [];
  return (
    <div>
      {body}
      {rebuildTo.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-2">
          <div className="text-[11px] font-bold text-slate-500">🔁 建て替え（撤去せずに種類を変える。造成からやり直し）</div>
          <div className="mt-1 flex gap-1.5">
            {rebuildTo.map((z) => {
              const c = checkRebuild(state, i, z);
              return (
                <Button
                  key={z}
                  size="sm"
                  variant="secondary"
                  disabled={!c.ok}
                  onClick={() => {
                    if (runAction((s) => rebuild(s, i, z))) toast(`${BUILDINGS[z].name}に建て替えました`, "info");
                  }}
                >
                  {BUILDINGS[z].emoji[1]} {BUILDINGS[z].name} {formatYen(c.cost, { compact: true })}
                </Button>
              );
            })}
          </div>
        </div>
      )}
      {b && del.ok && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (runAction((s) => demolish(s, i))) {
                toast(del.refund > 0 ? `撤去しました（+${formatYen(del.refund)}）` : "撤去しました", "info");
                onClose();
              }
            }}
          >
            🚜 撤去{del.refund > 0 ? `（+${formatYen(del.refund)} 戻る）` : "（返金なし）"}
          </Button>
        </div>
      )}
    </div>
  );
}
