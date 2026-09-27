"use client";

import { memo } from "react";
import { BUILDINGS, buildingEmoji, type BuildingType, type Terrain } from "@/game";
import { cx } from "../ui";

export interface TileViewProps {
  i: number;
  size: number;
  terrain: Terrain;
  checker: boolean;
  type?: BuildingType;
  level: number;
  abandoned: boolean;
  /** 道路の接続（上=1, 右=2, 下=4, 左=8） */
  roadMask: number;
  traffic: number;
  locked: boolean;
  overlay?: string;
  dim: boolean;
  badge?: "noRoad" | "disconnected";
  selected: boolean;
  flashKey?: number;
  preview?: "ok" | "bad";
  previewEmoji?: string;
  inRange: boolean;
  /** 効果範囲の境界線（上=1, 右=2, 下=4, 左=8） */
  rangeEdge?: number;
  /** 範囲表示中の住宅：効果が届いているか */
  covMark?: "in" | "out";
  /** もうすぐ次のレベルに育つ */
  soon?: boolean;
  /** 2×2 の大型施設の本体 */
  bigSize?: 2;
  /** 工事の残り月数 */
  buildLeft?: number;
}

const ZONE_PLATE: Record<string, string[]> = {
  residential: ["#e8f5e0", "#c9ebbd", "#a6dc94", "#86cc72", "#5fb54a"],
  commercial: ["#e3effc", "#c6def9", "#9fc6f2", "#78aeea", "#4f8fdc"],
  industrial: ["#fbf0d6", "#f5deaa", "#ecc97a", "#e0b050", "#d4943a"],
};

/** 造成中（レベル0）の点線の色：ゾーンの色に合わせる */
const ZONE_DASH: Record<string, string> = {
  residential: "border-emerald-500/80",
  commercial: "border-blue-500/80",
  industrial: "border-amber-500/80",
};

/** レベルごとの絵文字の大きさ（マスに対する割合）。小さいマスでは全体に大きめにする */
const EMOJI_SCALE = [0.46, 0.6, 0.72, 0.84, 0.92];

function Road({ mask, avenue, traffic, size }: { mask: number; avenue: boolean; traffic: number; size: number }) {
  const w = avenue ? 0.64 : 0.46;
  const inset = (1 - w) / 2;
  const color = avenue ? "#4b5563" : "#6b7280";
  const arm = (style: React.CSSProperties) => <div className="absolute" style={{ background: color, ...style }} />;
  const line = avenue ? "rgba(253,224,71,0.9)" : "rgba(255,255,255,0.75)";
  const lw = Math.max(1, Math.round(size * 0.04));
  return (
    <>
      <div className="absolute rounded-[2px]" style={{ background: color, left: `${inset * 100}%`, top: `${inset * 100}%`, width: `${w * 100}%`, height: `${w * 100}%` }} />
      {mask & 1 ? arm({ left: `${inset * 100}%`, width: `${w * 100}%`, top: 0, height: "50%" }) : null}
      {mask & 4 ? arm({ left: `${inset * 100}%`, width: `${w * 100}%`, bottom: 0, height: "50%" }) : null}
      {mask & 8 ? arm({ top: `${inset * 100}%`, height: `${w * 100}%`, left: 0, width: "50%" }) : null}
      {mask & 2 ? arm({ top: `${inset * 100}%`, height: `${w * 100}%`, right: 0, width: "50%" }) : null}
      {/* 車線の区切り（小さいマスでは省略） */}
      {size >= 20 && mask & 5 ? <div className="absolute left-1/2 -translate-x-1/2" style={{ width: lw, top: mask & 1 ? 0 : "50%", bottom: mask & 4 ? 0 : "50%", backgroundImage: `repeating-linear-gradient(${line} 0 3px, transparent 3px 7px)` }} /> : null}
      {size >= 20 && mask & 10 ? <div className="absolute top-1/2 -translate-y-1/2" style={{ height: lw, left: mask & 8 ? 0 : "50%", right: mask & 2 ? 0 : "50%", backgroundImage: `repeating-linear-gradient(90deg, ${line} 0 3px, transparent 3px 7px)` }} /> : null}
      {traffic >= 2 && (
        <span className="animate-car pointer-events-none absolute left-1/2 top-1/2 leading-none" style={{ fontSize: size * 0.34 }} aria-hidden>
          {traffic >= 3 ? "🚗🚙" : "🚗"}
        </span>
      )}
      {traffic >= 3 && <div className="absolute inset-0 rounded-sm ring-2 ring-inset ring-rose-500/60" />}
    </>
  );
}

function Sprite({ type, level, abandoned, size }: { type: BuildingType; level: number; abandoned: boolean; size: number }) {
  const def = BUILDINGS[type];
  const zone = def.category === "zone";
  const emoji = abandoned ? "🏚️" : buildingEmoji(type, level);
  const plate = zone ? (abandoned ? "#d6d3d1" : ZONE_PLATE[type][level]) : type === "cityHall" ? "#e9e1f7" : "#ffffff";
  const small = size < 26;
  const height = small ? (zone ? level * 0.7 + 0.5 : 1.5) : zone ? level * 1.5 + 1 : 2.5;
  const scale = (zone ? EMOJI_SCALE[level] : type === "cityHall" || type === "landmark" ? 0.8 : 0.68) * (small ? 1.08 : 1);
  return (
    <>
      <div
        className={cx("absolute rounded-[22%]", small ? "inset-[4%]" : "inset-[7%]", level === 0 && zone && cx("border-2 border-dashed", ZONE_DASH[type]))}
        style={{
          background: plate,
          boxShadow: `0 ${height}px 0 ${zone ? "rgba(0,0,0,0.18)" : def.color + "cc"}`,
          outline: zone ? undefined : `2px solid ${def.color}`,
          outlineOffset: -2,
        }}
      />
      <span
        key={`${type}-${level}-${abandoned}`}
        className={cx("animate-pop-in absolute inset-0 flex items-center justify-center leading-none", abandoned && "grayscale")}
        style={{ fontSize: size * scale, paddingBottom: height }}
        aria-hidden
      >
        {emoji}
      </span>
      {type === "industrial" && level >= 2 && !abandoned && (
        <span className="animate-smoke pointer-events-none absolute right-[6%] top-[-8%] leading-none" style={{ fontSize: size * 0.3 }} aria-hidden>
          💨
        </span>
      )}
      {zone && level > 0 && !abandoned && size >= 16 && (
        <span
          className={cx(
            "absolute bottom-[4%] right-[4%] flex items-center justify-center rounded-full font-black leading-none shadow ring-1 ring-white",
            level === 4 ? "bg-violet-600 text-white" : level === 3 ? "bg-amber-400 text-amber-950" : level === 2 ? "bg-slate-700 text-white" : "bg-white text-slate-700",
          )}
          style={{ width: Math.max(9, size * 0.3), height: Math.max(9, size * 0.3), fontSize: Math.max(7, size * 0.2) }}
          aria-label={`レベル${level}`}
        >
          {level}
        </span>
      )}
    </>
  );
}

/** 2×2 の大型施設（本体のマスから4マス分にはみ出して描く） */
function BigSprite({ type, level, buildLeft, size }: { type: BuildingType; level: number; buildLeft?: number; size: number }) {
  const def = BUILDINGS[type];
  const building = level === 0;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-[5]" style={{ width: size * 2, height: size * 2 }}>
      <div
        className={cx("absolute inset-[4%] rounded-[18%]", building && "border-2 border-dashed border-amber-500/80")}
        style={{ background: building ? "#fef3c7" : "#ffffff", boxShadow: `0 4px 0 ${def.color}cc`, outline: building ? undefined : `3px solid ${def.color}`, outlineOffset: -3 }}
      />
      <span key={`${type}-${level}`} className="animate-pop-in absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: size * (building ? 0.9 : 1.25), paddingBottom: 4 }} aria-hidden>
        {building ? "🏗️" : def.emoji[1]}
      </span>
      {building && buildLeft !== undefined && (
        <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-500 px-1.5 py-0.5 font-black leading-none text-white shadow" style={{ fontSize: Math.max(9, size * 0.28) }}>
          あと{buildLeft}か月
        </span>
      )}
    </div>
  );
}

function TileViewImpl(p: TileViewProps) {
  const s = p.size;
  const road = p.type === "road" || p.type === "avenue";
  return (
    <div data-i={p.i} className="relative select-none" style={{ width: s, height: s }}>
      {/* 地形 */}
      {p.terrain === "water" ? (
        <div className="water-tile absolute inset-0" />
      ) : (
        <div className="absolute inset-0" style={{ background: p.terrain === "forest" ? (p.checker ? "#86bf57" : "#7fb951") : p.checker ? "#a8d670" : "#9fd066" }} />
      )}
      {p.terrain === "forest" && !p.type && (
        <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: s * 0.5 }} aria-hidden>
          {p.checker ? "🌲" : "🌳"}
        </span>
      )}
      {road && <Road mask={p.roadMask} avenue={p.type === "avenue"} traffic={p.traffic} size={s} />}
      {p.type && p.bigSize === 2 && <BigSprite type={p.type} level={p.level} buildLeft={p.buildLeft} size={s} />}
      {p.type && !road && !p.bigSize && p.type !== "annex" && <Sprite type={p.type} level={p.level} abandoned={p.abandoned} size={s} />}
      {p.soon && (
        <span className="animate-bounce-soft pointer-events-none absolute left-[2%] top-[-4%] leading-none" style={{ fontSize: s * 0.32 }} title="もうすぐ育ちます" aria-hidden>
          ✨
        </span>
      )}

      {p.overlay && <div className="pointer-events-none absolute inset-0" style={{ background: p.overlay }} />}
      {p.dim && <div className="pointer-events-none absolute inset-0 bg-slate-900/30" />}
      {p.inRange && <div className="pointer-events-none absolute inset-0 bg-violet-400/30" />}
      {p.rangeEdge ? (
        <div
          className="pointer-events-none absolute inset-0 z-[4]"
          style={{
            borderColor: p.inRange ? "#7c3aed" : "#1d4ed8",
            borderStyle: "solid",
            borderTopWidth: p.rangeEdge & 1 ? 2 : 0,
            borderRightWidth: p.rangeEdge & 2 ? 2 : 0,
            borderBottomWidth: p.rangeEdge & 4 ? 2 : 0,
            borderLeftWidth: p.rangeEdge & 8 ? 2 : 0,
          }}
        />
      ) : null}
      {p.covMark && s >= 14 && (
        <span
          className={cx("absolute left-0 top-0 z-[6] flex items-center justify-center rounded-full font-black leading-none text-white shadow ring-1 ring-white", p.covMark === "in" ? "bg-emerald-500" : "bg-slate-400")}
          style={{ width: Math.max(10, s * 0.34), height: Math.max(10, s * 0.34), fontSize: Math.max(7, s * 0.22) }}
          aria-label={p.covMark === "in" ? "効果が届いている" : "効果が届いていない"}
        >
          {p.covMark === "in" ? "✓" : "✗"}
        </span>
      )}

      {p.badge && (
        <span
          className="absolute right-0 top-0 z-[6] flex items-center justify-center rounded-full bg-white leading-none shadow"
          style={{ width: s * 0.36, height: s * 0.36, fontSize: s * 0.24 }}
          title={p.badge === "noRoad" ? "道路に面していません" : "役所まで道路がつながっていません"}
        >
          {p.badge === "noRoad" ? "⛔" : "⚠️"}
        </span>
      )}

      {p.preview && (
        <div className={cx("pointer-events-none absolute inset-[3%] flex items-center justify-center rounded-lg border-2", p.preview === "ok" ? "border-emerald-400 bg-emerald-300/40" : "border-rose-500 bg-rose-400/40")}>
          {p.previewEmoji && (
            <span className="leading-none opacity-80" style={{ fontSize: s * 0.55 }}>
              {p.previewEmoji}
            </span>
          )}
        </div>
      )}

      {p.locked && <div className="pointer-events-none absolute inset-0 bg-slate-800/45" />}
      {p.selected && <div className="animate-ring pointer-events-none absolute inset-[4%] z-10 rounded-lg" />}
      {p.flashKey ? <div key={p.flashKey} className="animate-flash pointer-events-none absolute inset-0 z-10" /> : null}
    </div>
  );
}

export const TileView = memo(TileViewImpl);
