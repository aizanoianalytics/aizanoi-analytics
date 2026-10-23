import { COMBO, BOW } from './config.js';

// Duplicate minimal implementation that delegates to index.js via re-import is
// circular; instead reimplement using the shared helpers imported from index.js
// is not possible. So this module re-exports the implementations from index.js
// by importing them. (index.js does not import assist.js, so no cycle.)
import { pickTarget as _pickTarget, tryMelee as _tryMelee, tryBow as _tryBow } from './index.js';

export const ASSIST_MODES = ['manual', 'assist', 'auto'];
export const pickTarget = _pickTarget;
export const tryMelee = _tryMelee;
export const tryBow = _tryBow;
