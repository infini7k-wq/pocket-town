import { describe, expect, it } from "vitest";
import { placeBuilding } from "../actions";
import { analyzeCity } from "../analysis";
import { MISSIONS, claimMissions, currentMission, goalsAchieved } from "../goals";
import { readyToGrow } from "../growth";
import { createNewGame } from "../state";
import { voiceCandidates } from "../voices";
import { blankState, idx, put, roadRow, unwrap } from "./helpers";

describe("ミッション", () => {
  it("最初は「道路を延ばそう」から始まり、初期の町の建物は数えない", () => {
    const s = createNewGame("A", 1);
    expect(currentMission(s)?.id).toBe("m:road");
    expect(claimMissions(s, analyzeCity(s)).claimed).toHaveLength(0);
  });

  it("達成すると報酬を受け取り、次のミッションに進む（順番どおり）", () => {
    let s = blankState();
    roadRow(s, 8, 3, 12);
    for (const x of [3, 4, 5]) s = unwrap(placeBuilding(s, "road", idx(s, x, 9)));
    // 住宅も先に建てておくと、道路 → 住宅 の順に続けて達成される
    for (const x of [8, 9, 10]) s = unwrap(placeBuilding(s, "residential", idx(s, x, 9)));
    const before = s.money;
    const r = claimMissions(s, analyzeCity(s));
    expect(r.claimed.map((m) => m.id)).toEqual(["m:road", "m:house"]);
    expect(r.state.money).toBe(before + MISSIONS[0].reward + MISSIONS[1].reward);
    expect(currentMission(r.state)?.id).toBe("m:month");
    // 同じミッションを二重に受け取らない
    expect(claimMissions(r.state, analyzeCity(r.state)).claimed).toHaveLength(0);
  });

  it("ミッションは「街のスタイル」の達成数に含めない", () => {
    const s = { ...blankState(), achievements: ["m:road", "m:house", "surplus"] };
    expect(goalsAchieved(s)).toBe(1);
  });
});

describe("遊びやすさの補助", () => {
  it("条件がそろって成長ポイントがたまった建物は「もうすぐ育つ」", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    const home = put(s, 4, 9, "residential", 1, 14);
    put(s, 3, 9, "park");
    put(s, 5, 9, "commercial", 1);
    put(s, 6, 9, "school");
    put(s, 8, 9, "hospital");
    put(s, 11, 9, "industrial", 1);
    const b = s.tiles[home].building!;
    b.growth = 0;
    expect(readyToGrow(s, home, analyzeCity(s))).toBe(false);
    b.growth = 55;
    expect(readyToGrow(s, home, analyzeCity(s))).toBe(true);
  });

  it("住民の声には、解決に使える建物がついている", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 2, 50);
    const v = voiceCandidates(s, analyzeCity(s), null);
    expect(v.find((c) => c.id === "unemployment")?.tool).toBe("commercial");
    expect(v.find((c) => c.id === "school")?.tool).toBe("school");
  });
});
