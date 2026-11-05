// ECB reference conversion, not an executable FX quote. Each fixing is usable only from
// 00:00 UTC on the FOLLOWING date. One known-at-open rate is held for the whole UTC day.
const DAY = 86400000;
export function validateFx(fx) {
  if (fx?.version !== 1 || !Array.isArray(fx.available) || !fx.available.length || !Array.isArray(fx.tryPerUsd) || fx.available.length !== fx.tryPerUsd.length) throw new Error('FX history missing or malformed');
  for (let i=0;i<fx.available.length;i++) if (!Number.isFinite(fx.available[i]) || (i && fx.available[i] <= fx.available[i-1]) || !(Number.isFinite(fx.tryPerUsd[i]) && fx.tryPerUsd[i] > 0)) throw new Error('FX history missing or malformed');
  return fx;
}
export function fxAt(fx, time) {
  let lo=0, hi=fx.available.length-1, j=-1;
  while (lo<=hi) { const mid=(lo+hi)>>1; if (fx.available[mid]<=time) { j=mid;lo=mid+1; } else hi=mid-1; }
  if (j<0) throw new Error('FX history does not cover this date');
  if (time-fx.available[j]>7*DAY) throw new Error('FX history stale: update the ECB reference artifact before racing this date');
  return fx.tryPerUsd[j];
}
export function usdCols(cols, fx) {
  const rates=cols.t.map(t=>fxAt(fx,t)), out={...cols};
  for (const key of ['o','h','l','c','qv']) if (cols[key]) out[key]=cols[key].map((p,i)=>p/rates[i]);
  return out;
}
// Also revalues a carried close while the exchange is closed. No synthetic tradable bars.
export function assetPrice(m, a, i, time, field) {
  const p=a.cols[field][i];
  return a.fx ? p*fxAt(m.fx,a.cols.t[i])/fxAt(m.fx,time) : p;
}
