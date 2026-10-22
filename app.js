/* ===== STATE ===== */
let currentUser = null;
let currentPage = 'home';
let currentProduct = null;
let currentEmiProduct = null;
let currentChatConversation = null;
let buyListings = [];          // current page of Buy results (server-paginated)
let savedItems = new Set();    // saved product IDs — used for heart-icon state everywhere
let savedProductsCache = [];   // full saved product objects, for rendering the Saved page
let myListingsCache = [];      // full listing objects for the current user, any status
let selectedCategory = 'all';
let sellPhotos = [];
let selectedSellCat = '';
let editingListingId = null;   // set when the Sell form is being used to edit an existing listing
let editReturnListingId = null; // the listing an edit was opened from, to return to on back
let editingViaAdmin = false;   // true if the edit was launched from the admin panel (any listing)
let pendingAction = null;      // store what to do after login

// Buy page pagination state
let buyPageNum = 1;
let buyTotalPages = 0;
let buyTotalCount = 0;      // count of the CURRENT filtered result set
const BUY_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100, 250, 500];
let buyPerPage = 30; // clamped to the same 10–500 range as the admin tables' pager
let homeListingsCount = 0;  // site-wide active total, for the homepage stat only
let buyFetchToken = 0; // guards against out-of-order responses when filters change quickly

// Single source of truth for EMI status labels/pills, mirroring the backend's
// EMI_STATUSES. 'review' is the wire value for "Docs Needed" (kept as-is for
// backward compatibility with rows already in the database).
const EMI_STATUS_LABELS = {
  pending:'Under Review', review:'Docs Needed', approved:'Approved',
  rejected:'Rejected', disbursed:'Disbursed', completed:'Completed', cancelled:'Cancelled'
};
const EMI_STATUS_CLASS = {
  pending:'status-pending', review:'status-review', approved:'status-approved',
  rejected:'status-rejected', disbursed:'status-approved',
  completed:'status-approved', cancelled:'status-pending'
};
// Applications that must be finished before they can be archived (matches
// the backend's EMI_TERMINAL_STATUSES).
const EMI_TERMINAL = ['completed','cancelled','rejected'];
// Only these represent live money out the door, for the Total Loan Value stat.
const EMI_ACTIVE = ['approved','disbursed'];

/* ===== INIT ===== */


/* ===== URL PATHS =====
   Pages are /buy and /about rather than /#buy and /#about. This works
   because nginx already falls back to index.html for unknown paths
   (try_files $uri $uri/ /index.html), so a refresh or a shared link on
   /buy still serves the app rather than a 404.

   Old #hash links stay working: pageFromLocation() reads the hash too, so
   anything already bookmarked or pasted somewhere resolves and is then
   rewritten to the clean path. */
function pagePath(page) {
  return page === 'home' ? '/' : '/' + page;
}

/* The page named by the current URL, from either form. */
function pageFromLocation() {
  const hash = (location.hash || '').replace('#', '').trim();
  if (hash) return hash;
  return (location.pathname || '/').replace(/^\/+|\/+$/g, '').trim() || 'home';
}

/* Pages that a URL is allowed to open directly on load.
   Deliberately excludes 'admin' (staff-only; showPage does its own check but
   we should not even attempt it from a URL) and 'blogPost', which needs a
   post id the bare hash doesn't carry. */
const REFRESHABLE_PAGES = [
  'home', 'buy', 'sell', 'help', 'contact', 'blog', 'partners',
  'profile', 'mylistings', 'myads', 'mychats', 'mydeals', 'reportProblem', 'legal',
];

/* Pages that only make sense signed in. Hitting refresh on one while logged
   out lands on home rather than an empty broken page. */
const AUTH_ONLY_PAGES = ['profile', 'mylistings', 'myads', 'mychats', 'mydeals'];


/* Shows the shell of the page named in the hash, synchronously, at the very
   start of load. Only touches visibility — everything that needs data or the
   signed-in user still happens in restoreFromHash() once those are ready. */
function showInitialPageShell(hash) {
  const key = (hash || '').trim();
  const target = DOC_PAGE_TITLES[key] ? 'legal'
               : (REFRESHABLE_PAGES.includes(key) || key === 'admin' ? key : 'home');
  if (target === 'home') return;                       // already visible
  const el = document.getElementById(target + 'Page');
  if (!el) return;
  document.getElementById('homePage')?.classList.add('hidden');
  el.classList.remove('hidden');
  // on-home drives the light navbar; leaving it set would style the wrong page
  document.body.classList.remove('on-home');
}

/* Restores the page named in the URL hash on a fresh load, so refreshing
   keeps you where you were instead of bouncing to home. */
function restoreFromHash(hash) {
  const key = (hash || '').trim();

  if (key && DOC_PAGE_TITLES[key]) { openLegalPage(key); return; }

  // Admin panel: a reload stays in the panel, on the same section
  // (/admin?section=deals). Staff whose session ended get the panel's own
  // sign-in box. A signed-in user without panel access goes home.
  if (key === 'admin') {
    if (!currentUser || currentUser.hasPanel) {
      const section = adminSectionFromUrl();
      if (section && ADMIN_SECTION_TITLES[section]) currentAdminSection = section;
      history.replaceState({ view: 'page', page: 'admin' }, '', location.pathname + location.search);
      openAdminPanel(true);
      return;
    }
    history.replaceState({ view: 'page', page: 'home' }, '', pagePath('home'));
    showPage('home', true);
    return;
  }

  if (key && REFRESHABLE_PAGES.includes(key)) {
    if (AUTH_ONLY_PAGES.includes(key) && !currentUser) {
      history.replaceState({ view: 'page', page: 'home' }, '', pagePath('home'));
      showPage('home', true);
      return;
    }
    // fromPopstate=true: the entry for this page is the one the browser
    // already has, so showPage must not push a second one.
    history.replaceState({ view: 'page', page: key }, '', pagePath(key));
    showPage(key, true);
    return;
  }

  history.replaceState({ view: 'page', page: 'home' }, '', pagePath('home'));
  showPage('home', true);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Anything after the # that names a legal document is opened directly, so
  // a bookmarked or shared /#privacy lands on Privacy rather than the home
  // page. Captured before the replaceState below overwrites it.
  const deepLink = pageFromLocation();
  // Do NOT force the URL back to #home here. Doing that threw away the hash
  // on every load, so refreshing on /#buy or /#profile dumped you on the
  // home page.

  // Swap to the target page BEFORE the awaits below. #homePage is the only
  // page without .hidden in the markup, so it paints as soon as the HTML
  // parses; restoring the real page after four awaits meant refreshing on
  // /#buy showed home for a beat first. This is a synchronous class swap
  // only — no data loading, no history writes — so there is nothing to wait
  // for and nothing to undo if the checks below send us elsewhere.
  showInitialPageShell(deepLink);

  // Ahead of the first render, so a disabled EMI feature never flashes
  // on screen before being hidden.
  await loadSiteSettings();
  await refreshEmiCoverage();
  await refreshCurrentUser();
  await loadHomeStats();
  setupGlobalListeners();
  setupEnterKeyFlow();

  // Cropper drag. Bound once here rather than inline, because a drag that
  // starts on the canvas must keep tracking when the pointer leaves it —
  // otherwise the image sticks the moment you move past the edge.
  const stage = document.getElementById('avatarCropStage');
  if (stage) {
    stage.addEventListener('mousedown', startCropDrag);
    stage.addEventListener('touchstart', startCropDrag, { passive: false });
    window.addEventListener('mousemove', moveCropDrag);
    window.addEventListener('touchmove', moveCropDrag, { passive: false });
    window.addEventListener('mouseup', endCropDrag);
    window.addEventListener('touchend', endCropDrag);
  }

  // Close any open year combo when clicking outside it.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.combo-group')) return;
    document.querySelectorAll('.combo-menu').forEach(m => m.classList.add('hidden'));
  });

  // Escape closes the combo without closing the whole sell form.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.combo-menu:not(.hidden)');
    if (open) { open.classList.add('hidden'); e.stopPropagation(); }
  }, true);

  // Close the avatar menu when clicking anywhere else.
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('avatarMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (!e.target.closest('.profile-avatar-wrap')) menu.classList.add('hidden');
  });

  // Stop the browser replaying old input values on Back/Forward and reload.
  // autocomplete="off" does not cover this — scrollRestoration's sibling
  // behaviour for forms is controlled by the form's own autocomplete, so we
  // clear on pageshow instead, which fires for both fresh loads and
  // back-forward-cache restores.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      resetAuthForms();
      const sb = document.getElementById('buySearchInput');
      if (sb && currentPage !== 'buy') sb.value = '';
    }
  });

  restoreFromHash(deepLink);
  // Note: JWT auth checks the stored token directly on load (see refreshCurrentUser),
  // no live auth-state listener needed like Supabase's onAuthStateChange.
});

/* Looks a listing up wherever we already have it cached (open modal, the
   currently loaded Buy page, My Listings, Saved items) before falling back
   to a fresh server fetch by ID. Used anywhere a listing might be needed
   outside of the page that originally loaded it (chat, EMI, etc). */

/* Drops a listing from every in-memory cache so the next read refetches it.

   getListingById() answers from currentProduct / buyListings /
   myListingsCache / savedProductsCache before hitting the network. Those
   copies are made when a page or modal loads, so after saving an edit they
   still hold the PRE-EDIT object — the database had the new attributes while
   the edit form, reading the cache, showed the old blanks. It looked exactly
   like the save had failed. */
function invalidateListingCache(id) {
  if (!id) return;
  if (currentProduct && currentProduct.id === id) currentProduct = null;
  [buyListings, myListingsCache, savedProductsCache].forEach(cache => {
    if (!Array.isArray(cache)) return;
    const i = cache.findIndex(x => x && x.id === id);
    if (i !== -1) cache.splice(i, 1);
  });
}

async function getListingById(id) {
  // Editing always refetches. A cached copy is a snapshot from whenever its
  // page loaded, so after a save it is stale by definition — that is how a
  // save that worked showed up as an edit form full of blanks. One request
  // is a small price for never showing someone their old data as if it were
  // current.
  const fresh = await (async () => {
    try { return normalizeListing(await db.getProductById(id)); }
    catch { return null; }
  })();
  if (fresh) return fresh;

  // Network failed — fall back to whatever is cached rather than breaking.
  if (currentProduct && currentProduct.id === id) return currentProduct;
  for (const cache of [buyListings, myListingsCache, savedProductsCache]) {
    const hit = cache.find(x => x.id === id);
    if (hit) return hit;
  }
  return null;
}

async function loadHomeStats() {
  try {
    const { total } = await db.getProducts({ page: 1, perPage: 1 });
    homeListingsCount = total;
  } catch {
    homeListingsCount = 0;
  }
  updateStatCount();
}

async function refreshCurrentUser() {
  try {
    const profile = await db.getCurrentProfile();
    if (profile) {
      currentUser = {
        id: profile.id,
        email: profile.email,
        name: profile.first_name,
        lastName: profile.last_name,
        phone: profile.phone,
        pincode: profile.city,
        avatarUrl: profile.avatar_url,
        isAdmin: profile.is_admin || profile.is_staff || false,
        roles: profile.roles || [],
        isSuperadmin: (profile.roles || []).includes('superadmin'),
        // Supplied by the server from the role matrix — the UI never decides
        // permissions itself, it only renders what the server says is allowed.
        capabilities: profile.capabilities || [],
        sections: profile.sections || [],
        // Lender (NBFC) users are not staff, but they work in the admin
        // panel's Lender portal tab, so they get the panel link too.
        hasPanel: !!(profile.is_admin || profile.is_staff || (profile.sections || []).includes('lender')),
        // DealLock: set while new listings and deals are paused (3 locked
        // deals cancelled in a row). The server enforces it either way.
        dealBanUntil: profile.deal_ban_until || null,
        createdAt: profile.created_at
      };
      updateUserUI();
      await loadSavedItems();
    }
  } catch (err) {
    console.error('refreshCurrentUser failed:', err);
  }
}

function normalizeListing(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    condition: row.condition,
    price: Number(row.price),
    originalPrice: row.original_price ? Number(row.original_price) : null,
    pincode: row.city || '',
    location: row.location || '',
    images: [row.ai_image_url, ...(row.extra_images || [])].filter(Boolean),
    description: row.ai_description || '',
    fbLink: row.fb_link || '',
    emiEligible: row.emi_eligible,
    negotiable: row.negotiable || false,
    brand: row.brand || '',
    model: row.model || '',
    landmark: row.landmark || '',
    showPhone: row.show_phone || 'chat_only',
    sellerPhone: row.seller_phone || '',
    sellerId: row.posted_by || '',
    sellerName: row.seller_name || 'Seller',
    sellerAvatar: row.seller_avatar || '',
    views: row.views || 0,
    status: row.status || 'active',
    // DealLock: 'pending' while a deal waits for the seller or documents
    // (the listing is not marked reserved yet), 'reserved' once it locks.
    dealStage: row.deal_stage || (row.status === 'reserved' ? 'reserved' : null),
    // DealLock phase 5: the listing's documents (cars and bikes).
    docsState: row.docs_state || null,
    vehicleHadLoan: row.vehicle_had_loan === undefined ? null : row.vehicle_had_loan,
    isFeatured: !!row.is_featured,
    featuredUntil: row.featured_until || null,
    createdAt: row.created_at,
    // The server sends these (product_attributes: year, km, owners, fuel...)
    // but they were never copied here, so p.attributes was always undefined —
    // which is why editing a listing came back with every category field
    // blank, and why the detail page could not show them either.
    attributes: row.attributes || {},
    daysAgo: row.created_at ? Math.max(0, Math.floor((Date.now() - new Date(row.created_at)) / 86400000)) : 0
  };
}

/* Headline counts stay readable as the marketplace grows: exact below 1,000,
   then an abbreviated floor with a "+" so the figure is never overstated. */
function formatCompactCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1000000) {
    const k = v / 1000;
    return (k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)) + 'k+';
  }
  const m = v / 1000000;
  return (m < 10 ? Math.floor(m * 10) / 10 : Math.floor(m)) + 'M+';
}

function updateStatCount() {
  const el = document.getElementById('statListings');
  if (el) el.textContent = formatCompactCount(homeListingsCount);
}

/* ===== PAGE NAVIGATION ===== */
const PROTECTED = ['profile', 'mylistings', 'myads', 'emi-status', 'mychats', 'mydeals'];

/* Restarts a CSS animation on an element. Removing the class isn't enough on
   its own — the browser only replays the animation if a reflow happens in
   between, which is what reading offsetWidth forces. */
function animateIn(el, cls = 'page-enter') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);

  // Strip the class once the animation finishes. This matters beyond
  // tidiness: the animation uses fill-mode `both`, so the element keeps a
  // computed `transform` (an identity matrix) forever afterwards — and ANY
  // transform on an ancestor makes descendant `position: fixed` resolve
  // against that ancestor instead of the viewport. That's what stopped the
  // admin sidebar from staying put while scrolling.
  const done = (e) => {
    if (e.target !== el) return; // child animations bubble up; ignore them
    el.classList.remove(cls);
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
}

/* Pages the user navigated through, so a back button returns to the actual
   previous page rather than always dumping them on the home page. */
let pageHistory = [];

/* Pages that display the site footer. Deliberately excludes the
   transactional pages (buy, sell, chat, admin, profile) — someone
   mid-purchase doesn't need a sitemap, and on mobile it just pushes the
   real content further up the scroll. */
const FOOTER_PAGES = [
  'home', 'help', 'contact', 'reportProblem', 'legal',
  'partners', 'blog', 'blogPost',
];

/* ===== ROLE-BASED ADMIN VISIBILITY =====
   The server sends the current user's capabilities and which admin sections
   they unlock. The UI hides everything else.

   This is presentation only. Every endpoint independently enforces the same
   capability, so hiding a menu item is a courtesy — not the control. A
   manager who guesses a URL still gets 403 from the API. */
function userCan(capability) {
  return Array.isArray(currentUser?.capabilities) &&
         currentUser.capabilities.includes(capability);
}

function userSections() {
  return Array.isArray(currentUser?.sections) ? currentUser.sections : [];
}

function applyAdminPermissions() {
  const allowed = userSections();
  let firstVisible = null;

  document.querySelectorAll('.admin-nav-item[data-section]').forEach(btn => {
    const section = btn.dataset.section;
    const ok = allowed.includes(section);
    btn.classList.toggle('hidden', !ok);
    if (ok && !firstVisible) firstVisible = section;
  });

  // Hide the group heading when every item beneath it is hidden, so the
  // sidebar doesn't show "Settings" above nothing.
  document.querySelectorAll('.admin-nav-heading').forEach(heading => {
    const group = [];
    let el = heading.nextElementSibling;
    while (el && el.classList.contains('admin-nav-item')) {
      group.push(el);
      el = el.nextElementSibling;
    }
    const anyVisible = group.some(b => !b.classList.contains('hidden'));
    heading.classList.toggle('hidden', !anyVisible);
  });

  // The EMI stat cards and the Reports shortcut sit above every section.
  // A role without those sections (a lender's portal user) would see
  // made-up zeros and a button that only says "no access", so hide them.
  document.querySelector('.admin-stats-grid')?.classList.toggle('hidden', !allowed.includes('emi'));
  document.querySelector('.admin-topbar-right button[onclick*="reports"]')?.classList.toggle('hidden', !allowed.includes('reports'));

  return firstVisible;
}

/* ===== SITE SETTINGS / FEATURE FLAGS =====
   Loaded once at boot. EMI defaults to OFF so that a failed or slow
   settings request can never briefly advertise financing we can't
   actually provide — the safe state is the restrictive one. */
let siteSettings = { emi_enabled: false };

function emiEnabled() {
  return siteSettings.emi_enabled === true;
}

/* Whether EMI is covered at the CURRENT selected area. Resolved from the
   server on boot and whenever the area changes. */
let emiCoveredHere = false;

/* What the user actually sees.

   The global switch controls site-wide advertising; coverage controls real
   availability. So a buyer in a covered pilot region sees EMI even while
   the switch is off — otherwise the pilot would be invisible to exactly
   the people it's for. */
function emiVisibleHere() {
  return emiEnabled() || emiCoveredHere;
}

function applyFeatureFlags() {
  document.body.classList.toggle('emi-off', !emiVisibleHere());
}

/* Called on boot and after an area change. Cheap (one request) and it
   decides whether an entire category of UI renders, so it runs before the
   first paint of EMI-dependent content rather than after. */
async function refreshEmiCoverage() {
  const pincode = selectedArea?.pincode
    || (selectedArea?.prefix ? `${selectedArea.prefix}001` : null);
  if (!pincode) { emiCoveredHere = false; applyFeatureFlags(); return; }
  try {
    const res = await db.getEmiAvailability({ pincode });
    emiCoveredHere = res.available === true;
  } catch {
    // Fall back to the switch alone rather than assuming coverage.
    emiCoveredHere = false;
  }
  applyFeatureFlags();
}

async function loadSiteSettings() {
  try {
    const s = await db.getSiteSettings();
    siteSettings = { emi_enabled: s?.emi_enabled === true };
  } catch {
    // Keep the safe default rather than assuming EMI is available.
    siteSettings = { emi_enabled: false };
  }
  applyFeatureFlags();
}

/* ===== ADMIN: TABLE PAGINATION =====
   One shared, generic pager for every admin table. Operates on whatever
   array a table's render function has already fetched and filtered — it
   just slices out one page and draws the controls, so it works the same
   way whether the underlying rows came from a server-filtered fetch
   (Products) or a client-filtered cache (Users, Purchases, Financers,
   EMI, Reports) without needing six different implementations. */
const ADMIN_PAGE_SIZE_MIN = 10;
const ADMIN_PAGE_SIZE_MAX = 500;
const ADMIN_PAGE_SIZE_DEFAULT = 25;
const ADMIN_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];


const adminPagination = {}; // { tableId: { page, perPage } }

// Registered by each section so the pager's own controls (page size,
// prev/next, page numbers) can trigger a re-render without needing a
// giant if/else keyed by table id.
const ADMIN_TABLE_RERENDER = {};

function adminPagerState(tableId) {
  if (!adminPagination[tableId]) adminPagination[tableId] = { page: 1, perPage: ADMIN_PAGE_SIZE_DEFAULT };
  return adminPagination[tableId];
}

function adminResetPage(tableId) {
  adminPagerState(tableId).page = 1;
}

/* Slices `rows` down to the current page for `tableId`, clamping the page
   number if the data shrank (e.g. a delete) or a filter changed the total.
   Draws the pager controls as a side effect and returns just this page's
   rows for the caller to render into the table body. */
function adminPaginate(tableId, rows) {
  const state = adminPagerState(tableId);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / state.perPage));
  state.page = Math.min(Math.max(state.page, 1), totalPages);
  const start = (state.page - 1) * state.perPage;
  adminRenderPagerControls(tableId, total, totalPages);
  return rows.slice(start, start + state.perPage);
}

function adminSetPageSize(tableId, rawValue) {
  const state = adminPagerState(tableId);
  const n = Math.min(ADMIN_PAGE_SIZE_MAX, Math.max(ADMIN_PAGE_SIZE_MIN, parseInt(rawValue, 10) || ADMIN_PAGE_SIZE_DEFAULT));
  state.perPage = n;
  state.page = 1; // changing page size makes the old page number meaningless
  ADMIN_TABLE_RERENDER[tableId]?.();
}

function adminGoToPage(tableId, page) {
  adminPagerState(tableId).page = page;
  ADMIN_TABLE_RERENDER[tableId]?.();
}

/* Windowed page numbers (current \u00b1 2, plus first/last) so a 500-row table
   at 10/page \u2014 50 pages \u2014 doesn't render 50 buttons across the screen. */
function adminPageWindow(current, totalPages) {
  const win = new Set([1, totalPages, current, current - 1, current + 1, current - 2, current + 2]);
  return [...win].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
}

function adminRenderPagerControls(tableId, total, totalPages) {
  const el = document.getElementById(`adminPager-${tableId}`);
  if (!el) return;
  const state = adminPagerState(tableId);

  if (total === 0) { el.innerHTML = ''; return; }

  const start = (state.page - 1) * state.perPage + 1;
  const end = Math.min(state.page * state.perPage, total);

  const pageNums = adminPageWindow(state.page, totalPages);
  let pageBtns = '';
  let lastRendered = 0;
  pageNums.forEach(n => {
    if (n - lastRendered > 1) pageBtns += `<span class="admin-pager-ellipsis">\u2026</span>`;
    pageBtns += `<button class="admin-pager-num ${n === state.page ? 'is-active' : ''}" onclick="adminGoToPage('${tableId}',${n})">${n}</button>`;
    lastRendered = n;
  });

  el.innerHTML = `
    <div class="admin-pager-size">
      <label for="adminPageSize-${tableId}">Show</label>
      <select id="adminPageSize-${tableId}" onchange="adminSetPageSize('${tableId}', this.value)">
        ${ADMIN_PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${n === state.perPage ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <span>per page</span>
    </div>
    <div class="admin-pager-range">${start}\u2013${end} of ${total}</div>
    <div class="admin-pager-nav">
      <button class="admin-pager-arrow" onclick="adminGoToPage('${tableId}',${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fas fa-chevron-left"></i></button>
      ${pageBtns}
      <button class="admin-pager-arrow" onclick="adminGoToPage('${tableId}',${state.page + 1})" ${state.page >= totalPages ? 'disabled' : ''} aria-label="Next page"><i class="fas fa-chevron-right"></i></button>
    </div>`;
}

/* Client-side text filter shared by every admin table search box. These
   tables are staff-only tools operating on already-fetched data, so a
   quick in-memory filter is simpler and more responsive than round-
   tripping to the server on every keystroke — unlike the public Buy page,
   which filters server-side because its catalogue doesn't all fit in
   memory to begin with. */
function adminMatches(query, ...fields) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => String(f || '').toLowerCase().includes(q));
}

/* Modals that can nest — a "Chat with Seller" or "Buy with EMI" opened from
   an already-open product listing must NOT close that listing underneath
   it, and closing the chat/EMI overlay must reveal the listing exactly as
   it was, not send the user to home.

   modalStack is the single source of truth for which of our OWN history
   entries are currently "ours" and in what order. Every push here means
   exactly one pushState call; every close pops exactly one. Deriving this
   from DOM visibility alone (as the old per-modal flags tried to) breaks
   as soon as two modals are visible at once, because "is X visible" no
   longer tells you which one a Back press should close. */
let modalStack = [];

function pushModal(id) {
  modalStack.push(id);
  history.pushState({ view: 'modal', modal: id }, '');
}

const MODAL_HIDE = {
  product: () => {
    const m = document.getElementById('productModal');
    m.classList.add('hidden');
    m.classList.remove('pdp-modal');
  },
  chat: () => {
    const m = document.getElementById('chatModal');
    m.classList.add('hidden');
    m.classList.remove('is-minimised');
    document.getElementById('chatMiniBubble')?.classList.add('hidden');
    chatMinimised = false;
    clearInterval(chatPollInterval);
    currentChatConversation = null;
    if (typeof dealsOnChatOpen === 'function') dealsOnChatOpen();
    // Repaint on the way out: the conversation was read inside the modal,
    // and the list behind it still showed the stale dot.
    if (currentPage === 'mychats') renderChatListItems();
    refreshNavBadges();
  },
  emi: () => document.getElementById('emiModal').classList.add('hidden'),
  lightbox: () => document.getElementById('imageLightbox').classList.add('hidden'),
  bot: () => setBotPanel(false),
  avatarCrop: () => {
    document.getElementById('avatarCropModal').classList.add('hidden');
    cropImage = null;
  },
  partyInfo: () => document.getElementById('partyInfoModal').classList.add('hidden'),
  legalPeek: () => document.getElementById('legalPeekModal').classList.add('hidden'),
  camera: () => {
    document.getElementById('cameraModal').classList.add('hidden');
    stopCameraStream();
  },
  auth: () => {
    document.getElementById('authModal').classList.add('hidden');
    resetAuthForms();
  },
};

/* Hides a modal's DOM and removes it from our stack, WITHOUT touching
   history — used both when popstate has already moved history back for us,
   and as the first step of an explicit close() before we move it back
   ourselves. Body scroll only unlocks once every modal we know about is
   closed, since a lower one (e.g. product) may still be open. */
function hideModal(id) {
  // try/finally, not try/catch-and-continue: whatever a hide handler does or
  // fails to do, the stack must still be popped and body scroll must still be
  // restored. A throw here previously left the page permanently unscrollable
  // -- an unrecoverable state for the user, from a non-critical error. The
  // error still surfaces in the console and error-logger.
  try {
    MODAL_HIDE[id]?.();
  } finally {
    const i = modalStack.lastIndexOf(id);
    if (i !== -1) modalStack.splice(i, 1);
    if (modalStack.length === 0) document.body.style.overflow = '';
  }
}

/* Called by a modal's own close ("X") button. Hides it, then consumes the
   single history entry pushModal() created for it. */
// history.back() fires a popstate event asynchronously. Without this flag,
// an explicit close (X button / Escape / backdrop click) would hide the
// modal immediately AND THEN the resulting popstate would try to close
// "the new top of the stack" again — which, since we already popped this
// modal off, would incorrectly be the modal underneath it (e.g. closing
// Chat via its X button would also close the product listing behind it).
let suppressNextPopstate = false;

function closeTopModal(id) {
  const owned = modalStack.includes(id);
  hideModal(id); // synchronous — the UI updates immediately, no flash
  if (owned) {
    suppressNextPopstate = true;
    history.back();
  }
}

function goBack() {
  // Leaving an edit reopens the listing it was started from. Without this the
  // back arrow dropped the user on whatever page was behind the modal, which
  // is rarely where they were looking.
  if (currentPage === 'sell' && editReturnListingId) {
    const id = editReturnListingId;
    editReturnListingId = null;
    const prev = pageHistory.pop();
    showPage(prev || 'buy', false, true);
    openListing(id).catch(() => {});
    return;
  }
  const prev = pageHistory.pop();
  // fromHistory=true so navigating back doesn't itself get pushed onto the stack
  showPage(prev || 'home', false, true);
}


/* Underlines the nav link for the page you're on. Driven by data-nav on each
   link rather than an index, so reordering the nav can't silently break it.
   "How It Works" points at home because it scrolls to a section there, and
   marking it active on every home visit would be wrong — so it is only
   matched when nothing else is. */
function markNavActive(page) {
  document.querySelectorAll('.nav-desktop-links a[data-nav]').forEach(a => {
    const target = a.getAttribute('data-nav');
    if (target === 'home') { a.classList.remove('is-active'); return; }
    // The EMI link lands on Buy with the EMI filter ticked, so the two Buy
    // links are told apart by that checkbox rather than by the page name.
    const emiOn = !!document.getElementById('emiFilter')?.checked;
    let active = false;
    if (target === 'buy')      active = page === 'buy' && !emiOn;
    else if (target === 'buy-emi') active = page === 'buy' && emiOn;
    else                       active = target === page;
    a.classList.toggle('is-active', active);
  });
}

function showPage(page, fromPopstate = false, fromHistory = false) {
  // The home page uses a light navbar (the rest of the app keeps the dark one),
  // so scope it with a body class rather than restyling .navbar globally.
  document.body.classList.toggle('on-home', page === 'home');
  // Hides the support bubble in the admin panel, where it would just
  // overlap the dense staff UI.
  document.body.classList.toggle('on-admin', page === 'admin');

  // The footer lives outside the pages (so the home layout can go
  // full-width), so which pages show it is decided here. These are the
  // "read about the site" pages — a visitor who lands on Contact Us from a
  // search result should still be able to reach Terms, Help or the
  // category links without hitting the back button.
  document.body.classList.toggle('show-footer', FOOTER_PAGES.includes(page));
  // Leaving the legal page clears which document was open, so a stale key
  // can't keep "About" underlined while you're reading Help.
  if (page !== 'legal') currentLegalKey = null;
  markNavActive(page);
  if (PROTECTED.includes(page) && !currentUser) {
    pendingAction = () => showPage(page);
    showToast('Please login to continue', 'info');
    openModal();
    return;
  }
  // Record where we're leaving from, unless this IS a back navigation.
  // Guard against consecutive duplicates so tapping the same nav item twice
  // doesn't require two presses of Back to escape.
  if (!fromHistory && !fromPopstate && currentPage && currentPage !== page) {
    if (pageHistory[pageHistory.length - 1] !== currentPage) pageHistory.push(currentPage);
    if (pageHistory.length > 20) pageHistory.shift();
  }

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  // EMI pages are unreachable while the feature is off, including via a
  // stale #emi-status URL or browser history.
  if (page === 'emi-status' && !emiVisibleHere()) {
    showToast('EMI is not available yet.', 'info');
    page = 'home';
  }

  const target = document.getElementById(page + 'Page');
  if (target) {
    target.classList.remove('hidden');
    currentPage = page;
    animateIn(target);
  }
  // Leaving Buy clears its search box: coming back later to a stale query
  // and an unrelated result set reads as a bug, not as remembered state.
  if (page !== 'buy') {
    const sb = document.getElementById('buySearchInput');
    if (sb) sb.value = '';
  }
  // After currentPage is updated above — markFooterActive() reads it, and
  // calling it earlier would highlight the page we just left.
  markFooterActive();
  document.getElementById('userMenu')?.classList.add('hidden');
  window.scrollTo(0, 0);

  if (page === 'buy') initBuyPage();
  // The hero map may have been skipped at load (home hidden because the
  // URL pointed elsewhere), in which case this is its first real chance.
  if (page === 'home') {
    initHomeMap();
    if (homeMap) requestAnimationFrame(() => homeMap.invalidateSize());
  }
  if (page === 'profile') renderProfilePage();
  if (page === 'mylistings') renderMyListings();
  if (page === 'myads') renderSavedPage();
  if (page === 'emi-status') renderEmiStatusPage();
  if (page === 'mychats') renderMyChats();
  // DealLock (deals.js)
  if (page === 'mydeals' && typeof renderMyDeals === 'function') renderMyDeals();
  if (page === 'help') initHelpPage();
  if (page === 'contact') initProblemForm('contact');
  if (page === 'reportProblem') initProblemForm('problem');
  if (page === 'partners') initPartnersPage();
  if (page === 'blog') initBlogPage();

  if (!fromPopstate) {
    history.pushState({ view: 'page', page }, '', pagePath(page));
  }
}

/* ===== BUY PAGE ===== */
function initBuyPage() {
  document.getElementById('buySearchInput').value = '';
  selectedCategory = 'all';
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === 'all'));
  document.getElementById('filterPanel')?.classList.add('hidden');
  applyBuyFilters();
}

function browseCategory(cat) {
  showPage('buy');
  setTimeout(() => setCatDirect(cat), 50);
}

function browseEmiListings() {
  if (!emiVisibleHere()) { showToast('EMI is not available in your area yet.', 'info'); return; }
  showPage('buy');
  setTimeout(() => {
    const emiCheckbox = document.getElementById('emiFilter');
    if (emiCheckbox) emiCheckbox.checked = true;
    document.getElementById('filterPanel')?.classList.remove('hidden');
    applyBuyFilters();
    markNavActive('buy');   // the checkbox is only ticked now, after showPage ran
    showToast('Showing EMI-eligible listings', 'info');
  }, 50);
}

function setCat(el, cat) {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  selectedCategory = cat;
  applyBuyFilters();
}

function setCatDirect(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  applyBuyFilters();
}

function triggerBuySearch() { applyBuyFilters(); }

function toggleFilters() {
  document.getElementById('filterPanel').classList.toggle('hidden');
}

function getBuyFilterParams() {
  const q = (document.getElementById('buySearchInput')?.value || '').trim();
  const minPrice = parseFloat(document.getElementById('priceMin')?.value);
  const maxPrice = parseFloat(document.getElementById('priceMax')?.value);
  const pincode = (document.getElementById('pincodeFilter')?.value || '').trim();
  const emiOnly = document.getElementById('emiFilter')?.checked || false;
  const sort = document.getElementById('buySortSelect')?.value || 'recommended';
  return {
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    search: q || undefined,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    pincode: pincode || undefined,
    // Ranks nearby listings first without hiding anything else. Under
    // Newest / Price it only breaks ties: the order the buyer picked wins.
    near: selectedArea ? selectedArea.prefix : undefined,
    emiOnly, sort
  };
}

/* Resets to page 1 and replaces the grid — called whenever a filter,
   category, search term, or sort order changes. */

/* type="tel" does NOT restrict what can be typed — it only hints at a phone
   keypad on mobile. Letters go straight through. This strips anything that
   is not a digit, keeping a single leading + for country codes. */
function sanitisePhone(input) {
  const hadPlus = input.value.trim().startsWith('+');
  const digits = input.value.replace(/\D/g, '');
  input.value = (hadPlus ? '+' : '') + digits;
}

/* Ten digits, optionally prefixed with +91 or 91. Rejects letters, short
   numbers, and the all-same-digit strings people type to skip the field. */
function isValidIndianPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '').replace(/^91/, '');
  if (digits.length !== 10) return false;
  if (!/^[6-9]/.test(digits)) return false;   // Indian mobiles start 6-9
  if (/^(\d)\1{9}$/.test(digits)) return false;
  return true;
}


/* Number inputs accept "-5" from typing and pasting even with min="0" — the
   attribute only constrains the spinner and form validation, not the value.
   This strips a leading minus as it's entered so a negative price can never
   sit in the field, let alone reach the server. */
function clampNonNegative(input) {
  if (input.value === '' || input.value === '-') { input.value = ''; return; }
  const n = parseFloat(input.value);
  if (isNaN(n) || n < 0) input.value = '';
}

/* Shows the Clear button in the filter bar only when something is actually
   filtered. Called on every filter change and after clearing. */
function updateClearFiltersBtn() {
  const active =
    !!document.getElementById('priceMin')?.value ||
    !!document.getElementById('priceMax')?.value ||
    !!document.getElementById('pincodeFilter')?.value ||
    !!document.getElementById('emiFilter')?.checked ||
    !!document.getElementById('buySearchInput')?.value ||
    (selectedCategory && selectedCategory !== 'all');
  document.getElementById('clearFiltersBtn')?.classList.toggle('hidden', !active);
}

function applyBuyFilters() {
  buyPageNum = 1;
  updateClearFiltersBtn();
  fetchBuyPage();
}

/* Fetches and displays buyPageNum from the server. The grid always shows
   exactly one page's worth of results now — turning the page REPLACES the
   grid rather than appending to it (this used to be a "Load More" button
   that appended; that's now handled by the numbered pager instead). */
async function fetchBuyPage() {
  const grid = document.getElementById('buyListingsGrid');
  const noRes = document.getElementById('buyNoResults');
  const countEl = document.getElementById('buyResultsCount');
  const loadingEl = document.getElementById('buyLoading');

  const thisFetch = ++buyFetchToken;
  loadingEl?.classList.remove('hidden');

  let data;
  try {
    data = await db.getProducts({ ...getBuyFilterParams(), page: buyPageNum, perPage: buyPerPage });
  } catch (err) {
    console.error('fetchBuyPage failed:', err);
    if (thisFetch === buyFetchToken) loadingEl?.classList.add('hidden');
    return;
  }
  if (thisFetch !== buyFetchToken) return; // a newer filter/page change superseded this request

  const items = data.items.map(normalizeListing);
  buyTotalPages = data.totalPages;
  buyTotalCount = data.total;
  buyListings = items;

  if (countEl) {
    // "near X first" is only true under Recommended. Newest and Price are
    // strict orders, where nearness only breaks ties.
    const sortNow = document.getElementById('buySortSelect')?.value || 'recommended';
    const near = selectedArea && sortNow === 'recommended' ? ` · near ${escapeHtml(selectedArea.name)} first` : '';
    countEl.innerHTML = `${Number(data.total).toLocaleString('en-IN')} listing${data.total !== 1 ? 's' : ''} found` +
      (near ? `<span class="buy-near-note">${near}</span>` : '');
  }
  loadingEl?.classList.add('hidden');

  if (items.length === 0) {
    grid.innerHTML = '';
    noRes.classList.remove('hidden');
    renderBuyPagerControls();
    return;
  }
  noRes.classList.add('hidden');

  grid.innerHTML = items.map(p => createListingCard(p)).join('');
  animateIn(grid, 'grid-enter');
  renderBuyPagerControls();
}

function buyGoToPage(page) {
  buyPageNum = Math.min(Math.max(page, 1), Math.max(buyTotalPages, 1));
  fetchBuyPage();
  document.getElementById('buyResultsCount')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buySetPageSize(rawValue) {
  buyPerPage = Math.min(ADMIN_PAGE_SIZE_MAX, Math.max(ADMIN_PAGE_SIZE_MIN, parseInt(rawValue, 10) || 30));
  buyPageNum = 1; // the old page number is meaningless against a different page size
  fetchBuyPage();
}

/* Same windowed page-number logic as the admin tables' pager (current \u00b1 2,
   plus first/last), reused directly rather than duplicated \u2014 it's a pure
   function of two numbers, nothing admin-specific about it. */
function renderBuyPagerControls() {
  const el = document.getElementById('buyPager');
  if (!el) return;

  if (buyTotalCount === 0) { el.innerHTML = ''; return; }

  const start = (buyPageNum - 1) * buyPerPage + 1;
  const end = Math.min(buyPageNum * buyPerPage, buyTotalCount);

  const pageNums = adminPageWindow(buyPageNum, Math.max(buyTotalPages, 1));
  let pageBtns = '';
  let lastRendered = 0;
  pageNums.forEach(n => {
    if (n - lastRendered > 1) pageBtns += `<span class="admin-pager-ellipsis">\u2026</span>`;
    pageBtns += `<button class="admin-pager-num ${n === buyPageNum ? 'is-active' : ''}" onclick="buyGoToPage(${n})">${n}</button>`;
    lastRendered = n;
  });

  el.innerHTML = `
    <div class="admin-pager-size">
      <label for="buyPageSize">Show</label>
      <select id="buyPageSize" onchange="buySetPageSize(this.value)">
        ${BUY_PAGE_SIZE_OPTIONS.map(n => `<option value="${n}" ${n === buyPerPage ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <span>per page</span>
    </div>
    <div class="admin-pager-range">${start}\u2013${end} of ${buyTotalCount}</div>
    <div class="admin-pager-nav">
      <button class="admin-pager-arrow" onclick="buyGoToPage(${buyPageNum - 1})" ${buyPageNum <= 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fas fa-chevron-left"></i></button>
      ${pageBtns}
      <button class="admin-pager-arrow" onclick="buyGoToPage(${buyPageNum + 1})" ${buyPageNum >= buyTotalPages ? 'disabled' : ''} aria-label="Next page"><i class="fas fa-chevron-right"></i></button>
    </div>`;
}

function clearBuyFilters() {
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('pincodeFilter').value = '';
  document.getElementById('emiFilter').checked = false;
  document.getElementById('buySearchInput').value = '';
  selectedCategory = 'all';
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === 'all'));
  document.getElementById('filterPanel').classList.add('hidden');
  applyBuyFilters();          // recomputes the Clear button, which now hides
}

/* ---- shared product helpers ---- */

const CONDITION_LABEL = { like_new: 'Excellent', good: 'Good', fair: 'Fair', for_parts: 'For Parts' };

// Prices are shown in full with Indian grouping (₹52,000), not abbreviated —
// formatNum's "52k"/"1.4L" shorthand is fine for view counts but reads as
// vague when it's the amount someone is being asked to pay.
function formatMoney(n) {
  const v = Number(n);
  if (!isFinite(v)) return '0';
  return Math.round(v).toLocaleString('en-IN');
}

// Monthly instalment shown on cards and the detail view. Mirrors the backend
// formula (10% down, 12% p.a. reducing balance) so the teaser matches what the
// application will actually quote.
function emiPerMonth(price, months = 12, downPct = 0.10, annualRate = 12) {
  const principal = Math.max(price * (1 - downPct), 0);
  const r = annualRate / 12 / 100;
  const f = Math.pow(1 + r, months);
  return principal > 0 ? (principal * r * f) / (f - 1) : 0;
}

// "Good deal" is derived from the seller's own original price, not invented:
// it only appears when there's a real, meaningful markdown.
function dealInfo(p) {
  const orig = Number(p.originalPrice) || 0;
  const price = Number(p.price) || 0;
  if (!orig || orig <= price) return null;
  const saving = orig - price;
  const pct = saving / orig;
  return { saving, pct, isGoodDeal: pct >= 0.05 };
}

/* Scrolls to the seller-side explainer. Same shape as goHowItWorks(): the
   section lives on the home page, so a visitor on Buy or Sell has to be
   returned home first, and the timeout gives that render a frame before we
   measure the scroll target. */
function goHowSellingWorks() {
  showPage('home');
  setTimeout(() => {
    document.getElementById('howSellingWorks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function goHowItWorks() {
  showPage('home');
  setTimeout(() => {
    const el = document.getElementById('howItWorks');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function createListingCard(p) {
  const saved = savedItems.has(p.id);
  const condLabel = CONDITION_LABEL[p.condition] || p.condition;
  const deal = dealInfo(p);
  const imgHtml = p.images.length
    ? `<img src="${p.images[0]}" alt="${escapeHtml(p.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=pcard-ph>${getCatEmoji(p.category)}</div>'">`
    : `<div class="pcard-ph">${getCatEmoji(p.category)}</div>`;
  const daysLabel = p.daysAgo === 0 ? 'Today' : p.daysAgo === 1 ? '1 day ago' : `${p.daysAgo} days ago`;

  return `
    <div class="pcard" onclick="openListing('${p.id}')">
      <div class="pcard-media">
        ${imgHtml}
        <div class="pcard-flags">
          ${p.isFeatured ? '<span class="pcard-flag pcard-flag-featured"><i class="fas fa-bolt"></i> FEATURED</span>' : ''}
          ${deal && deal.isGoodDeal ? '<span class="pcard-flag pcard-flag-deal"><i class="fas fa-arrow-trend-down"></i> GOOD DEAL</span>' : ''}
        </div>
        <button class="pcard-heart ${saved ? 'is-saved' : ''}" data-save-id="${p.id}" aria-pressed="${saved}" onclick="toggleSaveItem(event,'${p.id}')" aria-label="${saved ? 'Remove from saved' : 'Save listing'}">
          <i class="fas fa-heart"></i>
        </button>
        ${p.emiEligible && emiVisibleHere() ? '<span class="pcard-emi"><i class="fas fa-bolt"></i> EMI</span>' : ''}
      </div>
      <div class="pcard-body">
        <div class="pcard-tags">
          <span class="pcard-cond cond-${p.condition}">${condLabel.toUpperCase()}</span>
          ${p.negotiable ? '<span class="pcard-negotiable">Negotiable</span>' : ''}
        </div>
        <div class="pcard-title">${escapeHtml(p.title)}</div>
        <div class="pcard-price-row">
          <span class="pcard-price">₹${formatMoney(p.price)}</span>
          ${deal ? `<span class="pcard-was">₹${formatMoney(p.originalPrice)}</span>
                    <span class="pcard-save">−₹${formatMoney(deal.saving)}</span>` : ''}
        </div>
        ${p.emiEligible && emiVisibleHere() ? `<div class="pcard-emi-line"><i class="fas fa-bolt"></i> From ₹${formatMoney(emiPerMonth(p.price))}/month × 12</div>` : ''}
        <div class="pcard-foot">
          <span class="pcard-loc" title="${escapeHtml(p.landmark || p.location || p.pincode || '')}"><i class="fas fa-location-dot"></i> ${escapeHtml(p.landmark || p.location || p.pincode || '—')}</span>
          <span class="pcard-date">${daysLabel}</span>
        </div>
      </div>
    </div>`;
}

// Single source of truth for category icons — used by the buy filter pills,
// the home page tiles, card placeholders and map pins, so a category looks
// the same everywhere in the app.
const CAT_EMOJI = {
  cars: '🚗', phones: '📱', bikes: '🏍️', electronics: '💻',
  furniture: '🛋️', appliances: '🧊', fashion: '👗', property: '🏢',
  others: '📦'
};

function getCatEmoji(cat) {
  return CAT_EMOJI[cat] || '📦';
}

/* ===== OPEN LISTING (Product Detail) ===== */
let currentGalleryIndex = 0;


/* Attribute definitions, cached per category. The listing carries its values
   (year: "2018") but not their labels or option text, so the definitions are
   needed to render "Year of manufacture: 2018" rather than "year: 2018". One
   fetch per category per session. */
const attrDefCache = {};
async function categoryAttrDefs(category) {
  if (!category) return [];
  if (attrDefCache[category]) return attrDefCache[category];
  try {
    const res = await db.getCategoryAttributes(category);
    attrDefCache[category] = Array.isArray(res?.attributes) ? res.attributes : [];
  } catch {
    attrDefCache[category] = [];   // never block the page over optional detail
  }
  return attrDefCache[category];
}

/* Turns stored attribute values into label/value pairs for the detail page,
   in the order the category defines them — so Year comes before Kilometres
   on every car listing rather than in whatever order the object iterates. */
async function categoryDetailRows(p) {
  const values = p.attributes || {};
  if (!Object.keys(values).length) return [];
  const defs = await categoryAttrDefs(p.category);

  return defs.map(a => {
    const raw = values[a.key];
    if (raw === undefined || raw === null || raw === '') return null;

    // A select stores its option value; show the human label for it.
    let text = String(raw);
    if (a.type === 'select' && Array.isArray(a.options)) {
      const opt = a.options.find(o => String(o.value ?? o) === text);
      if (opt) text = String(opt.label ?? opt.value ?? opt);
    }
    if (a.unit && a.type === 'number') text = `${text} ${a.unit}`;
    return [a.label || a.key, text];
  }).filter(Boolean);
}

async function openListing(id) {
  document.getElementById('productModalContent').innerHTML =
    `<div style="text-align:center;padding:80px 20px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  document.getElementById('productModal').classList.remove('hidden');
  document.getElementById('productModal').classList.add('pdp-modal');
  document.body.style.overflow = 'hidden';
  pushModal('product');

  const p = await getListingById(id);
  if (!p) {
    closeProductModal(true);
    showToast('Listing not found.', 'error');
    return;
  }
  currentProduct = p;
  currentGalleryIndex = 0;
  db.incrementProductViews(id).catch(() => {});

  const condLabel = CONDITION_LABEL[p.condition] || p.condition;
  const deal = dealInfo(p);
  const daysLabel = p.daysAgo === 0 ? 'Today' : p.daysAgo === 1 ? 'Yesterday' : `${p.daysAgo} days ago`;
  const isOwnListing = currentUser && currentUser.id === p.sellerId;
  const isStaff = currentUser && currentUser.isAdmin;
  const catLabel = p.category.charAt(0).toUpperCase() + p.category.slice(1);

  // Two groups, rendered as two sections rather than one long list.
  //
  // Spec first: what the buyer is actually deciding on — a car's year and
  // kilometres matter more than its pincode, and burying them under
  // "Negotiable" made the page read like a form receipt.
  const specRows = await categoryDetailRows(p);

  const details = [
    ['Brand', p.brand], ['Model', p.model],
    ['Category', catLabel], ['Condition', condLabel],
    ['Negotiable', p.negotiable ? 'Yes' : 'No'],
    // Only meaningful while EMI is live; otherwise it advertises something
    // a buyer cannot act on.
    ...(emiVisibleHere() ? [['EMI Eligible', p.emiEligible ? 'Yes' : 'No']] : []),
    ['Location', p.landmark || p.location || ''],
    ['Pincode', p.pincode], ['Listed', daysLabel],
  ].filter(([, v]) => v !== '' && v != null);

  const sellerInitial = p.sellerName ? p.sellerName.charAt(0).toUpperCase() : 'S';
  const sellerAvatarHtml = p.sellerAvatar
    ? `<img src="${p.sellerAvatar}" alt="${escapeHtml(p.sellerName)}">` : sellerInitial;

  document.getElementById('productModalContent').innerHTML = `
    <div class="pdp-crumbs">
      <a href="#" onclick="closeProductModal(); showPage('home'); return false;">Home</a>
      <i class="fas fa-chevron-right"></i>
      <a href="#" onclick="closeProductModal(); showPage('buy'); return false;">Marketplace</a>
      <i class="fas fa-chevron-right"></i>
      <a href="#" onclick="closeProductModal(); browseCategory('${p.category}'); return false;">${catLabel}</a>
      <i class="fas fa-chevron-right"></i>
      <span>${escapeHtml(p.title)}</span>
    </div>

    ${isStaff ? `
      <div class="staff-mod-bar">
        <span><i class="fas fa-shield-alt"></i> Staff view</span>
        <div>
          <button class="btn-sm" onclick="closeProductModal(); editListing('${p.id}', true)">Edit</button>
          <button class="btn-sm btn-sm-red" onclick="staffDeleteListing('${p.id}')">Delete Listing</button>
          ${p.status === 'active' ? `<button class="btn-sm" style="background:var(--gold-light);color:#92400E" onclick="staffMarkRemoved('${p.id}')">Remove from site</button>` : ''}
        </div>
      </div>` : ''}

    <div class="pdp-grid">
      <div class="pdp-left">
        <div class="pdp-gallery" id="pmGallery">
          ${renderGalleryImage(p)}
          ${p.images.length > 1 ? `
            <button class="pdp-nav pdp-prev" onclick="galleryNav(-1)" aria-label="Previous image"><i class="fas fa-chevron-left"></i></button>
            <button class="pdp-nav pdp-next" onclick="galleryNav(1)" aria-label="Next image"><i class="fas fa-chevron-right"></i></button>
            <div class="pdp-count"><span id="pmGalleryCount">1</span> / ${p.images.length}</div>` : ''}
        </div>
        ${p.images.length > 1 ? `
          <div class="pdp-thumbs" id="pdpThumbs">
            ${p.images.map((src, i) => `
              <button class="pdp-thumb ${i === 0 ? 'is-active' : ''}" onclick="galleryGoTo(${i})">
                <img src="${src}" alt="View ${i + 1}" loading="lazy">
              </button>`).join('')}
          </div>` : ''}

        <div class="pdp-card">
          <h3>Product Details</h3>

          ${specRows.length ? `
            <div class="pdp-spec-group">
              <div class="pdp-spec-group-title">${escapeHtml(catLabel)} specifications</div>
              <div class="pdp-specs pdp-specs-key">
                ${specRows.map(([k, v]) => `
                  <div class="pdp-spec pdp-spec-key">
                    <span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong>
                  </div>`).join('')}
              </div>
            </div>` : ''}

          <div class="pdp-spec-group">
            ${specRows.length ? `<div class="pdp-spec-group-title">Listing details</div>` : ''}
            <div class="pdp-specs">
              ${details.map(([k, v]) => `<div class="pdp-spec"><span>${escapeHtml(k)}</span><strong>${escapeHtml(String(v))}</strong></div>`).join('')}
            </div>
          </div>
        </div>

        ${p.description ? `
          <div class="pdp-card">
            <h3>Description</h3>
            <p class="pdp-desc">${escapeHtml(p.description)}</p>
          </div>` : ''}
      </div>

      <div class="pdp-right">
        <div class="pdp-pills">
          <span class="pdp-pill cond-${p.condition}">${condLabel} Condition</span>
          ${deal && deal.isGoodDeal ? '<span class="pdp-pill pdp-pill-deal">Good Deal</span>' : ''}
          ${p.negotiable ? '<span class="pdp-pill pdp-pill-neutral">Negotiable</span>' : ''}
          ${p.dealStage === 'reserved' ? '<span class="pdp-pill pdp-pill-reserved"><i class="fas fa-lock"></i> Reserved</span>'
            : p.dealStage === 'pending' ? '<span class="pdp-pill pdp-pill-reserved"><i class="fas fa-handshake"></i> Deal in progress</span>' : ''}
        </div>

        <h1 class="pdp-title">${escapeHtml(p.title)}</h1>

        <div class="pdp-price-row">
          <span class="pdp-price">₹${formatMoney(p.price)}</span>
          ${deal ? `<span class="pdp-was">₹${formatMoney(p.originalPrice)}</span>` : ''}
        </div>
        ${deal ? `<div class="pdp-save">You save ₹${formatMoney(deal.saving)}</div>` : ''}

        <div class="pdp-loc">
          <i class="fas fa-location-dot"></i>
          ${p.landmark || p.location || '—'}${p.pincode ? ` <span class="pdp-pin">${p.pincode}</span>` : ''}
        </div>

        ${isOwnListing ? `
          <div class="pdp-own"><i class="fas fa-circle-info"></i> ${p.dealStage === 'reserved' ? 'This is your listing. A buyer has locked a deal on it.'
            : p.dealStage === 'pending' ? 'This is your listing. A buyer is in a deal on it.' : 'This is your listing'}</div>
          <div class="pdp-actions">
            ${p.dealStage ? `<button class="pdp-btn pdp-btn-amber" onclick="openDealForProduct('${p.id}')"><i class="fas fa-handshake"></i> View deal</button>` : ''}
            <button class="pdp-btn pdp-btn-blue" onclick="closeProductModal(); editListing('${p.id}')"><i class="fas fa-pen"></i> Edit Listing</button>
          </div>` : `
          ${p.dealStage === 'reserved' ? `<div class="pdp-reserved-note"><i class="fas fa-lock"></i> Reserved: another buyer has locked a deal on this listing. You can still message the seller.</div>`
            : p.dealStage === 'pending' ? `<div class="pdp-reserved-note"><i class="fas fa-handshake"></i> Another buyer is in a deal on this listing (documents being checked). You can still message the seller.</div>` : ''}
          <div class="pdp-actions">
            ${p.emiEligible && !p.dealStage ? `<button class="pdp-btn pdp-btn-amber" onclick="openEmiForProduct('${p.id}')"><i class="fas fa-bolt"></i> Buy with EMI</button>` : ''}
            <button class="pdp-btn pdp-btn-blue" onclick="startChat('${p.id}')"><i class="fas fa-comment-dots"></i> Chat with Seller</button>
            <button class="pdp-icon-btn ${savedItems.has(p.id) ? 'is-saved' : ''}" data-save-id="${p.id}" aria-pressed="${savedItems.has(p.id)}" onclick="toggleSaveItem(event,'${p.id}')" aria-label="${savedItems.has(p.id) ? 'Remove from saved' : 'Save listing'}">
              <i class="fas fa-heart"></i>
            </button>
            <button class="pdp-icon-btn" onclick="shareListing('${p.id}')" aria-label="Share"><i class="fas fa-share-nodes"></i></button>
          </div>
          ${p.showPhone === 'yes' && p.sellerPhone ? `
            <button class="pdp-btn pdp-btn-ghost pdp-btn-wide" onclick="callSeller('${p.sellerPhone}')"><i class="fas fa-phone"></i> Call Seller</button>` : ''}`}

        <div class="pdp-seller">
          <div class="pdp-seller-top">
            <div class="pdp-seller-avatar">${sellerAvatarHtml}</div>
            <div class="pdp-seller-info">
              <div class="pdp-seller-name">${escapeHtml(p.sellerName)}</div>
              <div class="pdp-seller-meta" id="pdpSellerMeta">Listed ${daysLabel}</div>
            </div>
          </div>
          ${!isOwnListing ? `
            <div class="pdp-seller-actions">
              ${p.sellerId ? `<button class="pdp-btn pdp-btn-ghost pdp-btn-wide" onclick="openReportModal('${p.sellerId}','${p.id}')"><i class="fas fa-flag"></i> Report Seller</button>` : ''}
            </div>` : ''}
        </div>

        <div class="pdp-safety">
          <i class="fas fa-shield-halved"></i>
          Always meet in public places. Use DealBriz chat to keep your conversations safe.
        </div>
      </div>
    </div>

    <div class="pdp-similar" id="pdpSimilar"></div>`;

  loadSellerMeta(p.sellerId);
  loadSimilarProducts(p);
}


/* Seller context, fetched separately so the modal renders immediately.
   Only shows facts we actually store — no ratings or verification badges,
   because there's no data behind them yet. */
async function loadSellerMeta(sellerId) {
  if (!sellerId) return;
  try {
    const u = await db.getProfileById(sellerId);
    const el = document.getElementById('pdpSellerMeta');
    if (!el || !u) return;
    const bits = [];
    if (u.created_at) {
      const d = new Date(u.created_at);
      bits.push(`Member since ${d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`);
    }
    if (u.city) bits.push(u.city);
    if (bits.length) el.textContent = bits.join(' · ');
  } catch { /* keep the fallback text already rendered */ }
}

async function loadSimilarProducts(p) {
  const wrap = document.getElementById('pdpSimilar');
  if (!wrap) return;
  try {
    const { items } = await db.getProducts({ category: p.category, page: 1, perPage: 5 });
    const similar = items.map(normalizeListing).filter(x => x.id !== p.id).slice(0, 4);
    if (!similar.length) return;
    wrap.innerHTML = `
      <div class="pdp-similar-head">
        <h3>Similar Products</h3>
        <button class="pdp-viewall" onclick="closeProductModal(); browseCategory('${p.category}')">View All <i class="fas fa-arrow-right"></i></button>
      </div>
      <div class="pdp-similar-grid">${similar.map(createListingCard).join('')}</div>`;
  } catch { /* similar products are a nicety — silence is better than an error box */ }
}

async function shareListing(id) {
  const url = `${location.origin}${location.pathname}#listing-${id}`;
  const title = currentProduct ? currentProduct.title : 'DealBriz listing';
  try {
    if (navigator.share) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard.', 'success');
  } catch { /* user dismissed the share sheet — nothing to report */ }
}

function renderGalleryImage(p) {
  if (p.images.length === 0) {
    return `<div class="pm-img-placeholder">${getCatEmoji(p.category)}</div>`;
  }
  // Clicking opens the lightbox: the gallery box crops with object-fit:cover,
  // so anything near the edge of a tall or wide photo is cut off here.
  return `<img src="${p.images[currentGalleryIndex]}" alt="${escapeHtml(p.title)}" class="pdp-zoomable" onclick="openLightbox(currentGalleryIndex)" title="Click to view full image" onerror="this.parentElement.innerHTML='<div class=pm-img-placeholder>${getCatEmoji(p.category)}</div>'">`;
}


/* ===== IMAGE LIGHTBOX ===== */
/* Photos are cropped to fill the gallery box, so a full-frame view is the
   only way to see the whole picture. Goes through pushModal/closeTopModal
   like every other overlay, which is what stops Back from skipping past the
   listing straight to Home. */
let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(index = 0) {
  const imgs = (currentProduct && currentProduct.images) || [];
  if (!imgs.length) return;
  lightboxImages = imgs;
  lightboxIndex = Math.max(0, Math.min(index, imgs.length - 1));

  const many = imgs.length > 1;
  document.querySelector('.lightbox-prev')?.classList.toggle('hidden', !many);
  document.querySelector('.lightbox-next')?.classList.toggle('hidden', !many);
  document.getElementById('lightboxCount')?.classList.toggle('hidden', !many);

  updateLightbox();
  document.getElementById('imageLightbox').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal('lightbox');
}

function updateLightbox() {
  const img = document.getElementById('lightboxImg');
  if (img) {
    img.src = lightboxImages[lightboxIndex];
    img.alt = `Image ${lightboxIndex + 1} of ${lightboxImages.length}`;
  }
  const count = document.getElementById('lightboxCount');
  if (count) count.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
}

function lightboxNav(direction) {
  if (lightboxImages.length <= 1) return;
  const total = lightboxImages.length;
  lightboxIndex = (lightboxIndex + direction + total) % total;
  updateLightbox();
  // Keep the listing's own gallery in step, so closing the lightbox does not
  // snap the page back to a different photo than the one just viewed.
  currentGalleryIndex = lightboxIndex;
  updateGalleryDisplay();
}

function closeLightbox(fromPopstate = false) {
  if (fromPopstate) { hideModal('lightbox'); return; }
  closeTopModal('lightbox');
}

function galleryNav(direction) {
  if (!currentProduct || currentProduct.images.length <= 1) return;
  const total = currentProduct.images.length;
  currentGalleryIndex = (currentGalleryIndex + direction + total) % total;
  updateGalleryDisplay();
}

function galleryGoTo(index) {
  currentGalleryIndex = index;
  updateGalleryDisplay();
}

function updateGalleryDisplay() {
  const gallery = document.getElementById('pmGallery');
  if (!gallery || !currentProduct) return;
  const imgEl = gallery.querySelector('img, .pm-img-placeholder');
  if (imgEl) imgEl.outerHTML = renderGalleryImage(currentProduct);
  const countEl = document.getElementById('pmGalleryCount');
  if (countEl) countEl.textContent = currentGalleryIndex + 1;
  document.querySelectorAll('.pdp-thumb').forEach((t, i) => {
    t.classList.toggle('is-active', i === currentGalleryIndex);
  });
  // keep the active thumbnail in view when there are many images
  const active = document.querySelector('.pdp-thumb.is-active');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function staffDeleteListing(id) {
  if (!confirm('Permanently delete this listing from the database? This cannot be undone.')) return;
  try {
    await db.adminDeleteProduct(id);
    showToast('Listing permanently deleted.', 'success');
    closeProductModal();
    if (currentPage === 'buy') applyBuyFilters();
  } catch (err) { showToast(err.message || 'Could not delete listing.', 'error'); }
}

async function staffMarkRemoved(id) {
  if (!confirm('Remove this listing from the site? It will no longer appear in search or browsing.')) return;
  try {
    await db.adminUpdateProduct(id, { status: 'removed' });
    showToast('Listing removed from site.', 'success');
    closeProductModal();
    if (currentPage === 'buy') applyBuyFilters();
  } catch (err) { showToast(err.message || 'Could not remove listing.', 'error'); }
}

function closeProductModal(fromPopstate = false) {
  if (fromPopstate) { hideModal('product'); return; }
  closeTopModal('product');
}

function callSeller(phone) {
  if (!currentUser) { pendingAction = null; openModal(); return; }
  window.location.href = `tel:${phone}`;
}

/* ===== CHAT ===== */
let chatPollInterval = null;

async function startChat(listingId) {
  if (!currentUser) {
    pendingAction = () => startChat(listingId);
    openModal();
    return;
  }
  const p = await getListingById(listingId);
  if (!p) return;
  if (!p.sellerId) {
    showToast('This listing has no seller information. Cannot start chat.', 'error');
    return;
  }
  if (p.sellerId === currentUser.id) {
    showToast("This is your own listing.", 'info');
    return;
  }
  await openChatWindow({
    listingId,
    otherPartyId: p.sellerId,
    otherPartyName: p.sellerName || 'Seller',
    otherPartyAvatar: p.sellerAvatar || '',
    productTitle: p.title
  });
}

/* Shared chat-window opener — used both when a buyer starts a new chat
   and when either party reopens an existing conversation from My Chats.
   Deliberately has NO "own listing" guard: a seller must be able to open
   and reply to conversations about their own listings. */

/* ===== CHAT: seller vs buyer context ===== */

/* True when the signed-in user posted this listing. Asks the server rather
   than trusting anything the caller passed in — the inbox opens chats for
   both sides through the same function, and getting this backwards would
   show a seller the buyer's prompts. */
/* Who posted the listing a chat is about, or null when there is no listing
   or it can't be loaded (deleted). Decides whether I am the seller here,
   and whether the other person is. */
async function listingOwnerId(listingId) {
  if (!listingId) return null;
  try {
    const p = await db.getProductById(listingId);
    return (p && (p.sellerId || p.posted_by)) || null;
  } catch { return null; }
}

async function isMyListing(listingId) {
  if (!listingId || !currentUser) return false;
  const owner = await listingOwnerId(listingId);
  return !!owner && owner === currentUser.id;
}

function chatNoticeText(iAmSeller) {
  return iAmSeller
    ? 'All chats are monitored for your safety. Never share OTPs, and take payment only after you have the buyer in front of you.'
    : 'All chats are monitored for your safety. Never share OTPs or payment outside DealBriz.';
}

/* A seller is answering questions, not asking them. */
const CHAT_QUICK_BUYER = [
  ['Still available?', 'Is this still available?'],
  ['Best price?', 'What is your best price?'],
  ['See today?', 'Can I see it today?'],
];
const CHAT_QUICK_SELLER = [
  ['Yes, available', 'Yes, it is still available.'],
  ['Price is firm', 'The price is as listed.'],
  ['When suits you?', 'When would you like to come and see it?'],
];

function renderChatQuickMsgs(iAmSeller) {
  const box = document.getElementById('chatQuickMsgs');
  if (!box) return;
  const opts = iAmSeller ? CHAT_QUICK_SELLER : CHAT_QUICK_BUYER;
  box.innerHTML = opts.map(([label, text]) =>
    `<button onclick="sendQuickMsg('${escapeHtml(text).replace(/'/g, "\\'")}')">${escapeHtml(label)}</button>`
  ).join('');
}

/* Opens the listing this conversation is about, on top of the chat, so
   closing it returns to the same conversation rather than the feed. */
async function openChatListing() {
  const id = currentChatConversation && currentChatConversation.listingId;
  if (!id) return;
  // Collapse to a bubble first. Opening the listing on top left the chat
  // sitting behind it, visible through the edges and impossible to reach —
  // it looked stuck. Minimising keeps the conversation one tap away instead.
  minimiseChat();
  try {
    await openListing(id);
  } catch {
    showToast('This listing is no longer available.', 'info');
  }
}

/* ===== CHAT MINIMISE =====
   Hides the chat panel and shows a bubble that restores it. The conversation
   itself is untouched — currentChatConversation and the poll interval keep
   running, so restoring is instant and no messages are missed. */
let chatMinimised = false;

function minimiseChat() {
  if (!currentChatConversation) return;
  chatMinimised = true;
  document.getElementById('chatModal')?.classList.add('is-minimised');
  const bubble = document.getElementById('chatMiniBubble');
  if (bubble) {
    bubble.classList.remove('hidden');
    const name = document.getElementById('chatSellerName')?.textContent || 'Chat';
    bubble.querySelector('.chat-mini-name').textContent = name;
  }
}

function restoreChat() {
  chatMinimised = false;
  document.getElementById('chatModal')?.classList.remove('is-minimised');
  document.getElementById('chatMiniBubble')?.classList.add('hidden');
  // If a listing is open on top, close it so the chat is actually reachable
  // rather than restored underneath it.
  if (modalStack[modalStack.length - 1] === 'product') closeTopModal('product');
  const log = document.getElementById('chatMessages');
  if (log) log.scrollTop = log.scrollHeight;
}

/* Shows the other party's profile: who they are, when they joined, where
   they're based, and how many listings they have. A buyer deciding whether
   to meet a stranger should not have to leave the conversation to find out
   anything about them. */
/* Opens a panel about the other party, with Report as an action on it.
   Only shows what /api/users/<id> returns — that endpoint deliberately
   withholds email and phone, and this must not imply otherwise. */
async function showChatPartyInfo() {
  const c = currentChatConversation;
  if (!c || !c.sellerId) return;

  const box = document.getElementById('partyInfoModal');
  document.getElementById('partyInfoRows').innerHTML =
    `<div class="party-info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  box.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal('partyInfo');

  try {
    const u = await db.getProfileById(c.sellerId);
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'This user';
    const joined = u.created_at
      ? new Date(u.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      : null;

    document.getElementById('partyInfoAvatar').src =
      u.avatar_url || initialsAvatar(name, 96);
    document.getElementById('partyInfoName').textContent = name;
    document.getElementById('partyInfoMeta').textContent =
      joined ? `Member since ${joined}` : 'DealBriz member';

    const rows = [
      u.city ? ['fa-location-dot', 'Location', u.city] : null,
      joined ? ['fa-calendar-check', 'Joined', joined] : null,
      c.productTitle ? ['fa-box-open', 'This chat is about', c.productTitle] : null,
    ].filter(Boolean);

    document.getElementById('partyInfoRows').innerHTML = rows.map(([icon, label, value]) =>
      `<div class="party-info-row">
         <i class="fas ${icon}"></i>
         <span class="party-info-label">${escapeHtml(label)}</span>
         <span class="party-info-value">${escapeHtml(String(value))}</span>
       </div>`).join('');

    // Reporting yourself is meaningless, so hide the button on your own chats.
    const reportBtn = document.getElementById('partyInfoReportBtn');
    if (reportBtn) {
      reportBtn.classList.toggle('hidden', c.sellerId === currentUser?.id);
      reportBtn.innerHTML = `<i class="fas fa-flag"></i> ${c.otherIsSeller ? 'Report Seller' : 'Report User'}`;
    }
  } catch {
    document.getElementById('partyInfoRows').innerHTML =
      `<div class="party-info-loading">Could not load this profile.</div>`;
  }
}

function closePartyInfo(fromPopstate = false) {
  if (fromPopstate) { hideModal('partyInfo'); return; }
  closeTopModal('partyInfo');
}

/* Closes the info panel before opening the report form, so the two don't
   stack — the report modal would otherwise sit on top of a panel the user
   can't see behind it. */
function reportFromChat() {
  const c = currentChatConversation;
  if (!c || !c.sellerId) return;
  closePartyInfo();
  openReportModal(c.sellerId, c.listingId || null, c.otherIsSeller ? 'seller' : 'user');
}

async function openChatWindow({ listingId, otherPartyId, otherPartyName, otherPartyAvatar, productTitle }) {
  if (!currentUser) {
    pendingAction = () => openChatWindow({ listingId, otherPartyId, otherPartyName, otherPartyAvatar, productTitle });
    openModal();
    return;
  }

  const initial = otherPartyName ? otherPartyName.charAt(0).toUpperCase() : 'U';
  document.getElementById('chatSellerName').textContent = otherPartyName || 'User';
  document.getElementById('chatProductTitle').textContent = productTitle || 'Listing';
  document.getElementById('chatSellerAvatar').innerHTML = otherPartyAvatar
    ? `<img src="${otherPartyAvatar}" alt="${otherPartyName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : initial;

  // Whether *this* user owns the listing decides both the suggested
  // openers and the wording of the safety notice: telling a seller not to
  // pay outside the platform is advice for the wrong side of the deal.
  const ownerId = currentUser ? await listingOwnerId(listingId) : null;
  const iAmSeller = !!ownerId && ownerId === currentUser.id;
  // "Report seller" only when the other person is the one selling this
  // listing. A buyer (or anyone, when the listing is gone) is reported as a
  // user. NOTE: sellerId below is the OTHER person in the chat, whichever
  // side they are on.
  const otherIsSeller = !!ownerId && ownerId === otherPartyId;
  currentChatConversation = { listingId, sellerId: otherPartyId, productTitle, iAmSeller, otherIsSeller };
  renderChatQuickMsgs(iAmSeller);
  // DealLock: clear the previous conversation's deal bar (deals.js).
  if (typeof dealsOnChatOpen === 'function') dealsOnChatOpen();

  const viewBtn = document.getElementById('chatViewListing');
  if (viewBtn) viewBtn.classList.toggle('hidden', !listingId);

  document.getElementById('chatMessages').innerHTML = `
    <div class="chat-notice"><i class="fas fa-shield-alt"></i> ${chatNoticeText(iAmSeller)}</div>
    <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>`;

  // Deliberately NOT closing the product modal: chat opens ON TOP of the
  // listing you were viewing, so it's still there when you close chat.
  document.getElementById('chatModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal('chat');

  await loadChatMessages();
  db.markMessagesRead(listingId, otherPartyId).then(refreshNavBadges).catch(() => {});
  // The inbox list is drawn from a separate fetch, so marking read on the
  // server left its per-row unread dot showing until the page was reloaded.
  markConversationReadLocally(listingId, otherPartyId);

  clearInterval(chatPollInterval);
  chatPollInterval = setInterval(async () => {
    if (document.getElementById('chatModal').classList.contains('hidden')) {
      clearInterval(chatPollInterval);
      return;
    }
    await loadChatMessages();
    // refreshNavBadges here as well as on open. Messages arriving WHILE the
    // chat is open were marked read but the dot was left to the 60s nav
    // poll, so it sat there for up to a minute on a conversation the user
    // was actively reading.
    db.markMessagesRead(listingId, otherPartyId).then(refreshNavBadges).catch(() => {});
  }, 4000);
}

async function loadChatMessages() {
  if (!currentChatConversation) return;
  try {
    const msgs = await db.getConversationMessages(currentChatConversation.listingId, currentChatConversation.sellerId);
    const container = document.getElementById('chatMessages');
    const notice = `<div class="chat-notice"><i class="fas fa-shield-alt"></i> All chats are monitored for your safety. Never share OTPs or payment outside DealBriz.</div>`;

    if (msgs.length === 0) {
      container.innerHTML = notice + `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Say hello to start the conversation!</div>`;
      if (typeof dealsAfterChatRender === 'function') dealsAfterChatRender(msgs);
      return;
    }

    const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    container.innerHTML = notice + msgs.map(m => {
      const isSent = m.sender_id === currentUser.id;
      const time = new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      // DealLock offer cards and system lines (deals.js). Plain messages,
      // and everything if deals.js isn't loaded, draw as before.
      const special = typeof renderDealChatMessage === 'function' ? renderDealChatMessage(m, isSent, time) : '';
      if (special) return special;
      return `<div class="chat-msg ${isSent ? 'sent' : 'received'}"><div>${escapeHtml(m.body)}</div><div class="chat-msg-time">${time}</div></div>`;
    }).join('');

    if (wasNearBottom) container.scrollTop = container.scrollHeight;
    if (typeof dealsAfterChatRender === 'function') dealsAfterChatRender(msgs);
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

function closeChatModal(fromPopstate = false) {
  if (fromPopstate) { hideModal('chat'); return; }
  closeTopModal('chat');
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !currentChatConversation) return;
  input.value = '';
  try {
    await db.sendMessage({
      productId: currentChatConversation.listingId,
      receiverId: currentChatConversation.sellerId,
      body: text
    });
    await loadChatMessages();
  } catch (err) {
    console.error('Send message failed:', err);
    showToast(`Message failed: ${err.message || 'unknown error'}`, 'error');
    input.value = text;
  }
}

async function sendQuickMsg(text) {
  if (!currentChatConversation) return;
  try {
    await db.sendMessage({
      productId: currentChatConversation.listingId,
      receiverId: currentChatConversation.sellerId,
      body: text
    });
    await loadChatMessages();
  } catch (err) {
    console.error('Send message failed:', err);
    showToast(`Message failed: ${err.message || 'unknown error'}`, 'error');
  }
}


/* The inbox's data, held at module scope rather than inside renderMyChats()
   so opening a conversation can clear its unread dot without refetching the
   whole list. */
let myConversations = [];

/* Marks one conversation read in the cached list and repaints the inbox if
   it is on screen. Runs alongside the server call so the dot clears
   immediately instead of waiting for a reload. */
function markConversationReadLocally(productId, otherUserId) {
  let changed = false;
  myConversations.forEach(c => {
    if (c.product_id === productId && c.otherUserId === otherUserId && !c.is_read) {
      c.is_read = true;
      changed = true;
    }
  });
  if (changed && currentPage === 'mychats') renderChatListItems();
}

async function renderMyChats() {
  const el = document.getElementById('myChatsContent');
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading chats...</div>`;

  try {
    myConversations = await db.getMyConversations();
  } catch (err) {
    console.error('Failed to load conversations:', err);
    myConversations = [];
  }
  renderChatListItems();
}

/* Draws the inbox from myConversations. Split out from the fetch above so a
   single row can be repainted without a round trip. */
function renderChatListItems() {
  const el = document.getElementById('myChatsContent');
  if (!el) return;
  const conversations = myConversations;

  if (conversations.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>No chats yet</h3><p>Start a chat by clicking "Chat with Seller" on any listing</p><button class="btn-primary" onclick="showPage('buy')">Browse Listings</button></div>`;
    return;
  }

  el.innerHTML = conversations.map(c => {
    const name = c.otherUserProfile ? `${c.otherUserProfile.first_name} ${c.otherUserProfile.last_name}`.trim() : 'User';
    const avatar = c.otherUserProfile?.avatar_url;
    const initial = name.charAt(0).toUpperCase() || 'U';
    // The API field is is_read — reading c.read gave undefined, so every
    // received conversation looked permanently unread.
    const isUnread = !c.is_read && c.receiver_id === currentUser.id;
    const timeAgo = formatTimeAgo(c.created_at);
    const productTitle = c.products?.title || 'Listing';
    return `
      <div class="chat-list-item" onclick="openConversation('${c.product_id}','${c.otherUserId}')">
        <div class="chat-list-avatar">${avatar ? `<img src="${avatar}" alt="${name}">` : initial}</div>
        <div class="chat-list-info">
          <div class="chat-list-name">${name}</div>
          <div class="chat-list-product">${productTitle}</div>
          <div class="chat-list-last">${escapeHtml(c.body)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="chat-list-time">${timeAgo}</div>
          ${isUnread ? '<div class="chat-unread">•</div>' : ''}
        </div>
      </div>`;
  }).join('');
}

async function openConversation(productId, otherUserId) {
  const p = await getListingById(productId);
  if (p) {
    // Figure out whether "otherUserId" is the seller (if I'm the buyer)
    // or the buyer (if I'm the seller viewing my own listing's chat).
    const otherIsSeller = p.sellerId === otherUserId;
    let otherName = otherIsSeller ? (p.sellerName || 'Seller') : null;
    let otherAvatar = otherIsSeller ? (p.sellerAvatar || '') : '';

    if (!otherIsSeller) {
      // otherUserId is a buyer — look up their profile for name/avatar
      try {
        const profile = await db.getProfileById(otherUserId);
        otherName = profile ? `${escapeHtml(profile.first_name)} ${escapeHtml(profile.last_name)}`.trim() : 'Buyer';
        otherAvatar = profile?.avatar_url || '';
      } catch {
        otherName = 'Buyer';
      }
    }

    await openChatWindow({
      listingId: productId,
      otherPartyId: otherUserId,
      otherPartyName: otherName,
      otherPartyAvatar: otherAvatar,
      productTitle: p.title
    });
    return;
  }

  // Listing might be sold/removed but conversation history should still open
  try {
    const profile = await db.getProfileById(otherUserId);
    const name = profile ? `${escapeHtml(profile.first_name)} ${escapeHtml(profile.last_name)}`.trim() : 'User';
    await openChatWindow({
      listingId: productId,
      otherPartyId: otherUserId,
      otherPartyName: name,
      otherPartyAvatar: profile?.avatar_url || '',
      productTitle: 'Listing no longer available'
    });
  } catch (err) {
    showToast('Could not open conversation.', 'error');
  }
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ===== NAVBAR BADGES: NOTIFICATIONS + CHAT ===== */

// One timer for the whole app, holding the id so a second call to
// startNavBadgePolling() (re-login without a page reload) replaces the old
// interval instead of stacking a second one on top of it.
let navBadgeInterval = null;
let notifCache = [];

// 60s. The chat window already polls its own thread every 4s while open, so
// this only has to catch messages that arrive while the user is elsewhere.
// Faster would multiply DB load across every open tab for a dot that does
// not become more useful for being 30 seconds fresher.
const NAV_BADGE_POLL_MS = 60000;

function startNavBadgePolling() {
  stopNavBadgePolling();
  refreshNavBadges();
  navBadgeInterval = setInterval(refreshNavBadges, NAV_BADGE_POLL_MS);
}

function stopNavBadgePolling() {
  if (navBadgeInterval) clearInterval(navBadgeInterval);
  navBadgeInterval = null;
  setNavDot('navNotifDot', 0);
  setNavDot('navChatDot', 0);
}

function setNavDot(id, count) {
  document.getElementById(id)?.classList.toggle('hidden', !count);
}

// Never surfaces its own failure. A dead poll (offline, migration not yet
// applied, session expired mid-idle) means the dot is stale, which is worth
// far less than a toast firing every 60 seconds on a page the user is trying
// to read. Real failures still land in the console and error-logger.
async function refreshNavBadges() {
  if (!currentUser) { stopNavBadgePolling(); return; }
  try {
    const s = await db.getNotificationSummary();
    setNavDot('navNotifDot', s.notifications);
    setNavDot('navChatDot', s.chats);
  } catch (err) {
    console.warn('Badge refresh failed:', err);
  }
  // DealLock: the buyer's "seller confirmed your deal" popup (deals.js).
  if (typeof dealsCheckBuyerNotices === 'function') dealsCheckBuyerNotices();
}

// Chat button. showPage() already gates 'mychats' through PROTECTED, which
// stores pendingAction and opens the login modal, so a signed-out click lands
// on the chats page by itself once login succeeds - no separate auth branch.
function openChatsFromNav() {
  closeNotifPanel();
  showPage('mychats');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;

  if (!currentUser) {
    // Resume into the panel after login, matching how the chat button
    // resumes into the chats page.
    pendingAction = () => toggleNotifPanel();
    showToast('Please login to continue', 'info');
    openModal();
    return;
  }

  const opening = panel.classList.contains('hidden');
  document.getElementById('userMenu')?.classList.add('hidden');
  panel.classList.toggle('hidden', !opening);
  if (opening) loadNotifications();
}

function closeNotifPanel() {
  document.getElementById('notifPanel')?.classList.add('hidden');
}

async function loadNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;
  list.innerHTML = '<div class="notif-empty">Loading...</div>';
  try {
    notifCache = await db.getNotifications();
    renderNotifications();
  } catch (err) {
    console.warn('Notification load failed:', err);
    list.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
  }
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;

  if (!notifCache.length) {
    list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><span>No notifications yet</span></div>';
    return;
  }

  const icons = { emi: 'fa-file-invoice-dollar', chat: 'fa-comment-dots', listing: 'fa-tag', system: 'fa-circle-info' };

  // Every interpolated value below is server-stored text that ultimately
  // originated from a form, so all of it goes through escapeHtml - the same
  // rule that closed the 35 XSS holes in the template literals elsewhere in
  // this file.
  list.innerHTML = notifCache.map(n => `
    <button type="button" class="notif-item ${n.is_read ? '' : 'is-unread'}" onclick="openNotification('${escapeHtml(n.id)}')">
      <span class="notif-icon notif-icon-${escapeHtml(n.kind)}"><i class="fas ${icons[n.kind] || icons.system}"></i></span>
      <span class="notif-body">
        <strong>${escapeHtml(n.title)}</strong>
        ${n.body ? `<small>${escapeHtml(n.body)}</small>` : ''}
        <em>${escapeHtml(formatTimeAgo(n.created_at))}</em>
      </span>
    </button>
  `).join('');
}

async function openNotification(id) {
  const n = notifCache.find(x => x.id === id);
  if (!n) return;

  // Mark read locally first so the row updates immediately, then persist.
  // A failed write leaves it read in this session only and the next poll
  // corrects it - preferable to the row staying visibly unread after a tap.
  if (!n.is_read) {
    n.is_read = true;
    renderNotifications();
    db.markNotificationsRead(id).then(refreshNavBadges).catch(() => {});
  }

  closeNotifPanel();
  // Staff DealLock notices ("Payout needed", "Dispute"...) open the admin
  // Deals section. showPage('admin') alone shows an empty panel shell.
  if (n.link_page === 'admin' && typeof openAdminDeals === 'function') { openAdminDeals(n); return; }
  if (n.link_page) showPage(n.link_page);
}

async function markAllNotificationsRead() {
  try {
    await db.markNotificationsRead();
    notifCache.forEach(n => { n.is_read = true; });
    renderNotifications();
    refreshNavBadges();
  } catch {
    showToast('Could not mark notifications read.', 'error');
  }
}

/* ===== SELL ===== */
function startSell() {
  if (!currentUser) {
    pendingAction = () => showPage('sell');
    showToast('Please login to post an ad', 'info');
    openModal();
    return;
  }
  editingListingId = null;
  editingViaAdmin = false;
  resetSellForm();
  setSellFormMode('create');
  showPage('sell');
}

/* Pre-fills the Sell form with an existing listing's data and switches it
   into edit mode. viaAdmin=true means this was launched from the admin
   panel (any listing, not just the user's own) and should save through
   the admin edit endpoint instead of the owner one. */
async function editListing(id, viaAdmin = false) {
  const cache = viaAdmin ? null : myListingsCache;
  let p = cache ? cache.find(x => x.id === id) : null;
  if (!p) p = await getListingById(id);
  if (!p) { showToast('Could not load listing to edit.', 'error'); return; }

  editingListingId = id;
  editingViaAdmin = viaAdmin;
  // Where to go back to. Editing is always reached FROM a listing, so both
  // the back arrow and the browser Back button should return to that listing
  // rather than to whatever page happened to be underneath the modal.
  editReturnListingId = id;
  resetSellForm();

  selectedSellCat = p.category;
  document.querySelectorAll('.sell-cat-item').forEach(i => i.classList.toggle('selected', i.dataset.cat === p.category));
  // Awaited: renderSellAttributes fetches the field definitions, and without
  // awaiting it the code below could finish before the inputs exist.
  renderBrandSuggestions(p.category);
  await renderSellAttributes(p.category, p.attributes || {});

  document.getElementById('sellTitle').value = p.title || '';
  document.getElementById('sellDesc').value = p.description || '';
  document.getElementById('sellCondition').value = p.condition || '';
  document.getElementById('sellBrand').value = p.brand || '';
  document.getElementById('sellModel').value = p.model || '';
  document.getElementById('sellPrice').value = p.price || '';
  document.getElementById('sellPincode').value = p.pincode || '';
  document.getElementById('sellLandmark').value = p.landmark || '';
  document.getElementById('sellNegotiable').checked = !!p.negotiable;
  document.getElementById('sellEmiEligible').checked = !!p.emiEligible;
  document.getElementById('sellShowPhone').value = p.showPhone || 'chat_only';
  // Was never restored, so an edit silently offered to re-feature a listing
  // that is already featured.
  const feat = document.getElementById('sellFeature');
  if (feat) feat.checked = !!p.isFeatured;

  sellPhotos = (p.images || []).map(url => ({ url, existing: true }));
  renderPhotoGrid();

  setSellFormMode('edit');
  showPage('sell');
  // DealLock: the listing's documents, uploaded straight from here.
  if (typeof sellDocsLoadForEdit === 'function') await sellDocsLoadForEdit(id, viaAdmin);
}

function setSellFormMode(mode) {
  const title = document.getElementById('sellPageTitle');
  const btn = document.querySelector('.sell-submit-btn');
  if (title) title.textContent = mode === 'edit' ? 'Edit Your Ad' : 'Post Your Ad';
  if (btn) btn.innerHTML = mode === 'edit'
    ? '<i class="fas fa-save"></i> Save Changes'
    : '<i class="fas fa-upload"></i> Save & Post Ad';
}

function resetSellForm() {
  sellPhotos = [];
  selectedSellCat = '';
  const attrBox = document.getElementById('sellAttributes');
  if (attrBox) attrBox.innerHTML = '';
  document.querySelectorAll('.sell-cat-item').forEach(i => i.classList.remove('selected'));
  ['sellTitle','sellDesc','sellBrand','sellModel','sellPincode','sellLandmark','sellPrice'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('sellCondition').value = '';
  document.getElementById('sellNegotiable').checked = false;
  document.getElementById('sellEmiEligible').checked = false;
  const featureCb = document.getElementById('sellFeature');
  if (featureCb) featureCb.checked = false;
  document.getElementById('sellShowPhone').value = 'chat_only';
  document.getElementById('pincodeResult').textContent = '';
  renderPhotoGrid();
  if (typeof sellDocsReset === 'function') sellDocsReset();
}


/* ===== BRAND SUGGESTIONS BY CATEGORY =====
   Rendered into a <datalist>, not a <select>, on purpose: this is a
   second-hand marketplace, and a fixed dropdown would block anyone selling a
   brand not on the list. The datalist offers the common ones while leaving
   the field free text.

   Deliberately not read from existing listings the way search's brand
   vocabulary is — with a handful of listings that list would be nearly
   empty, which is exactly when a seller most needs the prompt. */
const CATEGORY_BRANDS = {
  cars: ['Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Honda', 'Toyota', 'Kia',
         'Renault', 'Volkswagen', 'Skoda', 'Ford', 'MG', 'Nissan', 'Jeep',
         'BMW', 'Mercedes-Benz', 'Audi', 'Volvo'],
  bikes: ['Hero', 'Honda', 'Bajaj', 'TVS', 'Royal Enfield', 'Yamaha', 'Suzuki',
          'KTM', 'Jawa', 'Ola Electric', 'Ather', 'Kawasaki', 'Harley-Davidson'],
  phones: ['Samsung', 'Apple', 'Xiaomi', 'Redmi', 'Realme', 'OnePlus', 'Vivo',
           'Oppo', 'Poco', 'Motorola', 'Nothing', 'Google', 'iQOO', 'Infinix', 'Tecno'],
  electronics: ['HP', 'Dell', 'Lenovo', 'Asus', 'Acer', 'Apple', 'MSI', 'Sony',
                'LG', 'Samsung', 'Canon', 'Nikon', 'JBL', 'boAt', 'Logitech'],
  appliances: ['LG', 'Samsung', 'Whirlpool', 'Godrej', 'Voltas', 'Haier', 'IFB',
               'Bosch', 'Panasonic', 'Blue Star', 'Hitachi', 'Philips', 'Prestige', 'Bajaj'],
  furniture: ['IKEA', 'Godrej Interio', 'Nilkamal', 'Pepperfry', 'Urban Ladder',
              'Durian', 'Sleepwell', 'Wakefit', 'HomeTown', 'Damro'],
  fashion: ['Nike', 'Adidas', 'Puma', 'Levi\'s', 'H&M', 'Zara', 'Uniqlo', 'US Polo Assn',
            'Allen Solly', 'Peter England', 'Woodland', 'Bata', 'Titan', 'Fastrack'],
  property: [],
  others: [],
};

/* Fills the brand field's datalist for the chosen category. Property gets no
   list — "brand" is meaningless for a flat — so the field is relabelled to
   something that is (the builder or society name). */
function renderBrandSuggestions(cat) {
  const list = document.getElementById('sellBrand_menu');
  const input = document.getElementById('sellBrand');
  const label = document.getElementById('sellBrandLabel');
  if (!list || !input) return;

  const brands = CATEGORY_BRANDS[cat] || [];
  // this.textContent, not the value inlined into the onclick: escapeHtml
  // turns the apostrophe in "Levi's" into &#39;, which the browser decodes
  // back to ' before JS parses the attribute — breaking the call. Reading
  // the button's own text sidesteps quoting entirely.
  list.innerHTML = brands.map(b =>
    `<button type="button" class="combo-opt" onclick="pickComboValue('sellBrand', this.textContent)">${escapeHtml(b)}</button>`
  ).join('');
  if (!brands.length) list.classList.add('hidden');

  if (cat === 'property') {
    if (label) label.textContent = 'Builder / Society';
    input.placeholder = 'e.g. DLF, Omaxe';
  } else {
    if (label) label.textContent = 'Brand / Make';
    input.placeholder = brands.length
      ? `e.g. ${brands.slice(0, 3).join(', ')}`
      : 'e.g. Samsung, Honda, IKEA';
  }
}

function selectSellCat(el, cat) {
  document.querySelectorAll('.sell-cat-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  selectedSellCat = cat;
  renderSellAttributes(cat);
  renderBrandSuggestions(cat);
  // DealLock: a car or bike needs its documents (deals.js).
  if (typeof sellDocsRender === 'function') sellDocsRender();
}

function handlePhotoUpload(e) {
  const files = Array.from(e.target.files);
  const remaining = 5 - sellPhotos.length;
  const toAdd = files.slice(0, remaining);
  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      sellPhotos.push({ file, url: ev.target.result });
      renderPhotoGrid();
    };
    reader.readAsDataURL(file);
  });
  if (files.length > remaining) showToast(`Max 5 photos. Only ${remaining} added.`, 'info');
}

function renderPhotoGrid() {
  const grid = document.getElementById('photoGrid');
  const previews = sellPhotos.map((p, i) => `
    <div class="photo-preview">
      <img src="${p.url}" alt="Photo ${i+1}">
      <button class="photo-remove" onclick="removePhoto(${i})"><i class="fas fa-times"></i></button>
    </div>`).join('');
  const addBtn = sellPhotos.length < 5
    ? `<div class="photo-add-btn" onclick="document.getElementById('photoInput').click()"><i class="fas fa-camera"></i><span>Add</span></div>` : '';
  grid.innerHTML = previews + addBtn;
}

function removePhoto(i) {
  sellPhotos.splice(i, 1);
  renderPhotoGrid();
}

async function lookupPincode(val) {
  const result = document.getElementById('pincodeResult');
  if (val.length !== 6) { result.textContent = ''; return; }
  result.textContent = '📍 Looking up...';
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${val}`);
    const data = await res.json();
    if (data[0].Status === 'Success') {
      const { District, State } = data[0].PostOffice[0];
      result.textContent = `📍 ${District}, ${State}`;
      document.getElementById('sellLandmark').placeholder = `Near ${District} area`;
    } else { result.textContent = ''; }
  } catch { result.textContent = ''; }
}

/* True while a save is in flight. The submit button is disabled too, but
   only AFTER validation runs — a fast double-click (or Enter held down) can
   fire the second call before the first reaches that line, and both then
   run to completion. This flag is set on the very first statement, so the
   second call returns immediately. */
let sellSubmitInFlight = false;

async function handleSellSubmit() {
  if (sellSubmitInFlight) return;
  if (!currentUser) {
    pendingAction = () => handleSellSubmit();
    openModal();
    return;
  }
  const isEdit = !!editingListingId;
  const errEl = document.getElementById('sellError');
  const title = document.getElementById('sellTitle').value.trim();
  const desc = document.getElementById('sellDesc').value.trim();
  const condition = document.getElementById('sellCondition').value;
  const price = parseFloat(document.getElementById('sellPrice').value);
  const pincode = document.getElementById('sellPincode').value.trim();

  if (!selectedSellCat) { showAuthError(errEl, 'Please select a category.'); return; }
  if (!title) { showAuthError(errEl, 'Please enter a title.'); return; }
  if (!desc) { showAuthError(errEl, 'Please add a description.'); return; }
  if (!condition) { showAuthError(errEl, 'Please select item condition.'); return; }
  if (!price || price <= 0) { showAuthError(errEl, 'Please enter a valid price.'); return; }
  if (!pincode || pincode.length !== 6) { showAuthError(errEl, 'Please enter a valid 6-digit pincode.'); return; }
  // DealLock: posting a car or bike needs the loan answer and every
  // vehicle document (they upload right after the ad is saved).
  const docsProblem = (!isEdit && typeof sellDocsProblem === 'function') ? sellDocsProblem() : null;
  if (docsProblem) { showAuthError(errEl, docsProblem); document.getElementById('sellDocs')?.scrollIntoView({ block: 'center' }); return; }
  // DealLock: 3 locked deals cancelled in a row pause new listings for a
  // while. Checked here so no photos are uploaded for nothing; the server
  // refuses the listing anyway.
  if (!isEdit && currentUser.dealBanUntil && new Date(currentUser.dealBanUntil) > new Date()) {
    const until = new Date(currentUser.dealBanUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const limit = (typeof dealRulesCache !== 'undefined' && dealRulesCache && dealRulesCache.cancel_limit) || 3;
    showAuthError(errEl, `You force-cancelled ${limit} deals in a row, so you can't post new listings until ${until}.`);
    return;
  }
  errEl.classList.add('hidden');

  const submitBtn = document.querySelector('.sell-submit-btn');
  sellSubmitInFlight = true;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isEdit ? 'Saving...' : 'Posting...'}`;
  let created = null;

  try {
    let imageUrl = null;
    let extraImages = [];

    if (sellPhotos.length > 0) {
      const toUpload = sellPhotos.filter(p => !p.existing);
      if (toUpload.length > 0) {
        showToast(`Uploading ${toUpload.length} photo${toUpload.length > 1 ? 's' : ''}...`, 'info');
      }
      const uploadedUrls = [];

      for (let i = 0; i < sellPhotos.length; i++) {
        const p = sellPhotos[i];
        if (p.existing) { uploadedUrls.push(p.url); continue; }
        try {
          const url = await db.uploadProductImage(p.file);
          uploadedUrls.push(url);
        } catch (imgErr) {
          console.error(`Photo ${i + 1} upload exception:`, imgErr);
        }
      }

      if (uploadedUrls.length === 0 && toUpload.length > 0) {
        showToast('Photo upload failed. Posting ad without new photos.', 'error');
      } else if (uploadedUrls.length < sellPhotos.length) {
        showToast(`Only ${uploadedUrls.length} of ${sellPhotos.length} photos saved.`, 'error');
      }

      imageUrl = uploadedUrls[0] || null;
      extraImages = uploadedUrls.slice(1);
    }

    const payload = {
      title,
      category: selectedSellCat,
      condition,
      price,
      location: document.getElementById('pincodeResult').textContent.replace('📍 ', '') || pincode,
      city: pincode,
      ai_description: desc,
      ai_image_url: imageUrl,
      extra_images: extraImages,
      emi_eligible: document.getElementById('sellEmiEligible').checked,
      negotiable: document.getElementById('sellNegotiable').checked,
      brand: document.getElementById('sellBrand').value.trim(),
      model: document.getElementById('sellModel').value.trim(),
      attributes: collectSellAttributes(),
      landmark: document.getElementById('sellLandmark').value.trim(),
      show_phone: document.getElementById('sellShowPhone').value
    };
    if (!isEdit && typeof sellDocsLoanAnswer === 'function') {
      const had = sellDocsLoanAnswer();
      if (had !== null) payload.vehicle_had_loan = had;
    }

    if (isEdit) {
      if (editingViaAdmin) await db.adminUpdateProduct(editingListingId, payload);
      else await db.updateMyListing(editingListingId, payload);
    } else {
      created = await db.createProduct({
        ...payload,
        original_price: null, fb_link: '',
        seller_phone: currentUser.phone || '',
        seller_name: `${currentUser.name} ${currentUser.lastName || ''}`.trim(),
        seller_avatar: currentUser.avatarUrl || '',
        posted_by: currentUser.id,
        status: 'active'
      });
    }

    // If the seller ticked "show at top", promote the listing they just
    // created. Done after creation because the listing needs an id first;
    // a failure here must not make a successful post look failed.
    // DealLock: the vehicle documents chosen in the form go up now that the
    // listing has an id. A failure doesn't undo the post: the seller adds
    // what's missing from My Listings, Edit listing.
    if (!isEdit && created && typeof sellDocsUploadAfterCreate === 'function') {
      await sellDocsUploadAfterCreate(created.id);
    }

    if (!isEdit && created && document.getElementById('sellFeature')?.checked) {
      try { await db.featureListing(created.id, '7d'); }
      catch (e) { console.warn('Promotion failed, listing still posted:', e); }
    }

    invalidateListingCache(editingListingId);
    // DealLock: a changed category can change which documents the listing needs.
    if (isEdit && typeof sellDocsLoadForEdit === 'function') sellDocsLoadForEdit(editingListingId, editingViaAdmin);

    // KEEP editingListingId after an edit. Clearing it here while leaving the
    // user on the same form meant the next click saw isEdit === false and
    // took the CREATE branch — so pressing Save twice on an edit published a
    // second copy of the listing, and three times published three. It is
    // cleared by startSell() when a genuinely new ad begins, and by
    // editListing() when a different listing is opened, which is where it
    // belongs.
    if (!isEdit) {
      editingListingId = null;
      editingViaAdmin = false;
      // The form is only emptied for a new post. After an edit it stays as
      // it is, showing what was just saved.
      resetSellForm();
      setSellFormMode('create');
    }

    await loadHomeStats();
    showToast(isEdit ? 'Listing updated!' : '🎉 Your ad is live!', 'success');
    // Saving an edit does NOT navigate. Opening the admin panel (or My
    // Listings) on save yanked the user somewhere they didn't ask to go, and
    // did it behind the page they were still looking at. Saving confirms and
    // stops; leaving is the back button's job, and that now returns to the
    // listing. Creating a new ad still navigates, because there is no page
    // to stay on — the form has just been emptied.
    if (!isEdit) {
      showPage('mylistings');
    }
  } catch (err) {
    console.error('Save ad failed:', err);
    const detail = err?.message || err?.error_description || JSON.stringify(err);
    showAuthError(errEl, `Failed to save ad: ${detail}`);
  } finally {
    sellSubmitInFlight = false;
    submitBtn.disabled = false;
    setSellFormMode(isEdit ? 'edit' : 'create');
  }
}

/* ===== MY LISTINGS ===== */
async function renderMyListings() {
  const el = document.getElementById('myListingsContent');
  if (!currentUser) return;
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading your listings...</div>`;

  try {
    myListingsCache = (await db.getMyListings()).map(normalizeListing);
  } catch (err) {
    console.error('Failed to load my listings:', err);
    myListingsCache = [];
  }

  if (myListingsCache.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-list"></i><h3>No listings yet</h3><p>Post your first item to sell</p><button class="btn-primary" onclick="startSell()">Post an Ad</button></div>`;
    return;
  }
  el.innerHTML = myListingsCache.map(p => `
    <div class="my-listing-card">
      <div class="my-listing-img">
        ${p.images.length ? `<img src="${p.images[0]}" alt="${escapeHtml(p.title)}">` : getCatEmoji(p.category)}
      </div>
      <div class="my-listing-info">
        <div class="listing-status-pill status-${p.status}">${p.status.charAt(0).toUpperCase()+p.status.slice(1)}</div>
        ${p.dealStage === 'pending' ? `<div class="featured-note"><i class="fas fa-handshake"></i> Deal in progress: waiting for confirmation or documents</div>` : ''}
        ${typeof ldBadgeHtml === 'function' ? ldBadgeHtml(p.docsState) : ''}
        <div class="my-listing-title">${escapeHtml(p.title)}</div>
        <div class="my-listing-price">₹${formatNum(p.price)}</div>
        <div class="my-listing-meta">${p.pincode} · ${p.views} views</div>
        ${p.isFeatured ? `<div class="featured-note"><i class="fas fa-bolt"></i> Showing at top until ${new Date(p.featuredUntil).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div>` : ''}
        <div class="my-listing-actions">
          <button class="btn-sm btn-sm-blue" onclick="openListing('${p.id}')">View</button>
          ${p.docsState === 'needed' && p.status !== 'sold' ? `<button class="btn-sm btn-sm-feature" onclick="dlGoToListingDocsFromMyListings('${p.id}')"><i class="fas fa-file-shield"></i> Add documents</button>` : ''}
          ${p.status === 'active' ? `<button class="btn-sm" onclick="editListing('${p.id}')">Edit</button>` : ''}
          ${p.status === 'active' && !p.dealStage ? (p.isFeatured
            ? `<button class="btn-sm btn-sm-feature is-on" onclick="openFeatureModal('${p.id}')"><i class="fas fa-bolt"></i> Extend</button>`
            : `<button class="btn-sm btn-sm-feature" onclick="openFeatureModal('${p.id}')"><i class="fas fa-bolt"></i> Show at Top</button>`) : ''}
          ${p.dealStage
            ? `<button class="btn-sm btn-sm-feature" onclick="openDealForProduct('${p.id}')"><i class="fas fa-handshake"></i> View deal</button>`
            : `<button class="btn-sm btn-sm-red" onclick="deleteListing('${p.id}')">Delete</button>`}
          ${p.status === 'active' && !p.dealStage ? `<button class="btn-sm" style="background:var(--gold-light);color:#92400E" onclick="markAsSold('${p.id}')">Mark Sold</button>` : ''}
          ${p.status === 'sold' ? `<button class="btn-sm" onclick="unmarkAsSold('${p.id}')"><i class="fas fa-rotate-left"></i> Relist</button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

async function deleteListing(id) {
  if (!confirm('Delete this listing?')) return;
  try {
    await db.updateMyListing(id, { status: 'removed' });
    await renderMyListings();
    showToast('Listing deleted.', 'info');
  } catch (err) { showToast(err.message || 'Could not delete listing.', 'error'); }
}

async function markAsSold(id) {
  const buyerEmail = prompt('Optional: enter the buyer\'s email to record them on this sale (leave blank to skip):', '');
  try {
    await db.sellMyListing(id, buyerEmail ? buyerEmail.trim() : '');
    await renderMyListings();
    showToast('Marked as sold! Purchase record saved.', 'success');
  } catch (err) { showToast(err.message || 'Could not update listing.', 'error'); }
}

/* Undoes an accidental "Mark Sold". Confirms first because it deletes the
   purchase record behind the sale, and warns that the listing goes public
   again — a seller who genuinely sold the item shouldn't relist it by
   accident from a button next to Delete. */
async function unmarkAsSold(id) {
  if (!confirm('Relist this item?\n\nIt goes back on sale and the sale record is removed.')) return;
  try {
    await db.unsellMyListing(id);
    await renderMyListings();
    showToast('Listing is active again.', 'success');
  } catch (err) {
    showToast(err.message || 'Could not relist this listing.', 'error');
  }
}

/* ===== REPORT A SELLER OR USER =====
   target 'seller' (from a listing, or a chat with the person selling it) or
   'user' (a buyer in the seller's chat). The server works out which it is
   from the listing, so this only changes the wording and the reasons. */
let reportTarget = null;

// Reasons that only make sense about the person selling the listing.
const SELLER_ONLY_REPORT_REASONS = ['fake_listing', 'counterfeit', 'prohibited_item'];

function openReportModal(sellerId, productId, target = 'seller') {
  const isSeller = target === 'seller';
  if (!currentUser) {
    pendingAction = () => openReportModal(sellerId, productId, target);
    showToast(isSeller ? 'Please login to report a seller' : 'Please login to report a user', 'info');
    openModal();
    return;
  }
  if (sellerId === currentUser.id) { showToast("You can't report yourself.", 'info'); return; }
  reportTarget = { sellerId, productId };
  document.getElementById('reportTitle').textContent = isSeller ? 'Report this seller' : 'Report this user';
  document.querySelectorAll('#reportReason option').forEach(o => {
    const hide = !isSeller && SELLER_ONLY_REPORT_REASONS.includes(o.value);
    o.hidden = hide;
    o.disabled = hide;
  });
  document.getElementById('reportReason').value = '';
  document.getElementById('reportDetails').value = '';
  document.getElementById('reportError').classList.add('hidden');
  document.getElementById('reportModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeReportModal() {
  document.getElementById('reportModal').classList.add('hidden');
  reportTarget = null;
  // The product modal may still be open underneath, so only restore scrolling
  // if nothing else is showing.
  if (document.getElementById('productModal').classList.contains('hidden')) {
    document.body.style.overflow = '';
  }
}

async function submitReport() {
  if (!reportTarget) return;
  const errEl = document.getElementById('reportError');
  const reason = document.getElementById('reportReason').value;
  if (!reason) { showAuthError(errEl, 'Please choose a reason.'); return; }
  errEl.classList.add('hidden');

  try {
    await db.submitReport({
      reportedUserId: reportTarget.sellerId,
      productId: reportTarget.productId,
      reason,
      details: document.getElementById('reportDetails').value.trim()
    });
    closeReportModal();
    showToast('Report submitted. Our team will review it.', 'success');
  } catch (err) {
    showAuthError(errEl, err.message || 'Could not submit report.');
  }
}

/* ===== SAVED ITEMS ===== */
async function loadSavedItems() {
  if (!currentUser) { savedItems = new Set(); savedProductsCache = []; return; }
  try {
    savedProductsCache = (await db.getSavedProducts()).map(normalizeListing);
    savedItems = new Set(savedProductsCache.map(p => p.id));
  } catch { savedItems = new Set(); savedProductsCache = []; }
}

/* Repaints every heart for one listing, wherever it currently is on screen.

   A listing can have two hearts visible at once — the card in the grid and
   the one inside the open product modal. Previously only the grid was
   repainted, and only on the buy/saved pages, so the modal's heart never
   changed colour until the modal was reopened. */
function syncSaveButtons(id) {
  const isSaved = savedItems.has(id);

  /* Every heart for this listing — the grid card, the detail view, and the
     saved-items page can all be showing the same item at once.

     The saved state is expressed purely by CSS colour on a SOLID heart.
     It used to swap between Font Awesome's `far` (outline) and `fas`
     (solid) styles, but `far` isn't present in every Font Awesome build,
     so on those the icon didn't visibly change and the tap looked ignored.
     Colour needs no webfont to have loaded. */
  document.querySelectorAll(`[data-save-id="${id}"]`).forEach(btn => {
    btn.classList.toggle('is-saved', isSaved);
    btn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
    btn.setAttribute('aria-label', isSaved ? 'Remove from saved' : 'Save listing');

    // Restart a short pop animation so the tap is acknowledged even when
    // the before/after colours are hard to tell apart at a glance.
    btn.classList.remove('heart-pop');
    void btn.offsetWidth;   // forces the animation to replay
    btn.classList.add('heart-pop');
  });
}

async function toggleSaveItem(e, id) {
  e.stopPropagation();
  if (!currentUser) { pendingAction = null; openModal(); return; }

  const wasSaved = savedItems.has(id);

  // Flip the local state and repaint FIRST, before the request. A heart is
  // a direct-manipulation control: waiting for a round trip makes the tap
  // feel broken even when it succeeds.
  if (wasSaved) {
    savedItems.delete(id);
    savedProductsCache = savedProductsCache.filter(p => p.id !== id);
  } else {
    savedItems.add(id);
  }
  syncSaveButtons(id);

  try {
    if (wasSaved) {
      await db.unsaveProduct(id);
      showToast('Removed from saved', 'info');
    } else {
      await db.saveProduct(id);
      const p = await getListingById(id);
      if (p) savedProductsCache.push(p);
      showToast('Saved!', 'success');
    }
  } catch {
    // Roll the optimistic change back so the heart can't show a state the
    // server rejected.
    if (wasSaved) savedItems.add(id); else savedItems.delete(id);
    syncSaveButtons(id);
    showToast('Could not update saved items.', 'error');
    await loadSavedItems();
  }

  // The saved page lists items, so removing one has to drop the whole card.
  if (currentPage === 'myads') renderSavedGridFromCache();
}

function renderBuyGridFromCache() {
  const grid = document.getElementById('buyListingsGrid');
  if (grid) grid.innerHTML = buyListings.map(p => createListingCard(p)).join('');
}

async function renderSavedPage() {
  const el = document.getElementById('savedContent');
  if (!currentUser) return;
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading saved items...</div>`;

  // Refetch rather than trusting the cache from login: a saved listing may
  // have been sold, edited, or deleted by its seller since then.
  await loadSavedItems();

  if (savedProductsCache.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-heart"></i><h3>No saved items</h3><p>Tap the heart on any listing to save it</p><button class="btn-primary" onclick="showPage('buy')">Browse Listings</button></div>`;
    return;
  }
  el.innerHTML = `<div class="listings-grid">${savedProductsCache.map(p => createListingCard(p)).join('')}</div>`;
  animateIn(el.firstElementChild, 'grid-enter');
}

function renderSavedGridFromCache() {
  const el = document.getElementById('savedContent');
  if (!el) return;
  if (savedProductsCache.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-heart"></i><h3>No saved items</h3><p>Tap the heart on any listing to save it</p><button class="btn-primary" onclick="showPage('buy')">Browse Listings</button></div>`;
    return;
  }
  el.innerHTML = `<div class="listings-grid">${savedProductsCache.map(p => createListingCard(p)).join('')}</div>`;
}

/* ===== EMI ===== */
async function openEmiForProduct(id) {
  // "Buy with EMI" stays visible on every EMI-eligible listing, whether or
  // not financing is currently switched on or covers this area. Hiding it
  // leaves a buyer with no explanation; showing it and explaining on tap
  // tells them what's actually going on.
  // Coverage decides, not the global switch — a covered pilot region works
  // even while EMI is hidden from the rest of the site.
  const available = await checkEmiAvailabilityForListing(id);
  if (!available.ok) {
    showEmiUnavailableModal(available.message
      ? available
      : { message: 'EMI financing isn\u2019t live yet. We\u2019re finalising our lending partners.' });
    return;
  }
  if (!currentUser) { pendingAction = () => openEmiForProduct(id); openModal(); return; }
  const p = await getListingById(id);
  if (!p) return;
  currentEmiProduct = p;
  document.getElementById('emiProductName').textContent = p.title;
  document.getElementById('emiPrice').textContent = '₹' + formatNum(p.price);
  document.getElementById('downPayment').value = '';
  calcEMI();
  // Deliberately NOT closing the product modal — same reasoning as chat:
  // EMI opens on top of the listing, which is still there once EMI closes.
  document.getElementById('emiModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal('emi');
}

function calcEMI() {
  if (!currentEmiProduct) return;
  const price = currentEmiProduct.price;
  const down = parseFloat(document.getElementById('downPayment').value) || 0;
  const tenure = parseInt(document.getElementById('emiTenure').value);
  const rate = parseFloat(document.getElementById('emiRate').value);
  const loan = Math.max(0, price - down);
  const mr = rate / 12 / 100;
  const emi = mr > 0 ? loan * mr * Math.pow(1+mr,tenure) / (Math.pow(1+mr,tenure)-1) : 0;
  document.getElementById('loanAmt').textContent = '₹' + formatNum(Math.round(loan));
  document.getElementById('monthlyEmi').textContent = '₹' + formatNum(Math.round(emi));
  document.getElementById('totalPay').textContent = '₹' + formatNum(Math.round(emi * tenure));
  document.getElementById('totalInt').textContent = '₹' + formatNum(Math.round(emi * tenure - loan));
}

function closeEmiModal(fromPopstate = false) {
  if (fromPopstate) { hideModal('emi'); return; }
  closeTopModal('emi');
}

async function submitEMI() {
  const msgEl = document.getElementById('emiFormMsg');
  const name = document.getElementById('emiFullName').value.trim();
  const phone = document.getElementById('emiPhone').value.trim();
  const income = document.getElementById('emiIncome').value.trim();
  if (!name || !phone || !income) { msgEl.textContent = 'Please fill all fields.'; msgEl.classList.remove('hidden'); return; }
  msgEl.classList.add('hidden');
  const down = parseFloat(document.getElementById('downPayment').value) || 0;
  const tenure = parseInt(document.getElementById('emiTenure').value);
  const rate = parseFloat(document.getElementById('emiRate').value);
  const loan = Math.max(0, currentEmiProduct.price - down);
  const mr = rate / 12 / 100;
  const emi = mr > 0 ? loan * mr * Math.pow(1+mr,tenure) / (Math.pow(1+mr,tenure)-1) : 0;
  try {
    await db.submitEmiApplication({
      product_id: currentEmiProduct.id, product_title_snapshot: currentEmiProduct.title,
      product_image_snapshot: currentEmiProduct.images[0] || null, product_price_snapshot: currentEmiProduct.price,
      down_payment: down, tenure_months: tenure, interest_rate: rate,
      loan_amount: Math.round(loan), monthly_emi: Math.round(emi),
      total_payable: Math.round(emi * tenure), applicant_name: name,
      applicant_phone: phone, applicant_income: parseFloat(income) || null, status: 'pending'
    });
    showToast('EMI application submitted!', 'success');
    closeEmiModal();
    ['emiFullName','emiPhone','emiIncome'].forEach(id => document.getElementById(id).value = '');
  } catch (err) { msgEl.textContent = 'Submission failed. Try again.'; msgEl.classList.remove('hidden'); }
}

async function renderEmiStatusPage() {
  const list = document.getElementById('emiAppsList');
  const none = document.getElementById('noEmiApps');
  let apps = [];
  try { apps = await db.getMyEmiApplications(); } catch { }
  document.getElementById('emiAppCount').textContent = `${apps.length} app${apps.length !== 1 ? 's' : ''}`;
  if (apps.length === 0) { list.innerHTML = ''; none.classList.remove('hidden'); return; }
  none.classList.add('hidden');
  const labels = EMI_STATUS_LABELS;
  const cls = EMI_STATUS_CLASS;
  list.innerHTML = apps.map(a => `
    <div class="emi-app-card">
      <div class="emi-app-img"><img src="${a.product_image_snapshot||''}" alt="" onerror="this.src=''"></div>
      <div class="emi-app-info">
        <div class="emi-app-title">${a.product_title_snapshot}</div>
        <div class="emi-app-meta">
          <span><i class="fas fa-calendar"></i> ${new Date(a.applied_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>
          <span><i class="fas fa-clock"></i> ${a.tenure_months} mo</span>
          <span><i class="fas fa-percent"></i> ${a.interest_rate}%</span>
        </div>
      </div>
      <div class="emi-app-status">
        <span class="status-pill ${cls[a.status]||'status-pending'}">${labels[a.status]||'Pending'}</span>
        <div class="emi-app-amount">₹${formatNum(a.monthly_emi)}/mo</div>
      </div>
    </div>`).join('');
}

/* ===== AUTH ===== */
function openModal(hint) {
  if (currentUser) return; // already logged in, nothing to do
  document.getElementById('authModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Wipe anything left from an abandoned attempt. The modal keeps its DOM
  // between openings, so without this a half-typed email and password sit
  // waiting for whoever opens it next — including on a shared machine.
  resetAuthForms();
  pushModal('auth');
}
function closeModal(fromPopstate = false) {
  if (fromPopstate) { hideModal('auth'); return; }
  closeTopModal('auth');
}
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  // The icon shows the CURRENT state, not the action the button performs:
  // an open eye means the password is visible, a struck-through eye means
  // it is masked. isHidden is the state BEFORE the toggle above, so after
  // it the password is visible exactly when isHidden was true.
  const nowVisible = isHidden;
  icon.classList.toggle('fa-eye', nowVisible);
  icon.classList.toggle('fa-eye-slash', !nowVisible);
  btn.setAttribute('aria-label', nowVisible ? 'Hide password' : 'Show password');
}

/* Clears the login and signup forms.
   Called from openModal(), from MODAL_HIDE.auth, and on bfcache restore --
   but it was never actually defined, so every one of those three call sites
   threw a ReferenceError.

   The damage was not the missing reset. MODAL_HIDE.auth hides the modal and
   THEN calls this, so the throw aborted hideModal() before it could pop the
   modal off modalStack or restore document.body.style.overflow. The modal
   vanished while the body stayed locked at overflow:hidden -- the page
   appeared to close the dialog and then refused to scroll. openModal() threw
   at the same point, so pushModal('auth') never ran either and Back could
   not close the modal.

   Uses optional chaining throughout: this runs during teardown, and a null
   element here would resurrect exactly the failure mode it is fixing. */
function resetAuthForms() {
  ['loginForm', 'signupForm'].forEach(id => {
    // #loginForm and #signupForm are <div>s, not <form>s, so .reset() does
    // not exist on them -- calling it would throw a TypeError and recreate
    // the exact freeze this function was missing for. Clear the fields.
    document.getElementById(id)?.querySelectorAll('input').forEach(el => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else {
        el.value = '';
        // Re-mask anything the eye toggle revealed, so a password is never
        // left visible for whoever opens the modal next.
        if (el.type === 'text' && el.id.toLowerCase().includes('password')) {
          el.type = 'password';
        }
      }
    });
  });
  // Put the eye icons back to the masked state to match the inputs above.
  document.querySelectorAll('#authModal .pw-toggle i').forEach(icon => {
    icon.classList.add('fa-eye-slash');
    icon.classList.remove('fa-eye');
  });
  clearAuthErrors();
}

function clearAuthErrors() {
  ['loginError','signupError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.textContent = ''; }
  });
}

/* ===== LEGAL PAGE FROM THE AUTH MODAL =====
   The Terms and Privacy links inside the signup form used to call
   openLegalPage() directly. That renders a PAGE, but #authModal sits at
   z-index 3400 — so the document opened behind the modal and looked like
   nothing happened.

   This closes the modal first, remembers which tab was open, and reopens it
   when the user leaves the document. Someone reading the terms mid-signup
   should come back to a form that still has their details in it, not to a
   blank page. */
/* Shows a legal document in a dialog stacked ON TOP of whatever is open,
   without navigating. Reached from the signup form's Terms/Privacy links.

   The earlier approach navigated to the legal page and restored the auth
   modal on the way back, which meant preserving a half-filled form across a
   page change. Not navigating removes that problem rather than managing it:
   the form is never unmounted, so nothing needs restoring. */
let legalPeekKey = null;

async function openLegalFromAuth(key) {
  legalPeekKey = key;

  document.getElementById('legalPeekTitle').textContent = DOC_PAGE_TITLES[key] || 'DealBriz';
  document.getElementById('legalPeekUpdated').textContent = '';
  const body = document.getElementById('legalPeekBody');
  body.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  body.scrollTop = 0;

  document.getElementById('legalPeekModal').classList.remove('hidden');
  pushModal('legalPeek');

  try {
    const doc = await db.getLegalDoc(key);
    document.getElementById('legalPeekTitle').textContent = doc.title || DOC_PAGE_TITLES[key] || 'DealBriz';
    document.getElementById('legalPeekUpdated').textContent = doc.updated_at
      ? `Last updated ${new Date(doc.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : '';
    // Same sanitiser the full page uses — this content is admin-editable.
    body.innerHTML = renderSafeMarkup(doc.content);
  } catch {
    body.innerHTML = `<p>Could not load this right now. You can read it on the full page instead.</p>`;
  }
}

function closeLegalPeek(fromPopstate = false) {
  if (fromPopstate) { hideModal('legalPeek'); return; }
  closeTopModal('legalPeek');
}

/* Escape hatch for anyone who wants the real page — closes the signup form
   too, since they are leaving it deliberately rather than glancing at a
   document mid-form. */
function openLegalFull() {
  const key = legalPeekKey;
  closeLegalPeek();
  closeModal();
  // Deferred so both modals finish popping their history entries before the
  // page navigation adds its own.
  setTimeout(() => openLegalPage(key), 0);
}

function switchTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('loginTab').classList.toggle('active', tab === 'login');
  document.getElementById('signupTab').classList.toggle('active', tab === 'signup');
  clearAuthErrors();
}

async function handleLogin() {
  const errEl = document.getElementById('loginError');
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPassword').value;
  if (!email || !pass) { showAuthError(errEl, 'Please enter email and password.'); return; }
  try {
    await db.logIn({ email, password: pass });
    await refreshCurrentUser();
    closeModal();
    showToast(`Welcome back, ${currentUser.name}!`, 'success');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    if (pendingAction) { const action = pendingAction; pendingAction = null; setTimeout(action, 100); }
  } catch (err) {
    const msg = err.message?.toLowerCase() || '';
    if (msg.includes('invalid login')) showAuthError(errEl, 'Incorrect email or password.');
    else if (msg.includes('not confirmed')) showAuthError(errEl, 'Please confirm your email first.');
    else showAuthError(errEl, err.message || 'Login failed.');
  }
}

async function handleSignup() {
  const errEl = document.getElementById('signupError');
  const firstName = document.getElementById('signupFirstName').value.trim();
  const lastName = document.getElementById('signupLastName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const phone = document.getElementById('signupPhone').value.trim();
  const pincode = document.getElementById('signupPincode').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirmPassword').value;
  if (!firstName||!lastName||!email||!phone||!pincode||!password||!confirm) { showAuthError(errEl,'Please fill all fields.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError(errEl,'Invalid email address.'); return; }
  if (!isValidIndianPhone(phone)) { showAuthError(errEl,'Enter a valid 10-digit mobile number.'); return; }
  // Checked before the account exists, not after: agreeing to the terms is
  // the condition of creating one.
  if (!document.getElementById('signupTerms')?.checked) {
    showAuthError(errEl, 'Please accept the Terms of Service and Privacy Policy to continue.');
    return;
  }
  if (pincode.length !== 6 || isNaN(pincode)) { showAuthError(errEl,'Enter a valid 6-digit pincode.'); return; }
  if (password.length < 8) { showAuthError(errEl,'Password must be at least 8 characters.'); return; }
  if (password !== confirm) { showAuthError(errEl,'Passwords do not match.'); return; }
  try {
    await db.signUp({ firstName, lastName, email, phone, city: pincode, password });
    showToast('Account created! Please log in.', 'success');
    ['signupFirstName','signupLastName','signupEmail','signupPhone','signupPincode','signupPassword','signupConfirmPassword'].forEach(id => document.getElementById(id).value = '');
    const terms = document.getElementById('signupTerms');
    if (terms) terms.checked = false;
    switchTab('login');
    document.getElementById('loginEmail').value = email;
  } catch (err) {
    if (err.message?.toLowerCase().includes('already registered')) showAuthError(errEl,'Email already registered. Please login.');
    else showAuthError(errEl, err.message || 'Signup failed.');
  }
}

async function handleLogout() {
  try { await db.logOut(); } catch {}
  currentUser = null; savedItems = new Set();
  updateUserUIAfterLogout();
  showToast('Logged out.', 'info');
  showPage('home');
}

function showAuthError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('loginNavBtn').classList.add('hidden');
  document.getElementById('userAvatar').classList.remove('hidden');
  const avatarSrc = avatarSrcFor(currentUser);   // drawn locally, cannot fail to load
  document.getElementById('userAvatarImg').src = avatarSrc;
  document.getElementById('userMenuAvatar').src = avatarSrc;
  document.getElementById('userMenuName').textContent = `${currentUser.name} ${currentUser.lastName || ''}`.trim();
  document.getElementById('userMenuEmail').textContent = currentUser.email;

  const roles = currentUser.roles || [];
  document.getElementById('navStaffBadge').classList.toggle('hidden', roles.length === 0);
  document.getElementById('userMenuAdminLink').classList.toggle('hidden', !currentUser.hasPanel);
  renderRoleBadges('userMenuRoleBadges', roles);
  startNavBadgePolling();
}

function renderRoleBadges(containerId, roles) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!roles || roles.length === 0) { el.innerHTML = ''; return; }
  const icons = { superadmin: 'fa-crown', admin: 'fa-shield-alt', manager: 'fa-user-tie', dev: 'fa-terminal', merchant: 'fa-store', lender: 'fa-building-columns' };
  el.innerHTML = roles.map(r => `<span class="role-badge-pill role-badge-${r}"><i class="fas ${icons[r] || 'fa-user'}"></i> ${r}</span>`).join('');
}

function updateUserUIAfterLogout() {
  document.getElementById('userAvatar').classList.add('hidden');
  document.getElementById('loginNavBtn').classList.remove('hidden');
  document.getElementById('userMenu').classList.add('hidden');
  // Clears both dots as well as the timer, so the previous user's unread
  // state does not linger in the navbar after they sign out.
  stopNavBadgePolling();
  closeNotifPanel();
  notifCache = [];
}
function toggleUserMenu() { document.getElementById('userMenu').classList.toggle('hidden'); }

/* ===== PROFILE ===== */
async function renderProfilePage() {
  if (!currentUser) return;
  document.getElementById('profilePageAvatar').src = avatarSrcFor(currentUser);
  document.getElementById('profileSidebarName').textContent = `${currentUser.name} ${currentUser.lastName||''}`.trim();
  document.getElementById('profileSidebarEmail').textContent = currentUser.email;
  renderRoleBadges('profileRoleBadges', currentUser.roles || []);
  document.getElementById('profileFirstName').value = currentUser.name || '';
  document.getElementById('profileLastName').value = currentUser.lastName || '';
  document.getElementById('profileEmail').value = currentUser.email;
  document.getElementById('profilePhone').value = currentUser.phone || '';
  document.getElementById('profilePincode').value = currentUser.pincode || '';
  document.getElementById('statSavedCount').textContent = savedItems.size;
  try {
    myListingsCache = (await db.getMyListings()).map(normalizeListing);
    document.getElementById('statListingsCount').textContent = myListingsCache.length;
  } catch { document.getElementById('statListingsCount').textContent = '0'; }
  try {
    const apps = await db.getMyEmiApplications();
    document.getElementById('statEmiCount').textContent = apps.length;
  } catch {}
  if (currentUser.createdAt) {
    document.getElementById('statMemberSince').textContent = new Date(currentUser.createdAt).toLocaleDateString('en-IN',{month:'short',year:'numeric'});
  }
  switchProfileTab('details');
}

function switchProfileTab(tab) {
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.profile-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('profileTab-'+tab).classList.remove('hidden');
  const idx = {details:0,security:1,stats:2}[tab];
  document.querySelectorAll('.profile-nav-btn')[idx].classList.add('active');
}
function hideProfileMsg(id) { const el=document.getElementById(id); el.classList.add('hidden'); el.className='profile-msg hidden'; }
function showProfileMsg(id,msg,type) { const el=document.getElementById(id); el.textContent=msg; el.className=`profile-msg ${type==='success'?'success-msg':'error-msg'}`; el.classList.remove('hidden'); }

async function saveProfileDetails() {
  const fn=document.getElementById('profileFirstName').value.trim();
  const ln=document.getElementById('profileLastName').value.trim();
  const ph=document.getElementById('profilePhone').value.trim();
  const pc=document.getElementById('profilePincode').value.trim();
  if(!fn||!ln||!ph||!pc){showProfileMsg('profileDetailsMsg','Please fill all fields.','error');return;}
  if(!isValidIndianPhone(ph)){showProfileMsg('profileDetailsMsg','Enter a valid 10-digit mobile number.','error');return;}
  if(pc.length!==6||isNaN(pc)){showProfileMsg('profileDetailsMsg','Enter a valid 6-digit pincode.','error');return;}

  // Saying "Profile updated!" when nothing changed is a small lie that makes
  // the message meaningless — after a while nobody reads it, including when
  // it matters. Compare against what is already stored and say so instead.
  const unchanged =
    fn === (currentUser.name || '') &&
    ln === (currentUser.lastName || '') &&
    ph === (currentUser.phone || '') &&
    pc === (currentUser.pincode || '');
  if (unchanged) { showProfileMsg('profileDetailsMsg','No changes to save.','error'); return; }

  try {
    await db.updateProfile({first_name:fn,last_name:ln,phone:ph,city:pc});
    currentUser.name=fn; currentUser.lastName=ln; currentUser.phone=ph; currentUser.pincode=pc;
    updateUserUI(); showProfileMsg('profileDetailsMsg','Profile updated!','success');
    document.getElementById('profileSidebarName').textContent=`${fn} ${ln}`;
  } catch { showProfileMsg('profileDetailsMsg','Update failed. Try again.','error'); }
}

async function changePassword() {
  const cur=document.getElementById('currentPassword').value;
  const np=document.getElementById('newPassword').value;
  const cf=document.getElementById('confirmNewPassword').value;
  if(!cur||!np||!cf){showProfileMsg('profileSecurityMsg','Please fill all fields.','error');return;}
  if(np.length<8){showProfileMsg('profileSecurityMsg','New password must be 8+ characters.','error');return;}
  if(np!==cf){showProfileMsg('profileSecurityMsg','Passwords do not match.','error');return;}
  try {
    await db.changePassword(cur, np);
    showProfileMsg('profileSecurityMsg','Password updated!','success');
    ['currentPassword','newPassword','confirmNewPassword'].forEach(id=>document.getElementById(id).value='');
  } catch { showProfileMsg('profileSecurityMsg','Current password is incorrect.','error'); }
}

/* ===== PROFILE PICTURE =====

   Fallback avatar is drawn locally as an inline SVG rather than fetched from
   ui-avatars.com. The external call was the reason the picture showed as a
   broken image: if that host is slow, blocked, or offline, there is nothing
   to render and the alt text shows through. A data URI cannot fail. */
function initialsAvatar(name, size = 200) {
  const initials = (name || '?')
    .trim().split(/\s+/).slice(0, 2)
    .map(w => w[0] || '').join('').toUpperCase() || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="100%" height="100%" fill="#2563EB"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" ` +
    `font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" ` +
    `font-size="${Math.round(size * 0.4)}" font-weight="700">${initials}</text></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function avatarSrcFor(user) {
  return user?.avatarUrl || initialsAvatar(`${user?.name || ''} ${user?.lastName || ''}`);
}

function toggleAvatarMenu(ev) {
  ev?.stopPropagation();
  const menu = document.getElementById('avatarMenu');
  if (!menu) return;
  // "Remove" only makes sense when there is a picture to remove.
  document.getElementById('avatarRemoveBtn')?.classList.toggle('hidden', !currentUser?.avatarUrl);
  menu.classList.toggle('hidden');
}

function pickAvatar(source) {
  document.getElementById('avatarMenu')?.classList.add('hidden');

  if (source === 'camera') {
    // Live capture needs getUserMedia, which browsers only expose on HTTPS
    // (or localhost). On plain HTTP the API is simply absent, so fall back
    // to the file input's capture attribute — that hands off to the phone's
    // own camera app and still works. Desktop on HTTP has no camera route
    // at all, so say so rather than opening an empty file picker.
    const canStream = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
                      && window.isSecureContext;
    if (canStream) { openCamera(); return; }

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const input = document.getElementById('avatarCameraInput');
      if (input) { input.value = ''; input.click(); }
      return;
    }
    showToast('Camera needs a secure (https) connection. Choose a file instead.', 'info');
    return;
  }

  const input = document.getElementById('avatarInput');
  if (input) { input.value = ''; input.click(); }   // reset so re-picking the same file still fires change
}

/* ===== LIVE CAMERA =====
   Streams the camera into a <video>, then draws a frame to a canvas on
   capture and hands that straight to the existing cropper — so a photo taken
   here gets the same reposition-and-zoom step as one chosen from disk. */
let cameraStream = null;
let cameraFacing = 'user';   // front camera by default; this is a profile picture

async function openCamera() {
  const modal = document.getElementById('cameraModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal('camera');
  await startCameraStream();
}

async function startCameraStream() {
  const video = document.getElementById('cameraVideo');
  const hint = document.getElementById('cameraHint');
  stopCameraStream();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacing, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = cameraStream;
    hint.textContent = 'Line yourself up, then take the shot.';

    // Only offer Flip when there is more than one camera to flip to.
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      document.getElementById('cameraFlipBtn')?.classList.toggle('hidden', cams.length < 2);
    } catch { /* device listing is optional */ }
  } catch (err) {
    // Distinguish "you said no" from "there isn't one" — the fixes differ.
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    hint.textContent = denied
      ? 'Camera access was blocked. Allow it in your browser settings, or choose a file instead.'
      : 'No camera available on this device.';
    document.getElementById('cameraShootBtn').disabled = true;
  }
}

/* Releasing the tracks is what turns the camera light off. Skipping this
   leaves the camera live after the dialog closes. */
function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

async function flipCamera() {
  cameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
  await startCameraStream();
}

function closeCamera(fromPopstate = false) {
  document.getElementById('cameraShootBtn').disabled = false;
  if (fromPopstate) { hideModal('camera'); return; }
  closeTopModal('camera');
}

function captureCameraPhoto() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.videoWidth) { showToast('Camera is not ready yet.', 'info'); return; }

  // Grab the largest centred square the frame allows, so the cropper starts
  // from something already close to the final shape.
  const side = Math.min(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d');

  if (cameraFacing === 'user') {
    // Front cameras show a mirrored preview. Saving it unmirrored would look
    // wrong to the person who just posed for it, so match what they saw.
    ctx.translate(side, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video,
    (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side,
    0, 0, side, side);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const img = new Image();
  img.onload = () => {
    closeCamera();                 // stops the stream
    openAvatarCrop(img);           // same adjust step as a file from disk
  };
  img.onerror = () => showToast('Could not capture that photo.', 'error');
  img.src = dataUrl;
}

async function removeAvatar() {
  document.getElementById('avatarMenu')?.classList.add('hidden');
  if (!confirm('Remove your profile picture?')) return;
  try {
    await db.removeAvatar();
    currentUser.avatarUrl = null;
    document.getElementById('profilePageAvatar').src = avatarSrcFor(currentUser);
    updateUserUI();
    showToast('Profile picture removed.', 'success');
  } catch (err) {
    showToast(err.message || 'Could not remove picture.', 'error');
  }
}

/* ---- Cropper ----
   Pan and zoom over a fixed 320px square, exported at 512px. State lives in
   these three variables; the canvas is redrawn from them on every change. */
const AVATAR_STAGE = 320;
const AVATAR_OUTPUT = 512;
let cropImage = null;
let cropOffset = { x: 0, y: 0 };
let cropDrag = null;

function handleAvatarPicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please choose an image.', 'error'); return; }
  // 10MB in, 512px JPEG out — the limit is about not reading a huge file into
  // memory, not about what gets uploaded.
  if (file.size > 10 * 1024 * 1024) { showToast('Image must be under 10MB.', 'error'); return; }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => openAvatarCrop(img);
    img.onerror = () => showToast('That image could not be read.', 'error');
    img.src = reader.result;
  };
  reader.onerror = () => showToast('That image could not be read.', 'error');
  reader.readAsDataURL(file);
}

function openAvatarCrop(img) {
  cropImage = img;
  cropOffset = { x: 0, y: 0 };
  document.getElementById('avatarZoom').value = 1;
  document.getElementById('avatarCropModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal('avatarCrop');
  drawAvatarCrop();
}

function closeAvatarCrop(fromPopstate = false) {
  if (fromPopstate) { hideModal('avatarCrop'); return; }
  closeTopModal('avatarCrop');
}

/* Scale so the SHORTER side fills the square at zoom 1 — the standard
   "cover" fit. Scaling to the longer side would leave empty corners. */
function cropBaseScale() {
  if (!cropImage) return 1;
  return Math.max(AVATAR_STAGE / cropImage.width, AVATAR_STAGE / cropImage.height);
}

function clampCropOffset(scale) {
  const w = cropImage.width * scale;
  const h = cropImage.height * scale;
  const maxX = Math.max(0, (w - AVATAR_STAGE) / 2);
  const maxY = Math.max(0, (h - AVATAR_STAGE) / 2);
  cropOffset.x = Math.min(maxX, Math.max(-maxX, cropOffset.x));
  cropOffset.y = Math.min(maxY, Math.max(-maxY, cropOffset.y));
}

function drawAvatarCrop() {
  const canvas = document.getElementById('avatarCropCanvas');
  if (!canvas || !cropImage) return;
  const ctx = canvas.getContext('2d');
  const zoom = parseFloat(document.getElementById('avatarZoom').value) || 1;
  const scale = cropBaseScale() * zoom;

  clampCropOffset(scale);

  const w = cropImage.width * scale;
  const h = cropImage.height * scale;
  ctx.clearRect(0, 0, AVATAR_STAGE, AVATAR_STAGE);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, AVATAR_STAGE, AVATAR_STAGE);
  ctx.drawImage(cropImage,
    (AVATAR_STAGE - w) / 2 + cropOffset.x,
    (AVATAR_STAGE - h) / 2 + cropOffset.y,
    w, h);
}

function startCropDrag(e) {
  if (!cropImage) return;
  const p = e.touches ? e.touches[0] : e;
  cropDrag = { x: p.clientX, y: p.clientY };
  e.preventDefault();
}

function moveCropDrag(e) {
  if (!cropDrag) return;
  const p = e.touches ? e.touches[0] : e;
  cropOffset.x += p.clientX - cropDrag.x;
  cropOffset.y += p.clientY - cropDrag.y;
  cropDrag = { x: p.clientX, y: p.clientY };
  drawAvatarCrop();
  e.preventDefault();
}

function endCropDrag() { cropDrag = null; }

async function saveAvatarCrop() {
  if (!cropImage) return;
  const btn = document.getElementById('avatarCropSave');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Re-render at output size rather than upscaling the 320px preview,
    // so the saved picture keeps the original's detail.
    const out = document.createElement('canvas');
    out.width = out.height = AVATAR_OUTPUT;
    const ctx = out.getContext('2d');
    const zoom = parseFloat(document.getElementById('avatarZoom').value) || 1;
    const ratio = AVATAR_OUTPUT / AVATAR_STAGE;
    const scale = cropBaseScale() * zoom * ratio;
    const w = cropImage.width * scale;
    const h = cropImage.height * scale;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, AVATAR_OUTPUT, AVATAR_OUTPUT);
    ctx.drawImage(cropImage,
      (AVATAR_OUTPUT - w) / 2 + cropOffset.x * ratio,
      (AVATAR_OUTPUT - h) / 2 + cropOffset.y * ratio,
      w, h);

    const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) throw new Error('Could not process that image.');
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

    const url = await db.uploadAvatar(file);
    currentUser.avatarUrl = url;
    document.getElementById('profilePageAvatar').src = url;
    updateUserUI();
    closeAvatarCrop();
    showToast('Profile picture updated.', 'success');
  } catch (err) {
    showToast(err.message || 'Upload failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save picture';
  }
}

/* ===== ADMIN ===== */
/* fromUrl: restoring /admin after a reload, so the browser already has the
   history entry and showPage must not push another. */
async function openAdminPanel(fromUrl = false) {
  showPage('admin', fromUrl === true);
  if (currentUser?.hasPanel) {
    document.getElementById('adminLoginBox').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    adminFillSidebarUser();
    // Land on the first section this role can actually see: a manager has
    // no Site Settings, and a dashboard-less role shouldn't open a blank panel.
    const firstVisible = applyAdminPermissions();
    if (firstVisible && !userSections().includes(currentAdminSection)) {
      currentAdminSection = firstVisible;
    }
    adminSwitchSection(currentAdminSection);
    renderAdminDashboard();
  } else {
    document.getElementById('adminLoginBox').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
  }
}
async function handleAdminLogin() {
  const errEl=document.getElementById('adminLoginError');
  const email=document.getElementById('adminEmail').value.trim();
  const pass=document.getElementById('adminPassword').value;
  if(!email||!pass){errEl.textContent='Enter email and password.';errEl.classList.remove('hidden');return;}
  try {
    await db.logIn({email,password:pass});
    await refreshCurrentUser();
    if(!currentUser?.hasPanel){await db.logOut();currentUser=null;errEl.textContent='No admin access.';errEl.classList.remove('hidden');return;}
    errEl.classList.add('hidden');
    // Same landing as opening the panel while signed in: the sidebar shows
    // only this role's sections, starting with the first one it can use.
    await openAdminPanel(); showToast('Welcome!','success');
  } catch { errEl.textContent='Invalid credentials.'; errEl.classList.remove('hidden'); }
}
async function adminLogout() { await handleLogout(); }
let adminStatusFilter='all', adminEmiApps=[], adminShowArchived=false;

async function renderAdminDashboard() {
  try { adminEmiApps=await db.getAllEmiApplications(adminShowArchived); } catch { adminEmiApps=[]; }
  document.getElementById('adminStatTotal').textContent=adminEmiApps.length;
  document.getElementById('adminStatPending').textContent=adminEmiApps.filter(a=>a.status==='pending').length;
  document.getElementById('adminStatApproved').textContent=adminEmiApps.filter(a=>a.status==='approved').length;
  document.getElementById('adminStatRejected').textContent=adminEmiApps.filter(a=>a.status==='rejected').length;
  // Only live exposure — settled/cancelled loans no longer inflate this.
  const activeValue=adminEmiApps
    .filter(a=>EMI_ACTIVE.includes(a.status))
    .reduce((s,a)=>s+(Number(a.loan_amount)||0),0);
  document.getElementById('adminStatLoanValue').textContent='₹'+formatNum(activeValue);
  // Only render into whichever section is actually visible — no point
  // rebuilding the EMI table's DOM (or the charts) when it's hidden.
  if (currentAdminSection === 'emi') renderAdminTable();
  if (currentAdminSection === 'dashboard') renderAdminDashboardCharts();
}

function adminFilterStatus(status) {
  adminStatusFilter=status;
  adminResetPage('emi');
  // Scope to status buttons only — the section tabs (Users/Products/...) share
  // the .admin-filter-btn class, and an unscoped selector would strip their
  // active highlight too.
  document.querySelectorAll('.admin-filter-btn[data-status]').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.admin-filter-btn[data-status="${status}"]`)?.classList.add('active');
  renderAdminTable();
}

async function adminToggleArchived() {
  adminShowArchived=!adminShowArchived;
  adminResetPage('emi');
  const btn=document.getElementById('adminArchivedToggle');
  if(btn){
    btn.classList.toggle('active',adminShowArchived);
    btn.innerHTML=adminShowArchived
      ? '<i class="fas fa-box-open"></i> Hide Archived'
      : '<i class="fas fa-box-archive"></i> Show Archived';
  }
  await renderAdminDashboard();
}

ADMIN_TABLE_RERENDER.emi = renderAdminTable;

function adminEmiFilterChanged() { adminResetPage('emi'); renderAdminTable(); }

function renderAdminTable() {
  const byStatus = adminStatusFilter==='all' ? adminEmiApps : adminEmiApps.filter(a=>a.status===adminStatusFilter);
  const q = document.getElementById('adminEmiSearch')?.value || '';
  const filtered = byStatus.filter(a => adminMatches(q, a.product_title_snapshot, a.applicant_name, a.applicant_phone));
  const apps = adminPaginate('emi', filtered);

  const tbody=document.getElementById('adminTableBody');
  const noApps=document.getElementById('adminNoApps');
  const countEl = document.getElementById('adminEmiCount');
  if (countEl) countEl.textContent = `${filtered.length} of ${byStatus.length}`;
  if(filtered.length===0){tbody.innerHTML='';noApps.classList.remove('hidden');return;}
  noApps.classList.add('hidden');

  const canDelete=!!currentUser?.isSuperadmin;

  tbody.innerHTML=apps.map(a=>{
    const options=Object.entries(EMI_STATUS_LABELS)
      .map(([v,l])=>`<option value="${v}" ${a.status===v?'selected':''}>${l}</option>`).join('');
    const canArchive=EMI_TERMINAL.includes(a.status);
    // A hard delete would strip the agreed loan terms off a completed sale,
    // so it's refused server-side when a purchase references this row.
    const deleteBtn=canDelete
      ? (a.has_purchase
          ? `<button class="btn-sm" disabled title="Linked to a completed purchase — archive instead">Delete</button>`
          : `<button class="btn-sm btn-sm-red" onclick="adminDeleteEmiConfirm('${a.id}')">Delete</button>`)
      : '';
    const archiveBtn=a.is_archived
      ? `<button class="btn-sm" onclick="adminArchiveEmiConfirm('${a.id}',false)">Unarchive</button>`
      : (canArchive
          ? `<button class="btn-sm" onclick="adminArchiveEmiConfirm('${a.id}',true)">Archive</button>`
          : '');

    return `
    <tr${a.is_archived?' style="opacity:.6"':''}>
      <td><div class="admin-product-cell"><img src="${a.product_image_snapshot||''}" alt="" onerror="this.style.display='none'"><span>${a.product_title_snapshot}${a.deal_id?' <span class="deal-tag">DealLock</span>':''}</span></div></td>
      <td>${a.profiles?`${a.profiles.first_name} ${a.profiles.last_name}`:a.applicant_name}<br><small>${a.applicant_phone}</small></td>
      <td>₹${formatNum(a.loan_amount)}</td>
      <td>₹${formatNum(a.monthly_emi)}<br><small>${a.tenure_months}mo@${a.interest_rate}%</small></td>
      <td>${new Date(a.applied_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</td>
      <td>
        <span class="status-pill ${EMI_STATUS_CLASS[a.status]||'status-pending'}">${EMI_STATUS_LABELS[a.status]||a.status}</span>
        ${a.is_archived?'<br><small style="color:var(--text-muted)">Archived</small>':''}
      </td>
      <td>
        <select class="status-dropdown" onchange="adminChangeStatus('${a.id}',this.value)">${options}</select>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          <button class="btn-sm btn-sm-blue" onclick="adminViewEmiApplication('${a.id}')">Details</button>
          ${archiveBtn}${deleteBtn}
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function adminChangeStatus(id,status) {
  try { await db.updateEmiStatus(id,status); showToast('Status updated.','success'); renderAdminDashboard(); }
  catch (err) { showToast(err.message||'Could not update — admin permission required.','error'); }
}

async function adminArchiveEmiConfirm(id,archived) {
  if(archived && !confirm('Archive this application? It stays in the database as a loan record but is hidden from the default view.')) return;
  try {
    await db.adminArchiveEmi(id,archived);
    showToast(archived?'Application archived.':'Application restored.','success');
    renderAdminDashboard();
  } catch (err) { showToast(err.message||'Could not archive application.','error'); }
}

async function adminDeleteEmiConfirm(id) {
  if(!confirm('Permanently delete this EMI application? This erases the loan record and cannot be undone.\n\nIf you only want it out of the way, use Archive instead.')) return;
  try {
    await db.adminDeleteEmi(id);
    showToast('Application deleted.','success');
    renderAdminDashboard();
  } catch (err) { showToast(err.message||'Could not delete application.','error'); }
}

/* ===== ADMIN: SECTION SWITCHING ===== */
let currentAdminSection = 'dashboard';

// Section slug -> the heading and breadcrumb shown above the content.
const ADMIN_SECTION_TITLES = {
  dashboard: 'Dashboard',
  emi: 'EMI Applications',
  users: 'Users',
  products: 'Products',
  purchases: 'Purchases',
  financers: 'Financers',
  reports: 'Reports',
  terms: 'Content Pages',
  blog: 'Blog Posts',
  faqs: 'Help Centre FAQs',
  chatbot: 'Chatbot',
  settings: 'Site Settings',
  logs: 'Application Logs',
  roles: 'Roles & Access',
  emiareas: 'EMI Coverage',
  deals: 'Deals',
  lender: 'Lender portal',
};

function adminSwitchSection(section) {
  // Refuse to open a section this role can't use — reachable via an old
  // link or browser history even when the menu item is hidden.
  const allowed = userSections();
  if (allowed.length && !allowed.includes(section)) {
    showToast('You don\u2019t have access to that section.', 'error');
    return;
  }
  currentAdminSection = section;
  // Keep the section in the address bar, so a reload comes back here.
  if (currentPage === 'admin') {
    try { history.replaceState(history.state, '', `/admin?section=${encodeURIComponent(section)}`); } catch { /* ignore */ }
  }
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.admin-nav-item[data-section="${section}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('adminSection-' + section)?.classList.remove('hidden');

  const title = ADMIN_SECTION_TITLES[section] || section;
  const titleEl = document.getElementById('adminPageTitle');
  const crumbEl = document.getElementById('adminBreadcrumbCurrent');
  if (titleEl) titleEl.textContent = title;
  if (crumbEl) crumbEl.textContent = title;

  // On mobile the sidebar overlays the content, so a selection has to close
  // it — otherwise the user picks a section and still can't see it.
  adminToggleSidebar(false);
  document.querySelector('.admin-content')?.scrollTo?.({ top: 0 });

  // EMI was the one section with no render call here, so opening it fresh
  // showed an empty table until some other action (clicking a status pill)
  // happened to call renderAdminTable(). If the data hasn't been fetched
  // yet, fetch it; otherwise just draw what we already have.
  if (section === 'emi') {
    if (adminEmiApps.length === 0) renderAdminDashboard(); else renderAdminTable();
  }
  adminLoadSection(section);
}

/* The section's own data, fetched again (also used by the Refresh button). */
function adminLoadSection(section) {
  const jobs = [];
  const run = fn => { try { const r = fn(); if (r && typeof r.then === 'function') jobs.push(r); } catch (e) { console.warn(e); } };
  if (section === 'users') run(renderAdminUsers);
  if (section === 'products') run(renderAdminProducts);
  if (section === 'purchases') run(renderAdminPurchases);
  if (section === 'deals' && typeof renderAdminDeals === 'function') run(renderAdminDeals);
  if (section === 'lender' && typeof renderLenderPortal === 'function') run(renderLenderPortal);
  if (section === 'financers') run(renderAdminFinancers);
  if (section === 'reports') run(renderAdminReports);
  if (section === 'terms') run(renderAdminTerms);
  if (section === 'blog') run(renderAdminBlog);
  if (section === 'faqs') run(renderAdminFaqs);
  if (section === 'chatbot') run(renderAdminChatbot);
  if (section === 'settings') run(renderAdminSettings);
  if (section === 'logs') run(renderAdminLogs);
  if (section === 'roles') run(renderAdminRoles);
  if (section === 'emiareas') run(renderAdminEmiAreas);
  if (section === 'dashboard') run(renderAdminDashboardCharts);
  return Promise.allSettled(jobs);
}

/* Admin panel "Refresh": fetches the open section (and the stat cards)
   again without leaving the panel. The browser's own reload works too now,
   but this keeps scroll, filters and the sidebar as they are. */
let adminRefreshing = false;
async function adminRefresh() {
  if (adminRefreshing || currentPage !== 'admin') return;
  adminRefreshing = true;
  const btn = document.getElementById('adminRefreshBtn');
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  try {
    // renderAdminDashboard: the stat cards, and on the Dashboard and EMI
    // sections their charts and table too.
    const jobs = [renderAdminDashboard()];
    if (!['dashboard', 'emi'].includes(currentAdminSection)) jobs.push(adminLoadSection(currentAdminSection));
    await Promise.allSettled(jobs);
    showToast('Updated', 'success');
  } finally {
    adminRefreshing = false;
    if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
  }
}

function adminSectionFromUrl() {
  try { return new URLSearchParams(location.search).get('section') || ''; } catch { return ''; }
}

/* Opens/closes the mobile sidebar. Pass no argument to toggle, or an
   explicit boolean to force a state. */
function adminFillSidebarUser() {
  if (!currentUser) return;
  const name = `${currentUser.name || ''} ${currentUser.lastName || ''}`.trim() || 'Admin';
  const nameEl = document.getElementById('adminSidebarName');
  const roleEl = document.getElementById('adminSidebarRole');
  const avatarEl = document.getElementById('adminSidebarAvatar');
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = currentUser.isSuperadmin ? 'Superadmin'
    : ((currentUser.roles || []).includes('lender') ? 'Lender' : 'Staff');
  if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
}

function adminToggleSidebar(force) {
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('admin-sidebar-open');
  document.body.classList.toggle('admin-sidebar-open', open);
}

/* The coloured stat cards double as shortcuts: clicking "Pending" jumps to
   the EMI list already filtered to pending, which is what someone reading
   that number actually wants next. */
function adminFilterStatusFromCard(status) {
  adminSwitchSection('emi');
  adminFilterStatus(status);
}

/* ===== ADMIN: USERS ===== */
let adminUsersCache = [];

async function renderAdminUsers() {
  try { adminUsersCache = await db.adminGetUsers(); }
  catch { adminUsersCache = []; showToast('Could not load users.', 'error'); }
  renderAdminUsersTable();
}

ADMIN_TABLE_RERENDER.users = renderAdminUsersTable;

function adminUserFilterChanged() { adminResetPage('users'); renderAdminUsersTable(); }

function renderAdminUsersTable() {
  const tbody = document.getElementById('adminUsersBody');
  const noUsers = document.getElementById('adminNoUsers');
  const q = document.getElementById('adminUserSearch')?.value || '';
  const filtered = adminUsersCache.filter(u =>
    adminMatches(q, `${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}`, u.email, u.phone, u.city));
  const users = adminPaginate('users', filtered);

  document.getElementById('adminUserCount').textContent = `${filtered.length} of ${adminUsersCache.length}`;
  if (filtered.length === 0) { tbody.innerHTML = ''; noUsers.classList.remove('hidden'); return; }
  noUsers.classList.add('hidden');

  const canManageRoles = !!currentUser?.isSuperadmin;

  tbody.innerHTML = users.map(u => {
    const rolesBadges = ((u.roles && u.roles.length)
      ? u.roles.map(r => `<span class="status-pill status-approved">${r}</span>`).join(' ')
      : (u.is_admin ? '<span class="status-pill status-pending">admin (legacy)</span>' : '—'))
      + (u.lender ? `<br><small><i class="fas fa-building-columns"></i> ${escapeHtml(u.lender.name || 'Lender')}</small>` : '')
      // DealLock: paused after 3 force-cancelled deals in a row.
      + (u.deal_ban_until ? `<br><span class="status-pill status-rejected" title="No new listings or deals">Deals paused till ${new Date(u.deal_ban_until).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</span>`
          + (userCan('users.suspend') ? ` <button class="btn-sm" style="margin-top:4px" onclick="adminLiftDealBan('${u.id}')">Lift</button>` : '') : '');

    // Role-assignment, role-removal, and account deletion are all
    // superadmin-only server-side — hide them from other staff (admin/
    // manager) in the UI too, instead of showing controls that just 403.
    const roleControls = canManageRoles ? `
        <select class="status-dropdown" onchange="adminAssignRole('${u.id}', this.value)">
          <option value="">Assign role...</option>
          <option value="merchant">Merchant</option>
          <option value="dev">Developer (read-only + logs)</option>
          <option value="lender">Lender (NBFC)</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        ${(u.roles && u.roles.length) && u.id !== currentUser.id
          ? `<button class="btn-sm" style="margin-top:4px" onclick="adminRemoveRoleConfirm('${u.id}')">Remove Role</button>` : ''}
        <button class="btn-sm btn-sm-red" onclick="adminDeleteUserConfirm('${u.id}')" style="margin-top:4px">Delete</button>`
      : '';

    return `
    <tr>
      <td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.phone || '—'}</td>
      <td>${u.city || '—'}</td>
      <td>${rolesBadges}</td>
      <td>${new Date(u.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</td>
      <td>${roleControls}</td>
    </tr>`;
  }).join('');
}

async function adminAssignRole(uid, roleName) {
  if (!roleName) return;
  // A lender user always belongs to one lender, so ask which first.
  if (roleName === 'lender') {
    if (typeof adminAssignLenderRole === 'function') adminAssignLenderRole(uid);
    renderAdminUsersTable();   // put the dropdown back to "Assign role..."
    return;
  }
  try {
    await db.adminUpdateUser(uid, { role_name: roleName });
    showToast(`Role "${roleName}" assigned.`, 'success');
    renderAdminUsers();
  } catch (err) {
    showToast(err.message || 'Could not assign role — superadmin required.', 'error');
  }
}

async function adminRemoveRoleConfirm(uid) {
  if (!confirm('Remove this user\'s staff role? They will lose admin panel access.')) return;
  try {
    await db.adminRemoveUserRole(uid);
    showToast('Role removed.', 'success');
    renderAdminUsers();
  } catch (err) {
    showToast(err.message || 'Could not remove role — superadmin required.', 'error');
  }
}

async function adminDeleteUserConfirm(uid) {
  if (!confirm('Permanently delete this user account? This cannot be undone.')) return;
  try {
    await db.adminDeleteUser(uid);
    showToast('User deleted.', 'success');
    renderAdminUsers();
  } catch (err) {
    showToast(err.message || 'Could not delete user — superadmin required.', 'error');
  }
}

/* ===== ADMIN: PRODUCTS ===== */
function getAdminProductFilters() {
  return {
    search: (document.getElementById('adminProdSearch')?.value || '').trim(),
    category: document.getElementById('adminProdCategory')?.value || 'all',
    status: document.getElementById('adminProdStatus')?.value || 'all',
    seller: (document.getElementById('adminProdSeller')?.value || '').trim(),
    emiOnly: document.getElementById('adminProdEmi')?.checked || false,
    sort: document.getElementById('adminProdSort')?.value || 'newest'
  };
}

// Typing fires on every keystroke, so wait for a pause before querying.
let adminProdFilterTimer = null;
function adminProductFilterChanged() {
  adminResetPage('products');
  clearTimeout(adminProdFilterTimer);
  adminProdFilterTimer = setTimeout(renderAdminProducts, 250);
}

function adminClearProductFilters() {
  adminResetPage('products');
  document.getElementById('adminProdSearch').value = '';
  document.getElementById('adminProdSeller').value = '';
  document.getElementById('adminProdCategory').value = 'all';
  document.getElementById('adminProdStatus').value = 'all';
  document.getElementById('adminProdSort').value = 'newest';
  document.getElementById('adminProdEmi').checked = false;
  renderAdminProducts();
}

ADMIN_TABLE_RERENDER.products = renderAdminProductsTable;

let adminProductsCache = [];
let adminProdFetchToken = 0;

async function renderAdminProducts() {
  const token = ++adminProdFetchToken;
  try { adminProductsCache = await db.adminGetProducts(getAdminProductFilters()); }
  catch { adminProductsCache = []; showToast('Could not load products.', 'error'); }
  // A newer filter change already fired while this fetch was in flight —
  // drop the stale response instead of letting it clobber newer results.
  if (token !== adminProdFetchToken) return;
  renderAdminProductsTable();
}

function renderAdminProductsTable() {
  const tbody = document.getElementById('adminProductsBody');
  const noProducts = document.getElementById('adminNoProducts');
  const countEl = document.getElementById('adminProdCount');
  const products = adminPaginate('products', adminProductsCache);

  if (countEl) countEl.textContent = `${adminProductsCache.length} listing${adminProductsCache.length !== 1 ? 's' : ''}`;

  if (adminProductsCache.length === 0) { tbody.innerHTML = ''; noProducts.classList.remove('hidden'); return; }
  noProducts.classList.add('hidden');

  const statusCls = { active: 'status-approved', sold: 'status-rejected', removed: 'status-pending' };

  tbody.innerHTML = products.map(p => `
    <tr>
      <td><div class="admin-product-cell"><img src="${p.ai_image_url || ''}" alt="" onerror="this.style.display='none'"><span>${escapeHtml(p.title)}</span></div></td>
      <td>${p.category}</td>
      <td>₹${formatNum(p.price)}</td>
      <td>${p.seller_name || '—'}</td>
      <td><span class="status-pill ${statusCls[p.status] || 'status-pending'}">${p.status}</span></td>
      <td>${p.views}</td>
      <td>
        <button class="btn-sm btn-sm-blue" onclick="adminViewProduct('${p.id}')">View</button>
        <button class="btn-sm" onclick="editListing('${p.id}', true)">Edit</button>
        <button class="btn-sm btn-sm-red" onclick="adminDeleteProductConfirm('${p.id}')">Delete</button>
      </td>
    </tr>`).join('');
}

/* Staff-facing single-listing view. Uses the admin endpoint rather than
   the public one so it can also show who the seller actually is, every
   EMI application against this listing, and the sale record if it sold. */
async function adminViewProduct(pid) {
  document.getElementById('productModalContent').innerHTML =
    `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  document.getElementById('productModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  history.pushState({ view: 'modal', modal: 'product' }, '');

  let p;
  try {
    const raw = await db.adminGetProduct(pid);
    // adminGetProduct returns the raw API shape (ai_image_url, city, ...);
    // normalize it to the same shape every other listing view uses, then
    // re-attach the admin-only extras.
    p = {
      ...normalizeListing(raw),
      seller: raw.seller,
      emiApplications: raw.emiApplications || [],
      purchase: raw.purchase || null
    };
  } catch (err) {
    closeProductModal(true);
    showToast(err.message || 'Could not load listing.', 'error');
    return;
  }

  currentProduct = p;
  currentGalleryIndex = 0;

  const statusCls = { active: 'status-approved', sold: 'status-rejected', removed: 'status-pending' };
  const s = p.seller;

  const sellerBlock = s ? `
    <div class="admin-detail-row"><span>Name</span><strong>${s.name || '—'}</strong></div>
    <div class="admin-detail-row"><span>Email</span><strong>${s.email || '—'}</strong></div>
    <div class="admin-detail-row"><span>Phone</span><strong>${s.phone || '—'}</strong></div>
    <div class="admin-detail-row"><span>Pincode</span><strong>${s.city || '—'}</strong></div>
    <div class="admin-detail-row"><span>Joined</span><strong>${s.joined ? new Date(s.joined).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</strong></div>`
    : `<div class="admin-detail-row"><span>Seller</span><strong>Account deleted</strong></div>`;

  // needs_docs has no pill class of its own — fall back to the pending style
  const emiPillCls = { approved: 'status-approved', rejected: 'status-rejected' };
  const emiBlock = p.emiApplications.length
    ? p.emiApplications.map(a => `
        <div class="admin-detail-row">
          <span>${a.applicant_name} · ${a.tenure_months}mo</span>
          <strong>₹${formatNum(a.monthly_emi)}/mo <span class="status-pill ${emiPillCls[a.status] || 'status-pending'}">${(a.status || '').replace('_',' ')}</span></strong>
        </div>`).join('')
    : `<div class="admin-detail-row"><span>No EMI applications</span><strong>—</strong></div>`;

  const purchaseBlock = p.purchase ? `
    <div class="admin-detail-row"><span>Sold for</span><strong>₹${formatNum(p.purchase.total_amount)}</strong></div>
    <div class="admin-detail-row"><span>Payment</span><strong>${(p.purchase.payment_method || '').replace('_',' ')}</strong></div>
    <div class="admin-detail-row"><span>Buyer</span><strong>${p.purchase.buyer_name || 'Not recorded'}</strong></div>
    <div class="admin-detail-row"><span>Date</span><strong>${p.purchase.purchase_date ? new Date(p.purchase.purchase_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</strong></div>`
    : `<div class="admin-detail-row"><span>Not sold yet</span><strong>—</strong></div>`;

  document.getElementById('productModalContent').innerHTML = `
    <div class="pm-images" id="pmGallery">
      ${renderGalleryImage(p)}
      <button class="modal-close" onclick="closeProductModal()"><i class="fa fa-times"></i></button>
    </div>
    <div class="pm-body">
      <div class="staff-mod-bar">
        <span><i class="fas fa-shield-alt"></i> Admin view</span>
        <span class="status-pill ${statusCls[p.status] || 'status-pending'}">${p.status}</span>
      </div>
      <div class="pm-price-row">
        <div class="pm-price">₹${formatNum(p.price)}</div>
      </div>
      <h2 class="pm-title">${escapeHtml(p.title)}</h2>
      <div class="pm-meta">${p.category} · ${p.condition} · ${p.views} views</div>
      ${p.description ? `<p class="pm-desc">${escapeHtml(p.description)}</p>` : ''}

      <div class="admin-detail-section"><h4>Listing</h4>
        <div class="admin-detail-row"><span>Brand / Model</span><strong>${p.brand || '—'} ${p.model || ''}</strong></div>
        <div class="admin-detail-row"><span>Location</span><strong>${p.location || '—'} (${p.pincode || '—'})</strong></div>
        <div class="admin-detail-row"><span>Negotiable</span><strong>${p.negotiable ? 'Yes' : 'No'}</strong></div>
        <div class="admin-detail-row"><span>EMI eligible</span><strong>${p.emiEligible ? 'Yes' : 'No'}</strong></div>
        <div class="admin-detail-row"><span>Posted</span><strong>${p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</strong></div>
      </div>

      <div class="admin-detail-section"><h4>Seller</h4>${sellerBlock}</div>
      <div class="admin-detail-section"><h4>EMI Applications (${p.emiApplications.length})</h4>${emiBlock}</div>
      <div class="admin-detail-section"><h4>Sale</h4>${purchaseBlock}</div>

      <div class="pm-actions">
        <button class="btn-primary" onclick="closeProductModal(); editListing('${p.id}', true)">
          <i class="fas fa-edit"></i> Edit Listing
        </button>
        <button class="btn-sm btn-sm-red" onclick="closeProductModal(); adminDeleteProductConfirm('${p.id}')">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>`;
}

async function adminDeleteProductConfirm(pid) {
  if (!confirm('Permanently delete this listing? This cannot be undone.')) return;
  try {
    await db.adminDeleteProduct(pid);
    showToast('Product deleted.', 'success');
    renderAdminProducts();
    await loadHomeStats();
  } catch (err) {
    showToast(err.message || 'Could not delete product.', 'error');
  }
}

/* ===== ADMIN: PURCHASES ===== */
let adminPurchasesCache = [];

async function renderAdminPurchases() {
  try { adminPurchasesCache = await db.adminGetPurchases(); }
  catch { adminPurchasesCache = []; showToast('Could not load purchases.', 'error'); }
  renderAdminPurchasesTable();
}

ADMIN_TABLE_RERENDER.purchases = renderAdminPurchasesTable;

function adminPurchaseFilterChanged() { adminResetPage('purchases'); renderAdminPurchasesTable(); }

function renderAdminPurchasesTable() {
  const tbody = document.getElementById('adminPurchasesBody');
  const noPurchases = document.getElementById('adminNoPurchases');
  const q = document.getElementById('adminPurchaseSearch')?.value || '';
  const filtered = adminPurchasesCache.filter(p =>
    adminMatches(q, p.product_title, p.buyer_name, p.seller_name));
  const purchases = adminPaginate('purchases', filtered);

  document.getElementById('adminPurchaseCount').textContent = `${filtered.length} of ${adminPurchasesCache.length}`;
  if (filtered.length === 0) { tbody.innerHTML = ''; noPurchases.classList.remove('hidden'); return; }
  noPurchases.classList.add('hidden');

  const statusCls = { completed: 'status-approved', pending: 'status-pending', cancelled: 'status-rejected' };

  tbody.innerHTML = purchases.map(p => `
    <tr>
      <td><div class="admin-product-cell"><img src="${p.product_image || ''}" alt="" onerror="this.style.display='none'"><span>${p.product_title}</span></div></td>
      <td>${p.buyer_name || '—'}</td>
      <td>${p.seller_name || '—'}</td>
      <td>₹${formatNum(p.total_amount)}</td>
      <td>${p.payment_method === 'emi' ? '<span class="status-pill status-review">EMI</span>' : 'Full Payment'}</td>
      <td><span class="status-pill ${statusCls[p.status] || 'status-pending'}">${p.status}</span></td>
      <td>${new Date(p.purchase_date).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</td>
    </tr>`).join('');
}

/* ===== ADMIN: FINANCERS ===== */
let adminFinancersCache = [];

async function renderAdminFinancers() {
  try { adminFinancersCache = await db.adminGetFinancers(); }
  catch { adminFinancersCache = []; showToast('Could not load financers.', 'error'); }
  renderAdminFinancersTable();
}

ADMIN_TABLE_RERENDER.financers = renderAdminFinancersTable;

function adminFinancerFilterChanged() { adminResetPage('financers'); renderAdminFinancersTable(); }

function renderAdminFinancersTable() {
  const tbody = document.getElementById('adminFinancersBody');
  const noFinancers = document.getElementById('adminNoFinancers');
  const q = document.getElementById('adminFinancerSearch')?.value || '';
  const filtered = adminFinancersCache.filter(f =>
    adminMatches(q, f.name, f.contact_email, f.contact_phone, f.city, f.state));
  const financers = adminPaginate('financers', filtered);

  document.getElementById('adminFinancerCount').textContent = `${filtered.length} of ${adminFinancersCache.length}`;
  if (filtered.length === 0) { tbody.innerHTML = ''; noFinancers.classList.remove('hidden'); return; }
  noFinancers.classList.add('hidden');

  tbody.innerHTML = financers.map(f => `
    <tr>
      <td>${escapeHtml(f.name)}</td>
      <td>${f.contact_email || '—'}<br><small>${f.contact_phone || ''}</small></td>
      <td>
        ${[f.city, f.state].filter(Boolean).join(', ') || '—'}
        ${f.pincode ? `<br><small>${f.pincode}</small>` : ''}
        <br><small>${f.serves_all_india === false ? 'Local only' : 'All India'}</small>
      </td>
      <td>${f.min_interest_rate}% – ${f.max_interest_rate}%</td>
      <td>₹${formatNum(f.min_loan_amount)} – ₹${formatNum(f.max_loan_amount)}</td>
      <td><span class="status-pill ${f.status === 'active' ? 'status-approved' : 'status-rejected'}">${f.status}</span>
        <br><small>${(f.loan_types || ['vehicle', 'personal']).map(t => t === 'vehicle' ? 'Vehicle loans' : 'Personal loans').join(', ') || 'No loan types'}</small></td>
      <td>
        <button class="btn-sm btn-sm-blue" onclick="editFinancer(${f.financer_id})">Edit</button>
        <button class="btn-sm btn-sm-red" onclick="deleteFinancerConfirm(${f.financer_id})">Delete</button>
      </td>
    </tr>`).join('');
}

function openFinancerForm() {
  document.getElementById('financerFormBox').classList.remove('hidden');
  document.getElementById('financerEditId').value = '';
  ['financerName','financerEmail','financerPhone','financerMinRate','financerMaxRate','financerMinLoan','financerMaxLoan',
   'financerAddress','financerCity','financerState','financerPincode'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('financerStatus').value = 'active';
  document.getElementById('financerServesAll').value = 'true';
  document.getElementById('financerLoanVehicle').checked = true;
  document.getElementById('financerLoanPersonal').checked = true;
}

function closeFinancerForm() {
  document.getElementById('financerFormBox').classList.add('hidden');
}

function editFinancer(fid) {
  const f = adminFinancersCache.find(x => x.financer_id === fid);
  if (!f) return;
  openFinancerForm();
  document.getElementById('financerEditId').value = f.financer_id;
  document.getElementById('financerName').value = f.name;
  document.getElementById('financerEmail').value = f.contact_email || '';
  document.getElementById('financerPhone').value = f.contact_phone || '';
  document.getElementById('financerMinRate').value = f.min_interest_rate;
  document.getElementById('financerMaxRate').value = f.max_interest_rate;
  document.getElementById('financerMinLoan').value = f.min_loan_amount;
  document.getElementById('financerMaxLoan').value = f.max_loan_amount;
  document.getElementById('financerStatus').value = f.status;
  document.getElementById('financerAddress').value = f.address_line || '';
  document.getElementById('financerCity').value = f.city || '';
  document.getElementById('financerState').value = f.state || '';
  document.getElementById('financerPincode').value = f.pincode || '';
  document.getElementById('financerServesAll').value = f.serves_all_india === false ? 'false' : 'true';
  const loanTypes = f.loan_types || ['vehicle', 'personal'];
  document.getElementById('financerLoanVehicle').checked = loanTypes.includes('vehicle');
  document.getElementById('financerLoanPersonal').checked = loanTypes.includes('personal');
}

async function saveFinancer() {
  const editId = document.getElementById('financerEditId').value;
  const payload = {
    name: document.getElementById('financerName').value.trim(),
    contact_email: document.getElementById('financerEmail').value.trim(),
    contact_phone: document.getElementById('financerPhone').value.trim(),
    min_interest_rate: parseFloat(document.getElementById('financerMinRate').value),
    max_interest_rate: parseFloat(document.getElementById('financerMaxRate').value),
    min_loan_amount: parseFloat(document.getElementById('financerMinLoan').value) || 5000,
    max_loan_amount: parseFloat(document.getElementById('financerMaxLoan').value),
    status: document.getElementById('financerStatus').value,
    address_line: document.getElementById('financerAddress').value.trim(),
    city: document.getElementById('financerCity').value.trim(),
    state: document.getElementById('financerState').value.trim(),
    pincode: document.getElementById('financerPincode').value.trim(),
    serves_all_india: document.getElementById('financerServesAll').value === 'true',
    // DealLock: which loans this lender funds (cars and bikes are vehicle
    // loans, every other category is a personal loan).
    loan_types: [
      document.getElementById('financerLoanVehicle').checked ? 'vehicle' : null,
      document.getElementById('financerLoanPersonal').checked ? 'personal' : null,
    ].filter(Boolean)
  };
  if (!payload.loan_types.length) {
    showToast('Choose at least one loan type this lender funds.', 'error');
    return;
  }
  if (!payload.name || !payload.min_interest_rate || !payload.max_interest_rate || !payload.max_loan_amount) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  if (payload.pincode && !/^\d{6}$/.test(payload.pincode)) {
    showToast('Pincode must be 6 digits.', 'error');
    return;
  }
  // A local-only partner is matched to buyers by pincode, so without one it
  // would never be shown to anybody.
  if (!payload.serves_all_india && !payload.pincode) {
    showToast('A local-only financer needs a pincode, otherwise it can never be matched to a buyer.', 'error');
    return;
  }
  try {
    if (editId) await db.adminUpdateFinancer(editId, payload);
    else await db.adminCreateFinancer(payload);
    showToast('Financer saved.', 'success');
    closeFinancerForm();
    renderAdminFinancers();
  } catch (err) {
    showToast(err.message || 'Could not save financer.', 'error');
  }
}

async function deleteFinancerConfirm(fid) {
  if (!confirm('Delete this financer?')) return;
  try {
    await db.adminDeleteFinancer(fid);
    showToast('Financer deleted.', 'success');
    renderAdminFinancers();
  } catch (err) {
    showToast(err.message || 'Could not delete — superadmin required.', 'error');
  }
}

/* ===== GLOBAL LISTENERS ===== */

/* ===== ENTER KEY NAVIGATION =====
   Enter moves to the next field, and on the last one submits. Wired by one
   delegated listener rather than per-input handlers, so it covers markup that
   is rendered later (the sell form's category fields, admin forms) without
   anyone having to remember to add it.

   Opt in by putting data-enter-flow on a container and naming its submit
   button with data-enter-submit. Textareas are skipped — Enter means a new
   line there, and hijacking it would stop people writing a description. */
function setupEnterKeyFlow() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;

    const el = e.target;
    if (!el || !el.matches('input, select')) return;
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') return;

    const flow = el.closest('[data-enter-flow]');
    if (!flow) return;

    // A datalist suggestion is being picked, not the field being completed.
    if (el.getAttribute('list') && el.getAttribute('aria-expanded') === 'true') return;

    const fields = [...flow.querySelectorAll('input, select, textarea')]
      .filter(f => !f.disabled && !f.readOnly && f.type !== 'hidden' && f.type !== 'file'
                   && f.offsetParent !== null);

    const i = fields.indexOf(el);
    const next = fields[i + 1];

    e.preventDefault();

    if (next) { next.focus(); if (next.select) next.select(); return; }

    // Last field: submit. Falls back to the first visible submit-ish button
    // when the container hasn't named one.
    const btn = flow.querySelector('[data-enter-submit]')
             || flow.querySelector('button.btn-primary:not([disabled])');
    if (btn) btn.click();
  });
}

function setupGlobalListeners() {
  document.addEventListener('click', e => {
    if (!e.target.closest('.user-avatar') && !e.target.closest('.user-menu')) {
      document.getElementById('userMenu')?.classList.add('hidden');
    }
    if (!e.target.closest('#navNotifBtn') && !e.target.closest('.notif-panel')) {
      closeNotifPanel();
    }
  });

  // A tab left open for hours holds a stale dot until the next 60s tick.
  // Refreshing when it regains focus makes the badge correct at the moment
  // the user actually looks at it.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) refreshNavBadges();
  });
  document.addEventListener('keydown', e => {
    // Close exactly the innermost open modal — with Chat or EMI stacked on
    // top of a product listing, Escape should only dismiss the top layer.
    if (e.key === 'Escape' && modalStack.length) {
      closeTopModal(modalStack[modalStack.length - 1]);
      return;
    }
    // Arrow keys page through photos, but only while the lightbox is the
    // top layer — otherwise they would fight with normal page scrolling.
    if (modalStack[modalStack.length - 1] === 'lightbox') {
      if (e.key === 'ArrowLeft') lightboxNav(-1);
      if (e.key === 'ArrowRight') lightboxNav(1);
    }
  });
  ['authModal','emiModal','productModal','chatModal','imageLightbox',
   'partyInfoModal','cameraModal','avatarCropModal','legalPeekModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      // A click can only land on THIS modal's own backdrop if it's the
      // frontmost one, so it's safe to close exactly this one.
      // The stack name and the element id match for every modal except the
      // lightbox, whose element is #imageLightbox.
      // Element ids and modal-stack names differ for a few overlays.
      const STACK_NAME = {
        imageLightbox: 'lightbox',
        partyInfoModal: 'partyInfo',
        cameraModal: 'camera',
        avatarCropModal: 'avatarCrop',
        legalPeekModal: 'legalPeek',
      };
      if (e.target.id === id) closeTopModal(STACK_NAME[id] || id);
    });
  });

  // Make the browser/phone back button close the topmost open modal (or
  // navigate to the previous in-app page) instead of leaving the site,
  // since every page switch and modal open pushes a history entry.
  window.addEventListener('popstate', (e) => {
    if (suppressNextPopstate) {
      // This pop was already fully handled synchronously by closeTopModal()
      // — an explicit close, not a real Back-button navigation.
      suppressNextPopstate = false;
      return;
    }
    if (modalStack.length > 0) {
      // Close exactly the modal opened most recently — never re-derive this
      // from which DOM elements happen to be visible. With Chat or EMI
      // stacked on top of an open product listing, BOTH can be visible at
      // once, and only the most recently opened one should close here.
      hideModal(modalStack[modalStack.length - 1]);
      return;
    }
    const state = e.state;
    if (state && state.view === 'page') {
      // A legal entry carries which document it was, so Back between About
      // and Terms reloads the right one instead of whichever was last shown.
      if (state.page === 'legal' && state.doc) openLegalPage(state.doc);
      else showPage(state.page, true);
    } else {
      showPage('home', true);
    }
  });
}

/* ===== UTILS ===== */
function formatNum(n) {
  if (!n && n !== 0) return '0';
  if (n >= 10000000) return (n/10000000).toFixed(1)+'Cr';
  if (n >= 100000) return (n/100000).toFixed(n%100000===0?0:1)+'L';
  if (n >= 1000) return (n/1000).toFixed(n%1000===0?0:1)+'k';
  return n.toLocaleString('en-IN');
}

let toastTimer;
function showToast(msg, type='info') {
  const toast=document.getElementById('globalToast');
  toast.textContent=msg; toast.className=`toast ${type}`;
  clearTimeout(toastTimer);
  setTimeout(()=>toast.classList.add('show'),10);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),3000);
}


/* ===== ADMIN: SELLER REPORTS ===== */
const REPORT_REASON_LABELS = {
  fraud_scam:'Fraud or scam', fake_listing:'Fake or misleading listing',
  counterfeit:'Counterfeit goods', harassment:'Harassment or abusive behaviour',
  prohibited_item:'Prohibited item', payment_issue:'Payment problem', other:'Other',
  // "Report a Problem" reasons — site issues rather than seller reports.
  bug:'Something is broken', listing_issue:'Problem with a listing',
  account_issue:'Account or login problem', abuse:'Abuse or unsafe behaviour',
  feedback:'Feedback or suggestion'
};
const REPORT_STATUS_LABELS = {
  open:'Open', investigating:'Investigating', action_taken:'Action Taken', dismissed:'Dismissed'
};
const REPORT_STATUS_CLASS = {
  open:'status-pending', investigating:'status-review',
  action_taken:'status-approved', dismissed:'status-rejected'
};
let adminReportFilter = 'all', adminReports = [];

async function renderAdminReports() {
  try { adminReports = await db.adminGetReports(adminReportFilter); }
  catch (err) { adminReports = []; showToast(err.message || 'Could not load reports.', 'error'); }
  updateReportsBadge();
  renderAdminReportsTable();
}

ADMIN_TABLE_RERENDER.reports = renderAdminReportsTable;

function adminReportSearchChanged() { adminResetPage('reports'); renderAdminReportsTable(); }

function renderAdminReportsTable() {
  const tbody = document.getElementById('adminReportsBody');
  const none = document.getElementById('adminNoReports');
  const q = document.getElementById('adminReportSearch')?.value || '';
  const filtered = adminReports.filter(r => adminMatches(q,
    r.reported_user?.name, r.reported_user?.email, r.reporter_name, r.reason, r.details));
  const rows = adminPaginate('reports', filtered);

  const countEl = document.getElementById('adminReportCount');
  if (countEl) countEl.textContent = `${filtered.length} of ${adminReports.length}`;
  if (filtered.length === 0) { tbody.innerHTML = ''; none.classList.remove('hidden'); return; }
  none.classList.add('hidden');

  const canSuspend = !!currentUser?.isSuperadmin;

  tbody.innerHTML = rows.map(r => {
    const seller = r.reported_user;
    const suspended = seller && seller.account_status === 'suspended';
    const repeatFlag = r.reports_against_seller > 1
      ? `<br><small style="color:var(--red);font-weight:700">${r.reports_against_seller} reports against this user</small>` : '';
    // Who was reported, as worked out by the server from the listing.
    const roleTag = r.report_type === 'buyer' ? '<span class="report-type-tag">Buyer</span><br>'
      : r.report_type === 'user' ? '<span class="report-type-tag">User</span><br>' : '';
    const suspendBtn = (canSuspend && seller)
      ? (suspended
          ? `<button class="btn-sm" onclick="adminSuspendSeller('${seller.id}',false)">Reinstate</button>`
          : `<button class="btn-sm btn-sm-red" onclick="adminSuspendSeller('${seller.id}',true)">Suspend</button>`)
      : '';
    return `
    <tr>
      <td>
        ${r.report_type === 'problem'
          // A problem report is about the SITE, so there's no seller to show.
          // Showing "Deleted user" here (the old fallback) would read as if an
          // account had been removed, which is simply untrue.
          ? `<span class="report-type-tag">Site problem</span>
             ${r.subject ? `<br><strong>${escapeHtml(r.subject)}</strong>` : ''}
             ${r.contact_email ? `<br><small>${escapeHtml(r.contact_email)}</small>` : ''}`
          : `${roleTag}${seller ? `${escapeHtml(seller.name)}<br><small>${escapeHtml(seller.email)}</small>` : 'Deleted user'}
             ${suspended ? '<br><span class="status-pill status-rejected">Suspended</span>' : ''}
             ${repeatFlag}`}
      </td>
      <td>${REPORT_REASON_LABELS[r.reason] || r.reason}</td>
      <td><div class="report-details">${r.details ? escapeHtml(r.details) : '<em>No details given</em>'}</div></td>
      <td>${r.reporter_name}${r.product_title ? `<br><small>on "${escapeHtml(r.product_title)}"</small>` : ''}</td>
      <td>${new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
      <td>
        <span class="status-pill ${REPORT_STATUS_CLASS[r.status]||'status-pending'}">${REPORT_STATUS_LABELS[r.status]||r.status}</span>
        ${r.reviewed_by_name ? `<br><small>by ${r.reviewed_by_name}</small>` : ''}
      </td>
      <td>
        <select class="status-dropdown" onchange="adminChangeReportStatus('${r.report_id}',this.value)">
          ${Object.entries(REPORT_STATUS_LABELS).map(([v,l])=>`<option value="${v}" ${r.status===v?'selected':''}>${l}</option>`).join('')}
        </select>
        <div style="display:flex;gap:4px;margin-top:4px">${suspendBtn}</div>
      </td>
    </tr>`;
  }).join('');
}

function updateReportsBadge() {
  // Count only open reports — that's the queue that needs attention.
  const open = adminReports.filter(r => r.status === 'open').length;
  const badge = document.getElementById('adminReportsBadge');
  if (badge) {
    badge.textContent = open;
    badge.classList.toggle('hidden', open === 0);
  }
  // Mirrored as a dot on the topbar icon, so a pending queue is visible
  // even when the sidebar is collapsed on mobile.
  document.getElementById('adminTopbarReportsDot')?.classList.toggle('hidden', open === 0);
}

function adminFilterReports(status) {
  adminReportFilter = status;
  adminResetPage('reports');
  document.querySelectorAll('.admin-filter-btn[data-report-status]').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.admin-filter-btn[data-report-status="${status}"]`)?.classList.add('active');
  renderAdminReports();
}

async function adminChangeReportStatus(rid, status) {
  try {
    await db.adminUpdateReport(rid, { status });
    showToast('Report updated.', 'success');
    renderAdminReports();
  } catch (err) { showToast(err.message || 'Could not update report.', 'error'); }
}

async function adminSuspendSeller(uid, suspend) {
  if (suspend) {
    const reason = prompt('Reason for suspension (shown only to staff):', '');
    if (reason === null) return;
    if (!confirm('Suspend this account?\n\nThey will be unable to log in and their active listings will be hidden. Nothing is deleted — this is reversible.')) return;
    try {
      const res = await db.adminSuspendUser(uid, true, reason);
      showToast(`Account suspended. ${res.listings_affected||0} listing(s) hidden.`, 'success');
    } catch (err) { showToast(err.message || 'Could not suspend account.', 'error'); return; }
  } else {
    if (!confirm('Reinstate this account? Their hidden listings will be restored.')) return;
    try {
      const res = await db.adminSuspendUser(uid, false);
      showToast(`Account reinstated. ${res.listings_affected||0} listing(s) restored.`, 'success');
    } catch (err) { showToast(err.message || 'Could not reinstate account.', 'error'); return; }
  }
  renderAdminReports();
  if (currentAdminSection === 'users') renderAdminUsers();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}


/* ===== ADMIN: EMI APPLICATION DETAIL ===== */

// Formats a stored UTC timestamp as a readable date + time, or a dash.
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) +
         ', ' + d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

async function adminViewEmiApplication(eid) {
  document.getElementById('productModalContent').innerHTML =
    `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  document.getElementById('productModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  history.pushState({ view: 'modal', modal: 'product' }, '');

  let a;
  try { a = await db.adminGetEmiApplication(eid); }
  catch (err) {
    closeProductModal(true);
    showToast(err.message || 'Could not load application.', 'error');
    return;
  }

  const ap = a.applicant;
  // "Did the applicant actually receive the money?" — the question the
  // status alone doesn't answer.
  const outcome = a.disbursed_at
    ? '<span class="status-pill status-approved">Loan Disbursed</span>'
    : (a.status === 'rejected' ? '<span class="status-pill status-rejected">Declined — Not Disbursed</span>'
      : a.status === 'cancelled' ? '<span class="status-pill status-pending">Withdrawn — Not Disbursed</span>'
      : '<span class="status-pill status-pending">Not Yet Disbursed</span>');

  const turnaround = daysBetween(a.applied_at, a.reviewed_at);
  const principal = Number(a.loan_amount) || 0;
  const totalPayable = Number(a.total_payable) || 0;
  const interestCost = totalPayable - principal;

  const row = (label, value) => `<div class="admin-detail-row"><span>${label}</span><strong>${value}</strong></div>`;

  document.getElementById('productModalContent').innerHTML = `
    <div class="pm-body" style="padding-top:20px">
      <div class="staff-mod-bar">
        <span><i class="fas fa-file-invoice-dollar"></i> EMI Application</span>
        <span class="status-pill ${EMI_STATUS_CLASS[a.status]||'status-pending'}">${EMI_STATUS_LABELS[a.status]||a.status}</span>
      </div>

      <h2 class="pm-title" style="margin-bottom:4px">${escapeHtml(a.product_title_snapshot)}</h2>
      <div class="pm-meta">Application ID: ${a.id}</div>

      <div class="admin-detail-section"><h4>Outcome</h4>
        ${row('Disbursement Status', outcome)}
        ${row('Current Stage', EMI_STATUS_LABELS[a.status] || a.status)}
        ${a.is_archived ? row('Archived', 'Yes') : ''}
      </div>

      <div class="admin-detail-section"><h4>Application Timeline</h4>
        ${row('Application Date', fmtDateTime(a.applied_at))}
        ${row('Decision Date', fmtDateTime(a.reviewed_at))}
        ${row('Decided By', a.reviewed_by_name || '—')}
        ${row('Disbursement Date', fmtDateTime(a.disbursed_at))}
        ${row('Closure Date', fmtDateTime(a.closed_at))}
        ${turnaround !== null ? row('Decision Turnaround', `${turnaround} day${turnaround===1?'':'s'}`) : ''}
      </div>

      <div class="admin-detail-section"><h4>Loan Terms</h4>
        ${row('Item Price at Application', '₹' + formatNum(a.product_price_snapshot))}
        ${row('Down Payment', '₹' + formatNum(a.down_payment))}
        ${row('Principal (Loan Amount)', '₹' + formatNum(principal))}
        ${row('Interest Rate', a.interest_rate + '% p.a.')}
        ${row('Tenure', a.tenure_months + ' months')}
        ${row('Monthly Instalment', '₹' + formatNum(a.monthly_emi))}
        ${row('Total Repayable', '₹' + formatNum(totalPayable))}
        ${row('Total Interest Cost', '₹' + formatNum(interestCost))}
      </div>

      <div class="admin-detail-section"><h4>Applicant</h4>
        ${row('Name on Application', escapeHtml(a.applicant_name))}
        ${row('Phone on Application', a.applicant_phone)}
        ${row('Declared Monthly Income', a.applicant_income ? '₹' + formatNum(a.applicant_income) : 'Not provided')}
        ${ap ? row('Account Email', ap.email) : ''}
        ${ap ? row('Account Status', ap.account_status === 'suspended'
              ? '<span class="status-pill status-rejected">Suspended</span>' : 'Active') : ''}
        ${ap ? row('Member Since', fmtDateTime(ap.joined)) : row('Account', 'Deleted')}
      </div>

      <div class="admin-detail-section"><h4>Linked Listing &amp; Sale</h4>
        ${a.product ? row('Listing', escapeHtml(a.product.title) + ` (${a.product.status})`) : row('Listing', 'No longer available')}
        ${a.product ? row('Seller', escapeHtml(a.product.seller_name || '—')) : ''}
        ${a.purchase ? row('Sale Recorded', '₹' + formatNum(a.purchase.total_amount) + ' · ' + (a.purchase.payment_method||'').replace('_',' ')) : row('Sale Recorded', 'No')}
      </div>

      ${typeof adminEmiDealSectionHtml === 'function' ? adminEmiDealSectionHtml(a) : ''}

      <div class="admin-detail-section"><h4>Financing Partner</h4>
        <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.5">
          Optional — attributes this loan to a partner for reporting. Does not notify the applicant or the financer.
        </p>
        <select id="emiFinancerSelect" style="width:100%;margin-bottom:8px">
          <option value="">Loading partners...</option>
        </select>
        <button class="btn-sm btn-sm-blue" onclick="adminSaveEmiFinancer('${a.id}')">Save Financer</button>
      </div>

      <div class="admin-detail-section"><h4>Reviewer Notes</h4>
        <textarea id="emiDecisionNotes" rows="3" style="width:100%" placeholder="Record why this decision was made...">${a.decision_notes ? escapeHtml(a.decision_notes) : ''}</textarea>
        <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="adminSaveEmiNotes('${a.id}')">Save Notes</button>
      </div>
    </div>`;

  populateEmiFinancerSelect(a.financer_id);
  if (a.deal_id && typeof adminFillEmiDealStatus === 'function') adminFillEmiDealStatus(a.deal_id);
}

async function populateEmiFinancerSelect(currentFinancerId) {
  const sel = document.getElementById('emiFinancerSelect');
  if (!sel) return;
  try {
    const financers = await db.adminGetFinancers();
    sel.innerHTML = '<option value="">Not assigned</option>' +
      financers.map(f => `<option value="${f.financer_id}" ${String(f.financer_id) === String(currentFinancerId) ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
  } catch {
    sel.innerHTML = '<option value="">Could not load partners</option>';
  }
}

async function adminSaveEmiFinancer(eid) {
  const sel = document.getElementById('emiFinancerSelect');
  const financerId = sel.value || null;
  try {
    await db.adminUpdateEmi(eid, { financer_id: financerId });
    showToast(financerId ? 'Financing partner saved.' : 'Financing partner removed.', 'success');
  } catch (err) { showToast(err.message || 'Could not save financing partner.', 'error'); }
}

async function adminSaveEmiNotes(eid) {
  const notes = document.getElementById('emiDecisionNotes').value;
  try {
    await db.adminUpdateEmi(eid, { decision_notes: notes });
    showToast('Notes saved.', 'success');
  } catch (err) { showToast(err.message || 'Could not save notes.', 'error'); }
}


/* ===== HOME PAGE ===== */

const HOME_CATEGORIES = ['cars','phones','bikes','electronics','furniture','appliances','fashion','property','others'];
const HOME_EMI_RATE = 12; // % p.a. used by the on-page calculator

/* Live listing counts per category. Each request asks for a single item and
   reads the `total` from the pagination metadata, so we get real counts
   without pulling every listing down. */
async function loadHomeCategoryCounts() {
  await Promise.all(HOME_CATEGORIES.map(async cat => {
    const el = document.querySelector(`[data-cat-count="${cat}"]`);
    if (!el) return;
    try {
      const { total } = await db.getProducts({ category: cat, page: 1, perPage: 1 });
      el.textContent = `${formatCompactCount(total)} listing${total === 1 ? '' : 's'}`;
    } catch {
      el.textContent = '';
    }
  }));
}

function homeSearch() {
  const q = (document.getElementById('homeSearchInput')?.value || '').trim();
  showPage('buy');
  setTimeout(() => {
    const input = document.getElementById('buySearchInput');
    if (input) { input.value = q; applyBuyFilters(); }
  }, 60);
}

function navSearch() {
  const q = (document.getElementById('navSearchInput')?.value || '').trim();
  showPage('buy');
  setTimeout(() => {
    const input = document.getElementById('buySearchInput');
    if (input) { input.value = q; applyBuyFilters(); }
  }, 60);
}

/* Same reducing-balance formula the backend uses, so the figure a buyer sees
   here matches what the application will quote. */
function recalcHomeEmi() {
  const price = parseFloat(document.getElementById('calcPrice')?.value) || 0;
  let down = parseFloat(document.getElementById('calcDown')?.value) || 0;
  const months = parseInt(document.getElementById('calcTenure')?.value, 10) || 12;

  if (down > price) down = price;               // a down payment can't exceed the price
  const principal = Math.max(price - down, 0);

  const r = HOME_EMI_RATE / 12 / 100;
  const f = Math.pow(1 + r, months);
  const monthly = principal > 0 ? (principal * r * f) / (f - 1) : 0;
  const total = monthly * months;

  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  const interest = Math.max(total - principal, 0);
  set('calcEmi', inr(monthly));
  set('calcSub', `per month for ${months} months`);
  set('calcDownOut', inr(down));
  set('calcLoan', inr(principal));
  set('calcInterest', inr(interest));
  // Total outlay for the buyer: what they put down plus everything they repay,
  // so the rows above visibly add up to this figure.
  set('calcTotal', inr(down + principal + interest));
}

/* Fades sections in as they scroll into view. If IntersectionObserver is
   missing or motion is reduced, reveal everything at once rather than
   leaving the page blank. */
function initHomeReveal() {
  const items = document.querySelectorAll('#homePage .hb-reveal');
  if (!items.length) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('hb-in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('hb-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach(el => io.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  // showPage() isn't called on first load — the home page is visible by
  // default — so set the light-navbar class here too.
  const home = document.getElementById('homePage');
  if (home && !home.classList.contains('hidden')) document.body.classList.add('on-home');
  initSelectedArea();
  initHomeReveal();
  recalcHomeEmi();
  loadHomeCategoryCounts();
  initHomeMap();
});

/* ===== LOCATION / AREA SELECTION ===== */

// Resolved at load time, not inside DOMContentLoaded: several init functions
// fetch listings for the current area, and if this were still the default
// when they ran, the first request would be for the wrong district.
let selectedArea = (() => {
  try {
    const saved = localStorage.getItem('db_area');
    if (saved) {
      // Newer format: the full area object, so a saved choice keeps its
      // exact post office and pincode across reloads.
      if (saved.startsWith('{')) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name && parsed.prefix) return parsed;
      }
      // Older formats stored just a name or a 3-digit prefix. Resolve them
      // so an existing user isn't silently reset to the default city.
      const byName = dbAreaByName(saved);
      if (byName) return byName;
      const byPrefix = dbAreaByPrefix(saved);
      if (byPrefix) return byPrefix;
    }
  } catch { /* private mode / storage disabled */ }
  return DB_DEFAULT_AREA;
})();

function initSelectedArea() {
  updateAreaLabels();
}

function updateAreaLabels() {
  document.querySelectorAll('[data-area-label]').forEach(el => el.textContent = selectedArea.name);
  // refreshHomeMap() rewrites this with the live count once it has fetched;
  // until then the pill still names the area that was just chosen.
  const chip = document.getElementById('homeMapChipText');
  if (chip) chip.textContent = `Listings around ${selectedArea.name}`;
}

function openLocationPicker() {
  document.getElementById('locSearch').value = '';
  renderLocationList();
  document.getElementById('locationModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLocationPicker() {
  document.getElementById('locationModal').classList.add('hidden');
  document.body.style.overflow = '';
}

let locSearchTimer = null;
let locSearchToken = 0;

/* Debounced so typing "coimbatore" fires one request, not ten. 220ms is
   short enough to feel instant and long enough to skip intermediate
   keystrokes. */
function renderLocationList() {
  clearTimeout(locSearchTimer);
  const raw = (document.getElementById('locSearch')?.value || '').trim();
  locSearchTimer = setTimeout(() => searchLocationsLive(raw), raw ? 220 : 0);
}

async function searchLocationsLive(raw) {
  const el = document.getElementById('locList');
  if (!el) return;

  // Guards against out-of-order responses: a slow request for "coi" must
  // not overwrite the results for "coimbatore" typed after it.
  const token = ++locSearchToken;

  if (raw.length >= 2 || !raw) {
    el.innerHTML = `<div class="loc-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;
  }

  let data;
  try {
    data = await db.searchLocations(raw, 30);
  } catch {
    // Fall back to the built-in city list so the picker still works if the
    // API is unreachable — better than an empty dialog.
    if (token === locSearchToken) renderLocationListOffline(raw);
    return;
  }
  if (token !== locSearchToken) return;

  const results = data.results || [];
  if (!results.length) {
    // An empty box has not failed to match anything — nothing was asked yet.
    // Telling the user 'No match for ""' the moment the dialog opens reads
    // as an error before they have typed a character.
    el.innerHTML = raw
      ? `<div class="loc-empty">No match for \u201c${escapeHtml(raw)}\u201d.<br>
         Try a city, district, state or 6-digit pincode.</div>`
      : `<div class="loc-empty">Type a city, district, state or 6-digit pincode.</div>`;
    return;
  }

  const header = data.major
    ? '<div class="loc-sub-label">Popular cities</div>'
    : `<div class="loc-match-label">${results.length} match${results.length === 1 ? '' : 'es'} for \u201c${escapeHtml(raw)}\u201d</div>`;

  el.innerHTML = header + results.map(locResultHtml).join('');
}

/* A database row, rather than a DB_AREAS entry. Selecting one stores the
   full pincode, so "near me" ranking and EMI coverage both resolve at the
   most precise level available instead of a 3-digit prefix. */
function locResultHtml(r) {
  const active = selectedArea && selectedArea.pincode === r.pincode
                 && selectedArea.name === r.office_name;
  const payload = encodeURIComponent(JSON.stringify({
    name: r.office_name, district: r.district, state: r.state,
    pincode: r.pincode, prefix: r.pincode.slice(0, 3),
    lat: r.latitude, lng: r.longitude,
  }));
  return `
    <button class="loc-item ${active ? 'is-active' : ''}" onclick="selectAreaFromResult('${payload}')">
      <span>
        <strong>${escapeHtml(r.office_name)}</strong>
        <small>${escapeHtml(r.district)}, ${escapeHtml(r.state)}</small>
      </span>
      ${active ? '<i class="fas fa-check"></i>' : `<span class="loc-pin">${escapeHtml(r.pincode)}</span>`}
    </button>`;
}

function selectAreaFromResult(encoded) {
  let r;
  try { r = JSON.parse(decodeURIComponent(encoded)); } catch { return; }

  selectedArea = {
    name: r.name, district: r.district, state: r.state,
    prefix: r.prefix, pincode: r.pincode,
    // Some post offices have no usable coordinates in the India Post data.
    // Fall back to the district centre we already know so the map still
    // has somewhere sensible to point.
    lat: r.lat != null ? r.lat : (dbAreaByPrefix(r.prefix)?.lat ?? DB_DEFAULT_AREA.lat),
    lng: r.lng != null ? r.lng : (dbAreaByPrefix(r.prefix)?.lng ?? DB_DEFAULT_AREA.lng),
  };

  try { localStorage.setItem('db_area', JSON.stringify(selectedArea)); } catch { /* storage off */ }
  updateAreaLabels();
  closeLocationPicker();
  showToast(`Showing listings around ${escapeHtml(selectedArea.name)}.`, 'success');
  // Moving to a different area can change whether EMI is offered here.
  emiAvailabilityCache = {};
  refreshEmiCoverage();
  refreshHomeMap(true);
  loadHomeCategoryCounts();
  loadHomeStats();
  if (currentPage === 'buy') applyBuyFilters();
}

/* Offline fallback: the original hardcoded list. Only used when the search
   API can't be reached. */
function renderLocationListOffline(raw) {
  const q = raw.toLowerCase();
  const el = document.getElementById('locList');
  const list = DB_AREAS.filter(a =>
    !q || a.name.toLowerCase().includes(q) || a.district.toLowerCase().includes(q) ||
    a.state.toLowerCase().includes(q) || a.prefix.startsWith(q));
  if (!list.length) {
    el.innerHTML = raw
      ? `<div class="loc-empty">No match for \u201c${escapeHtml(raw)}\u201d.</div>`
      : `<div class="loc-empty">Type a city, district, state or 6-digit pincode.</div>`;
    return;
  }
  el.innerHTML = '<div class="loc-sub-label">Offline list</div>' + list.map(locItemHtml).join('');
}

function locItemHtml(a) {
  const active = a.name === selectedArea.name;
  return `
    <button class="loc-item ${active ? 'is-active' : ''}" onclick="selectArea('${a.name.replace(/'/g, "\\'")}')">
      <span><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.district)}, ${escapeHtml(a.state)}</small></span>
      ${active ? '<i class="fas fa-check"></i>' : `<span class="loc-pin">${a.prefix}xxx</span>`}
    </button>`;
}

function selectArea(name) {
  const a = dbAreaByName(name);
  if (!a) return;
  selectedArea = a;
  try { localStorage.setItem('db_area', JSON.stringify(a)); } catch { /* storage disabled */ }
  updateAreaLabels();
  closeLocationPicker();
  showToast(`Showing listings around ${escapeHtml(a.name)}.`, 'success');
  emiAvailabilityCache = {};
  refreshEmiCoverage();
  refreshHomeMap(true);
  loadHomeCategoryCounts();
  loadHomeStats();
  // If the buyer is already browsing, re-filter to the new area straight away.
  if (currentPage === 'buy') applyBuyFilters();
}

/* Browser geolocation gives coordinates, not a pincode, so pick whichever
   supported district centre is closest. */
function detectMyLocation() {
  if (!navigator.geolocation) { showToast('Your browser does not support location detection.', 'error'); return; }
  showToast('Detecting your location…', 'info');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      let best = null, bestKm = Infinity;
      DB_AREAS.forEach(a => {
        const km = dbHaversineKm(here, a);
        if (km < bestKm) { bestKm = km; best = a; }
      });
      if (!best || bestKm > 150) {
        showToast('We are not live in your area yet — showing Chandigarh instead.', 'info');
        selectArea(DB_DEFAULT_AREA.name);
        return;
      }
      selectArea(best.name);
    },
    () => showToast('Could not get your location. Pick a city from the list instead.', 'error'),
    { timeout: 8000 }
  );
}

/* ===== HOME MAP ===== */

/* OSM France's raster style: cream blocks, orange roads and green parks —
   the closest keyless match to the hero's pastel map. CARTO's keyless
   tiles now watermark "API KEY REQUIRED", so they can't be used. If this
   ever needs a paid/guaranteed provider, only this constant changes. */
const HOME_MAP_TILES = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
const HOME_MAP_ATTRIB = '&copy; OpenStreetMap contributors &middot; tiles: OSM France';
const HOME_MAP_REFRESH_MS = 60000;

const CAT_ICON = {
  cars: 'fa-car-side', phones: 'fa-mobile-screen-button', bikes: 'fa-motorcycle',
  electronics: 'fa-laptop', furniture: 'fa-couch', appliances: 'fa-plug',
  fashion: 'fa-shirt', property: 'fa-building', others: 'fa-box'
};

function getCatIcon(cat) {
  return CAT_ICON[cat] || 'fa-box';
}

let homeMap = null, homeMapLayer = null, homeUserMarker = null;
let homeMapRequestId = 0;
let homeMapTimer = null;

function initHomeMap() {
  const el = document.getElementById('homeMap');
  if (!el) return;
  // Leaflet is loaded from a CDN; if it's blocked the styled placeholder
  // stays put rather than leaving an empty grey box.
  if (typeof L === 'undefined') {
    const fb = document.getElementById('homeMapFallback');
    if (fb) fb.querySelector('span').textContent = 'Map could not be loaded';
    return;
  }
  if (homeMap) return;
  // The home page starts hidden when a visitor lands on #buy and navigates
  // back; building a map in a 0x0 container gives broken tiles forever.
  if (!el.offsetParent) return;

  homeMap = L.map(el, {
    zoomControl: false,
    scrollWheelZoom: false,
    worldCopyJump: true,
    // Leaflet's own credit is replaced by the static .hb-map-credit link,
    // which can sit above the hero's white fade and stays readable.
    attributionControl: false
  }).setView([selectedArea.lat, selectedArea.lng], 12);

  let tileErrors = 0;
  L.tileLayer(HOME_MAP_TILES, {
    maxZoom: 19,
    subdomains: 'abc',
    // Retina tiles double the pixels the browser must decode and paint on a
    // map this large. 256px tiles look fine and pan noticeably smoother.
    detectRetina: false,
    crossOrigin: true,
    keepBuffer: 1,
    attribution: HOME_MAP_ATTRIB
  }).on('tileerror', () => {
    // The odd bad tile is normal; a run of them means the provider is
    // unreachable, and the fallback explains the grey map instead of
    // leaving a blank canvas.
    if (++tileErrors === 8) {
      const fb = document.getElementById('homeMapFallback');
      if (fb) {
        fb.style.display = 'grid';
        fb.querySelector('span').textContent = 'Map tiles could not be loaded';
      }
    }
  }).addTo(homeMap);

  homeMapLayer = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 46,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: cluster => L.divIcon({
          className: 'db-cluster-wrap',
          html: `<div class="db-cluster">${cluster.getChildCount()}</div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        })
      })
    : L.layerGroup();
  homeMap.addLayer(homeMapLayer);

  const fb = document.getElementById('homeMapFallback');
  if (fb) fb.style.display = 'none';

  updateHomeUserMarker();
  refreshHomeMap(true);
  startHomeMapUpdates();
}

/* The white ring + blue dot at the centre of the selected area. */
function updateHomeUserMarker() {
  if (!homeMap) return;
  if (!homeMap.getPane('dbMePane')) {
    const pane = homeMap.createPane('dbMePane');
    pane.style.zIndex = 450;
    pane.style.pointerEvents = 'none';
  }
  if (!homeUserMarker) {
    homeUserMarker = L.marker([selectedArea.lat, selectedArea.lng], {
      icon: L.divIcon({
        className: 'db-me-wrap',
        html: '<div class="db-me"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      }),
      pane: 'dbMePane',
      interactive: false,
      keyboard: false
    }).addTo(homeMap);
  } else {
    homeUserMarker.setLatLng([selectedArea.lat, selectedArea.lng]);
  }
}

function homePopupHtml(p, dist) {
  const media = p.images && p.images[0]
    ? `<div class="db-pop-media"><img src="${p.images[0]}" alt="" loading="lazy"
         onerror="this.parentElement.innerHTML='<div class=pcard-ph>${getCatEmoji(p.category)}</div>'"></div>`
    : `<div class="db-pop-media"><div class="pcard-ph">${getCatEmoji(p.category)}</div></div>`;
  return `
    <div class="db-pop">
      ${media}
      <div class="db-pop-body">
        <div class="db-pop-title">${escapeHtml(p.title)}</div>
        <div class="db-pop-row">
          <span class="db-pop-price">₹${formatMoney(p.price)}</span>
          <span class="db-pop-dist">${dist}</span>
        </div>
        ${p.emiEligible ? `<div class="db-pop-emi"><i class="fas fa-bolt"></i> From ₹${formatMoney(emiPerMonth(p.price))}/mo</div>` : ''}
        <button class="db-pop-btn" onclick="openListing('${p.id}')">View listing</button>
      </div>
    </div>`;
}

/* `recenter` frames the pins; polling calls it with false so a refresh
   never yanks the view while someone is panning around. */
async function refreshHomeMap(recenter = false) {
  if (!homeMap) return;
  const requestId = ++homeMapRequestId;
  const chip = document.getElementById('homeMapChipText');
  if (chip) chip.textContent = 'Updating listings…';

  let items = [], total = 0;
  try {
    const res = await db.getProducts({ pincode: selectedArea.prefix, page: 1, perPage: 60 });
    items = res.items || [];
    total = res.total || 0;
  } catch {
    if (requestId === homeMapRequestId && chip) chip.textContent = 'Could not load listings';
    return;
  }
  // A slower request from a previous area must not overwrite the new one.
  if (requestId !== homeMapRequestId || !homeMap) return;

  homeMapLayer.clearLayers();
  const centre = { lat: selectedArea.lat, lng: selectedArea.lng };
  const points = [];

  items.map(normalizeListing).forEach(p => {
    const c = dbCoordsForListing(p);
    if (!c) return;   // pincode outside the districts we can place
    points.push([c.lat, c.lng]);
    const dist = dbFormatDistance(dbHaversineKm(centre, c));
    const marker = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'db-pin-wrap',
        html: `<div class="db-pin"><i class="fas ${getCatIcon(p.category)}"></i></div>`,
        iconSize: [54, 56],
        iconAnchor: [27, 54],
        popupAnchor: [0, -50]
      }),
      riseOnHover: true,
      title: p.title
    });
    marker.bindPopup(homePopupHtml(p, dist), {
      closeButton: true, maxWidth: 290, minWidth: 268,
      // Keep the bubble clear of the floating "Listings near you" pill and
      // the status chip, which would otherwise sit on top of it.
      autoPanPadding: L.point(18, 84)
    });
    homeMapLayer.addLayer(marker);
  });

  if (chip) {
    chip.textContent = total === 0
      ? `No listings in ${selectedArea.name} yet`
      : points.length < total
        ? `Showing ${points.length} of ${total} listings around ${selectedArea.name}`
        : `${total} listing${total === 1 ? '' : 's'} around ${selectedArea.name}`;
  }

  updateHomeUserMarker();

  if (recenter) {
    if (points.length) {
      // Frame everything on screen, but stay at city/sector level: zooming
      // further makes the basemap dense and the pins huge.
      homeMap.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 13 });
    } else {
      homeMap.setView([selectedArea.lat, selectedArea.lng], 12);
    }
  }
}

function homeMapZoom(dir) {
  if (!homeMap) return;
  if (dir > 0) homeMap.zoomIn(1); else homeMap.zoomOut(1);
}

function recenterHomeMap() {
  if (!homeMap) return;
  homeMap.flyTo([selectedArea.lat, selectedArea.lng], Math.max(homeMap.getZoom(), 12), { duration: 0.6 });
  updateHomeUserMarker();
}

/* Listings posted or archived elsewhere should turn up here without a
   reload. Polling only; the API has no push channel. */
function startHomeMapUpdates() {
  if (homeMapTimer) return;
  homeMapTimer = setInterval(() => {
    if (document.hidden) return;
    if (!homeMap || !document.body.classList.contains('on-home')) return;
    // Leave the map alone while a listing card is open or the pointer is
    // on it — a refresh would close the popup under the click.
    if (homeMap._popup) return;
    const wrap = document.getElementById('hbHeroMap');
    if (wrap && wrap.matches(':hover')) return;
    refreshHomeMap(false);
  }, HOME_MAP_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!homeMap || !document.body.classList.contains('on-home')) return;
    if (homeMap._popup) return;
    refreshHomeMap(false);
  });
}


/* ===== SHOW AT TOP (listing promotion) ===== */

let featureTarget = null;      // listing id being promoted
let featurePlans = [];         // cached from the API
let featureSelectedPlan = null;

async function openFeatureModal(listingId) {
  const p = myListingsCache.find(x => x.id === listingId) || await getListingById(listingId);
  if (!p) { showToast('Could not load that listing.', 'error'); return; }
  featureTarget = listingId;

  document.getElementById('featureListingTitle').textContent = p.title;
  document.getElementById('featureError').classList.add('hidden');
  document.getElementById('featureConfirmLabel').textContent = p.isFeatured ? 'Extend promotion' : 'Show at Top';
  document.getElementById('featureRemoveBtn').classList.toggle('hidden', !p.isFeatured);

  const wrap = document.getElementById('featurePlans');
  wrap.innerHTML = `<div style="padding:14px;color:var(--text-muted);font-size:13px">Loading options...</div>`;
  document.getElementById('featureModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    if (!featurePlans.length) featurePlans = await db.getFeaturePlans();
  } catch {
    wrap.innerHTML = `<div style="padding:14px;color:var(--red);font-size:13px">Could not load promotion options.</div>`;
    return;
  }
  featureSelectedPlan = featurePlans[1]?.code || featurePlans[0]?.code;
  renderFeaturePlans();
}

function renderFeaturePlans() {
  document.getElementById('featurePlans').innerHTML = featurePlans.map(pl => `
    <button class="feature-plan ${pl.code === featureSelectedPlan ? 'is-active' : ''}" onclick="selectFeaturePlan('${pl.code}')">
      <span class="feature-plan-days">${pl.label}</span>
      <span class="feature-plan-price">₹${pl.price}</span>
    </button>`).join('');
}

function selectFeaturePlan(code) {
  featureSelectedPlan = code;
  renderFeaturePlans();
}

function closeFeatureModal() {
  document.getElementById('featureModal').classList.add('hidden');
  document.body.style.overflow = '';
  featureTarget = null;
}

async function confirmFeature() {
  if (!featureTarget || !featureSelectedPlan) return;
  const errEl = document.getElementById('featureError');
  try {
    await db.featureListing(featureTarget, featureSelectedPlan);
    closeFeatureModal();
    showToast('Your listing will now show at the top.', 'success');
    if (currentPage === 'mylistings') renderMyListings();
  } catch (err) {
    showAuthError(errEl, err.message || 'Could not promote this listing.');
  }
}

async function removeFeature() {
  if (!featureTarget) return;
  if (!confirm('Stop showing this listing at the top? Any remaining promoted time is lost.')) return;
  try {
    await db.unfeatureListing(featureTarget);
    closeFeatureModal();
    showToast('Promotion removed.', 'info');
    if (currentPage === 'mylistings') renderMyListings();
  } catch (err) {
    showToast(err.message || 'Could not remove promotion.', 'error');
  }
}


/* ===== TERMS OF SERVICE (public viewer) ===== */

async function openTermsModal() {
  document.getElementById('termsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('termsModalBody').innerHTML =
    `<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  document.getElementById('termsModalMeta').textContent = '';
  try {
    const doc = await db.getLegalDoc('terms');
    document.getElementById('termsModalTitle').textContent = doc.title;
    document.getElementById('termsModalMeta').textContent = doc.updated_at
      ? `Last updated ${new Date(doc.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : '';
    document.getElementById('termsModalBody').innerHTML = `<div class="terms-rendered">${renderSafeMarkup(doc.content)}</div>`;
  } catch (err) {
    document.getElementById('termsModalBody').innerHTML =
      `<div style="text-align:center;padding:30px;color:var(--text-muted)">Could not load the Terms of Service right now.</div>`;
  }
}

function closeTermsModal() {
  document.getElementById('termsModal').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ===== SAFE TEXT FORMATTING (used by Terms & Conditions) =====
   A deliberately small, constrained markup — NOT raw HTML. The content
   here renders on every visitor's browser (footer link, sell page), so
   letting an admin (or anyone who ever compromises that account) store
   arbitrary HTML/script would be a stored-XSS hole straight into the
   public site. Instead: escape the text FIRST, unconditionally, then
   layer our own whitelist of patterns on top of the now-inert text. No
   path exists for a `<script>` or `<img onerror=...>` typed into the
   textarea to ever become a real tag — only the specific patterns below
   ever turn into markup, and only into the five tags we chose.
     **bold**       -> <strong>
     *italic*        -> <em>
     __underline__   -> <u>
     - item           -> <ul><li>
     1. item          -> <ol><li>
   Blank line = paragraph break; single newline = <br>. */
function renderSafeMarkup(text) {
  const escaped = escapeHtml(text || '');
  const inline = (line) => line
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  const lines = escaped.split('\n');
  const out = [];
  let listType = null; // 'ul' | 'ol' | null — tracks an open list across lines
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  lines.forEach(line => {
    const bullet = /^-\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (numbered) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(numbered[1])}</li>`);
    } else {
      closeList();
      out.push(line.trim() === '' ? '<br>' : `<p>${inline(line)}</p>`);
    }
  });
  closeList();
  return out.join('');
}

/* ===== ADMIN: TERMS OF SERVICE (editor) ===== */

let adminTermsDoc = null;

// Every editable content page, in the order staff see them.
const ADMIN_DOC_KEYS = [
  { key: 'about',   label: 'About DealBriz' },
  { key: 'safety',  label: 'Safety Guidelines' },
  { key: 'terms',   label: 'Terms of Service' },
  { key: 'privacy', label: 'Privacy Policy' },
  { key: 'cookies', label: 'Cookie Policy' },
];
let adminActiveDocKey = 'about';

async function renderAdminTerms() { return renderAdminLegalDoc(adminActiveDocKey); }

/* One editor serves both legal documents — they differ only in which
   doc_key they load and which pair of elements they render into. */
async function renderAdminLegalDoc(key) {
  adminActiveDocKey = key;
  const ids = { body: 'adminTermsBody', meta: 'adminTermsMeta' };
  const box = document.getElementById(ids.body);

  // Picker doubles as the section's navigation between documents.
  const picker = document.getElementById('adminDocPicker');
  if (picker) {
    picker.innerHTML = ADMIN_DOC_KEYS.map(d =>
      `<button class="admin-doc-tab ${d.key === key ? 'is-active' : ''}" onclick="renderAdminLegalDoc('${d.key}')">${d.label}</button>`
    ).join('');
  }
  const headingEl = document.getElementById('adminDocHeading');
  if (headingEl) headingEl.textContent = ADMIN_DOC_KEYS.find(d => d.key === key)?.label || 'Content Pages';
  box.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    adminTermsDoc = await db.getLegalDoc(key);
  } catch {
    adminTermsDoc = { title: ADMIN_DOC_KEYS.find(d => d.key === key)?.label || key, content: '', updated_at: null, updated_by_name: null };
  }
  document.getElementById(ids.meta).textContent = adminTermsDoc.updated_at
    ? `Last updated ${new Date(adminTermsDoc.updated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${adminTermsDoc.updated_by_name ? ' by ' + adminTermsDoc.updated_by_name : ''}`
    : 'Not yet published';
  box.innerHTML = `
    <div class="terms-toolbar">
      <button type="button" title="Bold" onclick="termsWrapSelection('**','**','bold text')"><i class="fas fa-bold"></i></button>
      <button type="button" title="Italic" onclick="termsWrapSelection('*','*','italic text')"><i class="fas fa-italic"></i></button>
      <button type="button" title="Underline" onclick="termsWrapSelection('__','__','underlined text')"><i class="fas fa-underline"></i></button>
      <span class="terms-toolbar-sep"></span>
      <button type="button" title="Bullet list" onclick="termsInsertLinePrefix('- ')"><i class="fas fa-list-ul"></i></button>
      <button type="button" title="Numbered list" onclick="termsInsertLinePrefix('1. ')"><i class="fas fa-list-ol"></i></button>
      <span class="terms-toolbar-sep"></span>
      <div class="terms-toolbar-tabs">
        <button type="button" id="termsTabWrite" class="is-active" onclick="termsSetTab('write')">Write</button>
        <button type="button" id="termsTabPreview" onclick="termsSetTab('preview')">Preview</button>
      </div>
    </div>
    <textarea id="adminTermsTextarea" class="admin-terms-textarea" spellcheck="false">${escapeHtml(adminTermsDoc.content || '')}</textarea>
    <div id="adminTermsPreview" class="admin-terms-preview terms-rendered hidden"></div>
    <div class="admin-terms-actions">
      <span id="adminTermsCount" class="admin-terms-count"></span>
      <div>
        <button class="btn-sm" onclick="renderAdminLegalDoc('${key}')">Revert changes</button>
        <button class="btn-primary" onclick="saveAdminTerms('${key}')"><i class="fas fa-save"></i> Save & Publish</button>
      </div>
    </div>
    <p class="admin-terms-help"><strong>**bold**</strong> &middot; <em>*italic*</em> &middot; <u>__underline__</u> &middot; "- " for a bullet list &middot; "1. " for a numbered list</p>`;
  const ta = document.getElementById('adminTermsTextarea');
  const updateCount = () => { document.getElementById('adminTermsCount').textContent = `${ta.value.length.toLocaleString('en-IN')} characters`; };
  ta.addEventListener('input', updateCount);
  updateCount();
}

/* Wraps the current text-area selection with formatting markers (or
   inserts placeholder text if nothing is selected), then re-selects the
   wrapped text so hitting the same button again would remove it — the
   pattern most simple markdown toolbars use. */
function termsWrapSelection(before, after, placeholder) {
  const ta = document.getElementById('adminTermsTextarea');
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const selected = ta.value.slice(start, end) || placeholder;
  ta.value = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
  ta.focus();
  ta.setSelectionRange(start + before.length, start + before.length + selected.length);
  document.getElementById('adminTermsCount').textContent = `${ta.value.length.toLocaleString('en-IN')} characters`;
}

/* Inserts a line-start prefix (list markers) at the beginning of whichever
   line the cursor is currently on. */
function termsInsertLinePrefix(prefix) {
  const ta = document.getElementById('adminTermsTextarea');
  if (!ta) return;
  const start = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
  ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
  ta.focus();
  const newPos = start + prefix.length;
  ta.setSelectionRange(newPos, newPos);
  document.getElementById('adminTermsCount').textContent = `${ta.value.length.toLocaleString('en-IN')} characters`;
}

function termsSetTab(tab) {
  const ta = document.getElementById('adminTermsTextarea');
  const preview = document.getElementById('adminTermsPreview');
  const writeTab = document.getElementById('termsTabWrite');
  const previewTab = document.getElementById('termsTabPreview');
  if (tab === 'preview') {
    preview.innerHTML = renderSafeMarkup(ta.value) || '<p class="admin-terms-preview-empty">Nothing to preview yet.</p>';
    ta.classList.add('hidden');
    preview.classList.remove('hidden');
    previewTab.classList.add('is-active');
    writeTab.classList.remove('is-active');
  } else {
    ta.classList.remove('hidden');
    preview.classList.add('hidden');
    writeTab.classList.add('is-active');
    previewTab.classList.remove('is-active');
  }
}

async function saveAdminTerms(key = 'terms') {
  const label = ADMIN_DOC_KEYS.find(d => d.key === key)?.label || 'Page';
  const content = document.getElementById('adminTermsTextarea').value.trim();
  if (!content) { showToast(`${label} cannot be empty.`, 'error'); return; }
  try {
    adminTermsDoc = await db.updateLegalDoc(key, content);
    showToast(`${label} published.`, 'success');
    renderAdminLegalDoc(key);
  } catch (err) {
    showToast(err.message || 'Could not save — superadmin required.', 'error');
  }
}

/* ===== ADMIN: DASHBOARD CHARTS ===== */

// Keeps one Chart.js instance per canvas so re-entering the Dashboard tab
// destroys the old chart before drawing a new one — Chart.js throws if you
// construct a second chart on a canvas that already has one attached.
const adminCharts = {};

const ADMIN_CHART_COLORS = ['#2563EB', '#17C3B2', '#E7B24B', '#8B5CF6', '#EF4444', '#10B981', '#F97316', '#0EA5E9', '#EC4899', '#64748B'];

function adminChartToggle(canvasId, emptyId, isEmpty) {
  document.getElementById(canvasId).classList.toggle('hidden', isEmpty);
  document.getElementById(emptyId).classList.toggle('hidden', !isEmpty);
}

function adminDrawChart(canvasId, config) {
  if (typeof Chart === 'undefined') return; // CDN blocked — the empty-state text still shows
  if (adminCharts[canvasId]) adminCharts[canvasId].destroy();
  adminCharts[canvasId] = new Chart(document.getElementById(canvasId), config);
}

async function renderAdminDashboardCharts() {
  let data;
  try {
    data = await db.adminGetAnalytics();
  } catch (err) {
    showToast(err.message || 'Could not load dashboard analytics.', 'error');
    return;
  }
  renderAdminOverviewTotals(data.totals || {});
  renderChartEmiByPlace(data.emi_by_place || []);
  renderChartEmiByFinancer(data.emi_by_financer || []);
  renderChartSalesByMonth(data.sales_by_month || []);
  renderChartTopProducts(data.top_products || []);
}

function renderAdminOverviewTotals(t) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('adminStatUsers', formatNum(t.users || 0));
  set('adminStatProducts', formatNum(t.products || 0));
  set('adminStatPurchases', formatNum(t.purchases || 0));
  set('adminStatRevenue', '₹' + formatNum(t.completed_sales_value || 0));
  set('adminStatFinancers', formatNum(t.financers || 0));
  set('adminStatOpenReports', formatNum(t.open_reports || 0));
}

function renderChartEmiByPlace(rows) {
  const empty = rows.length === 0 || rows.every(r => r.count === 0);
  adminChartToggle('chartEmiByPlace', 'chartEmiByPlaceEmpty', empty);
  if (empty) return;

  // Pincode prefix -> friendly district name, via the same lookup the home
  // page map uses, so a "place" here means the same thing it does there.
  const labeled = rows.map(r => ({
    label: r.prefix ? (dbAreaForPincode(r.prefix + '00')?.name || `${r.prefix}xxx`) : 'Unknown',
    count: r.count, totalLoan: r.total_loan
  })).sort((a, b) => b.count - a.count).slice(0, 10);

  adminDrawChart('chartEmiByPlace', {
    type: 'bar',
    data: {
      labels: labeled.map(r => r.label),
      datasets: [{ label: 'Applications', data: labeled.map(r => r.count), backgroundColor: ADMIN_CHART_COLORS[0], borderRadius: 5, maxBarThickness: 34 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (ctx) => `Loan value: ₹${formatNum(labeled[ctx.dataIndex].totalLoan)}` } }
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderChartEmiByFinancer(rows) {
  const empty = rows.length === 0 || rows.every(r => r.count === 0);
  adminChartToggle('chartEmiByFinancer', 'chartEmiByFinancerEmpty', empty);
  if (empty) return;

  const labeled = rows.map(r => ({
    label: r.name || 'Unassigned', count: r.count, totalLoan: r.total_loan
  })).sort((a, b) => b.count - a.count);

  adminDrawChart('chartEmiByFinancer', {
    type: 'doughnut',
    data: {
      labels: labeled.map(r => r.label),
      datasets: [{ data: labeled.map(r => r.count), backgroundColor: ADMIN_CHART_COLORS, borderColor: '#fff', borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11.5 } } },
        tooltip: { callbacks: { afterLabel: (ctx) => `Loan value: ₹${formatNum(labeled[ctx.dataIndex].totalLoan)}` } }
      }
    }
  });
}

function renderChartSalesByMonth(rows) {
  const empty = rows.length === 0;
  adminChartToggle('chartSalesByMonth', 'chartSalesByMonthEmpty', empty);
  if (empty) return;

  const labels = rows.map(r => {
    const [y, m] = r.month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  });

  adminDrawChart('chartSalesByMonth', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Sales value', data: rows.map(r => r.total),
        borderColor: ADMIN_CHART_COLORS[1], backgroundColor: 'rgba(23,195,178,0.12)',
        fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: ADMIN_CHART_COLORS[1]
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: (ctx) => `${rows[ctx.dataIndex].count} sale(s)` } }
      },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => '₹' + formatNum(v) } } }
    }
  });
}

function renderChartTopProducts(rows) {
  const empty = rows.length === 0;
  adminChartToggle('chartTopProducts', 'chartTopProductsEmpty', empty);
  if (empty) return;

  const truncate = (t) => t.length > 28 ? t.slice(0, 27) + '…' : t;

  adminDrawChart('chartTopProducts', {
    type: 'bar',
    data: {
      labels: rows.map(r => truncate(r.title)),
      datasets: [{ label: 'Revenue', data: rows.map(r => r.total), backgroundColor: ADMIN_CHART_COLORS[2], borderRadius: 5, maxBarThickness: 26 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `₹${formatNum(ctx.parsed.x)}`, afterLabel: (ctx) => `${rows[ctx.dataIndex].count} sale(s)` } }
      },
      scales: { x: { beginAtZero: true, ticks: { callback: (v) => '₹' + formatNum(v) } } }
    }
  });
}

/* ===== HELP CENTRE / CONTACT / REPORT A PROBLEM / LEGAL ===== */

let faqData = { categories: [], items: [] };
let faqActiveCategory = 'all';

async function initHelpPage() {
  const list = document.getElementById('faqList');
  list.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    const res = await db.getFaqs();
    const all = Array.isArray(res?.items) ? res.items : [];
    faqData = {
      categories: Array.isArray(res?.categories) ? res.categories : [],
      // Bulk-imported answers teach the chatbot but would swamp this page,
      // so the Help Centre shows only entries flagged for it. Entries
      // predating that flag have no value and are treated as visible.
      items: all.filter(f => f.show_in_help !== false),
    };
  } catch {
    faqData = { categories: [], items: [] };
    list.innerHTML = `<div class="info-loading">Could not load help articles right now.</div>`;
    return;
  }
  renderFaqCategories();
  renderFaqList();
}

function renderFaqCategories() {
  // Only offer categories that actually have published entries — an empty
  // filter chip is just a dead end for the reader.
  const used = new Set(faqData.items.map(f => f.category));
  const cats = faqData.categories.filter(c => used.has(c.code));
  document.getElementById('faqCategories').innerHTML =
    [`<button class="faq-cat ${faqActiveCategory === 'all' ? 'is-active' : ''}" onclick="setFaqCategory('all')">All</button>`]
      .concat(cats.map(c => `<button class="faq-cat ${faqActiveCategory === c.code ? 'is-active' : ''}" onclick="setFaqCategory('${c.code}')">${escapeHtml(c.label)}</button>`))
      .join('');
}

function setFaqCategory(code) {
  faqActiveCategory = code;
  renderFaqCategories();
  renderFaqList();
}

function renderFaqList() {
  const q = (document.getElementById('faqSearch')?.value || '').trim().toLowerCase();
  const list = document.getElementById('faqList');
  const rows = faqData.items.filter(f =>
    (faqActiveCategory === 'all' || f.category === faqActiveCategory) &&
    (!q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)));

  if (!rows.length) {
    list.innerHTML = `<div class="info-loading">No help articles match that. Try a different search, or <a href="#" onclick="showPage('contact'); return false;">contact us</a>.</div>`;
    return;
  }
  const labelFor = (code) => faqData.categories.find(c => c.code === code)?.label || code;
  list.innerHTML = rows.map(f => `
    <details class="faq-item">
      <summary>
        <span>${escapeHtml(f.question)}</span>
        <i class="fas fa-chevron-down"></i>
      </summary>
      <div class="faq-answer terms-rendered">${renderSafeMarkup(f.answer)}</div>
      <div class="faq-tag">${escapeHtml(labelFor(f.category))}</div>
    </details>`).join('');
}

/* ---- Contact Us + Report a Problem ----
   Both post to the same endpoint as reports of type `problem`, so staff
   work one queue instead of a separate contact inbox nobody checks. The
   two forms differ only in copy and which reasons they offer. */
let problemReasons = [];

async function initProblemForm(mode) {
  const wrapId = mode === 'contact' ? 'contactFormWrap' : 'problemFormWrap';
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    if (!problemReasons.length) problemReasons = await db.getProblemReasons();
  } catch {
    problemReasons = [{ value: 'other', label: 'Something else' }];
  }

  const prefillEmail = currentUser?.email || '';
  wrap.innerHTML = `
    <div class="form-group">
      <label for="${wrapId}Reason">${mode === 'contact' ? 'What is this about?' : 'What went wrong?'}</label>
      <select id="${wrapId}Reason">
        ${problemReasons.map(r => `<option value="${r.value}">${escapeHtml(r.label)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="${wrapId}Subject">Subject <span class="opt">(optional)</span></label>
      <input type="text" id="${wrapId}Subject" maxlength="200" placeholder="Short summary">
    </div>
    <div class="form-group">
      <label for="${wrapId}Email">Your email${currentUser ? ' <span class="opt">(optional)</span>' : ''}</label>
      <input type="email" id="${wrapId}Email" value="${escapeHtml(prefillEmail)}" placeholder="you@example.com">
      ${currentUser ? '' : '<small class="field-hint">Required so we can reply — no account needed.</small>'}
    </div>
    <div class="form-group">
      <label for="${wrapId}Details">${mode === 'contact' ? 'Message' : 'Describe the problem'}</label>
      <textarea id="${wrapId}Details" rows="6" maxlength="4000" placeholder="${mode === 'contact' ? 'How can we help?' : 'What happened? What were you trying to do?'}"></textarea>
    </div>
    <div id="${wrapId}Error" class="auth-error hidden"></div>
    <button class="btn-primary" style="width:100%" onclick="submitProblemForm('${mode}')">
      <i class="fas fa-paper-plane"></i> ${mode === 'contact' ? 'Send message' : 'Submit report'}
    </button>`;
}

async function submitProblemForm(mode) {
  const wrapId = mode === 'contact' ? 'contactFormWrap' : 'problemFormWrap';
  const errEl = document.getElementById(`${wrapId}Error`);
  const payload = {
    reason: document.getElementById(`${wrapId}Reason`).value,
    subject: document.getElementById(`${wrapId}Subject`).value,
    contact_email: document.getElementById(`${wrapId}Email`).value,
    details: document.getElementById(`${wrapId}Details`).value,
  };
  if (!payload.details.trim()) {
    showAuthError(errEl, mode === 'contact' ? 'Please write your message.' : 'Please describe the problem.');
    return;
  }
  try {
    await db.submitProblemReport(payload);
    document.getElementById(wrapId).innerHTML = `
      <div class="info-success">
        <i class="fas fa-circle-check"></i>
        <strong>${mode === 'contact' ? 'Message sent' : 'Report submitted'}</strong>
        <span>Thanks — our team will look into this and reply by email if needed.</span>
        <button class="btn-sm" onclick="initProblemForm('${mode}')">Send another</button>
      </div>`;
  } catch (err) {
    showAuthError(errEl, err.message || 'Could not submit right now. Please try again.');
  }
}

/* ---- Document pages (About, Safety, Cookies, Terms, Privacy) ----
   All five are editable documents from the same table, so one page and one
   renderer serves them. The tab strip only shows for the legal trio, which
   readers genuinely move between; About and Safety stand alone. */

/* Which legal document is on screen, so the footer can highlight the right
   link — the page name alone ("legal") can't tell About from Terms. */
let currentLegalKey = null;

/* Highlights the footer link for wherever you currently are. Driven by
   data-foot on each link, so link order and wording can change freely. */
function markFooterActive() {
  let catNow = '';
  try {
    if (currentPage === 'buy') catNow = getBuyFilterParams().category || '';
  } catch { catNow = ''; }
  document.querySelectorAll('.site-footer a[data-foot]').forEach(a => {
    const [kind, value] = a.getAttribute('data-foot').split(':');
    let active = false;
    if (kind === 'legal')     active = currentPage === 'legal' && currentLegalKey === value;
    else if (kind === 'page') active = currentPage === value;
    else if (kind === 'cat')  active = catNow === value;
    a.classList.toggle('is-active', active);
  });
}

const DOC_PAGE_TITLES = {
  about: 'About DealBriz',
  safety: 'Safety Guidelines',
  cookies: 'Cookie Policy',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};
const LEGAL_TAB_KEYS = ['terms', 'privacy', 'cookies'];

async function openLegalPage(key, replaceEntry = false) {
  // replaceEntry: reuse the current history entry rather than adding one.
  // Used when arriving from the auth modal, whose own entry we are consuming
  // — otherwise Back would land on a dead modal entry that renders nothing.
  showPage('legal', replaceEntry);
  // showPage writes "#legal" for all five documents, so About, Terms and
  // Privacy all shared one meaningless URL that couldn't be linked to or
  // bookmarked. Rewrite it to the document's own name. replaceState, not
  // pushState: showPage already added a history entry for this navigation,
  // and a second one would make Back appear to do nothing the first time.
  currentLegalKey = key;
  history.replaceState({ view: 'page', page: 'legal', doc: key }, '', pagePath(key));
  markFooterActive();

  const heading = DOC_PAGE_TITLES[key] || 'DealBriz';
  document.getElementById('legalPageHeading').textContent = heading;

  const showTabs = LEGAL_TAB_KEYS.includes(key);
  document.getElementById('legalTabs').classList.toggle('hidden', !showTabs);
  document.getElementById('legalTabTerms').classList.toggle('is-active', key === 'terms');
  document.getElementById('legalTabPrivacy').classList.toggle('is-active', key === 'privacy');
  document.getElementById('legalTabCookies').classList.toggle('is-active', key === 'cookies');

  const body = document.getElementById('legalContent');
  const updated = document.getElementById('legalUpdated');
  body.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  updated.textContent = '';
  try {
    const doc = await db.getLegalDoc(key);
    document.getElementById('legalPageHeading').textContent = doc.title || heading;
    updated.textContent = doc.updated_at
      ? `Last updated ${new Date(doc.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : '';
    body.innerHTML = renderSafeMarkup(doc.content);
  } catch {
    body.innerHTML = `<p>Could not load this page right now.</p>`;
  }
}

/* ---- EMI Partners ----
   Shows the real financer registry rather than a static list, so the page
   can never drift out of sync with who is actually funding loans. */
async function initPartnersPage() {
  const wrap = document.getElementById('partnersList');
  wrap.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  let partners = [];
  try {
    const res = await db.getFinancers();
    partners = Array.isArray(res) ? res : [];
  } catch {
    wrap.innerHTML = `<div class="info-loading">Could not load partners right now.</div>`;
    return;
  }
  if (!partners.length) {
    wrap.innerHTML = `<div class="empty-state"><i class="fas fa-hand-holding-usd"></i><h3>Partners coming soon</h3><p>We're onboarding financing partners now. EMI will go live once the first is signed.</p></div>`;
    return;
  }
  wrap.innerHTML = partners.map(f => `
    <div class="partner-card">
      <div class="partner-logo">${escapeHtml((f.name || '?').charAt(0).toUpperCase())}</div>
      <div class="partner-main">
        <div class="partner-name">${escapeHtml(f.name || 'Partner')}</div>
        ${(f.city || f.state) ? `<div class="partner-loc"><i class="fas fa-location-dot"></i> ${escapeHtml([f.city, f.state].filter(Boolean).join(', '))}</div>` : ''}
        <div class="partner-meta">
          ${(f.min_interest_rate != null && f.max_interest_rate != null)
            ? `<span><strong>${f.min_interest_rate}%–${f.max_interest_rate}%</strong> p.a.</span>` : ''}
          ${(f.min_loan_amount != null && f.max_loan_amount != null)
            ? `<span>₹${formatNum(f.min_loan_amount)} – ₹${formatNum(f.max_loan_amount)}</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

/* ---- Blog ---- */
async function initBlogPage() {
  const wrap = document.getElementById('blogList');
  wrap.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  let posts = [];
  try {
    const res = await db.getBlogPosts();
    posts = Array.isArray(res) ? res : [];
  } catch {
    wrap.innerHTML = `<div class="info-loading">Could not load posts right now.</div>`;
    return;
  }
  if (!posts.length) {
    wrap.innerHTML = `<div class="empty-state"><i class="fas fa-feather"></i><h3>No posts yet</h3><p>Check back soon.</p></div>`;
    return;
  }
  wrap.innerHTML = posts.map(p => `
    <button class="blog-card" onclick="openBlogPost('${p.slug}')">
      <div class="blog-card-date">${p.published_at ? new Date(p.published_at).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : 'Draft'}</div>
      <h3>${escapeHtml(p.title)}</h3>
      ${p.excerpt ? `<p>${escapeHtml(p.excerpt)}</p>` : ''}
      <span class="blog-card-more">Read more <i class="fas fa-arrow-right"></i></span>
    </button>`).join('');
}

async function openBlogPost(slug) {
  showPage('blogPost');
  const wrap = document.getElementById('blogPostContent');
  wrap.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    const post = await db.getBlogPost(slug);
    wrap.innerHTML = `
      <article class="blog-article">
        <div class="blog-card-date">
          ${post.published_at ? new Date(post.published_at).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : 'Draft'}
          ${post.author_name ? ` · ${escapeHtml(post.author_name)}` : ''}
        </div>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="terms-rendered">${renderSafeMarkup(post.body)}</div>
      </article>
      <button class="btn-sm" style="margin-top:20px" onclick="showPage('blog')"><i class="fas fa-arrow-left"></i> All posts</button>`;
  } catch {
    wrap.innerHTML = `<div class="info-loading">That post could not be found.</div>`;
  }
}

/* ===== ADMIN: BLOG MANAGEMENT ===== */

let adminBlogPosts = [];

async function renderAdminBlog() {
  const box = document.getElementById('adminBlogList');
  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    // all=true so staff also see drafts, which the public list hides.
    const res = await db.getBlogPosts(true);
    adminBlogPosts = Array.isArray(res) ? res : [];
  } catch {
    box.innerHTML = `<div class="info-loading">Could not load posts.</div>`;
    return;
  }
  if (!adminBlogPosts.length) {
    box.innerHTML = `<div class="empty-state"><i class="fas fa-feather"></i><h3>No posts yet</h3><p>Write your first post.</p></div>`;
    return;
  }
  box.innerHTML = adminBlogPosts.map(p => `
    <div class="admin-faq-row ${p.is_published ? '' : 'is-draft'}">
      <div class="admin-faq-main">
        <div class="admin-faq-q">
          ${escapeHtml(p.title)}
          ${p.is_published ? '' : '<span class="admin-faq-draft-tag">Draft</span>'}
        </div>
        <div class="admin-faq-a">
          ${p.published_at ? new Date(p.published_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'Not published'}
          &middot; /${escapeHtml(p.slug)}
        </div>
      </div>
      <div class="admin-faq-actions">
        <button class="btn-sm" onclick="openBlogEditor('${p.post_id}')">Edit</button>
        <button class="btn-sm" onclick="toggleBlogPublished('${p.post_id}')">${p.is_published ? 'Unpublish' : 'Publish'}</button>
        <button class="btn-sm btn-sm-red" onclick="deleteBlogPost('${p.post_id}')">Delete</button>
      </div>
    </div>`).join('');
}

async function openBlogEditor(postId) {
  document.getElementById('blogEditorTitle').textContent = postId ? 'Edit Post' : 'New Post';
  document.getElementById('blogEditId').value = postId || '';
  document.getElementById('blogEditorError').classList.add('hidden');
  document.getElementById('blogEditorModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // The list response omits body (it would send every post in full), so the
  // editor fetches the single post it actually needs.
  const stub = postId ? adminBlogPosts.find(p => p.post_id === postId) : null;
  document.getElementById('blogTitle').value = stub ? stub.title : '';
  document.getElementById('blogExcerpt').value = stub ? (stub.excerpt || '') : '';
  document.getElementById('blogPublished').checked = stub ? stub.is_published : true;
  document.getElementById('blogBody').value = '';

  if (stub) {
    try {
      const full = await db.getBlogPost(stub.slug);
      document.getElementById('blogBody').value = full.body || '';
    } catch {
      showAuthError(document.getElementById('blogEditorError'), 'Could not load this post\u2019s content.');
    }
  }
}

function closeBlogEditor() {
  document.getElementById('blogEditorModal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveBlogPost() {
  const id = document.getElementById('blogEditId').value;
  const errEl = document.getElementById('blogEditorError');
  const payload = {
    title: document.getElementById('blogTitle').value.trim(),
    excerpt: document.getElementById('blogExcerpt').value.trim(),
    body: document.getElementById('blogBody').value.trim(),
    is_published: document.getElementById('blogPublished').checked,
  };
  if (!payload.title || !payload.body) {
    showAuthError(errEl, 'Title and body are both required.');
    return;
  }
  try {
    if (id) await db.updateBlogPost(id, payload); else await db.createBlogPost(payload);
    closeBlogEditor();
    showToast(id ? 'Post updated.' : 'Post published.', 'success');
    renderAdminBlog();
  } catch (err) {
    showAuthError(errEl, err.message || 'Could not save this post.');
  }
}

async function toggleBlogPublished(postId) {
  const post = adminBlogPosts.find(p => p.post_id === postId);
  if (!post) return;
  try {
    await db.updateBlogPost(postId, { is_published: !post.is_published });
    showToast(post.is_published ? 'Post unpublished.' : 'Post published.', 'success');
    renderAdminBlog();
  } catch (err) { showToast(err.message || 'Could not update this post.', 'error'); }
}

async function deleteBlogPost(postId) {
  const post = adminBlogPosts.find(p => p.post_id === postId);
  if (!confirm(`Delete this post?\n\n"${post ? post.title : ''}"\n\nThis cannot be undone.`)) return;
  try {
    await db.deleteBlogPost(postId);
    showToast('Post deleted.', 'info');
    renderAdminBlog();
  } catch (err) { showToast(err.message || 'Could not delete this post.', 'error'); }
}

/* ===== ADMIN: FAQ MANAGEMENT ===== */

let adminFaqData = { categories: [], items: [] };

async function renderAdminFaqs() {
  const box = document.getElementById('adminFaqList');
  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    // all=true so staff also see unpublished drafts, which visitors don't.
    const res = await db.getFaqs(true);
    adminFaqData = {
      categories: Array.isArray(res?.categories) ? res.categories : [],
      items: Array.isArray(res?.items) ? res.items : [],
    };
  } catch (err) {
    box.innerHTML = `<div class="info-loading">Could not load FAQs.</div>`;
    return;
  }
  if (!adminFaqData.items.length) {
    box.innerHTML = `<div class="empty-state"><i class="fas fa-circle-question"></i><h3>No FAQs yet</h3><p>Add your first help article.</p></div>`;
    return;
  }

  const labelFor = (code) => adminFaqData.categories.find(c => c.code === code)?.label || code;
  // Grouped by category so the ordering staff see matches the Help Centre.
  const groups = {};
  adminFaqData.items.forEach(f => { (groups[f.category] ||= []).push(f); });

  box.innerHTML = Object.entries(groups).map(([cat, rows]) => `
    <div class="admin-faq-group">
      <h4>${escapeHtml(labelFor(cat))}</h4>
      ${rows.map(f => `
        <div class="admin-faq-row ${f.is_published ? '' : 'is-draft'}">
          <div class="admin-faq-main">
            <div class="admin-faq-q">
              ${escapeHtml(f.question)}
              ${f.is_published ? '' : '<span class="admin-faq-draft-tag">Draft</span>'}
              ${f.show_in_help === false ? '<span class="admin-faq-bot-tag" title="Answered by the chatbot, hidden from the public Help Centre page">Bot only</span>' : ''}
              ${f.source === 'import' ? '<span class="admin-faq-src-tag">Imported</span>' : ''}
            </div>
            <div class="admin-faq-a">${escapeHtml(f.answer).slice(0, 160)}${f.answer.length > 160 ? '…' : ''}</div>
          </div>
          <div class="admin-faq-actions">
            <span class="admin-faq-order">#${f.sort_order}</span>
            <button class="btn-sm" onclick="openFaqEditor('${f.faq_id}')">Edit</button>
            <button class="btn-sm" onclick="toggleFaqPublished('${f.faq_id}')">${f.is_published ? 'Unpublish' : 'Publish'}</button>
            <button class="btn-sm" onclick="toggleFaqInHelp('${f.faq_id}')" title="${f.show_in_help === false ? 'Also show on the public Help Centre' : 'Hide from the Help Centre, keep answering in chat'}">${f.show_in_help === false ? 'Add to Help' : 'Hide from Help'}</button>
            <button class="btn-sm btn-sm-red" onclick="deleteFaq('${f.faq_id}')">Delete</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function openFaqEditor(faqId) {
  const faq = faqId ? adminFaqData.items.find(f => f.faq_id === faqId) : null;
  document.getElementById('faqEditorTitle').textContent = faq ? 'Edit FAQ' : 'Add FAQ';
  document.getElementById('faqEditId').value = faq ? faq.faq_id : '';
  document.getElementById('faqQuestion').value = faq ? faq.question : '';
  document.getElementById('faqAnswer').value = faq ? faq.answer : '';
  document.getElementById('faqKeywords').value = faq ? (faq.keywords || '') : '';
  document.getElementById('faqSortOrder').value = faq ? faq.sort_order : 0;
  document.getElementById('faqPublished').checked = faq ? faq.is_published : true;
  document.getElementById('faqShowInHelp').checked = faq ? faq.show_in_help !== false : true;
  document.getElementById('faqEditorError').classList.add('hidden');

  const cats = adminFaqData.categories.length
    ? adminFaqData.categories
    : [{ code: 'general', label: 'General' }];
  document.getElementById('faqCategory').innerHTML = cats
    .map(c => `<option value="${c.code}" ${faq && faq.category === c.code ? 'selected' : ''}>${escapeHtml(c.label)}</option>`)
    .join('');

  document.getElementById('faqEditorModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFaqEditor() {
  pendingUnansweredId = null;
  document.getElementById('faqEditorModal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveFaq() {
  const id = document.getElementById('faqEditId').value;
  const errEl = document.getElementById('faqEditorError');
  const payload = {
    question: document.getElementById('faqQuestion').value.trim(),
    answer: document.getElementById('faqAnswer').value.trim(),
    keywords: document.getElementById('faqKeywords').value.trim(),
    category: document.getElementById('faqCategory').value,
    sort_order: parseInt(document.getElementById('faqSortOrder').value, 10) || 0,
    is_published: document.getElementById('faqPublished').checked,
    show_in_help: document.getElementById('faqShowInHelp').checked,
  };
  if (!payload.question || !payload.answer) {
    showAuthError(errEl, 'Question and answer are both required.');
    return;
  }
  try {
    if (id) await db.updateFaq(id, payload); else await db.createFaq(payload);

    // If this editor was opened from the chatbot's unanswered list, that
    // gap is now filled — mark it resolved so it stops being suggested.
    if (pendingUnansweredId) {
      try { await db.resolveUnanswered(pendingUnansweredId); } catch { /* non-critical */ }
      const from = pendingUnansweredId;
      pendingUnansweredId = null;
      closeFaqEditor();
      showToast('Answer saved \u2014 the bot can now answer that question.', 'success');
      if (currentAdminSection === 'chatbot') { renderAdminChatbot(); return; }
      renderAdminFaqs();
      return;
    }

    closeFaqEditor();
    showToast(id ? 'FAQ updated.' : 'FAQ added.', 'success');
    renderAdminFaqs();
  } catch (err) {
    showAuthError(errEl, err.message || 'Could not save this FAQ.');
  }
}

async function toggleFaqPublished(faqId) {
  const faq = adminFaqData.items.find(f => f.faq_id === faqId);
  if (!faq) return;
  try {
    await db.updateFaq(faqId, { is_published: !faq.is_published });
    showToast(faq.is_published ? 'FAQ unpublished.' : 'FAQ published.', 'success');
    renderAdminFaqs();
  } catch (err) { showToast(err.message || 'Could not update this FAQ.', 'error'); }
}

/* Toggles Help Centre visibility without touching whether the chatbot can
   answer from the entry — the two are deliberately separate. */
async function toggleFaqInHelp(faqId) {
  const faq = adminFaqData.items.find(f => f.faq_id === faqId);
  if (!faq) return;
  const next = faq.show_in_help === false;   // currently hidden -> show it
  try {
    await db.updateFaq(faqId, { show_in_help: next });
    showToast(next ? 'Now shown on the Help Centre.' : 'Hidden from the Help Centre \u2014 the chatbot still answers it.', 'success');
    renderAdminFaqs();
  } catch (err) { showToast(err.message || 'Could not update this FAQ.', 'error'); }
}

async function deleteFaq(faqId) {
  const faq = adminFaqData.items.find(f => f.faq_id === faqId);
  if (!confirm(`Delete this FAQ?\n\n"${faq ? faq.question : ''}"\n\nThis cannot be undone.`)) return;
  try {
    await db.deleteFaq(faqId);
    showToast('FAQ deleted.', 'info');
    renderAdminFaqs();
  } catch (err) { showToast(err.message || 'Could not delete this FAQ.', 'error'); }
}

/* ===== ADMIN: SITE SETTINGS (feature switches) ===== */

async function renderAdminSettings() {
  // Re-read from the server rather than trusting the copy loaded at boot —
  // another admin may have flipped it since this tab was opened.
  await loadSiteSettings();
  const toggle = document.getElementById('emiEnabledToggle');
  const badge = document.getElementById('emiFlagBadge');
  if (toggle) toggle.checked = emiEnabled();
  if (badge) {
    badge.textContent = emiEnabled() ? 'Advertised site-wide' : 'Covered areas only';
    badge.className = `setting-badge ${emiEnabled() ? 'is-on' : 'is-off'}`;
  }
  document.getElementById('settingsError')?.classList.add('hidden');
}

async function toggleEmiFeature(enabled) {
  const errEl = document.getElementById('settingsError');
  const toggle = document.getElementById('emiEnabledToggle');

  if (enabled && !confirm(
    'Advertise EMI across the whole site?\n\n' +
    'EMI badges, the homepage section and the nav link become visible to everyone. ' +
    'Applications are still only possible in areas you have added under EMI Coverage.'
  )) {
    toggle.checked = false;
    return;
  }

  try {
    const updated = await db.updateSiteSetting('emi_enabled', enabled);
    siteSettings = { emi_enabled: updated?.emi_enabled === true };
    applyFeatureFlags();
    renderAdminSettings();
    showToast(emiEnabled()
      ? 'EMI is now advertised site-wide.'
      : 'EMI is now visible only in covered areas.', 'success');
  } catch (err) {
    // Put the switch back where it was so it never shows a state the
    // server didn't accept.
    toggle.checked = !enabled;
    showAuthError(errEl, err.message || 'Could not change this setting.');
  }
}


/* ===== EMI AVAILABILITY BY LOCATION ===== */

// Cached per pincode for the session: the answer only changes when an
// admin edits coverage, and re-asking on every click adds a visible delay
// to a button press.
let emiAvailabilityCache = {};

async function checkEmiAvailabilityForListing(listingId) {
  // Prefer the LISTING's pincode over the buyer's: EMI is underwritten
  // against where the goods are, and a buyer browsing from another city
  // shouldn't be blocked on their own location.
  let pincode = null;
  try {
    const listing = await getListingById(listingId);
    pincode = listing?.pincode || null;
  } catch { /* fall through to the selected area */ }
  if (!pincode) pincode = selectedArea?.prefix ? `${selectedArea.prefix}001` : null;
  if (!pincode) return { ok: true }; // nothing to check against; server still enforces

  if (emiAvailabilityCache[pincode]) return emiAvailabilityCache[pincode];

  try {
    const res = await db.getEmiAvailability({ pincode });
    const result = {
      ok: res.available === true,
      reason: res.reason,
      message: res.message || 'EMI is not available in your area yet.',
      pincode,
    };
    emiAvailabilityCache[pincode] = result;
    return result;
  } catch {
    // If the check itself fails, let the attempt through — the server
    // re-checks before creating anything, so a network blip shouldn't
    // block a buyer who is genuinely in a covered area.
    return { ok: true };
  }
}

function showEmiUnavailableModal(info) {
  const modal = document.getElementById('emiUnavailableModal');
  if (!modal) { showToast(info.message, 'info'); return; }
  // "not live yet" and "not in your area" are different situations, so the
  // heading shouldn't claim it's about location when it isn't.
  const heading = document.getElementById('emiUnavailableHeading');
  if (heading) {
    heading.textContent = info.pincode ? 'EMI not available here yet' : 'EMI coming soon';
  }
  document.getElementById('emiUnavailableText').textContent = info.message;
  const where = document.getElementById('emiUnavailableWhere');
  where.textContent = info.pincode ? `Checked for pincode ${info.pincode}` : '';
  where.classList.toggle('hidden', !info.pincode);
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeEmiUnavailableModal() {
  document.getElementById('emiUnavailableModal').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ===== ADMIN: EMI COVERAGE AREAS ===== */

let adminEmiAreas = [];

async function renderAdminEmiAreas() {
  const box = document.getElementById('emiAreaList');
  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    const res = await db.adminGetEmiAreas();
    adminEmiAreas = Array.isArray(res) ? res : [];
  } catch (err) {
    box.innerHTML = `<div class="info-loading">Could not load coverage areas.</div>`;
    return;
  }
  onEmiAreaScopeChange();

  if (!adminEmiAreas.length) {
    box.innerHTML = `<div class="empty-state">
      <i class="fas fa-map-location-dot"></i>
      <h3>No coverage areas</h3>
      <p>EMI is currently unavailable everywhere. Add a state, district or pincode above once a financing partner confirms their region.</p>
    </div>`;
    return;
  }

  // Grouped by precedence so the effective rules read in the order the
  // server actually evaluates them.
  const order = { pincode: 0, district: 1, state: 2 };
  const sorted = [...adminEmiAreas].sort((a, b) =>
    (order[a.scope_type] - order[b.scope_type]) || a.scope_value.localeCompare(b.scope_value));

  box.innerHTML = `
    <div class="admin-faq-group"><h4>Active rules (most specific first)</h4>
    ${sorted.map(a => `
      <div class="admin-faq-row ${a.is_enabled ? '' : 'is-draft'}">
        <div class="admin-faq-main">
          <div class="admin-faq-q">
            ${escapeHtml(a.scope_value)}
            <span class="emi-area-scope">${a.scope_type}</span>
            ${a.is_enabled
              ? '<span class="status-pill status-approved">Available</span>'
              : '<span class="status-pill status-rejected">Excluded</span>'}
          </div>
          ${a.note ? `<div class="admin-faq-a">${escapeHtml(a.note)}</div>` : ''}
        </div>
        <div class="admin-faq-actions">
          <button class="btn-sm" onclick="toggleEmiArea('${a.area_id}')">${a.is_enabled ? 'Exclude' : 'Enable'}</button>
          <button class="btn-sm btn-sm-red" onclick="deleteEmiArea('${a.area_id}')">Remove</button>
        </div>
      </div>`).join('')}
    </div>`;
}

/* Suggestions come from the live pincode table, so an admin can't typo a
   district name that will silently never match anything. */
/* Suggestions for the coverage picker.

   Sourced from the dedicated /states and /districts endpoints, which return
   DISTINCT values across the whole pincode table. The earlier version
   derived them from the first 100 major cities, so most states — including
   Himachal Pradesh, the launch state — never appeared. */
let emiAreaOptions = [];

async function onEmiAreaScopeChange() {
  const scope = document.getElementById('emiAreaScope')?.value;
  const input = document.getElementById('emiAreaValue');
  if (!input) return;

  input.placeholder = scope === 'state' ? 'Start typing a state...'
    : scope === 'district' ? 'Start typing a district...' : 'e.g. 175001';
  input.value = '';
  hideEmiAreaSuggestions();

  if (scope === 'pincode') { emiAreaOptions = []; return; }

  try {
    if (scope === 'state') {
      const states = await db.getLocationStates();
      emiAreaOptions = (Array.isArray(states) ? states : []).map(v => ({ label: v, sub: '' }));
    } else {
      const rows = await db.getLocationDistricts();
      // 750 districts, and names repeat across states — showing the state
      // alongside is what makes "Aurangabad" pickable without ambiguity.
      emiAreaOptions = (Array.isArray(rows) ? rows : [])
        .map(r => ({ label: r.district, sub: r.state }));
    }
  } catch {
    emiAreaOptions = [];
  }
}

function filterEmiAreaSuggestions() {
  const input = document.getElementById('emiAreaValue');
  const box = document.getElementById('emiAreaSuggestions');
  if (!input || !box) return;

  const q = input.value.trim().toLowerCase();
  if (!emiAreaOptions.length) { hideEmiAreaSuggestions(); return; }

  const matches = emiAreaOptions
    .filter(o => !q || o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q))
    // Names starting with what was typed rank above ones merely containing it.
    .sort((a, b) => {
      const as = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.label.localeCompare(b.label);
    })
    .slice(0, 60); // capped so 750 districts don't build a giant DOM

  if (!matches.length) { hideEmiAreaSuggestions(); return; }

  box.innerHTML = matches.map(o => `
    <button type="button" class="combo-option" onclick="pickEmiAreaSuggestion('${escapeHtml(o.label).replace(/'/g, "\\'")}')">
      <span>${escapeHtml(o.label)}</span>
      ${o.sub ? `<small>${escapeHtml(o.sub)}</small>` : ''}
    </button>`).join('');
  box.classList.remove('hidden');
}

function pickEmiAreaSuggestion(value) {
  const input = document.getElementById('emiAreaValue');
  if (input) input.value = value;
  hideEmiAreaSuggestions();
}

function hideEmiAreaSuggestions() {
  document.getElementById('emiAreaSuggestions')?.classList.add('hidden');
}

// Close when clicking away — without this the list stays open over the
// rest of the form.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo-wrap')) hideEmiAreaSuggestions();
});

async function saveEmiArea() {
  const errEl = document.getElementById('emiAreaError');
  const payload = {
    scope_type: document.getElementById('emiAreaScope').value,
    scope_value: document.getElementById('emiAreaValue').value.trim(),
    note: document.getElementById('emiAreaNote').value.trim(),
    is_enabled: document.getElementById('emiAreaEnabled').checked,
  };
  if (!payload.scope_value) { showAuthError(errEl, 'Enter a location.'); return; }
  try {
    await db.adminCreateEmiArea(payload);
    document.getElementById('emiAreaValue').value = '';
    document.getElementById('emiAreaNote').value = '';
    errEl.classList.add('hidden');
    showToast('Coverage rule saved.', 'success');
    renderAdminEmiAreas();
  } catch (err) {
    showAuthError(errEl, err.message || 'Could not save this rule.');
  }
}

async function toggleEmiArea(areaId) {
  const area = adminEmiAreas.find(a => a.area_id === areaId);
  if (!area) return;
  try {
    await db.adminUpdateEmiArea(areaId, { is_enabled: !area.is_enabled });
    showToast(area.is_enabled ? 'Area excluded from EMI.' : 'Area now covered.', 'success');
    renderAdminEmiAreas();
  } catch (err) { showToast(err.message || 'Could not update.', 'error'); }
}

async function deleteEmiArea(areaId) {
  const area = adminEmiAreas.find(a => a.area_id === areaId);
  if (!confirm(`Remove this rule?\n\n${area ? area.scope_type + ': ' + area.scope_value : ''}\n\nCoverage then falls back to any broader rule, or to unavailable.`)) return;
  try {
    await db.adminDeleteEmiArea(areaId);
    showToast('Rule removed.', 'info');
    renderAdminEmiAreas();
  } catch (err) { showToast(err.message || 'Could not remove.', 'error'); }
}

/* ===== SUPPORT CHATBOT =====
   Answers come from the server's FAQ table and the signed-in user's own
   records. There is no language model, so it can't invent an answer — when
   nothing matches it says so and offers Contact Us. */

let botOpen = false;
let botGreeted = false;
let botBusy = false;

function toggleBot(force) {
  const next = typeof force === 'boolean' ? force : !botOpen;
  if (next === botOpen) return;

  if (next) {
    openBotPanel();
    // Registered on the modal stack so Back closes the assistant. Without
    // this the bot was invisible to history, and on a phone — where it fills
    // the screen — Back looked like it was closing the chat but actually
    // navigated off the site entirely.
    pushModal('bot');
  } else {
    closeTopModal('bot');
  }
}

/* Shows/hides the panel WITHOUT touching history. toggleBot() drives the
   history side; MODAL_HIDE calls this one when Back or Escape pops the
   stack, which would otherwise recurse. */
function setBotPanel(open) {
  botOpen = open;
  document.getElementById('botPanel')?.classList.toggle('hidden', !open);
  document.getElementById('botFab')?.classList.toggle('is-open', open);
  // Lock the page behind so it can't scroll under the full-screen panel on
  // mobile. Only lock here — hideModal() does the unlocking, and only once
  // the whole stack is empty, so closing the bot on top of an open product
  // modal doesn't wrongly release that one's lock too.
  if (open) document.body.style.overflow = 'hidden';
}

function openBotPanel() {
  setBotPanel(true);
  if (!botGreeted) loadBotGreeting();
  setTimeout(() => document.getElementById('botInput')?.focus(), 120);
}

async function loadBotGreeting() {
  botGreeted = true;
  try {
    const res = await db.getChatbotGreeting();
    addBotMessage(res.reply, 'bot');
    renderBotChips(res.quick_replies || []);
  } catch {
    addBotMessage("Hi! Ask me about how DealBriz works, or your own listings.", 'bot');
  }
}

function renderBotChips(questions) {
  const box = document.getElementById('botChips');
  if (!box) return;
  box.innerHTML = (questions || []).map(q =>
    `<button type="button" class="bot-chip" onclick="askBotQuick('${escapeHtml(q).replace(/'/g, "\\'")}')">${escapeHtml(q)}</button>`
  ).join('');
}

function askBotQuick(question) {
  const input = document.getElementById('botInput');
  if (input) input.value = question;
  sendBotMessage();
}

/* Renders one message. Bot replies come from our own database, but they're
   still escaped before display — an admin-authored FAQ answer shouldn't be
   able to inject markup into every user's page. Only the small markdown
   subset below becomes real formatting. */
function addBotMessage(text, who, extras = {}) {
  const log = document.getElementById('botLog');
  if (!log) return null;

  const row = document.createElement('div');
  row.className = `bot-msg bot-msg-${who}`;

  const bubble = document.createElement('div');
  bubble.className = 'bot-bubble';
  bubble.innerHTML = who === 'bot' ? renderSafeMarkup(text) : escapeHtml(text);
  row.appendChild(bubble);

  // "Did you mean" suggestions — offered as questions to tap, never
  // presented as the answer to what was actually asked.
  if (extras.related && extras.related.length) {
    const rel = document.createElement('div');
    rel.className = 'bot-related';
    rel.innerHTML = `<span>Related:</span>` + extras.related.map(q =>
      `<button type="button" class="bot-chip bot-chip-sm" onclick="askBotQuick('${escapeHtml(q).replace(/'/g, "\\'")}')">${escapeHtml(q)}</button>`
    ).join('');
    row.appendChild(rel);
  }

  if (extras.action) {
    const a = extras.action;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bot-action';
    btn.textContent = a.label || 'Open';
    btn.onclick = () => {
      toggleBot(false);
      if (a.type === 'login') openModal();
      else if (a.page) showPage(a.page);
    };
    row.appendChild(btn);
  }

  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return row;
}

function showBotTyping() {
  const log = document.getElementById('botLog');
  const row = document.createElement('div');
  row.className = 'bot-msg bot-msg-bot bot-typing';
  row.innerHTML = `<div class="bot-bubble"><span></span><span></span><span></span></div>`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return row;
}

async function sendBotMessage(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('botInput');
  const message = (input?.value || '').trim();
  if (!message || botBusy) return;

  botBusy = true;
  input.value = '';
  addBotMessage(message, 'user');
  renderBotChips([]);            // chips are for the opening turn only
  const typing = showBotTyping();

  try {
    // Send the selected area so "near me" resolves to somewhere real.
    const pincode = selectedArea?.pincode
      || (selectedArea?.prefix ? `${selectedArea.prefix}001` : null);
    const res = await db.askChatbot(message, pincode);
    typing.remove();
    addBotMessage(res.reply, 'bot', {
      related: res.related,
      action: res.action,
    });
  } catch (err) {
    typing.remove();
    // Even a transport failure ends with a route to a human.
    addBotMessage(
      "I couldn't reach our help service just now. Our support team can still help.",
      'bot',
      { action: { type: 'page', page: 'contact', label: 'Contact Us' } }
    );
  } finally {
    botBusy = false;
    input?.focus();
  }
}

/* ===== ADMIN: CHATBOT LEARNING QUEUE ===== */

let adminUnanswered = [];

async function renderAdminChatbot() {
  const box = document.getElementById('adminChatbotList');
  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    const res = await db.getUnansweredQuestions();
    adminUnanswered = Array.isArray(res) ? res : [];
  } catch {
    box.innerHTML = `<div class="info-loading">Could not load chatbot questions.</div>`;
    return;
  }
  if (!adminUnanswered.length) {
    box.innerHTML = `<div class="empty-state">
      <i class="fas fa-robot"></i><h3>Nothing unanswered</h3>
      <p>The bot has handled every question asked so far. Anything it can't answer will appear here.</p>
    </div>`;
    return;
  }
  box.innerHTML = adminUnanswered.map(u => `
    <div class="admin-faq-row">
      <div class="admin-faq-main">
        <div class="admin-faq-q">
          ${escapeHtml(u.question)}
          <span class="ask-count">asked ${u.ask_count}\u00d7</span>
        </div>
        <div class="admin-faq-a">
          Last asked ${u.last_asked ? new Date(u.last_asked).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '\u2014'}
          ${u.best_score != null ? ` \u00b7 closest FAQ scored ${u.best_score}` : ''}
        </div>
      </div>
      <div class="admin-faq-actions">
        <button class="btn-sm btn-sm-blue" onclick="answerUnanswered('${u.id}')">Answer this</button>
        <button class="btn-sm" onclick="dismissUnanswered('${u.id}')">Dismiss</button>
      </div>
    </div>`).join('');
}

/* Opens the FAQ editor pre-filled with the exact question a user asked, so
   the answer is written against their words rather than a paraphrase. */
async function answerUnanswered(id) {
  const item = adminUnanswered.find(u => u.id === id);
  if (!item) return;

  // The editor reads its category list from adminFaqData, which may not be
  // loaded if the admin came straight here.
  if (!adminFaqData.categories.length) {
    try {
      const res = await db.getFaqs(true);
      adminFaqData = {
        categories: Array.isArray(res?.categories) ? res.categories : [],
        items: Array.isArray(res?.items) ? res.items : [],
      };
    } catch { /* editor still opens with a default category */ }
  }

  openFaqEditor();
  document.getElementById('faqQuestion').value = item.question;
  // Seed keywords from the user's own wording — that's what future askers
  // will type too.
  document.getElementById('faqKeywords').value = item.question
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2).slice(0, 12).join(' ');
  pendingUnansweredId = id;
  setTimeout(() => document.getElementById('faqAnswer')?.focus(), 150);
}

// Set when the FAQ editor was opened from the learning queue, so saving can
// close the loop and mark that gap handled.
let pendingUnansweredId = null;

async function dismissUnanswered(id) {
  try {
    await db.resolveUnanswered(id);
    showToast('Dismissed.', 'info');
    renderAdminChatbot();
  } catch (err) { showToast(err.message || 'Could not dismiss.', 'error'); }
}

/* ===== ADMIN: ROLES & ACCESS (superadmin only) ===== */

let roleMatrix = null;
let roleDraft = {};   // role -> Set(capabilities), edited but not yet saved

// Human labels. The API sends capability strings like "emi.review"; showing
// those raw would make this screen unreadable for anyone who didn't write it.
const CAPABILITY_LABELS = {
  'dashboard.view': 'View dashboard & charts',
  'emi.view': 'View EMI applications',
  'emi.review': 'Approve / reject EMI applications',
  'emi.delete': 'Delete EMI applications',
  'users.view': 'View users',
  'users.suspend': 'Suspend user accounts',
  'users.delete': 'Delete user accounts',
  'users.assign_role': 'Assign roles to users',
  'products.view': 'View listings',
  'products.edit': 'Edit listings',
  'products.delete': 'Delete listings',
  'purchases.view': 'View purchases',
  'financers.view': 'View financing partners',
  'financers.manage': 'Add / edit financing partners',
  'reports.view': 'View reports queue',
  'reports.resolve': 'Resolve reports',
  'faqs.manage': 'Manage FAQs & chatbot answers',
  'blog.manage': 'Manage blog posts',
  'legal.edit': 'Edit legal & content pages',
  'settings.manage': 'Change site settings & EMI coverage',
  'logs.view': 'Read application logs',
  'deals.view': 'View DealLock deals (staff queue)',
  'deals.manage': 'Run DealLock deals: check documents, set lender, Ready to pay, Paid, disputes',
  'lender.portal': 'Lender portal: only their own lender\u2019s loans, deals and documents',
};

const CAPABILITY_GROUPS = [
  ['Overview', ['dashboard.view']],
  ['EMI', ['emi.view', 'emi.review', 'emi.delete']],
  ['Users', ['users.view', 'users.suspend', 'users.delete', 'users.assign_role']],
  ['Listings', ['products.view', 'products.edit', 'products.delete']],
  ['Sales & partners', ['purchases.view', 'financers.view', 'financers.manage']],
  ['DealLock', ['deals.view', 'deals.manage', 'lender.portal']],
  ['Moderation', ['reports.view', 'reports.resolve']],
  ['Content', ['faqs.manage', 'blog.manage', 'legal.edit']],
  ['Platform', ['settings.manage']],
  ['Diagnostics', ['logs.view']],
];

// Capabilities that grant irreversible power. Flagged in the UI so a
// superadmin granting them is making a deliberate choice, not a stray click.
const SENSITIVE_CAPS = new Set([
  'users.delete', 'users.assign_role', 'legal.edit', 'settings.manage', 'emi.delete',
  'deals.manage',
]);

async function renderAdminRoles() {
  const box = document.getElementById('adminRolesBody');
  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    roleMatrix = await db.adminGetRolePermissions();
  } catch (err) {
    box.innerHTML = `<div class="info-loading">${escapeHtml(err.message || 'Could not load role permissions.')}</div>`;
    return;
  }
  roleDraft = {};
  roleMatrix.roles.forEach(r => { roleDraft[r.role] = new Set(r.capabilities); });
  drawRoleMatrix();
}

function drawRoleMatrix() {
  const box = document.getElementById('adminRolesBody');
  box.innerHTML = roleMatrix.roles.map(r => {
    const draft = roleDraft[r.role];
    const locked = !r.is_editable;
    const changed = !locked && !setsEqual(draft, new Set(r.capabilities));

    const groups = CAPABILITY_GROUPS.map(([title, caps]) => `
      <div class="role-group">
        <h5>${escapeHtml(title)}</h5>
        ${caps.map(cap => `
          <label class="role-cap ${SENSITIVE_CAPS.has(cap) ? 'is-sensitive' : ''}">
            <input type="checkbox" ${draft.has(cap) ? 'checked' : ''} ${locked ? 'disabled' : ''}
                   onchange="toggleRoleCap('${r.role}','${cap}',this.checked)">
            <span>${escapeHtml(CAPABILITY_LABELS[cap] || cap)}</span>
            ${SENSITIVE_CAPS.has(cap) ? '<i class="fas fa-triangle-exclamation" title="Irreversible action"></i>' : ''}
          </label>`).join('')}
      </div>`).join('');

    return `
      <div class="role-card ${locked ? 'is-locked' : ''}">
        <div class="role-head">
          <div>
            <strong>${escapeHtml(r.role)}</strong>
            ${locked ? '<span class="role-tag role-tag-locked">Fixed</span>' : ''}
            ${r.is_customised ? '<span class="role-tag">Customised</span>' : '<span class="role-tag role-tag-muted">Defaults</span>'}
            <div class="role-count">${draft.size} of ${roleMatrix.capabilities.length} permissions</div>
          </div>
          ${locked ? '' : `
            <div class="role-actions">
              ${r.is_customised ? `<button class="btn-sm" onclick="resetRole('${r.role}')">Reset to defaults</button>` : ''}
              <button class="btn-primary btn-sm-inline ${changed ? '' : 'is-disabled'}"
                      ${changed ? '' : 'disabled'} onclick="saveRole('${r.role}')">
                ${changed ? 'Save changes' : 'Saved'}
              </button>
            </div>`}
        </div>
        ${locked ? '<p class="role-locked-note">Superadmins always have every permission. Changing it would make the platform impossible to administer.</p>' : ''}
        <div class="role-groups">${groups}</div>
      </div>`;
  }).join('');
}

function setsEqual(a, b) {
  return a.size === b.size && [...a].every(x => b.has(x));
}

function toggleRoleCap(role, cap, on) {
  const draft = roleDraft[role];
  if (!draft) return;
  if (on) draft.add(cap); else draft.delete(cap);

  // Viewing is implied by acting: granting "approve EMI" without "view EMI"
  // produces a role that can act on a screen it can't open.
  const IMPLIES = {
    'emi.review': 'emi.view', 'emi.delete': 'emi.view',
    'users.suspend': 'users.view', 'users.delete': 'users.view', 'users.assign_role': 'users.view',
    'products.edit': 'products.view', 'products.delete': 'products.view',
    'financers.manage': 'financers.view',
    'reports.resolve': 'reports.view',
  };
  if (on && IMPLIES[cap]) draft.add(IMPLIES[cap]);
  // And removing the view removes everything that depends on it.
  if (!on) {
    Object.entries(IMPLIES).forEach(([child, parent]) => {
      if (parent === cap) draft.delete(child);
    });
  }
  drawRoleMatrix();
}

async function saveRole(role) {
  try {
    await db.adminSetRolePermissions(role, [...roleDraft[role]]);
    showToast(`Permissions updated for ${role}.`, 'success');
    renderAdminRoles();
  } catch (err) {
    showToast(err.message || 'Could not save permissions.', 'error');
  }
}

async function resetRole(role) {
  if (!confirm(`Reset ${role} to the built-in default permissions?`)) return;
  try {
    await db.adminResetRolePermissions(role);
    showToast(`${role} reset to defaults.`, 'info');
    renderAdminRoles();
  } catch (err) {
    showToast(err.message || 'Could not reset.', 'error');
  }
}

/* ===== ADMIN: APPLICATION LOGS =====
   Lets an on-call developer read the logs without shell access to the
   production host. Read-only by design — the `dev` role can see everything
   here and change nothing, because debugging a problem should never
   require the ability to delete the evidence. */

let logFiles = [];
let logActiveFile = 'error';   // errors first: that's what you open logs for
let logActiveLevel = 'ALL';
let logSearchTimer = null;

// Level -> colour class. ERROR/CRITICAL red, WARNING amber, INFO neutral,
// DEBUG muted, so severity is readable at a glance without reading text.
const LOG_LEVEL_CLASS = {
  CRITICAL: 'log-critical',
  ERROR: 'log-error',
  WARNING: 'log-warn',
  WARN: 'log-warn',
  INFO: 'log-info',
  DEBUG: 'log-debug',
};
const LOG_LEVELS = ['ALL', 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];

async function renderAdminLogs() {
  const tabs = document.getElementById('logFileTabs');
  tabs.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
  try {
    const res = await db.getLogFiles();
    logFiles = Array.isArray(res?.files) ? res.files : [];
  } catch (err) {
    tabs.innerHTML = `<div class="info-loading">${escapeHtml(err.message || 'Could not load log files.')}</div>`;
    return;
  }

  tabs.innerHTML = logFiles.map(f => `
    <button class="log-file ${f.key === logActiveFile ? 'is-active' : ''} ${f.exists ? '' : 'is-empty'}"
            onclick="selectLogFile('${f.key}')" title="${escapeHtml(f.description)}">
      <strong>${escapeHtml(f.name)}</strong>
      <span>${f.exists ? formatBytes(f.size_bytes) : 'not created yet'}</span>
    </button>`).join('');

  renderLogLevelFilters();
  loadLogEntries();
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderLogLevelFilters() {
  document.getElementById('logLevelFilters').innerHTML = LOG_LEVELS.map(l => `
    <button class="log-level-btn ${l === logActiveLevel ? 'is-active' : ''} ${LOG_LEVEL_CLASS[l] || ''}"
            onclick="setLogLevel('${l}')">${l}</button>`).join('');
}

function selectLogFile(key) {
  logActiveFile = key;
  renderAdminLogs();
}

function setLogLevel(level) {
  logActiveLevel = level;
  renderLogLevelFilters();
  loadLogEntries();
}

// Typing in a 2000-line log shouldn't fire a request per keystroke.
function debouncedLogSearch() {
  clearTimeout(logSearchTimer);
  logSearchTimer = setTimeout(loadLogEntries, 300);
}

async function loadLogEntries() {
  const box = document.getElementById('logEntries');
  const meta = document.getElementById('logMeta');
  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Reading log...</div>`;

  const limit = document.getElementById('logLimit')?.value || 300;
  const q = document.getElementById('logSearch')?.value || '';

  let res;
  try {
    res = await db.viewLog(logActiveFile, { limit, level: logActiveLevel, q });
  } catch (err) {
    box.innerHTML = `<div class="info-loading">${escapeHtml(err.message || 'Could not read that log.')}</div>`;
    meta.innerHTML = '';
    return;
  }

  const entries = Array.isArray(res.entries) ? res.entries : [];
  const counts = res.counts || {};
  meta.innerHTML = `
    <span>Showing <strong>${entries.length}</strong> of ${res.total || 0} matching lines</span>
    ${Object.entries(counts).map(([lvl, n]) =>
      `<span class="log-count ${LOG_LEVEL_CLASS[lvl] || ''}">${escapeHtml(lvl)} ${n}</span>`).join('')}`;

  if (!entries.length) {
    box.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i>
      <h3>Nothing to show</h3><p>${res.note ? escapeHtml(res.note) : 'No log lines match the current filters.'}</p></div>`;
    return;
  }

  box.innerHTML = entries.map((e, i) => {
    const cls = LOG_LEVEL_CLASS[e.level] || 'log-info';
    const hasDetail = e.detail && e.detail.trim();
    return `
      <div class="log-row ${cls}">
        <div class="log-row-head" ${hasDetail ? `onclick="toggleLogDetail(${i})"` : ''}>
          <span class="log-time">${escapeHtml(e.timestamp || '')}</span>
          <span class="log-badge ${cls}">${escapeHtml(e.level)}</span>
          <span class="log-logger">${escapeHtml(e.logger || '')}</span>
          <span class="log-msg">${escapeHtml(e.message)}</span>
          ${hasDetail ? `<i class="fas fa-chevron-down log-caret" id="logCaret${i}"></i>` : ''}
        </div>
        ${hasDetail ? `<pre class="log-detail hidden" id="logDetail${i}">${escapeHtml(e.detail)}</pre>` : ''}
      </div>`;
  }).join('');
}

function toggleLogDetail(i) {
  const el = document.getElementById(`logDetail${i}`);
  const caret = document.getElementById(`logCaret${i}`);
  if (!el) return;
  const open = el.classList.toggle('hidden');
  if (caret) caret.style.transform = open ? '' : 'rotate(180deg)';
}

/* ===== SELL FORM: CATEGORY-SPECIFIC FIELDS =====
   Rendered from the server's definitions rather than a copy in JS, so the
   form, the search parser and the database can't drift apart. These are
   what make "2018 model under 1 lakh km" searchable at all — without them
   there is nothing to filter on. */

let sellAttrDefs = [];


/* Year options, newest first — next year included because dealers list
   upcoming model years, and bounded by the attribute's own min if it has one
   rather than a number hardcoded here. */
function yearOptionsHtml(attr, inputId) {
  const now = new Date().getFullYear();
  const max = attr.max != null ? Number(attr.max) : now + 1;
  const min = attr.min != null ? Number(attr.min) : 1950;
  let out = '';
  for (let y = max; y >= min; y--) {
    out += `<button type="button" class="combo-opt" onclick="pickComboValue('${inputId}', this.textContent)">${y}</button>`;
  }
  return out;
}

/* ===== COMBO DROPDOWN =====
   One implementation, used by the brand field and the year field. A plain
   scrollable div positioned under the input, rather than a native
   <datalist>: browsers draw a datalist popup wherever they choose — pinned
   to the side of the window, or flipped upward near the bottom — and no CSS
   can move it. This is ordinary DOM, so it always opens downward, and typing
   a value that is not on the list is still allowed.

   Convention: an input with id X has its menu at id X_menu. */
function openComboMenu(inputId) {
  document.querySelectorAll('.combo-menu').forEach(m => {
    if (m.id !== inputId + '_menu') m.classList.add('hidden');
  });
  const menu = document.getElementById(inputId + '_menu');
  if (!menu || !menu.children.length) return;
  menu.classList.remove('hidden');
  filterComboMenu(inputId);
  // Bring the current value into view rather than always starting at the top
  // — on the year list that is otherwise a long scroll every time.
  const active = menu.querySelector('.combo-opt.is-active');
  if (active) active.scrollIntoView({ block: 'center' });
}

function filterComboMenu(inputId) {
  const input = document.getElementById(inputId);
  const menu = document.getElementById(inputId + '_menu');
  if (!input || !menu) return;
  const q = (input.value || '').trim().toLowerCase();
  let shown = 0;
  menu.querySelectorAll('.combo-opt').forEach(btn => {
    const text = btn.textContent.trim();
    // Prefix match, not "contains": typing "hy" should offer Hyundai, not
    // every brand with an h in the middle.
    const match = !q || text.toLowerCase().startsWith(q);
    btn.classList.toggle('hidden', !match);
    btn.classList.toggle('is-active', text.toLowerCase() === q);
    if (match) shown++;
  });
  // An off-list value is valid, so no matches is not an error — close the
  // menu and let the user finish typing.
  menu.classList.toggle('hidden', shown === 0);
}

function pickComboValue(inputId, value) {
  const input = document.getElementById(inputId);
  if (input) { input.value = String(value).trim(); input.dispatchEvent(new Event('change')); }
  document.getElementById(inputId + '_menu')?.classList.add('hidden');
}

/* Whole numbers only, never negative. A count of owners or kilometres has no
   fractional or negative meaning, and min/step alone do not stop typing or
   pasting "-2.5" — they only constrain the spinner and form validation. */
function clampWholeNumber(input) {
  let v = (input.value || '').replace(/[^0-9]/g, '');
  v = v.replace(/^0+(?=\d)/, '');   // strip leading zeros, keep a lone "0"
  input.value = v;
  // The year field is a text input (so the combo can drive it), so filter its
  // list as the digits change.
  if (input.id && document.getElementById(input.id + '_menu')) filterComboMenu(input.id);
}

async function renderSellAttributes(category, existing = {}) {
  const box = document.getElementById('sellAttributes');
  if (!box) return;
  if (!category) { box.innerHTML = ''; sellAttrDefs = []; return; }

  box.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Loading fields...</div>`;
  try {
    const res = await db.getCategoryAttributes(category);
    sellAttrDefs = Array.isArray(res?.attributes) ? res.attributes : [];
  } catch {
    // A failed load must not block posting — these fields are optional.
    sellAttrDefs = [];
    box.innerHTML = '';
    return;
  }
  if (!sellAttrDefs.length) { box.innerHTML = ''; return; }

  box.innerHTML = `
    <div class="sell-attrs-head">
      <strong>${escapeHtml(category.charAt(0).toUpperCase() + category.slice(1))} details</strong>
      <small>Optional, but buyers filter on these \u2014 listings with them get found more often.</small>
    </div>
    <div class="sell-attrs-grid">
      ${sellAttrDefs.map(a => {
        const val = existing[a.key] != null ? String(existing[a.key]) : '';
        const id = `sellAttr_${a.key}`;
        if (a.type === 'select') {
          return `<div class="form-group">
            <label for="${id}">${escapeHtml(a.label)}</label>
            <select id="${id}">
              <option value="">Not specified</option>
              ${(a.options || []).map(o =>
                `<option value="${escapeHtml(o)}" ${o === val ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
            </select>
          </div>`;
        }
        // Year uses a custom dropdown, not a <datalist>. The browser draws a
        // datalist popup wherever it likes — sideways or upward near a
        // viewport edge — and no CSS can reposition it. This one is ordinary
        // DOM, so it always opens downward, directly under the input, and
        // still accepts typing for a year outside the list.
        const isYear = a.key === 'year';
        const listAttr = isYear ? ` autocomplete="off" onfocus="openComboMenu('${id}')" onclick="openComboMenu('${id}')"` : '';
        const yearList = isYear
          ? `<div class="combo-menu hidden" id="${id}_menu">${yearOptionsHtml(a, id)}</div>`
          : '';

        const type = a.type === 'number' ? 'number' : 'text';
        // step="1" plus the integer guard below: counts like owners, year and
        // kilometres are whole numbers. Without step, browsers accept "2.5
        // owners" and the spinner offers decimals.
        const bounds = a.type === 'number'
          ? `${a.min != null ? `min="${a.min}"` : 'min="0"'} ${a.max != null ? `max="${a.max}"` : ''} step="1" inputmode="numeric" oninput="clampWholeNumber(this)"`
          : '';
        return `<div class="form-group${isYear ? ' combo-group' : ''}">
          <label for="${id}">${escapeHtml(a.label)}${a.unit ? ` <span class="opt">(${escapeHtml(a.unit)})</span>` : ''}</label>
          <input type="${isYear ? 'text' : type}" id="${id}" ${bounds}${listAttr}
                 placeholder="${escapeHtml(a.placeholder || '')}" value="${escapeHtml(val)}">
          ${yearList}
        </div>`;
      }).join('')}
    </div>`;
}

/* Collects the filled-in fields. Blanks are omitted rather than stored as
   empty strings, which would otherwise match "colour = nothing" filters. */
function collectSellAttributes() {
  const out = {};
  sellAttrDefs.forEach(a => {
    const el = document.getElementById(`sellAttr_${a.key}`);
    if (!el) return;
    const v = (el.value || '').trim();
    if (v) out[a.key] = v;
  });
  return out;
}

/* ===== NATURAL-LANGUAGE SEARCH =====
   The server parses queries like "hyundai car 2018 under 5 lac below 1 lac
   km" into real filters. This handles the suggestion dropdown and shows
   what was understood, so a user who sees "Under ₹5,00,000" knows why a
   ₹6L car is missing rather than assuming search is broken. */

let suggestTimer = null;
let suggestToken = 0;
let suggestIndex = -1;

function onSearchInput(inputId, boxId) {
  clearTimeout(suggestTimer);
  const value = (document.getElementById(inputId)?.value || '').trim();
  if (value.length < 2) { hideSuggest(boxId); return; }
  // Debounced: typing a sentence shouldn't fire a request per character.
  suggestTimer = setTimeout(() => fetchSuggestions(value, boxId, inputId), 180);
}

async function fetchSuggestions(query, boxId, inputId) {
  const token = ++suggestToken;
  let res;
  try {
    res = await db.searchSuggest(query);
  } catch {
    hideSuggest(boxId);
    return;
  }
  // Guards against a slow early request overwriting a later one.
  if (token !== suggestToken) return;

  const box = document.getElementById(boxId);
  if (!box) return;
  const items = res.suggestions || [];
  const parsed = res.parsed || {};

  // The interpretation is more reassuring than the suggestions themselves:
  // it shows the search understood "under 5 lac" as a budget.
  const chips = (parsed.matched || []).slice(0, 6);
  const head = chips.length
    ? `<div class="suggest-parsed">${chips.map(c =>
        `<span class="suggest-chip">${escapeHtml(c)}</span>`).join('')}</div>`
    : '';

  if (!items.length && !chips.length) { hideSuggest(boxId); return; }

  const icons = { listing: 'fa-tag', brand: 'fa-copyright',
                  model: 'fa-cube', refine: 'fa-filter' };
  // The suggestion text is carried in a data attribute and read by a
  // delegated listener below, NOT interpolated into an inline handler.
  // Listing titles routinely contain quotes and apostrophes ("Hyundai
  // Creta 2018 'SX'"), which terminate an attribute early and leave the
  // handler malformed — the button then renders but does nothing.
  box.innerHTML = head + items.map((s, i) => `
    <button type="button" class="suggest-item" data-i="${i}"
            data-suggest="${escapeHtml(s.text)}">
      <i class="fas ${icons[s.type] || 'fa-search'}"></i>
      <span>${escapeHtml(s.text)}</span>
      ${s.note ? `<small>${escapeHtml(s.note)}</small>` : ''}
    </button>`).join('');

  box.dataset.input = inputId;
  suggestIndex = -1;
  box.classList.remove('hidden');
}

function hideSuggest(boxId) {
  document.getElementById(boxId)?.classList.add('hidden');
  suggestIndex = -1;
}

function applySuggestion(inputId, boxId, text) {
  const input = document.getElementById(inputId);
  if (input) input.value = text;
  hideSuggest(boxId);
  runSmartSearch(text);
}

/* Arrow keys move through suggestions; Enter takes the highlighted one, or
   searches what was typed when nothing is highlighted. */
function handleSearchKeys(event, inputId, boxId, fallback) {
  const box = document.getElementById(boxId);
  const items = box && !box.classList.contains('hidden')
    ? [...box.querySelectorAll('.suggest-item')] : [];

  if (event.key === 'ArrowDown' && items.length) {
    event.preventDefault();
    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
  } else if (event.key === 'ArrowUp' && items.length) {
    event.preventDefault();
    suggestIndex = Math.max(suggestIndex - 1, -1);
  } else if (event.key === 'Escape') {
    hideSuggest(boxId);
    return;
  } else if (event.key === 'Enter') {
    if (suggestIndex >= 0 && items[suggestIndex]) {
      applySuggestion(inputId, boxId, items[suggestIndex].dataset.suggest || '');
    } else {
      hideSuggest(boxId);
      const value = (document.getElementById(inputId)?.value || '').trim();
      if (value) runSmartSearch(value); else fallback();
    }
    return;
  } else {
    return;
  }
  items.forEach((el, i) => el.classList.toggle('is-active', i === suggestIndex));
}

document.addEventListener('mousedown', (e) => {
  const item = e.target.closest('.suggest-item');
  if (item) {
    // Must run before the input loses focus, or the dropdown is already
    // hidden by the time a click event would arrive.
    e.preventDefault();
    const box = item.closest('.search-suggest');
    applySuggestion(box?.dataset.input || 'navSearchInput', box?.id, item.dataset.suggest || '');
    return;
  }
  if (!e.target.closest('.nav-search-wrap, .hb-hero-search, .buy-search-wrap, .search-suggest')) {
    ['navSuggest', 'homeSuggest', 'buySuggest'].forEach(hideSuggest);
  }
});

/* Runs the search and shows the results on the Buy page. */
async function runSmartSearch(query) {
  ['navSearchInput', 'homeSearchInput', 'buySearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = query;
  });
  showPage('buy');

  const grid = document.getElementById('buyListingsGrid');
  if (grid) grid.innerHTML = `<div class="info-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>`;

  const pincode = selectedArea?.pincode
    || (selectedArea?.prefix ? `${selectedArea.prefix}001` : '');

  let res;
  try {
    res = await db.smartSearch(query, { page: 1, per_page: buyPerPage || 30, pincode });
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="info-loading">${escapeHtml(err.message || 'Search failed.')}</div>`;
    return;
  }

  renderSearchUnderstood(res);

  // Reuse the Buy page's own renderer rather than a parallel one, so a
  // search result card behaves exactly like a browsed card.
  const items = (res.items || []).map(normalizeListing);
  buyListings = items;
  buyTotalPages = res.total_pages || 1;
  buyTotalCount = res.total || 0;

  const noRes = document.getElementById('buyNoResults');
  if (items.length) {
    noRes?.classList.add('hidden');
    grid.innerHTML = items.map(p => createListingCard(p)).join('');
    animateIn(grid, 'grid-enter');
  } else {
    grid.innerHTML = '';
    noRes?.classList.remove('hidden');
  }

  const count = document.getElementById('buyResultsCount');
  if (count) {
    count.textContent = res.total
      ? `${Number(res.total).toLocaleString('en-IN')} result${res.total === 1 ? '' : 's'} for \u201c${query}\u201d`
      : `No results for \u201c${query}\u201d`;
  }
}

/* Shows the parsed filters as chips, plus a note when the search had to be
   broadened. Being told "we ignored the exact model" is far better than a
   silently different result set. */
function renderSearchUnderstood(res) {
  const box = document.getElementById('searchUnderstood');
  if (!box) return;
  const parsed = res.parsed || {};
  const chips = parsed.matched || [];

  // Nothing in the buyer's own pincode: say so, rather than leaving them to
  // wonder why the top result is from another district.
  const near = res.nearness;
  const nearNote = (near && near.scope !== 'exact')
    ? (near.scope === 'district'
        ? `Nothing in <strong>${escapeHtml(near.pincode)}</strong> right now &mdash; showing listings around ${escapeHtml(near.district)} first.`
        : `Nothing in <strong>${escapeHtml(near.pincode)}</strong> or nearby &mdash; showing listings from further away.`)
    : '';

  if (!chips.length && !res.relaxed && !nearNote) { box.classList.add('hidden'); return; }

  box.innerHTML = `
    ${chips.length ? `
      <div class="understood-row">
        <span class="understood-label">Searching for</span>
        ${chips.map(c => `<span class="understood-chip">${escapeHtml(c)}</span>`).join('')}
        <button class="understood-clear" onclick="clearSmartSearch()">Clear</button>
      </div>` : ''}
    ${res.relaxed ? `
      <div class="understood-relaxed">
        <i class="fas fa-circle-info"></i>
        No exact matches, so we broadened the search &mdash; <strong>${escapeHtml(res.relaxed)}</strong>.
      </div>` : ''}
    ${nearNote ? `
      <div class="understood-relaxed">
        <i class="fas fa-location-dot"></i>
        ${nearNote}
      </div>` : ''}`;
  box.classList.remove('hidden');
}

function clearSmartSearch() {
  ['navSearchInput', 'homeSearchInput', 'buySearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('searchUnderstood')?.classList.add('hidden');
  applyBuyFilters();
}
