// 表示用のフォーマット関数。

export function formatYen(v: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const sign = v < 0 ? "-" : opts.sign && v > 0 ? "+" : "";
  const abs = Math.abs(Math.round(v));
  if (opts.compact) {
    if (abs >= 100_000_000) return `${sign}¥${(abs / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1)}億`;
    if (abs >= 10_000) return `${sign}¥${Math.round(abs / 10_000).toLocaleString("ja-JP")}万`;
  }
  return `${sign}¥${abs.toLocaleString("ja-JP")}`;
}

export function formatNumber(v: number, opts: { sign?: boolean } = {}): string {
  const sign = v < 0 ? "-" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${Math.abs(Math.round(v)).toLocaleString("ja-JP")}`;
}

export function formatPercent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** turn 0 = 1年目4月 */
export function monthOf(turn: number): number {
  return ((turn + 3) % 12) + 1;
}

export function yearOf(turn: number): number {
  return Math.floor(turn / 12) + 1;
}

export function formatDate(turn: number): string {
  return `${yearOf(turn)}年目 ${monthOf(turn)}月`;
}

export function seasonEmoji(turn: number): string {
  const m = monthOf(turn);
  if (m >= 3 && m <= 5) return "🌸";
  if (m >= 6 && m <= 8) return "🌻";
  if (m >= 9 && m <= 11) return "🍁";
  return "⛄";
}
