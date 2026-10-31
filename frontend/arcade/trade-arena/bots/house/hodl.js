// House bot (not an AI-model entry): buys every listed asset in equal weight once, then holds.
let done = false;
module.exports = {
  name: 'HODL',
  onBar(state) {
    if (done) return null;
    const syms = Object.keys(state.assets);
    done = true;
    const w = 0.99 / syms.length;
    return { targets: Object.fromEntries(syms.map(s => [s, w])), note: `Equal weight across ${syms.length} assets. Never selling.` };
  }
};
