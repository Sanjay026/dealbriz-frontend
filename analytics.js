/* Google Analytics 4 — page views for the SPA and a few product events.
   The gtag.js tag itself lives in index.html; this file only talks to it.

   A plain GA4 install counts the first load and nothing else: showPage()
   swaps pages with history.pushState and never reloads, so every later
   screen would be invisible. The router calls dbTrackPageView() after it
   updates the URL and this file dedupes by path. The initial view is sent
   from here on load (send_page_view is off in the config), which also keeps
   localhost and staging hits out of the property. */
(function () {
  'use strict';

  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i
    .test(location.hostname) || location.protocol === 'file:';
  // Localhost is silent by default; add ?ga=1 to watch the property while
  // testing a change.
  const enabled = !isLocal || new URLSearchParams(location.search).has('ga');

  const PAGE_TITLES = {
    home: 'DealBriz – Buy & Sell Near You',
    buy: 'Buy Second-Hand Near You',
    sell: 'Sell an Item',
    help: 'Help Centre',
    contact: 'Contact Us',
    reportProblem: 'Report a Problem',
    blog: 'Blog',
    partners: 'Partners',
    profile: 'My Profile',
    mylistings: 'My Listings',
    myads: 'Saved Items',
    mychats: 'My Chats',
    mydeals: 'DealLock',
    'emi-status': 'EMI Status',
    legal: 'Legal',
    admin: 'Admin Panel',
    about: 'About DealBriz',
    safety: 'Safety Guidelines',
    cookies: 'Cookie Policy',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
  };

  let lastPath = null;
  let lastKey = null;

  const currentPath = () => location.pathname + location.search;
  // Query strings carry campaign tags (and the ?ga test flag), but the app
  // rewrites them away on load. Compare without the query so that rewrite
  // doesn't count as a second page view.
  const pageKey = path => path.split('?')[0] || '/';

  function titleFor(path) {
    const key = path.replace(/^\/+/, '').split(/[/?]/)[0] || 'home';
    return PAGE_TITLES[key] || document.title;
  }

  /* opts.path / opts.title exist for the rare call that has already left the
     URL it wants to report. Everything else reads location. */
  function dbTrackPageView(opts) {
    if (!enabled || typeof gtag !== 'function') return;
    const path = (opts && opts.path) || currentPath();
    const key = pageKey(path);
    if (key === lastKey) { lastPath = path; return; }
    const previous = lastPath ? location.origin + lastPath : document.referrer;
    lastKey = key;
    lastPath = path;
    gtag('event', 'page_view', {
      page_title: (opts && opts.title) || titleFor(path),
      page_path: path,
      page_location: location.origin + path,
      page_referrer: previous || undefined,
    });
  }

  function dbTrackEvent(name, params) {
    if (!enabled || typeof gtag !== 'function' || !name) return;
    gtag('event', name, params || {});
  }

  window.dbTrackPageView = dbTrackPageView;
  window.dbTrackEvent = dbTrackEvent;

  // First view. Runs before app.js, so it is not delayed by the app's data
  // loads; the router's later call for the same path is deduped above.
  dbTrackPageView();
})();
