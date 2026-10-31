// Theme: "light" (Aizanoi Analytics site palette, default) or "dark" (broadcast mode for watching races).
// Canvas and chart code read colours through css() so they follow the active theme.
const KEY = 'trade-arena:theme';
export function getTheme() {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch { /* storage blocked */ }
  return 'light';
}
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
}
export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Bot/benchmark identity colours per theme. Categorical identity, never profit/loss.
export function applyBotColors(roster, theme) {
  for (const b of roster.bots) { b.colorDark ??= b.color; b.color = theme === 'light' ? (b.colorLight || b.colorDark) : b.colorDark; }
  roster.benchmarksDark ??= { ...roster.benchmarks };
  roster.benchmarks = theme === 'light' ? { ...roster.benchmarksDark, ...(roster.benchmarksLight || {}) } : { ...roster.benchmarksDark };
}

export function chartTheme() {
  return { text: css('--muted'), grid: css('--grid'), border: css('--line'), up: css('--up'), down: css('--down'), bg: css('--panel-solid'), ink: css('--text') };
}
