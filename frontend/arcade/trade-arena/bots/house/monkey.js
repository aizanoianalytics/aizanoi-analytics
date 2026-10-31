// House bot (not an AI-model entry): the dart-throwing monkey. Every 10 bars picks 3 random assets.
module.exports = {
  name: 'Monkey',
  onBar(state) {
    if (state.step % 10) return null;
    const syms = Object.keys(state.assets);
    const pick = new Set();
    while (pick.size < Math.min(3, syms.length)) pick.add(syms[Math.floor(Math.random() * syms.length)]);
    return { targets: Object.fromEntries([...pick].map(s => [s, 0.33])), note: `Darts landed on ${[...pick].join(', ')}` };
  }
};
