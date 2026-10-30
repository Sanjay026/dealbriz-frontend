/* DealBriz product analytics -> POST /api/track -> Admin -> Analytics.

   What is sent (and nothing else):
     impression  a listing card was at least half on screen for 0.8 s
     click       a listing was opened, and from where (buy, home, similar...)
     dwell       how long an opened listing was looked at (time the tab was
                 hidden doesn't count; capped at 30 min by the server)
     category    a category was browsed
   plus a random id for this browser tab (sessionStorage), so the server can
   count sessions. The server adds the device type and a keyed hash of the
   IP, and drops bots, staff and sellers viewing their own listings.

   Events are sent in batches every 10 s, at 20 events, and when the page is
   hidden or closed. A failed send is dropped silently: tracking must never
   affect the page. */
(() => {
  const ENDPOINT = (typeof API_BASE !== 'undefined' ? API_BASE : '/api') + '/track';
  const queue = [];
  let timer = null;

  const session = (() => {
    const make = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    try {
      let s = sessionStorage.getItem('dbz_sid');
      if (!s) { s = make(); sessionStorage.setItem('dbz_sid', s); }
      return s;
    } catch { return make(); }
  })();

  const csrf = () => {
    const m = document.cookie.match(/(?:^|;\s*)csrf_access_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  };

  function flush() {
    clearTimeout(timer); timer = null;
    while (queue.length) {
      const events = queue.splice(0, 50);
      try {
        fetch(ENDPOINT, {
          method: 'POST', keepalive: true, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
          body: JSON.stringify({ session, events }),
        }).catch(() => {});
      } catch { /* never let tracking break the page */ }
    }
  }

  function push(ev) {
    queue.push(ev);
    if (queue.length >= 20) flush();
    else if (!timer) timer = setTimeout(flush, 10000);
  }

  // Where on the site an element is: similar / map / chat_ai / the page id.
  function sourceOf(el) {
    if (!el || !el.closest) return 'direct';
    if (el.closest('#pdpSimilar')) return 'similar';
    if (el.closest('.leaflet-popup, .db-pop')) return 'map';
    if (el.closest('#botLog')) return 'chat_ai';
    if (el.closest('#chatModal, .chat-list-item')) return 'chat';
    const page = el.closest('.page');
    return page && page.id ? page.id.replace(/Page$/, '').toLowerCase().slice(0, 20) : 'other';
  }

  /* ---------- impressions: cards at least half visible for 0.8 s ---------- */
  const seen = new WeakSet();
  const pending = new WeakMap();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      const el = e.target;
      if (seen.has(el)) return;
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        if (!pending.has(el)) pending.set(el, setTimeout(() => {
          pending.delete(el);
          if (seen.has(el) || !document.body.contains(el)) return;
          seen.add(el); io.unobserve(el);
          push({ type: 'impression', product_id: el.dataset.pid, source: sourceOf(el) });
        }, 800));
      } else if (pending.has(el)) {
        clearTimeout(pending.get(el)); pending.delete(el);
      }
    });
  }, { threshold: [0, 0.5] }) : null;

  function watch(root) {
    if (!io || !root || !root.querySelectorAll) return;
    if (root.matches && root.matches('.pcard[data-pid]')) io.observe(root);
    root.querySelectorAll('.pcard[data-pid]').forEach(el => io.observe(el));
  }
  if (io) {
    new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && watch(n))))
      .observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => watch(document.body));
  }

  /* ---------- dwell: time an opened listing is actually on screen ---------- */
  let dwell = null;   // { pid, total, since }
  function dwellPause() {
    if (dwell && dwell.since) { dwell.total += Date.now() - dwell.since; dwell.since = 0; }
  }
  function dwellResume() {
    if (dwell && !dwell.since && !document.hidden) dwell.since = Date.now();
  }
  function dwellStop() {
    if (!dwell) return;
    dwellPause();
    if (dwell.total >= 500) push({ type: 'dwell', product_id: dwell.pid, dwell_ms: Math.round(dwell.total) });
    dwell = null;
  }
  function dwellStart(pid) {
    if (dwell && dwell.pid === pid) return;
    dwellStop();
    dwell = { pid, total: 0, since: document.hidden ? 0 : Date.now() };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { dwellPause(); flush(); } else { dwellResume(); }
  });
  window.addEventListener('pagehide', () => { dwellStop(); flush(); });

  window.dbzTrack = {
    click(pid, ev) {
      if (!pid) return;
      const el = ev && ev.target && ev.target.nodeType === 1 ? ev.target : null;
      push({ type: 'click', product_id: String(pid), source: ev && ev.type === 'popstate' ? 'direct' : sourceOf(el) });
    },
    dwellStart(pid) { if (pid) dwellStart(String(pid)); },
    dwellStop,
    category(slug, source) {
      if (!slug || slug === 'all') return;
      push({ type: 'category', category: String(slug), source: source || 'buy' });
    },
  };
})();
