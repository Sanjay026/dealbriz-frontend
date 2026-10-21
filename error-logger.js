/* =====================================================
   DealBriz — client-side error logging

   Catches JavaScript errors that would otherwise only ever appear in a
   user's own console (where nobody sees them) and reports them to the
   backend, which writes them to logs/client.log.

   Loaded FIRST, before every other script, so that an error thrown while
   app.js itself is parsing is still captured.

   Three things this deliberately does:

   - Caps how much it sends. A broken render loop can throw thousands of
     times a second; without limits the browser would hammer the server
     and flood the log with one repeated line.
   - Never throws from inside the error handler. An error reporter that
     can itself fail is worse than none, because it turns one visible
     problem into two invisible ones.
   - Sends no personal data. Message, stack, page path and browser only.
     No form values, no tokens, no emails — a log file is not the place
     for those, and this endpoint is unauthenticated.
   ===================================================== */
(function () {
  'use strict';

  var MAX_REPORTS_PER_SESSION = 20;   // hard ceiling per page load
  var DEDUPE_WINDOW_MS = 10000;       // ignore the same message for 10s
  var sent = 0;
  var recent = {};

  function apiOrigin() {
    if (window.DEALBRIZ_API_ORIGIN) return window.DEALBRIZ_API_ORIGIN;
    if (location.protocol.indexOf('http') === 0) return location.origin;
    return 'http://127.0.0.1:5000';
  }

  function shouldSend(message) {
    if (sent >= MAX_REPORTS_PER_SESSION) return false;
    var now = Date.now();
    // Drop repeats of an identical message inside the window — the same
    // fault firing on every render is one bug, not five hundred.
    if (recent[message] && now - recent[message] < DEDUPE_WINDOW_MS) return false;
    recent[message] = now;
    return true;
  }

  function report(payload) {
    try {
      if (!payload || !payload.message || !shouldSend(payload.message)) return;
      sent++;

      var body = JSON.stringify({
        message: String(payload.message).slice(0, 500),
        source: String(payload.source || '').slice(0, 300),
        line: payload.line || null,
        column: payload.column || null,
        stack: String(payload.stack || '').slice(0, 4000),
        // Path only — the query string can carry search terms the user typed.
        page: location.pathname + location.hash
      });

      var url = apiOrigin() + '/api/logs/client';

      // sendBeacon survives the page being closed, which matters because
      // plenty of errors happen during navigation away. fetch is the
      // fallback where it isn't available.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () { /* reporting failure must stay silent */ });
      }
    } catch (e) {
      /* Never let the reporter throw. */
    }
  }

  window.addEventListener('error', function (event) {
    // Failed <img>/<script> loads also fire 'error' but have no .error —
    // they're noise here, and a broken image shouldn't page anyone.
    if (!event || !event.message) return;
    report({
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error && event.error.stack
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event ? event.reason : null;
    report({
      message: 'Unhandled promise rejection: ' +
        (reason && reason.message ? reason.message : String(reason)),
      stack: reason && reason.stack
    });
  });

  // Lets application code report a handled problem it still wants recorded,
  // e.g. a caught failure that leaves the UI in a degraded state.
  window.logClientError = function (message, error) {
    report({
      message: String(message),
      stack: error && error.stack,
      source: error && error.fileName
    });
  };
})();
