export function createAdaptiveQualityController({
  mobile = false,
  highPixelRatio = mobile ? 1.15 : 1.55,
  balancedPixelRatio = mobile ? 1.0 : 1.3,
  lowPixelRatio = mobile ? 0.85 : 1.0,
  slowFrameMs = mobile ? 29 : 25,
  fastFrameMs = mobile ? 20 : 17.5,
  downgradeSamples = 28,
  upgradeSamples = 180,
  cooldownSamples = 120,
} = {}) {
  const tiers = Object.freeze({
    high: highPixelRatio,
    balanced: balancedPixelRatio,
    low: lowPixelRatio,
  });

  let tier = mobile ? 'balanced' : 'high';
  let ewmaMs = 16.7;
  let slowSamples = 0;
  let fastSamples = 0;
  let cooldown = 0;
  let changed = false;

  function setTier(next) {
    if (next === tier) return false;
    tier = next;
    slowSamples = 0;
    fastSamples = 0;
    cooldown = cooldownSamples;
    changed = true;
    return true;
  }

  function sample(deltaSeconds) {
    const ms = Math.max(1, Math.min(250, Number(deltaSeconds) * 1000 || 16.7));
    ewmaMs = ewmaMs * 0.92 + ms * 0.08;
    if (cooldown > 0) {
      cooldown--;
      return tier;
    }

    if (ewmaMs > slowFrameMs) {
      slowSamples++;
      fastSamples = Math.max(0, fastSamples - 2);
      if (slowSamples >= downgradeSamples) {
        if (tier === 'high') setTier('balanced');
        else if (tier === 'balanced') setTier('low');
      }
    } else if (ewmaMs < fastFrameMs) {
      fastSamples++;
      slowSamples = Math.max(0, slowSamples - 1);
      if (fastSamples >= upgradeSamples) {
        if (tier === 'low') setTier('balanced');
        else if (tier === 'balanced') setTier('high');
      }
    } else {
      slowSamples = Math.max(0, slowSamples - 1);
      fastSamples = Math.max(0, fastSamples - 1);
    }
    return tier;
  }

  return Object.freeze({
    sample,
    pixelRatioCap: () => tiers[tier],
    consumeChanged() {
      const value = changed;
      changed = false;
      return value;
    },
    snapshot: () => Object.freeze({ tier, ewmaMs, pixelRatioCap: tiers[tier], slowSamples, fastSamples, cooldown }),
    forceTier(next) {
      if (!(next in tiers)) throw new RangeError(`Unknown quality tier: ${next}`);
      setTier(next);
      return tier;
    },
  });
}
