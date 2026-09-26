import { describe, expect, it } from "vitest";
import { analyzeCity } from "../analysis";
import { blankState, idx, put, roadRow } from "./helpers";

describe("交通", () => {
  it("建物が増えると道路の交通量が増え、渋滞すると満足度が下がる", () => {
    const s = blankState();
    roadRow(s, 8, 3, 12);
    put(s, 4, 9, "residential", 1, 10);
    const light = analyzeCity(s);
    for (let x = 3; x <= 12; x++) if (x !== 7) {
      put(s, x, 9, "residential", 3, 110);
      put(s, x, 7, "industrial", 3);
    }
    const heavy = analyzeCity(s);
    const road = idx(s, 5, 8);
    expect(heavy.traffic.load[road]).toBeGreaterThan(light.traffic.load[road] * 5);
    expect(heavy.congestion).toBeGreaterThan(light.congestion);
    expect(heavy.traffic.level[road]).toBe(3);
  });

  it("大通りは容量が大きく、混雑しにくい", () => {
    const s = { ...blankState(), rank: "town" as const };
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 12; x++) if (x !== 7) put(s, x, 9, "residential", 3, 110);
    const road = analyzeCity(s);
    for (let x = 3; x <= 12; x++) put(s, x, 8, "avenue");
    const avenue = analyzeCity(s);
    expect(avenue.congestion).toBeLessThan(road.congestion);
  });

  it("バス停の範囲では交通量が減る", () => {
    const s = { ...blankState(), rank: "town" as const };
    roadRow(s, 8, 3, 12);
    for (let x = 3; x <= 6; x++) put(s, x, 9, "residential", 3, 110);
    const before = analyzeCity(s).traffic.load[idx(s, 4, 8)];
    put(s, 4, 10, "busStop");
    put(s, 3, 10, "road");
    const after = analyzeCity(s).traffic.load[idx(s, 4, 8)];
    expect(after).toBeLessThan(before);
  });
});
