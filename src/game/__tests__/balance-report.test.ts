// バランス確認用の出力（BALANCE=1 のときだけ実行）
import { describe, it } from "vitest";
import { analyzeCity } from "../analysis";
import { advanceMonth } from "../simulation";
import { createNewGame } from "../state";
import { autoResolve, botTurn } from "./bot";

describe.runIf(process.env.BALANCE)("balance report", () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`seed ${seed}`, () => {
      let s = createNewGame("bal", seed);
      const a0 = analyzeCity(s);
      const lines: string[] = [`seed ${seed} trait=${s.profile.trait} tend=${s.profile.tendency} money=${s.money}`];
      const log = (s2: typeof s) => {
        const a = analyzeCity(s2);
        lines.push(
          `t${String(s2.turn).padStart(3)} pop ${String(a.population).padStart(5)} ¥${String(Math.round(s2.money / 1000)).padStart(6)}k net ${String(Math.round(a.budget.net / 1000)).padStart(5)}k H ${a.cityHappiness} emp ${(a.employment.employmentRate * 100).toFixed(0)}% fill ${(a.employment.jobFillRate * 100).toFixed(0)}% ce ${a.employment.comEfficiency.toFixed(2)} ie ${a.employment.indEfficiency.toFixed(2)} traf ${a.congestion} env ${a.cityEnvironment} D ${a.demand.residential}/${a.demand.commercial}/${a.demand.industrial} era ${s2.era.id} req ${s2.requests.length} rank ${s2.rank} R ${s2.tiles.filter((t) => t.building?.type === "residential").length}/${s2.tiles.filter((t) => t.building?.type === "residential" && t.building.level === 2).length} C ${s2.tiles.filter((t) => t.building?.type === "commercial").length} I ${s2.tiles.filter((t) => t.building?.type === "industrial").length} cap ${Math.round(a.employment.housingCapacity)} L3 ${s2.tiles.filter((t) => t.building?.level === 3).length} ${s2.lastReport ? `+${s2.lastReport.inflow}/-${s2.lastReport.outflow}` : ""}`,
        );
      };
      void a0;
      log(s);
      for (let m = 1; m <= 144; m++) {
        s = botTurn(s);
        s = autoResolve(s);
        const out = advanceMonth(s);
        if (!out) break;
        s = autoResolve(out.state);
        if (m % 12 === 0) log(s);
        if (s.gameOver) {
          lines.push("GAME OVER");
          break;
        }
      }
      console.log(lines.join("\n"));
    });
  }
  it("idle", () => {
    let s = createNewGame("idle", 5);
    const lines: string[] = ["idle"];
    for (let m = 0; m < 24; m++) {
      s = autoResolve(s);
      s = advanceMonth(s)!.state;
      const a = analyzeCity(s);
      if (m % 3 === 0) lines.push(`t${s.turn} pop ${a.population} ¥${s.money} net ${a.budget.net} H ${a.cityHappiness} emp ${(a.employment.employmentRate * 100).toFixed(0)} D ${a.demand.residential}/${a.demand.commercial}/${a.demand.industrial} +${s.lastReport!.inflow}/-${s.lastReport!.outflow}`);
    }
    console.log(lines.join("\n"));
  });
});
