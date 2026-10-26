/* =========================================================
   DealBriz — Lottie Motion Graphics Orchestration
   Manages all Lottie animations across the homepage:
   Hero particles + sparkle, Category hover icons,
   How-It-Works step bursts + confetti, Stats counter pulse.
   ========================================================= */
(() => {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
  if (REDUCE.matches) return; // bail early — CSS hides all containers too

  const instances = new Map(); // key → lottie instance, for pause/resume

  /* Wait for lottie-web to load (deferred script) */
  function waitForLottie() {
    return new Promise((resolve) => {
      if (window.lottie) return resolve(window.lottie);
      const check = setInterval(() => {
        if (window.lottie) { clearInterval(check); resolve(window.lottie); }
      }, 100);
      // give up after 10s
      setTimeout(() => clearInterval(check), 10000);
    });
  }

  /* Lazy-load a Lottie animation when its container enters the viewport */
  function lazyLoad(container, path, opts = {}) {
    return new Promise((resolve) => {
      const ob = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        ob.disconnect();
        waitForLottie().then((lot) => {
          const anim = lot.loadAnimation({
            container,
            renderer: 'svg',
            loop: opts.loop !== false,
            autoplay: opts.autoplay !== false,
            path,
          });
          if (opts.key) instances.set(opts.key, anim);
          resolve(anim);
        });
      }, { rootMargin: opts.rootMargin || '200px' });
      ob.observe(container);
    });
  }

  /* ======== 1. HERO ======== */
  function initHero() {
    const hero = document.querySelector('#homePage .hb-hero');
    if (!hero) return;

    // Background floating particles
    const bgEl = document.createElement('div');
    bgEl.className = 'lottie-hero-bg';
    bgEl.setAttribute('aria-hidden', 'true');
    hero.prepend(bgEl);

    // Sparkle on accent text
    const h1 = hero.querySelector('h1');
    if (h1) {
      const sparkEl = document.createElement('div');
      sparkEl.className = 'lottie-hero-sparkle';
      sparkEl.setAttribute('aria-hidden', 'true');
      h1.appendChild(sparkEl);

      // sparkle loads eagerly (above fold)
      waitForLottie().then((lot) => {
        const sp = lot.loadAnimation({
          container: sparkEl, renderer: 'svg', loop: true, autoplay: false,
          path: '/lottie/hero-sparkle.json',
        });
        instances.set('hero-sparkle', sp);
        // play with delay
        setTimeout(() => sp.play(), 800);
      });
    }

    // particles load eagerly
    waitForLottie().then((lot) => {
      const p = lot.loadAnimation({
        container: bgEl, renderer: 'svg', loop: true, autoplay: true,
        path: '/lottie/hero-particles.json',
      });
      instances.set('hero-particles', p);
    });
  }

  /* ======== 2. CATEGORY TILES ======== */
  function initCategories() {
    const section = document.getElementById('browseCategories');
    if (!section) return;

    const SLUG_MAP = {
      cars: '/lottie/cat-car.json',
      bikes: '/lottie/cat-bike.json',
      mobiles: '/lottie/cat-phone.json',
      phones: '/lottie/cat-phone.json',
      laptops: '/lottie/cat-laptop.json',
    };
    const GENERIC = '/lottie/cat-generic.json';
    const canHover = matchMedia('(hover: hover) and (pointer: fine)');
    const loaded = new Map(); // slug → anim instance

    const ob = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      ob.disconnect();

      waitForLottie().then((lot) => {
        const tiles = section.querySelectorAll('.dbz-tile');
        tiles.forEach((tile) => {
          const slug = tile.dataset.slug;
          const path = SLUG_MAP[slug] || GENERIC;

          // create container inside tile icon area
          const el = document.createElement('div');
          el.className = 'lottie-tile-anim';
          el.setAttribute('aria-hidden', 'true');
          tile.querySelector('.dbz-tile__icon').appendChild(el);

          const anim = lot.loadAnimation({
            container: el, renderer: 'svg', loop: true, autoplay: false, path,
          });
          loaded.set(tile, anim);
          instances.set('cat-' + slug, anim);

          // hover → play; leave → stop
          if (canHover.matches) {
            tile.addEventListener('mouseenter', () => { anim.goToAndPlay(0); });
            tile.addEventListener('mouseleave', () => { anim.goToAndStop(0); });
          }
          // focus for keyboard
          tile.addEventListener('focus', () => { anim.goToAndPlay(0); });
          tile.addEventListener('blur', () => { anim.goToAndStop(0); });
        });
      });
    }, { rootMargin: '200px' });
    ob.observe(section);
  }

  /* ======== 3. HOW IT WORKS ======== */
  function initHowItWorks() {
    const section = document.getElementById('howItWorks');
    if (!section) return;

    const ob = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      ob.disconnect();

      waitForLottie().then((lot) => {
        // Track which steps already got burst
        let bursted = new WeakSet();

        // Observe step nodes for is-on class
        const checkSteps = () => {
          const steps = section.querySelectorAll('.dbz-step');
          steps.forEach((step) => {
            if (step.classList.contains('is-on') && !bursted.has(step)) {
              bursted.add(step);
              const node = step.querySelector('.dbz-step__node');
              if (!node) return;
              node.classList.add('dbz-step__node--glow');

              const el = document.createElement('div');
              el.className = 'lottie-step-burst';
              el.setAttribute('aria-hidden', 'true');
              // Node already has position from CSS, just append inside
              node.appendChild(el);

              const a = lot.loadAnimation({
                container: el, renderer: 'svg', loop: false, autoplay: true,
                path: '/lottie/step-complete.json',
              });
              a.addEventListener('complete', () => {
                el.remove();
              });
            }
          });
        };

        // Observe finish element
        const finishEl = section.querySelector('.dbz-how__finish');
        let finishFired = false;

        const track = section.querySelector('.dbz-how__track');

        const checkFinish = () => {
          if (finishEl && finishEl.classList.contains('is-on') && !finishFired && track) {
            finishFired = true;
            const el = document.createElement('div');
            el.className = 'lottie-finish-celebration';
            el.setAttribute('aria-hidden', 'true');
            // Position at finish element's location within the track
            const tRect = track.getBoundingClientRect();
            const fRect = finishEl.getBoundingClientRect();
            el.style.position = 'absolute';
            el.style.left = (fRect.left + fRect.width / 2 - tRect.left) + 'px';
            el.style.top = (fRect.top - tRect.top - 90) + 'px';
            track.appendChild(el);

            const a = lot.loadAnimation({
              container: el, renderer: 'svg', loop: false, autoplay: true,
              path: '/lottie/finish-celebration.json',
            });
            a.addEventListener('complete', () => { el.remove(); });
          }
        };

        // Use MutationObserver to watch for class changes
        const mo = new MutationObserver(() => {
          checkSteps();
          checkFinish();
        });

        // Observe the track that contains steps + finish
        if (track) {
          mo.observe(track, { subtree: true, attributes: true, attributeFilter: ['class'] });
        }

        // Reset bursted set when flow switches
        const origMo = new MutationObserver(() => {
          const root = section.querySelector('[data-dbz-how]');
          if (root && root.classList.contains('is-switching')) {
            bursted = new WeakSet();
            finishFired = false;
            // remove glow from all nodes
            section.querySelectorAll('.dbz-step__node--glow').forEach((n) => {
              n.classList.remove('dbz-step__node--glow');
            });
          }
        });
        const howRoot = section.querySelector('[data-dbz-how]');
        if (howRoot) {
          origMo.observe(howRoot, { attributes: true, attributeFilter: ['class'] });
        }

        // Initial check
        checkSteps();
        checkFinish();
      });
    }, { rootMargin: '200px' });
    ob.observe(section);
  }

  /* ======== 4. STATS COUNTER ======== */
  function initStats() {
    const statEl = document.getElementById('statListings');
    if (!statEl) return;
    const statParent = statEl.closest('.hb-stat');
    if (!statParent) return;

    // Add pulse Lottie
    waitForLottie().then((lot) => {
      const pulseEl = document.createElement('div');
      pulseEl.className = 'lottie-stat-pulse';
      pulseEl.setAttribute('aria-hidden', 'true');
      statParent.appendChild(pulseEl);

      const pulse = lot.loadAnimation({
        container: pulseEl, renderer: 'svg', loop: true, autoplay: true,
        path: '/lottie/counter-pulse.json',
      });
      instances.set('stat-pulse', pulse);
    });

    // Enhanced count-up animation
    const origFn = window.updateStatCount;
    if (typeof origFn === 'function') {
      window.updateStatCount = function () {
        const before = parseInt(statEl.textContent.replace(/,/g, '')) || 0;
        origFn.apply(this, arguments);
        const afterText = statEl.textContent;
        const after = parseInt(afterText.replace(/,/g, '')) || 0;
        if (after > 0 && before === 0) {
          animateCount(statEl, 0, after, 1200);
        }
      };
    }
  }

  function animateCount(el, from, to, dur) {
    const start = performance.now();
    const fmt = (n) => n.toLocaleString('en-IN');
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3); // cubic ease-out
      el.textContent = fmt(Math.round(from + (to - from) * ease));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ======== SPA: pause/resume on page switch ======== */
  function setupSpaAware() {
    const home = document.getElementById('homePage');
    if (!home) return;

    const mo = new MutationObserver(() => {
      const hidden = home.hidden || home.style.display === 'none';
      instances.forEach((anim) => {
        try { hidden ? anim.pause() : anim.play(); } catch (e) {}
      });
    });
    mo.observe(home, { attributes: true, attributeFilter: ['hidden', 'style'] });
  }

  /* ======== INIT ======== */
  function init() {
    initHero();
    initCategories();
    initHowItWorks();
    initStats();
    setupSpaAware();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
