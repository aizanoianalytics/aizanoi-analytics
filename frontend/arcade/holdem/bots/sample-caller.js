module.exports = function act(state) {
  'use strict';
  return { type: state.canCheck ? 'check' : 'call' };
};

module.exports.botName = 'Sample Caller';
module.exports.lab = 'Aizanoi sample';
module.exports.note = 'House sample; not an AI-model entry.';
