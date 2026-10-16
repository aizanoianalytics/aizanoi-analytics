/* Aizanoi Hello — Tableau Dashboard Extension connectivity pilot.
 *
 * Contract: connectivity only. This file must never read dashboard,
 * worksheet, data-source, settings or filter information from Tableau,
 * and must never contact any network beyond the page's own origin
 * (which, in practice, it does not contact at all).
 */
(function () {
  'use strict';

  var badge = document.getElementById('state-badge');
  var panel = document.getElementById('panel');
  var message = document.getElementById('state-message');
  var actions = document.getElementById('actions');
  var retry = document.getElementById('retry-button');
  var modeFact = document.getElementById('fact-mode');

  function setState(state, badgeText, bodyText, showRetry) {
    badge.dataset.state = state;
    badge.textContent = badgeText;
    message.textContent = bodyText;
    actions.hidden = !showRetry;
    // The retry control itself must also be inert-safe: `hidden` on the wrapper
    // already removes it from the a11y tree and tab order.
    retry.hidden = !showRetry;
  }

  function markDemo() {
    modeFact.textContent = 'Demo (browser)';
    setState(
      'demo',
      'Demo / Tableau not detected',
      'This page is running in a plain browser. Open it as an extension inside ' +
      'Tableau to run the connectivity test — in Demo mode nothing has been sent ' +
      'to or read from Tableau.',
      true
    );
    panel.dataset.mode = 'demo';
  }

  function initializeTableau() {
    modeFact.textContent = 'Tableau Desktop';
    setState('connecting', 'Connecting…', 'Handshake with Tableau in progress.');

    tableau.extensions.initializeAsync().then(function () {
      panel.dataset.mode = 'tableau';
      setState(
        'connected',
        'Tableau connected',
        'The handshake with Tableau completed successfully. This pilot read no ' +
        'dashboard, worksheet or data source information.',
        false
      );
    }).catch(function (err) {
      // Report the error class without leaking workbook or data contents.
      var reason = (err && typeof err.message === 'string' && err.message) ? err.message : 'Unknown error';
      setState(
        'error',
        'Initialization failed',
        'Tableau did not complete the extension handshake (' + reason + '). ' +
        'Check that the extension URL is reachable from this machine and that ' +
        'the .trex manifest points to https://aizanoianalytics.com/analytics/tableau/hello/.',
        true
      );
    });
  }

  retry.addEventListener('click', function () {
    if (typeof tableau === 'undefined') {
      markDemo();
      return;
    }
    initializeTableau();
  });

  if (typeof tableau === 'undefined' || !tableau.extensions || !tableau.extensions.initializeAsync) {
    markDemo();
  } else {
    initializeTableau();
  }
})();
