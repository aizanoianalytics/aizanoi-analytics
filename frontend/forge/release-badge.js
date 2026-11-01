(function (root) {
  'use strict';
  var release = root.AIZANOI_RELEASE;
  if (!release || !root.document) return;
  var label = 'v' + release.VERSION + ' · build ' + release.BUILD;
  Array.prototype.forEach.call(root.document.querySelectorAll('[data-release]'), function (node) { node.textContent = label; });
})(globalThis);
