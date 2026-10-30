/* Browse Categories — tiles that expand into one panel.
   Desktop hovers a tile to preview it; touch taps to open, then uses the
   panel's CTA. Panel counts come from each tile's data-count, which
   app.js fills with real listing totals. */
(() => {
  const D = '#1b1d24', G = '#3a3f4d', L = '#cfd3dc', S = '#e6e8ee',
        GL = '#26314a', Y = '#ffd166', R = '#ff4d4d';
  const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="8" fill="#000" opacity=".16"/>`;
  const wheel = (cx, cy, r) => `<g class="dbz-wheel">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${D}"/><circle cx="${cx}" cy="${cy}" r="${r * .58}" fill="${L}"/>
    <rect x="${cx - r * .5}" y="${cy - r * .08}" width="${r}" height="${r * .16}" rx="${r * .08}" fill="#7d8496"/>
    <rect x="${cx - r * .08}" y="${cy - r * .5}" width="${r * .16}" height="${r}" rx="${r * .08}" fill="#7d8496"/>
    <circle cx="${cx}" cy="${cy}" r="${r * .16}" fill="${D}"/></g>`;

  const ART = {
    cars: ['0 0 420 200', `${shadow(215, 186, 195)}
      <path d="M22 142Q20 114 46 106L116 94L164 54Q178 42 200 42L298 42Q322 42 338 58L372 94L398 102Q412 108 412 126L412 148Q412 160 400 160L34 160Q22 160 22 142Z" fill="#fff"/>
      <path d="M22 136L412 136L412 148Q412 160 400 160L34 160Q22 160 22 148Z" fill="${S}"/>
      <path d="M130 94L172 58Q180 52 194 52L244 52L244 94Z" fill="${GL}"/>
      <path d="M254 52L296 52Q312 52 324 64L352 94L254 94Z" fill="${GL}"/>
      <path d="M150 90L182 62L198 62L166 90Z" fill="#fff" opacity=".2"/>
      <path d="M249 98L249 150" stroke="${L}" stroke-width="3"/>
      <rect x="204" y="106" width="22" height="5" rx="2.5" fill="#b8bdc9"/><rect x="284" y="106" width="22" height="5" rx="2.5" fill="#b8bdc9"/>
      <path d="M24 116Q30 108 46 108L54 118L26 124Z" fill="${Y}"/>
      <rect x="22" y="130" width="28" height="6" rx="3" fill="${D}" opacity=".55"/>
      <rect x="402" y="110" width="10" height="14" rx="3" fill="${R}"/>
      ${wheel(104, 160, 28)}${wheel(328, 160, 28)}`],

    scooters: ['0 0 420 220', `${shadow(211, 210, 170)}
      ${wheel(92, 170, 40)}${wheel(330, 170, 40)}
      <path d="M180 80L160 160" stroke="${G}" stroke-width="10" stroke-linecap="round"/>
      <rect x="140" y="60" width="80" height="40" rx="12" fill="#fff"/>
      <path d="M220 80h80l20 40v50h-20" stroke="${G}" stroke-width="8" fill="none" stroke-linejoin="round"/>
      <path d="M300 130h20v20h-20z" fill="${R}"/>
      <path d="M120 100Q140 56 180 60" stroke="#9aa1b1" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M130 70L160 50" stroke="${D}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="140" cy="80" r="12" fill="${Y}" stroke="#fff" stroke-width="4"/>`],

    commercial: ['0 0 420 220', `${shadow(210, 208, 190)}
      <rect x="20" y="68" width="240" height="120" rx="14" fill="#fff"/>
      <rect x="260" y="108" width="130" height="80" rx="10" fill="${S}"/>
      <path d="M260 128h100l28 34v26h-128" stroke="${G}" stroke-width="6" fill="none"/>
      ${wheel(80, 196, 26)}${wheel(200, 196, 26)}${wheel(346, 196, 26)}
      <rect x="34" y="82" width="60" height="40" rx="6" fill="${GL}"/>
      <rect x="110" y="82" width="60" height="40" rx="6" fill="${GL}"/>
      <path d="M314 128l20 18" stroke="${GL}" stroke-width="5" stroke-linecap="round"/>
      <rect x="370" y="148" width="16" height="14" rx="4" fill="${R}"/>
      <rect x="22" y="84" width="12" height="10" rx="3" fill="${Y}"/>`],

    bikes: ['0 0 420 220', `${shadow(211, 210, 170)}
      ${wheel(92, 164, 46)}${wheel(330, 164, 46)}
      <path d="M330 164L240 140" stroke="${G}" stroke-width="10" stroke-linecap="round"/>
      <path d="M200 176L312 182" stroke="#b8bdc9" stroke-width="12" stroke-linecap="round"/>
      <path d="M160 104L192 152L242 140" stroke="${G}" stroke-width="9" fill="none" stroke-linejoin="round"/>
      <rect x="176" y="112" width="70" height="46" rx="10" fill="${G}"/>
      <path d="M186 124H236M186 136H236M186 148H236" stroke="#555b6b" stroke-width="4"/>
      <path d="M92 164L138 62" stroke="#9aa1b1" stroke-width="10" stroke-linecap="round"/>
      <path d="M54 134Q92 108 130 134" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M150 84Q176 58 226 64L262 80L246 108L162 108Z" fill="#fff"/>
      <path d="M176 76Q196 66 222 70" stroke="${GL}" stroke-width="5" fill="none" opacity=".35" stroke-linecap="round"/>
      <path d="M256 78L336 84Q346 86 342 98L250 100Z" fill="${D}"/>
      <path d="M250 100L342 98L370 108L300 124L246 120Z" fill="#fff"/>
      <rect x="362" y="102" width="12" height="8" rx="3" fill="${R}"/>
      <path d="M126 50L162 40" stroke="${D}" stroke-width="9" stroke-linecap="round"/>
      <path d="M152 42L160 22" stroke="${D}" stroke-width="4"/><circle cx="161" cy="18" r="7" fill="${D}"/>
      <circle cx="128" cy="74" r="13" fill="${Y}" stroke="#fff" stroke-width="5"/>`],

    mobiles: ['0 0 240 320', `${shadow(120, 310, 84)}
      <g transform="rotate(-10 120 160)">
      <rect x="40" y="18" width="160" height="290" rx="30" fill="${D}"/>
      <rect x="200" y="90" width="5" height="40" rx="2" fill="${G}"/>
      <rect x="50" y="30" width="140" height="266" rx="22" fill="#f4f5f8"/>
      <rect x="98" y="38" width="44" height="10" rx="5" fill="${D}"/>
      <rect x="62" y="62" width="116" height="72" rx="12" fill="#dfe3ec"/>
      <circle cx="92" cy="92" r="14" fill="${Y}"/>
      <rect x="62" y="144" width="54" height="54" rx="10" fill="${S}"/><rect x="124" y="144" width="54" height="54" rx="10" fill="${S}"/>
      <rect x="62" y="210" width="90" height="10" rx="5" fill="${L}"/><rect x="62" y="228" width="60" height="10" rx="5" fill="${L}"/>
      <rect x="62" y="256" width="116" height="26" rx="13" fill="${GL}"/></g>`],

    laptops: ['0 0 400 260', `${shadow(200, 248, 190)}
      <rect x="62" y="16" width="276" height="186" rx="14" fill="${D}"/>
      <rect x="74" y="28" width="252" height="162" rx="6" fill="#f4f5f8"/>
      <rect x="86" y="42" width="228" height="16" rx="8" fill="#dfe3ec"/>
      <rect x="86" y="70" width="70" height="56" rx="8" fill="${S}"/><rect x="165" y="70" width="70" height="56" rx="8" fill="${S}"/><rect x="244" y="70" width="70" height="56" rx="8" fill="${S}"/>
      <rect x="86" y="136" width="120" height="10" rx="5" fill="${L}"/><rect x="86" y="154" width="80" height="10" rx="5" fill="${L}"/>
      <rect x="244" y="150" width="70" height="24" rx="12" fill="${GL}"/>
      <path d="M18 204L382 204L364 232Q360 240 348 240L52 240Q40 240 36 232Z" fill="#dfe3ec"/>
      <rect x="18" y="200" width="364" height="8" rx="4" fill="${L}"/>
      <rect x="168" y="204" width="64" height="7" rx="3.5" fill="#b8bdc9"/>`],

    appliances: ['0 0 260 320', `<defs><clipPath id="dbzDrum"><circle cx="130" cy="188" r="64"/></clipPath></defs>
      ${shadow(130, 310, 110)}
      <rect x="20" y="12" width="220" height="292" rx="22" fill="#fff"/>
      <path d="M20 70L20 34Q20 12 42 12L218 12Q240 12 240 34L240 70Z" fill="${S}"/>
      <rect x="40" y="30" width="72" height="22" rx="6" fill="${GL}"/>
      <rect x="48" y="38" width="30" height="6" rx="3" fill="#6ec1ff"/>
      <circle cx="198" cy="41" r="15" fill="#fff" stroke="${L}" stroke-width="4"/>
      <circle cx="152" cy="41" r="6" fill="${L}"/>
      <circle cx="130" cy="188" r="82" fill="${L}"/>
      <circle cx="130" cy="188" r="64" fill="${GL}"/>
      <path clip-path="url(#dbzDrum)" d="M58 198Q94 176 130 198T202 198L202 260L58 260Z" fill="#6ec1ff" opacity=".85"/>
      <path d="M92 152Q108 130 138 126" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".45"/>
      <rect x="36" y="300" width="28" height="10" rx="3" fill="${G}"/><rect x="196" y="300" width="28" height="10" rx="3" fill="${G}"/>`],

    furniture: ['0 0 420 240', `${shadow(210, 226, 190)}
      <rect x="58" y="196" width="12" height="24" rx="3" fill="${G}"/><rect x="350" y="196" width="12" height="24" rx="3" fill="${G}"/>
      <rect x="56" y="38" width="308" height="112" rx="26" fill="#fff"/>
      <path d="M210 50V140" stroke="${S}" stroke-width="4"/>
      <rect x="94" y="84" width="74" height="58" rx="16" fill="${Y}" transform="rotate(-8 131 113)"/>
      <rect x="40" y="164" width="340" height="38" rx="14" fill="${S}"/>
      <rect x="70" y="128" width="138" height="50" rx="14" fill="#f4f5f8"/>
      <rect x="212" y="128" width="138" height="50" rx="14" fill="#f4f5f8"/>
      <rect x="20" y="94" width="62" height="108" rx="24" fill="#fff"/>
      <rect x="338" y="94" width="62" height="108" rx="24" fill="#fff"/>`],

    fashion: ['0 0 340 320', `${shadow(170, 306, 120)}
      <path d="M170 62c0-13 22-13 22 0 0 9-11 11-18 16" stroke="${D}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M170 76L96 118l24 52 34-18v110q0 14 14 14h72q14 0 14-14V152l34 18 24-52-74-42z" fill="#fff"/>
      <path d="M170 76l-26 14 26 30 26-30z" fill="${GL}"/>
      <path d="M166 90l4 26 4-26z" fill="${S}"/>
      <path d="M138 206v58M202 206v58" stroke="${S}" stroke-width="4"/>
      <rect x="196" y="188" width="34" height="30" rx="4" fill="${S}" stroke="${L}" stroke-width="3"/>
      <rect x="148" y="62" width="20" height="11" rx="3" fill="${Y}" transform="rotate(-18 158 67)"/>
      <path d="M96 118l34 40M244 118l-34 40" stroke="${S}" stroke-width="4"/>`],

    property: ['0 0 380 300', `${shadow(190, 288, 150)}
      <rect x="268" y="58" width="26" height="50" fill="${G}"/>
      <path d="M72 140L190 44l118 96v124q0 14-14 14H86q-14 0-14-14z" fill="#fff"/>
      <path d="M40 150L190 32l150 118-22 24L190 70 62 174z" fill="${G}"/>
      <rect x="162" y="196" width="56" height="82" rx="6" fill="${GL}"/>
      <circle cx="206" cy="240" r="4" fill="${Y}"/>
      <rect x="96" y="170" width="46" height="46" rx="6" fill="${GL}"/>
      <path d="M119 170v46M96 193h46" stroke="${S}" stroke-width="4"/>
      <rect x="238" y="170" width="46" height="46" rx="6" fill="${GL}"/>
      <path d="M261 170v46M238 193h46" stroke="${S}" stroke-width="4"/>
      <rect x="148" y="278" width="84" height="10" rx="4" fill="${S}"/>`],

    antique: ['0 0 340 300', `${shadow(170, 288, 120)}
      <rect x="110" y="40" width="120" height="160" rx="12" fill="#fff"/>
      <rect x="120" y="52" width="100" height="136" rx="8" fill="${S}"/>
      <path d="M170 52V188" stroke="${L}" stroke-width="3"/>
      <circle cx="170" cy="120" r="40" fill="${GL}" opacity=".6"/>
      <circle cx="170" cy="120" r="28" fill="#fff" opacity=".3"/>
      <path d="M158 108Q170 90 182 108" stroke="${Y}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M158 132Q170 150 182 132" stroke="${Y}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="146" y="200" width="48" height="70" rx="6" fill="#fff"/>
      <rect x="152" y="208" width="36" height="54" rx="4" fill="${S}"/>
      <circle cx="170" cy="235" r="12" fill="${GL}" opacity=".5"/>
      <rect x="78" y="226" width="52" height="52" rx="26" fill="#fff"/>
      <circle cx="104" cy="252" r="18" fill="${Y}" opacity=".7"/>
      <rect x="210" y="216" width="62" height="62" rx="8" fill="#fff"/>
      <rect x="218" y="224" width="46" height="46" rx="4" fill="${S}"/>
      <path d="M232 238L252 258M252 238L232 258" stroke="${GL}" stroke-width="4" stroke-linecap="round"/>`],

    others: ['0 0 360 300', `${shadow(180, 288, 130)}
      <path d="M72 202h132v78H72z" fill="#fff"/>
      <path d="M204 202l48-26v78l-48 26z" fill="${S}"/>
      <path d="M72 202l48-26h132l-48 26z" fill="#f4f5f8"/>
      <path d="M138 202v78" stroke="${L}" stroke-width="8"/>
      <path d="M130 195l48-26" stroke="${L}" stroke-width="8"/>
      <path d="M92 130h94v56H92z" fill="#fff"/>
      <path d="M186 130l38-20v56l-38 20z" fill="${S}"/>
      <path d="M92 130l38-20h94l-38 20z" fill="#f4f5f8"/>
      <path d="M139 130v56" stroke="${L}" stroke-width="7"/>
      <path d="M240 96h44v48h-44z" fill="#fff"/>
      <path d="M284 96l18-12v48l-18 12z" fill="${S}"/>
      <path d="M240 96l18-12h44l-18 12z" fill="#f4f5f8"/>`],
  };

  // Categories now come from Admin -> Categories (app.js rebuilds the
  // tiles). "phones" is drawn with the mobiles art; a new category with no
  // art of its own gets the "others" box.
  const ALIAS = { phones: 'mobiles' };
  const svgFor = (slug) => {
    const a = ART[slug] || ART[ALIAS[slug]] || ART.others;
    if (!a) return '';
    const [, , w, h] = a[0].split(' ');
    return `<svg viewBox="${a[0]}" style="aspect-ratio:${w}/${h}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${a[1]}</svg>`;
  };

  const root = document.querySelector('[data-dbz-cats]');
  if (!root) return;
  const stage = root.querySelector('.dbz-cats__stage');
  let tiles = [...root.querySelectorAll('.dbz-tile')];
  const grid = root.querySelector('#homeCatGrid') || tiles[0]?.parentElement?.parentElement;
  // Each tile's hand-drawn line icon, kept by slug so rebuilt tiles reuse it.
  const ICONS = {};
  tiles.forEach(t => { ICONS[t.dataset.slug] = t.querySelector('.dbz-tile__icon')?.innerHTML || ''; });
  const iconFor = (slug) => ICONS[slug] || ICONS[ALIAS[slug]] || ICONS.others || '';
  const panel = root.querySelector('.dbz-panel');
  const nameEl = panel.querySelector('[data-panel-name]');
  const countRow = panel.querySelector('[data-panel-countrow]');
  const countEl = panel.querySelector('[data-panel-count]');
  const countWord = panel.querySelector('[data-panel-countword]');
  const cta = panel.querySelector('[data-panel-cta]');
  const ctaLabel = panel.querySelector('[data-panel-cta-label]');
  const art = panel.querySelector('[data-panel-art]');
  const closeBtn = panel.querySelector('.dbz-panel__close');

  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = (n) => n.toLocaleString('en-IN');

  let active = null, lastTile = null, openTimer, closeTimer, rafId, hoverLocked = false;

  function getCount(tile) {
    const raw = (tile.dataset.count || '').trim();
    return raw !== '' && !isNaN(raw) ? Number(raw) : null;
  }

  function countUp(to) {
    cancelAnimationFrame(rafId);
    if (reduce.matches) { countEl.textContent = fmt(to); return; }
    const start = performance.now() + 260, dur = 800;
    countEl.textContent = '0';
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - start) / dur));
      countEl.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  // Panel grows out of (and shrinks back into) the hovered tile. Values are
  // clamped because a tile can be half-scrolled out of the mobile strip.
  function setClip(tile) {
    const s = stage.getBoundingClientRect(), t = tile.getBoundingClientRect();
    const px = (v, max) => `${Math.max(0, Math.min(v, max))}px`;
    panel.style.setProperty('--ct', px(t.top - s.top, s.height));
    panel.style.setProperty('--cr', px(s.right - t.right, s.width));
    panel.style.setProperty('--cb', px(s.bottom - t.bottom, s.height));
    panel.style.setProperty('--cl', px(t.left - s.left, s.width));
  }

  function open(tile) {
    if (active === tile) return;
    active = lastTile = tile;
    const name = tile.dataset.name;
    /* panel always uses blue gradient */
    nameEl.textContent = name;
    ctaLabel.textContent = `Browse ${name}`;
    art.innerHTML = svgFor(tile.dataset.slug);

    const n = getCount(tile);
    countRow.hidden = n == null;
    if (n != null) {
      countEl.textContent = '0';
      if (countWord) countWord.textContent = n === 1 ? 'listing' : 'listings';
      countUp(n);
    }

    panel.style.transition = 'none';
    stage.classList.remove('is-open');
    setClip(tile);
    void panel.offsetWidth;            // restart animations from the tile's position
    panel.style.transition = '';
    stage.classList.add('is-open');
    panel.inert = false;
    panel.setAttribute('aria-hidden', 'false');
    tiles.forEach(t => t.setAttribute('aria-expanded', String(t === tile)));
  }

  function close() {
    clearTimeout(openTimer);
    if (!active) return;
    setClip(lastTile);
    active = null;
    stage.classList.remove('is-open');
    const hadFocus = panel.contains(document.activeElement);
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    tiles.forEach(t => t.setAttribute('aria-expanded', 'false'));
    if (hadFocus) lastTile.focus({ preventScroll: true });
  }

  function browse(tile) {
    window.browseCategory?.(tile.dataset.slug);
  }

  /* ---------- desktop: hover; keyboard: focus ---------- */
  function bindTile(tile) {
    tile.setAttribute('aria-expanded', 'false');
    tile.addEventListener('mouseenter', () => {
      if (!canHover.matches || hoverLocked) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      openTimer = setTimeout(() => open(tile), 140);
    });
    tile.addEventListener('mouseleave', () => clearTimeout(openTimer));
    tile.addEventListener('focus', () => {
      if (canHover.matches && !hoverLocked) open(tile);
    });

    /* touch: first tap opens the preview, the CTA inside goes to listings */
    tile.addEventListener('click', (e) => {
      if (canHover.matches) { browse(tile); return; }
      e.preventDefault();
      open(tile);
    });
  }
  tiles.forEach(bindTile);

  stage.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  stage.addEventListener('mouseleave', () => {
    if (!canHover.matches) return;     // touch browsers fire fake mouse events — ignore them
    clearTimeout(openTimer);
    hoverLocked = false;
    if (active) closeTimer = setTimeout(close, 120);
  });

  // Whole panel is clickable → category listings
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.dbz-panel__close, [data-panel-cta]')) return;
    if (active) browse(active);
  });
  cta.addEventListener('click', () => { if (active) browse(active); });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); hoverLocked = true; close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) { hoverLocked = true; close(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (active && !stage.contains(e.target)) close();
  });

  // app.js fills data-count after fetching totals; keep an open panel in sync.
  window.dbzCats = {
    close,
    /* list: [{slug, name, count}] in display order (Admin -> Categories).
       Same categories as now: only names and counts are updated. Otherwise
       the tiles are redrawn (built with DOM calls, so names can't inject
       markup). */
    rebuild(list) {
      if (!grid || !Array.isArray(list) || !list.length) return;
      const same = list.length === tiles.length && list.every((c, i) => tiles[i].dataset.slug === c.slug);
      if (same) {
        list.forEach((c, i) => {
          const t = tiles[i];
          t.dataset.name = c.name;
          t.dataset.count = c.count == null ? '' : String(c.count);
          t.setAttribute('aria-label', `Browse ${c.name}`);
          const n = t.querySelector('.dbz-tile__name'); if (n) n.textContent = c.name;
        });
        this.refresh();
        return;
      }
      close();
      grid.textContent = '';
      tiles = list.map((c, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.className = `dbz-tile ${i % 2 ? 'dbz-tile--white' : 'dbz-tile--blue'}`;
        b.type = 'button';
        b.dataset.slug = c.slug;
        b.dataset.name = c.name;
        b.dataset.count = c.count == null ? '' : String(c.count);
        b.setAttribute('aria-label', `Browse ${c.name}`);
        b.setAttribute('aria-haspopup', 'dialog');
        b.setAttribute('aria-expanded', 'false');
        b.style.setProperty('--i', String(i));
        const icon = document.createElement('span');
        icon.className = 'dbz-tile__icon';
        icon.innerHTML = iconFor(c.slug);     // our own SVG markup, captured above
        const name = document.createElement('span');
        name.className = 'dbz-tile__name';
        name.textContent = c.name;
        b.append(icon, name);
        li.append(b);
        grid.append(li);
        return b;
      });
      tiles.forEach(bindTile);
    },
    refresh() {
      if (!active) return;
      const n = getCount(active);
      countRow.hidden = n == null;
      if (n != null) {
        countEl.textContent = fmt(n);
        if (countWord) countWord.textContent = n === 1 ? 'listing' : 'listings';
      }
    },
  };
})();
