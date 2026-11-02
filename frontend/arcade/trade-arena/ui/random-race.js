// Random race: everything is drawn from crypto.getRandomValues, inside the after-cutoff period, and shown in the race header.
// Stock intraday stays excluded (session timing not audited) and the window keeps 4-hour races small.
export function randomRace({ cutoff, dataEnd }, rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) {
  const pickOne = list => list[Math.floor(rand() * list.length)];
  const market = pickOne(['crypto', 'crypto', 'stocks', 'mixed']);
  const tf = market === 'crypto' && rand() < 0.35 ? '4h' : '1d';
  const days = tf === '4h' ? 60 + Math.floor(rand() * 120) : 90 + Math.floor(rand() * 276);
  const first = Date.parse(cutoff) + 86400000, last = Date.parse(dataEnd) - days * 86400000;
  const start = new Date(first + Math.floor(rand() * ((last - first) / 86400000 + 1)) * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(start) + days * 86400000).toISOString().slice(0, 10);
  const seed = 1 + Math.floor(rand() * 2147483646), blind = rand() < 0.3;
  return { title: `Random race #${seed.toString(36).toUpperCase()}`, market, tf, start, end, blind, seed };
}
