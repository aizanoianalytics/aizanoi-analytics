export function createLifecycle() {
  let destroyed = false;
  let rafId = 0;
  const cleanup = [];
  const audioContexts = new Set();

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) throw new TypeError(`Cannot listen for ${type}: invalid target.`);
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
    return handler;
  }

  function addCleanup(fn) {
    if (typeof fn === 'function') cleanup.push(fn);
    return fn;
  }

  function frame(callback) {
    if (destroyed) return 0;
    rafId = requestAnimationFrame(callback);
    return rafId;
  }

  function trackAudioContext(context) {
    if (context) audioContexts.add(context);
    return context;
  }

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    for (let i = cleanup.length - 1; i >= 0; i--) {
      try { cleanup[i](); } catch (error) { console.warn('Ancient World cleanup failed:', error); }
    }
    cleanup.length = 0;

    await Promise.allSettled([...audioContexts].map(async (context) => {
      if (context?.state !== 'closed') await context.close?.();
    }));
    audioContexts.clear();
  }

  return {
    listen,
    addCleanup,
    frame,
    trackAudioContext,
    destroy,
    get destroyed() { return destroyed; },
  };
}
