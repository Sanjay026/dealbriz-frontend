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

  const TILE_ART = {
    cars: { blue: true, img: 'car-flat.svg' },
    mobiles: { blue: false, vb: '0 0 140 200', svg:
      `<rect x="30" y="16" width="72" height="140" rx="14" fill="#2C3E50"/>
      <rect x="34" y="22" width="64" height="128" rx="10" fill="#ECF0F1"/>
      <rect x="52" y="22" width="28" height="9" rx="4.5" fill="#2C3E50"/>
      <circle cx="66" cy="26.5" r="2.5" fill="#3D566E"/>
      <rect x="40" y="36" width="14" height="3" rx="1.5" fill="#BDC3C7"/>
      <rect x="80" y="36" width="12" height="3" rx="1.5" fill="#BDC3C7"/>
      <rect x="40" y="44" width="52" height="32" rx="6" fill="#E74C3C"/>
      <rect x="46" y="50" width="28" height="4" rx="2" fill="#fff" opacity=".3"/>
      <rect x="46" y="58" width="16" height="4" rx="2" fill="#fff" opacity=".2"/>
      <circle cx="82" cy="56" r="6" fill="#fff" opacity=".15"/>
      <rect x="40" y="82" width="52" height="9" rx="4.5" fill="#D5D8DC"/>
      <circle cx="86" cy="86.5" r="3" fill="#95A5A6"/>
      <rect x="40" y="98" width="23" height="23" rx="6" fill="#F1C40F"/>
      <rect x="69" y="98" width="23" height="23" rx="6" fill="#2ECC71"/>
      <rect x="40" y="127" width="23" height="10" rx="3" fill="#3498DB"/>
      <rect x="69" y="127" width="23" height="10" rx="3" fill="#BDC3C7"/>
      <rect x="52" y="144" width="28" height="3" rx="1.5" fill="#BDC3C7"/>` },
    bikes: { blue: true, img: 'bike-sport.svg' },
    electronics: { blue: false, vb: '0 0 160 150', svg:
      `<rect x="14" y="14" width="132" height="86" rx="6" fill="#2C3E50"/>
      <rect x="18" y="18" width="124" height="78" rx="3" fill="#ECF0F1"/>
      <circle cx="28" cy="26" r="3" fill="#E74C3C"/><circle cx="37" cy="26" r="3" fill="#F1C40F"/><circle cx="46" cy="26" r="3" fill="#2ECC71"/>
      <rect x="22" y="34" width="56" height="38" rx="4" fill="#E74C3C" opacity=".9"/>
      <rect x="22" y="34" width="56" height="38" rx="4" fill="url(#eg)"/>
      <polygon points="42,44 42,62 58,53" fill="#FFF" opacity=".85"/>
      <rect x="84" y="34" width="54" height="17" rx="3" fill="#3498DB"/>
      <path d="M98,42 L104,36 L110,40 L118,34 L126,42 L126,51 L84,51Z" fill="#2980B9"/>
      <circle cx="94" cy="40" r="4" fill="#F1C40F" opacity=".7"/>
      <rect x="84" y="56" width="25" height="16" rx="3" fill="#F1C40F"/>
      <rect x="113" y="56" width="25" height="16" rx="3" fill="#2ECC71"/>
      <rect x="22" y="78" width="80" height="4" rx="2" fill="#D5D8DC"/>
      <rect x="22" y="86" width="50" height="4" rx="2" fill="#D5D8DC"/>
      <rect x="58" y="100" width="44" height="10" rx="2" fill="#7F8C8D"/>
      <path d="M46,110 L114,110 L108,118 Q106,122 100,122 L60,122 Q54,122 52,118Z" fill="#95A5A6"/>
      <rect x="68" y="110" width="24" height="4" rx="2" fill="#7F8C8D"/>` },
    furniture: { blue: true, vb: '0 0 160 150', svg:
      `<path d="M130,4 Q142,4 142,18 L142,50" stroke="#7F8C8D" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M116,6 L144,6 L138,36 L122,36Z" fill="#F1C40F"/>
      <path d="M118,8 L142,8 L138,32 L122,32Z" fill="#F7DC6F" opacity=".5"/>
      <line x1="130" y1="36" x2="130" y2="42" stroke="#7F8C8D" stroke-width="1.5"/>
      <circle cx="130" cy="44" r="2.5" fill="#D4AC0D"/>
      <rect x="36" y="52" width="104" height="54" rx="18" fill="#E67E22"/>
      <path d="M50,62 Q88,56 126,62" stroke="#D35400" stroke-width="2" fill="none" opacity=".5"/>
      <rect x="80" y="42" width="52" height="28" rx="8" fill="#E74C3C" transform="rotate(-4 106 56)"/>
      <path d="M84,66 L88,76M92,67 L96,77M100,66 L104,76M108,65 L112,75" stroke="#C0392B" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="72" cy="78" rx="26" ry="14" fill="#1ABC9C"/>
      <ellipse cx="72" cy="76" rx="22" ry="10" fill="#16A085" opacity=".4"/>
      <rect x="20" y="66" width="28" height="46" rx="14" fill="#D35400"/>
      <rect x="128" y="66" width="28" height="46" rx="14" fill="#D35400"/>
      <rect x="22" y="72" width="24" height="36" rx="12" fill="#E67E22" opacity=".6"/>
      <rect x="130" y="72" width="24" height="36" rx="12" fill="#E67E22" opacity=".6"/>
      <rect x="38" y="104" width="100" height="16" rx="8" fill="#D35400"/>
      <rect x="54" y="118" width="8" height="16" rx="2" fill="#7F6C55"/>
      <rect x="114" y="118" width="8" height="16" rx="2" fill="#7F6C55"/>` },
    appliances: { blue: false, vb: '0 0 140 160', svg:
      `<rect x="20" y="6" width="100" height="136" rx="12" fill="#ECF0F1" stroke="#D5D8DC" stroke-width="1.5"/>
      <rect x="20" y="6" width="100" height="32" rx="12" fill="#BDC3C7"/>
      <rect x="20" y="26" width="100" height="12" fill="#BDC3C7"/>
      <rect x="32" y="14" width="40" height="16" rx="4" fill="#2C3E50"/>
      <rect x="36" y="18" width="20" height="4" rx="2" fill="#5DADE2"/>
      <rect x="36" y="24" width="12" height="3" rx="1.5" fill="#3498DB"/>
      <circle cx="96" cy="22" r="10" fill="#F4F6F7" stroke="#D5D8DC" stroke-width="2"/>
      <line x1="96" y1="14" x2="96" y2="22" stroke="#7F8C8D" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="80" cy="22" r="4" fill="#D5D8DC"/>
      <circle cx="70" cy="86" r="40" fill="#34495E"/>
      <circle cx="70" cy="86" r="36" fill="#2C3E50"/>
      <circle cx="70" cy="86" r="30" fill="#5DADE2"/>
      <path d="M46,92 Q58,78 70,92 T94,92 L94,116 Q82,108 70,116 Q58,108 46,116Z" fill="#85C1E9" opacity=".6"/>
      <path d="M50,68 Q62,54 76,60" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".25"/>
      <circle cx="70" cy="86" r="6" fill="#ABB2B9"/>
      <circle cx="70" cy="86" r="2" fill="#566573"/>
      <rect x="32" y="140" width="16" height="6" rx="2" fill="#95A5A6"/>
      <rect x="92" y="140" width="16" height="6" rx="2" fill="#95A5A6"/>` },
    fashion: { blue: true, vb: '0 0 160 160', svg:
      `<path d="M52,28 Q80,8 108,28 L128,76 L112,84 L104,60 L104,130 L56,130 L56,60 L48,84 L32,76Z" fill="#27AE60"/>
      <path d="M58,34 Q80,18 102,34" fill="#1E8449" opacity=".3"/>
      <path d="M52,28 L80,42 L108,28 Q80,14 52,28Z" fill="#2C3E50"/>
      <path d="M72,26 L80,42 L88,26Z" fill="#95A5A6"/>
      <line x1="80" y1="42" x2="80" y2="130" stroke="#1E8449" stroke-width="2.5"/>
      <circle cx="66" cy="78" r="6" fill="#F1C40F" opacity=".7"/>
      <path d="M60,96 L100,96" stroke="#1E8449" stroke-width="1.5" opacity=".4"/>
      <rect x="100" y="82" width="48" height="62" rx="6" fill="#E74C3C"/>
      <rect x="100" y="82" width="48" height="10" rx="6" fill="#C0392B"/>
      <path d="M116,82 Q116,68 124,68 Q132,68 132,82" stroke="#fff" stroke-width="2.5" fill="none"/>
      <ellipse cx="68" cy="148" rx="28" ry="10" fill="#F39C12"/>
      <path d="M44,144 Q54,134 68,132 Q82,134 92,144" fill="#2C3E50"/>
      <line x1="44" y1="142" x2="92" y2="142" stroke="#F1C40F" stroke-width="1.5"/>
      <ellipse cx="124" cy="152" rx="24" ry="8" fill="#2C3E50"/>
      <path d="M104,148 Q112,140 124,138 Q136,140 144,148" fill="#E74C3C"/>
      <line x1="104" y1="148" x2="144" y2="148" stroke="#fff" stroke-width="1.5"/>` },
    property: { blue: false, vb: '0 0 150 160', svg:
      `<rect x="96" y="18" width="14" height="28" fill="#566573"/>
      <rect x="98" y="14" width="10" height="6" fill="#7F8C8D"/>
      <rect x="30" y="52" width="80" height="96" fill="#F6D365"/>
      <rect x="30" y="52" width="80" height="8" fill="#E8C84A" opacity=".5"/>
      <polygon points="8,52 70,8 132,52" fill="#2C3E50"/>
      <polygon points="8,52 70,8 70,36 22,60" fill="#34495E" opacity=".3"/>
      <rect x="48" y="68" width="18" height="16" rx="2" fill="#5DADE2"/>
      <line x1="57" y1="68" x2="57" y2="84" stroke="#F6D365" stroke-width="2"/>
      <line x1="48" y1="76" x2="66" y2="76" stroke="#F6D365" stroke-width="2"/>
      <rect x="78" y="68" width="18" height="16" rx="2" fill="#5DADE2"/>
      <line x1="87" y1="68" x2="87" y2="84" stroke="#F6D365" stroke-width="2"/>
      <line x1="78" y1="76" x2="96" y2="76" stroke="#F6D365" stroke-width="2"/>
      <rect x="58" y="108" width="24" height="40" rx="3" fill="#E74C3C"/>
      <rect x="58" y="108" width="24" height="6" rx="3" fill="#C0392B"/>
      <circle cx="78" cy="130" r="2.5" fill="#F1C40F"/>
      <path d="M30,148 L110,148" stroke="#D4AC0D" stroke-width="1"/>
      <circle cx="22" cy="112" r="22" fill="#27AE60"/>
      <circle cx="16" cy="106" r="16" fill="#2ECC71" opacity=".5"/>
      <rect x="18" y="130" width="8" height="18" fill="#795548"/>
      <rect x="14" y="130" width="16" height="3" rx="1" fill="#6D4C41"/>` },
    others: { blue: true, vb: '0 0 160 160', svg:
      `<line x1="120" y1="90" x2="118" y2="150" stroke="#fff" stroke-width="1.5" opacity=".3"/>
      <ellipse cx="120" cy="56" rx="30" ry="36" fill="#E74C3C"/>
      <ellipse cx="112" cy="46" rx="8" ry="14" fill="#fff" opacity=".12"/>
      <path d="M114,92 L120,98 L126,92Z" fill="#C0392B"/>
      <line x1="50" y1="60" x2="48" y2="150" stroke="#fff" stroke-width="1.5" opacity=".3"/>
      <ellipse cx="50" cy="36" rx="22" ry="28" fill="#3498DB"/>
      <ellipse cx="44" cy="28" rx="6" ry="10" fill="#fff" opacity=".12"/>
      <path d="M44,64 L50,70 L56,64Z" fill="#2980B9"/>
      <rect x="56" y="100" width="56" height="42" rx="5" fill="#9B59B6"/>
      <rect x="52" y="92" width="64" height="14" rx="5" fill="#8E44AD"/>
      <rect x="80" y="92" width="8" height="50" fill="#F1C40F"/>
      <line x1="52" y1="99" x2="116" y2="99" stroke="#F1C40F" stroke-width="3"/>
      <ellipse cx="74" cy="88" rx="10" ry="7" fill="#F1C40F"/>
      <ellipse cx="94" cy="88" rx="10" ry="7" fill="#F1C40F"/>
      <circle cx="84" cy="90" r="4" fill="#D4AC0D"/>
      <polygon points="20,120 28,108 36,120 34,132 22,132" fill="#F1C40F"/>
      <polygon points="28,108 22,98 34,98" fill="#F1C40F" opacity=".7"/>` },
  };

  const applyTileIcon = (iconEl, slug) => {
    const key = TILE_ART[slug] ? slug : (ALIAS[slug] && TILE_ART[ALIAS[slug]] ? ALIAS[slug] : null);
    if (key) {
      const a = TILE_ART[key];
      if (a.img) {
        iconEl.innerHTML = `<img src="${a.img}" alt="${key}">`;
      } else {
        iconEl.innerHTML = `<svg viewBox="${a.vb}" xmlns="http://www.w3.org/2000/svg">${a.svg}</svg>`;
      }
      iconEl.style.background = a.blue ? 'var(--blue)' : '';
    } else {
      iconEl.style.background = '';
      const a = ART[slug] || ART[ALIAS[slug]] || ART.others;
      if (a) iconEl.innerHTML = `<svg viewBox="${a[0]}" xmlns="http://www.w3.org/2000/svg">${a[1]}</svg>`;
    }
  };
  tiles.forEach(t => {
    const iconEl = t.querySelector('.dbz-tile__icon');
    if (iconEl) applyTileIcon(iconEl, t.dataset.slug);
  });
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

  /* ---------- click to preview, click again to browse ---------- */
  function bindTile(tile) {
    tile.setAttribute('aria-expanded', 'false');
    tile.addEventListener('click', (e) => {
      e.preventDefault();
      if (active === tile) { browse(tile); return; }
      open(tile);
    });
  }
  tiles.forEach(bindTile);

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
        applyTileIcon(icon, c.slug);
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
