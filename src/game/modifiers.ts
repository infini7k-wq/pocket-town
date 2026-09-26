// イベントなどによる一時的な効果の集計。

import type { Modifier, ModifierEffects } from "./types";

export type Effects = Required<ModifierEffects>;

export const NO_EFFECTS: Effects = {
  happiness: 0,
  env: 0,
  comDemand: 0,
  indDemand: 0,
  resAppeal: 0,
  traffic: 0,
  taxIncome: 0,
  noiseShield: 0,
  extraComJobs: 0,
  comSupport: 0,
  indSupport: 0,
  eduWeight: 0,
  healthWeight: 0,
  envWeight: 0,
  parkWeight: 0,
};

export function sumEffects(modifiers: Modifier[]): Effects {
  const out: Effects = { ...NO_EFFECTS };
  for (const m of modifiers) {
    for (const key of Object.keys(m.effects) as Array<keyof ModifierEffects>) {
      out[key] += m.effects[key] ?? 0;
    }
  }
  out.noiseShield = Math.min(1, out.noiseShield);
  return out;
}

/** 1か月経過させ、期限切れの効果を取り除く */
export function tickModifiers(modifiers: Modifier[]): Modifier[] {
  return modifiers.map((m) => ({ ...m, turnsLeft: m.turnsLeft - 1 })).filter((m) => m.turnsLeft > 0);
}

/** 同じ id の効果は上書き（重ねがけしない） */
export function addModifier(modifiers: Modifier[], mod: Modifier): Modifier[] {
  return [...modifiers.filter((m) => m.id !== mod.id), mod];
}
