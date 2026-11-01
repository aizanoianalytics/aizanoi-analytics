(function (root) {
  'use strict';
  var release = root.AIZANOI_RELEASE;
  if (!release || !root.document) return;
  var label = 'v' + release.VERSION + ' · ' + release.BUILD;
  Array.prototype.forEach.call(root.document.querySelectorAll('[data-release]'), function (node) {
    var anchor = node.parentNode ? node.parentNode.querySelector('a[href*="/commits/"]') : null;
    if (anchor) anchor.textContent = 'exact commit (' + label + ')';
    else node.textContent = label;
  });
})(globalThis);
