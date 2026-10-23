/* =========================================================
   DealBriz — How It Works (scroll road)
   A road runs top → bottom through the steps. As you scroll, the road
   fills in navy, a car drives along it, and each step lights up when
   the car reaches it. Buying / Selling switch swaps the steps.
   ========================================================= */
(() => {
  const ICON = {
    search:  '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    chat:    '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/><path d="M8.5 8.5h7M8.5 11.5h4.5"/>',
    emi:     '<path d="M7 4.5h10M7 8.5h10M8 4.5h2.5a4 4 0 0 1 0 8H8l6.5 7"/>',
    done:    '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.5 2.5 5-5.3"/>',
    camera:  '<path d="M4 8.5a2 2 0 0 1 2-2h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.2"/>',
    pin:     '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    lock:    '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/><rect x="9" y="9.3" width="6" height="4.2" rx="1"/><path d="M10.3 9.3v-.9a1.7 1.7 0 0 1 3.4 0v.9"/>',
    tag:     '<path d="M3.5 12.2V5A1.5 1.5 0 0 1 5 3.5h7.2a1.5 1.5 0 0 1 1 .44l7.4 7.4a1.5 1.5 0 0 1 0 2.1l-7.2 7.2a1.5 1.5 0 0 1-2.1 0l-7.4-7.4a1.5 1.5 0 0 1-.4-1z"/><circle cx="8" cy="8" r="1.4"/>',
    flag:    '<path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[k]}</svg>`;

  /* Step text: Buying = dealbriz.com "How DealBriz Works"; Selling = "How Selling Works" titles. */
  const FLOWS = {
    buy: {
      sub: 'Buying or selling locally has never been simpler.',
      finish: 'Deal done',
      steps: [
        ['search', 'Browse',   'Find second-hand products near your location with smart search and filters.'],
        ['chat',   'Connect',  'Chat directly with the seller through our secure in-app messaging.'],
        ['emi',    'Choose',   'Buy directly or choose EMI financing if eligible for that product.'],
        ['done',   'Complete', 'Arrange pickup or delivery and finish your transaction safely.'],
      ],
    },
    sell: {
      sub: 'From photo to sold, and what it costs you: nothing.',
      finish: 'Sold',
      steps: [
        ['camera', 'List it',                'Pick a category, add up to 5 photos, set your price and mark it negotiable.'],
        ['pin',    'Buyers nearby find you', 'Your pincode shows the listing to people in your area first.'],
        ['lock',   'Talk on your terms',     'Buyers reach you in in-app chat. Your number stays hidden unless you share it.'],
        ['tag',    'Close the sale',         'Agree on a price, meet somewhere public and hand it over. Then mark it sold.'],
      ],
    },
  };

  const NS = 'http://www.w3.org/2000/svg';
  const pad = (n) => String(n).padStart(2, '0');

  function init() {
    const root = document.querySelector('[data-dbz-how]');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';

    const sub     = root.querySelector('[data-how-sub]');
    const toggles = [...root.querySelectorAll('[data-flow]')];
    const track   = root.querySelector('.dbz-how__track');
    const road    = root.querySelector('.dbz-how__road');
    const list    = root.querySelector('.dbz-how__steps');
    const finish  = root.querySelector('.dbz-how__finish');
    const reduce  = matchMedia('(prefers-reduced-motion: reduce)');
    const maskId  = 'dbzHowMask' + Math.random().toString(36).slice(2, 7);

    road.innerHTML = `
      <defs><mask id="${maskId}" maskUnits="userSpaceOnUse"><path class="r-mask"/></mask></defs>
      <path class="r-base"/><path class="r-dash-base"/>
      <g mask="url(#${maskId})"><path class="r-fill"/><path class="r-dash"/></g>
      <g class="car"><g class="car-body"><g transform="translate(-18,-11)">
        <rect x="0" y="0" width="36" height="22" rx="7" fill="#3B6EF5"/>
        <rect x="21" y="3.5" width="8" height="15" rx="2.5" fill="#0B1A33"/>
        <rect x="5" y="4" width="6" height="14" rx="2" fill="#0B1A33" opacity=".75"/>
        <rect x="12.5" y="5" width="7" height="12" rx="2" fill="#fff" opacity=".25"/>
        <rect x="33" y="3" width="3" height="5" rx="1.2" fill="#F5B942"/><rect x="33" y="14" width="3" height="5" rx="1.2" fill="#F5B942"/>
        <rect x="0" y="3" width="2.5" height="5" rx="1" fill="#E5484D"/><rect x="0" y="14" width="2.5" height="5" rx="1" fill="#E5484D"/>
      </g></g></g>`;
    const P = (c) => road.querySelector(c);
    const paths = [P('.r-base'), P('.r-dash-base'), P('.r-fill'), P('.r-dash'), P('.r-mask')];
    const mask = road.querySelector('mask');
    const maskPath = P('.r-mask');
    const car = P('.car');
    const tmp = document.createElementNS(NS, 'path');

    let flow = 'buy', steps = [], nodeLen = [], total = 0, endY = 0;
    let shown = 0, target = 0, raf = 0;

    function render() {
      const f = FLOWS[flow];
      root.dataset.activeFlow = flow;
      sub.textContent = f.sub;
      finish.innerHTML = `${svg('flag')}<span>${f.finish}</span>`;
      list.innerHTML = f.steps.map(([ic, title, text], i) => `
        <li class="dbz-step">
          <span class="dbz-step__node" aria-hidden="true">${pad(i + 1)}</span>
          <div class="dbz-step__card">
            <span class="dbz-step__icon">${svg(ic)}</span>
            <div>
              <span class="dbz-step__eyebrow">Step ${pad(i + 1)}</span>
              <h3 class="dbz-step__title">${title}</h3>
              <p class="dbz-step__text">${text}</p>
            </div>
          </div>
        </li>`).join('');
      steps = [...list.children];
      toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.flow === flow)));
    }

    /* Build the road through the centre of every step node. */
    function layout() {
      const t = track.getBoundingClientRect();
      const W = t.width, H = t.height;
      if (!W || !steps.length) return;
      const pts = steps.map((li) => {
        const r = li.querySelector('.dbz-step__node').getBoundingClientRect();
        return { x: r.left + r.width / 2 - t.left, y: r.top + r.height / 2 - t.top };
      });
      const last = pts[pts.length - 1];
      endY = H - 56;
      const segs = [`M ${pts[0].x} 0 L ${pts[0].x} ${pts[0].y}`];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dy = (b.y - a.y) / 2;
        segs.push(`C ${a.x} ${a.y + dy} ${b.x} ${b.y - dy} ${b.x} ${b.y}`);
      }
      segs.push(`L ${last.x} ${endY}`);

      nodeLen = pts.map((_, i) => { tmp.setAttribute('d', segs.slice(0, i + 1).join(' ')); return tmp.getTotalLength(); });
      const d = segs.join(' ');
      road.setAttribute('viewBox', `0 0 ${W} ${H}`);
      paths.forEach((p) => p.setAttribute('d', d));
      ['x', 'y'].forEach((k) => mask.setAttribute(k, -40));
      mask.setAttribute('width', W + 80); mask.setAttribute('height', H + 80);
      total = P('.r-base').getTotalLength();
      maskPath.style.strokeDasharray = `${total} ${total + 10}`;

      finish.style.left = `${last.x}px`;
      finish.style.top = `${endY + 14}px`;

      target = reduce.matches ? total : lengthForScroll();
      shown = Math.min(shown, total);
      draw(reduce.matches ? total : shown);
    }

    // length along the road whose point sits at ~62% of the viewport height
    function lengthForScroll() {
      const y = innerHeight * 0.62 - track.getBoundingClientRect().top;
      if (y <= 0) return 0;
      if (y >= endY) return total;
      const road0 = P('.r-base');
      let lo = 0, hi = total;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (road0.getPointAtLength(mid).y < y) lo = mid; else hi = mid;
      }
      return lo;
    }

    function draw(len) {
      maskPath.style.strokeDashoffset = String(total - len);
      const base = P('.r-base');
      const p = base.getPointAtLength(len);
      const a = base.getPointAtLength(Math.max(0, len - 2)), b = base.getPointAtLength(Math.min(total, len + 2));
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      car.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${ang})`);
      steps.forEach((li, i) => li.classList.toggle('is-on', len >= nodeLen[i] - 4));
      finish.classList.toggle('is-on', len >= total - 4);
    }

    // ease the car toward the scroll target so it drives instead of jumping
    function tick() {
      raf = 0;
      const diff = target - shown;
      shown = Math.abs(diff) < 0.5 ? target : shown + diff * 0.14;
      draw(shown);
      if (shown !== target) raf = requestAnimationFrame(tick);
    }
    function onScroll() {
      if (reduce.matches || !total) return;
      target = lengthForScroll();
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function switchTo(next) {
      if (next === flow) return;
      root.classList.add('is-switching');
      setTimeout(() => {
        flow = next;
        render();
        shown = 0;                                  // car drives the new route from the top
        layout();
        root.classList.remove('is-switching');
        onScroll();
      }, 200);
    }

    /* Flow can also be set from elsewhere (e.g. the sell band's
       "Learn How Selling Works"): without the fade, so the page can scroll
       straight to the switch. */
    function setFlow(next, animate = true) {
      if (!FLOWS[next] || next === flow) return;
      if (animate && !reduce.matches) {
        switchTo(next);
        return;
      }
      root.classList.remove('is-switching');
      flow = next;
      render();
      shown = 0;
      layout();
      onScroll();
    }

    window.dbzHow = {
      setFlow,
      refresh() { layout(); onScroll(); },
      get flow() { return flow; },
    };

    toggles.forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.flow)));
    addEventListener('scroll', onScroll, { passive: true });
    new ResizeObserver(() => { layout(); onScroll(); }).observe(track);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); onScroll(); });

    render();
    layout();
    onScroll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
