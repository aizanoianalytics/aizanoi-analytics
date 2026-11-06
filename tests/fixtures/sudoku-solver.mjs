// Independent MRV enumerator, also used by browser acceptance: never reads the stored solution.
export function solve(board, limit = 2, stats = {}) {
  const found = []; stats.nodes = 0;
  function visit(a) {
    stats.nodes++;
    let index = -1; let options = [];
    for (let i = 0; i < 81; i++) if (!a[i]) {
      const r = Math.floor(i / 9), c = i % 9;
      const allowed = [];
      for (let n = 1; n <= 9; n++) if (!a.some((v,j) => v === n && (Math.floor(j/9) === r || j%9 === c || (Math.floor(j/27) === Math.floor(r/3) && Math.floor(j%9/3) === Math.floor(c/3))))) allowed.push(n);
      if (index < 0 || allowed.length < options.length) { index = i; options = allowed; }
    }
    if (index < 0) { found.push(a); return; }
    for (const n of options) { const next = [...a]; next[index] = n; visit(next); if (found.length >= limit) return; }
  }
  visit(board); return found;
}
