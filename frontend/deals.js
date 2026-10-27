/* =====================================================
   DealBriz — DealLock (website)

   Offers in chat (from the buyer or the seller), the deal warning for both
   sides (buyer first, then the seller, who confirms with their password or
   an SMS code), the buyer's documents in the deal and the seller's on the
   listing (Sell form, Edit listing), cancel requests (agree / disagree / force cancel), the
   loan, the handover meeting and its code, My Deals, the staff Deals
   section and the Lender portal of the admin panel.

   Loaded after api-client.js and app.js and uses their globals (apiFetch,
   escapeHtml, showToast, pushModal, closeTopModal, MODAL_HIDE, currentUser,
   currentChatConversation, ...). app.js calls into this file only through
   a handful of hooks, each guarded with `typeof fn === 'function'`, so the
   rest of the site keeps working even if this file fails to load.

   Everything shown here comes from the server. Nothing is invented: no
   counts, no statuses, no "online" hints. The server also says what the
   viewer may do (can_respond, can_withdraw, can_cancel, can_confirm,
   can_upload_docs, can_review_docs...) so the buttons here and in the
   Android app follow the same rules.
   ===================================================== */

/* ---------- API ---------- */
const dealsApi = {
  rules: () => apiFetch('/deals/rules'),
  thread: (productId, otherId) =>
    apiFetch(`/deals/thread?product_id=${encodeURIComponent(productId)}&other_id=${encodeURIComponent(otherId)}`),
  sendOffer: ({ productId, buyerId, price, note, useDeallock }) =>
    apiFetch('/deals/offers', { method: 'POST', body: { product_id: productId, buyer_id: buyerId, price, note, use_deallock: useDeallock } }),
  counter: (id, price, note, useDeallock) =>
    apiFetch(`/deals/offers/${id}/counter`, { method: 'POST', body: { price, note, use_deallock: useDeallock } }),
  accept: (id) => apiFetch(`/deals/offers/${id}/accept`, { method: 'POST', body: {} }),
  decline: (id) => apiFetch(`/deals/offers/${id}/decline`, { method: 'POST', body: {} }),
  withdraw: (id) => apiFetch(`/deals/offers/${id}/withdraw`, { method: 'POST', body: {} }),
  mine: (status = 'all') => apiFetch(`/deals/mine?status=${encodeURIComponent(status)}`),
  get: (id) => apiFetch(`/deals/${id}`),
  confirmSendCode: (id) => apiFetch(`/deals/${id}/confirm/send-code`, { method: 'POST', body: {} }),
  confirm: (id, proof) => apiFetch(`/deals/${id}/confirm`, { method: 'POST', body: { acknowledged: true, ...proof } }),
  notices: () => apiFetch('/deals/notices'),
  acknowledge: (id) => apiFetch(`/deals/${id}/acknowledge`, { method: 'POST', body: { acknowledged: true } }),
  cancelAnswer: (id, agree) => apiFetch(`/deals/${id}/cancel/answer`, { method: 'POST', body: { agree } }),
  cancelWithdraw: (id) => apiFetch(`/deals/${id}/cancel/withdraw`, { method: 'POST', body: {} }),
  cancelForce: (id) => apiFetch(`/deals/${id}/cancel/force`, { method: 'POST', body: { acknowledged: true } }),
  cancel: (id, reason) => apiFetch(`/deals/${id}/cancel`, { method: 'POST', body: { reason } }),
  loanAnswer: (id, hadLoan) => apiFetch(`/deals/${id}/documents/loan-answer`, { method: 'POST', body: { had_loan: hadLoan } }),
  uploadDoc: (id, type, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch(`/deals/${id}/documents/${encodeURIComponent(type)}`, { method: 'POST', body: form, isForm: true });
  },
  reviewDoc: (dealId, docId, decision, reason) =>
    apiFetch(`/deals/${dealId}/documents/${docId}/review`, { method: 'POST', body: { decision, reason } }),
  docFileUrl: (dealId, docId) => `${API_BASE}/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(docId)}/file`,
  handover: (id, step, body = {}) => apiFetch(`/deals/${id}/handover/${step}`, { method: 'POST', body }),
  dispute: (id, reason) => apiFetch(`/deals/${id}/dispute`, { method: 'POST', body: { reason } }),
  applyLoan: (body) => apiFetch('/loans/apply', { method: 'POST', body }),
  loanLenders: (dealId) => apiFetch(`/loans/lenders?deal_id=${encodeURIComponent(dealId)}`),
  staffQueue: (status = '') => apiFetch(`/deals/staff/queue${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  staffReady: (id, note) => apiFetch(`/deals/staff/${id}/ready-to-pay`, { method: 'POST', body: { note } }),
  staffPaid: (id, utr) => apiFetch(`/deals/staff/${id}/paid`, { method: 'POST', body: { utr } }),
  staffResolve: (id, outcome, note) => apiFetch(`/deals/staff/${id}/resolve`, { method: 'POST', body: { outcome, note } }),
  staffResendLenderEmail: (id) => apiFetch(`/deals/staff/${id}/lender-email`, { method: 'POST', body: {} }),
};

/* Lender portal. Staff (deals.manage) pass the lender they are looking at;
   a lender user's own lender comes from their account on the server. */
const lenderApi = {
  q: (fid, extra = '') => {
    const parts = [];
    if (fid) parts.push(`financer_id=${encodeURIComponent(fid)}`);
    if (extra) parts.push(extra);
    return parts.length ? `?${parts.join('&')}` : '';
  },
  me: () => apiFetch('/lender/me'),
  loans: (fid, status = '') => apiFetch(`/lender/loans${lenderApi.q(fid, status ? `status=${encodeURIComponent(status)}` : '')}`),
  loan: (fid, id) => apiFetch(`/lender/loans/${id}${lenderApi.q(fid)}`),
  setStatus: (fid, id, status, notes) =>
    apiFetch(`/lender/loans/${id}/status${lenderApi.q(fid)}`, { method: 'POST', body: { status, decision_notes: notes } }),
  setDetails: (fid, id, ref, kfs) =>
    apiFetch(`/lender/loans/${id}/details${lenderApi.q(fid)}`, { method: 'POST', body: { nbfc_application_reference: ref, kfs_url: kfs } }),
  deals: (fid, status = '') => apiFetch(`/lender/deals${lenderApi.q(fid, status ? `status=${encodeURIComponent(status)}` : '')}`),
  saveSettings: (fid, docsEmail) => apiFetch(`/lender/settings${lenderApi.q(fid)}`, { method: 'PUT', body: { docs_email: docsEmail } }),
  // A lender user (not staff): choose their company once, or ask a superadmin to change it.
  chooseFirm: (financerId) => apiFetch('/lender/firm', { method: 'POST', body: { financer_id: financerId } }),
  firmRequest: (message) => apiFetch('/lender/firm/change-request', { method: 'POST', body: { message } }),
  ready: (fid, id, note) => apiFetch(`/lender/deals/${id}/ready-to-pay${lenderApi.q(fid)}`, { method: 'POST', body: { note } }),
  paid: (fid, id, utr) => apiFetch(`/lender/deals/${id}/paid${lenderApi.q(fid)}`, { method: 'POST', body: { utr } }),
};

/* ---------- Small helpers ---------- */
const dlEsc = (v) => (v === null || v === undefined ? '' : escapeHtml(String(v)));

function dlRupees(n) {
  const v = Number(n);
  if (!isFinite(v)) return '₹0';
  return '₹' + Math.round(v).toLocaleString('en-IN');
}

function dlWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function dlDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* "3,40,000" / "₹ 340000" / "340000" -> 340000 (whole rupees) or NaN. */
function dlParseRupees(text) {
  const clean = String(text || '').replace(/[₹,\s]/g, '');
  if (!/^\d+$/.test(clean)) return NaN;
  return parseInt(clean, 10);
}

/* Live Indian grouping (2,45,000) while typing, without moving the cursor.

   Rewriting el.value puts the browser's cursor at the end, so editing a
   digit in the middle ("2,50,000" -> "2,45,000") kept deleting the last
   zeros instead. The cursor is tracked as "how many digits are to its
   left", which survives the commas moving around, and put back there. */
function dlFormatRupeeInput(el) {
  const raw = el.value;
  const caret = el.selectionStart == null ? raw.length : el.selectionStart;
  let digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
  let digits = raw.replace(/\D/g, '').slice(0, 10);
  const trimmed = digits.replace(/^0+(?=\d)/, '');          // "05" -> "5"
  digitsBefore = Math.max(0, digitsBefore - (digits.length - trimmed.length));
  digits = trimmed;
  const formatted = digits ? Number(digits).toLocaleString('en-IN') : '';
  if (formatted === raw) return;
  el.value = formatted;
  if (document.activeElement !== el) return;
  let pos = 0;
  for (let seen = 0; pos < formatted.length && seen < digitsBefore; pos++) {
    if (/\d/.test(formatted[pos])) seen++;
  }
  el.setSelectionRange(pos, pos);
}

/* Backspace just after a comma (or Delete just before one) would remove
   only the comma, which the formatter puts straight back, so the key
   seemed dead. Delete the digit beyond it instead. beforeinput rather than
   keydown because Android keyboards don't report Backspace as a key. */
document.addEventListener('beforeinput', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !el.hasAttribute('data-rupee')) return;
  const back = e.inputType === 'deleteContentBackward';
  if (!back && e.inputType !== 'deleteContentForward') return;
  const s = el.selectionStart, t = el.selectionEnd, v = el.value;
  if (s == null || s !== t) return;
  const comma = back ? s - 1 : s;
  if (v[comma] !== ',') return;
  const digitAt = back ? comma - 1 : comma + 1;
  if (digitAt < 0 || digitAt >= v.length) return;
  e.preventDefault();
  el.value = v.slice(0, digitAt) + v.slice(digitAt + 1);
  const newCaret = back ? digitAt : comma;
  el.setSelectionRange(newCaret, newCaret);
  el.dispatchEvent(new Event('input', { bubbles: true }));  // reformat + recalculate
}, true);

const DEAL_STATUS_LABEL = {
  awaiting_seller: 'Awaiting confirmation',
  docs_pending: 'Documents pending',
  locked: 'Locked',
  loan_in_progress: 'Loan in progress',
  ready_to_pay: 'Ready to pay',
  paid: 'Paid',
  completed: 'Completed',
  released: 'Released',
  disputed: 'Under review',
};

const OFFER_STATUS_LABEL = {
  open: 'Waiting for reply',
  countered: 'Countered',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  superseded: 'Replaced',
  withdrawn: 'Withdrawn',
};

const RELEASE_REASON_LABEL = {
  buyer_withdrew: 'the buyer withdrew before the seller confirmed',
  seller_cancelled: 'the seller cancelled',
  mutual_cancel: 'both sides agreed to cancel',
  buyer_force_cancel: 'the buyer force-cancelled',
  seller_force_cancel: 'the seller force-cancelled',
  buyer_no_response: 'the buyer didn’t accept the deal warning in time',
  seller_declined: 'the seller decided not to lock it',
  seller_no_response: 'the seller didn’t confirm in time',
  reservation_expired: 'the reservation ended',
  account_suspended: 'an account was suspended',
  staff_action: 'DealBriz support released it',
  loan_rejected: 'the loan was not approved',
};

const LOAN_STATUS_LABEL = {
  pending: 'Application received',
  review: 'Under review',
  approved: 'Approved',
  rejected: 'Not approved',
  disbursed: 'Paid out',
  completed: 'Closed',
  cancelled: 'Withdrawn',
};

const DOC_STATUS_LABEL = {
  missing: 'Not uploaded',
  uploaded: 'Being checked',
  approved: 'Verified',
  rejected: 'Upload again',
};

const LOAN_TYPE_LABEL = { vehicle: 'Vehicle loan', personal: 'Personal loan' };

function dealPill(status) {
  return `<span class="deal-pill deal-pill-${dlEsc(status)}">${dlEsc(DEAL_STATUS_LABEL[status] || status)}</span>`;
}

function loanTypeTag(type) {
  if (!type) return '';
  return `<span class="deal-type deal-type-${dlEsc(type)}"><i class="fas ${type === 'vehicle' ? 'fa-car' : 'fa-user'}"></i> ${dlEsc(LOAN_TYPE_LABEL[type] || type)}</span>`;
}

const isVehicle = (d) => (d && (d.loan_type || 'vehicle')) === 'vehicle';
const itemWord = (d) => (isVehicle(d) ? 'vehicle' : 'item');

const LIVE_DEAL = ['awaiting_seller', 'docs_pending', 'locked', 'loan_in_progress', 'ready_to_pay', 'paid', 'disputed'];

/* Closes a modal and resolves once the browser has finished the history
   step closeTopModal() started. Opening the next modal before that
   finishes would push its history entry in the middle of the Back. */
function dlCloseModalThen(name) {
  return new Promise(resolve => {
    if (!modalStack.includes(name)) { resolve(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; window.removeEventListener('popstate', finish); resolve(); };
    window.addEventListener('popstate', finish);
    setTimeout(finish, 600);
    closeTopModal(name);
  });
}

function dlOpenOverlay(id, stackName) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  pushModal(stackName);
}

/* The site's own confirmation dialog, instead of the browser's confirm()
   ("dealbriz.com says..."). Resolves true or false.
   opts: { title, body (HTML, escape anything from users), ok, cancel,
           tone: 'info' | 'warn' | 'danger', icon } */
let dlAskResolve = null;
const DL_ASK_ICON = { info: 'fa-handshake', warn: 'fa-triangle-exclamation', danger: 'fa-circle-exclamation' };
function dlAsk(opts = {}) {
  if (dlAskResolve) { const r = dlAskResolve; dlAskResolve = null; r(false); }
  const tone = opts.tone || 'info';
  const modal = document.getElementById('dealAskModal');
  if (!modal) return Promise.resolve(window.confirm(opts.title || ''));
  modal.querySelector('.deal-ask-box').className = `modal-box deal-ask-box deal-ask-${tone}`;
  document.getElementById('dealAskIcon').innerHTML = `<i class="fas ${opts.icon || DL_ASK_ICON[tone] || DL_ASK_ICON.info}"></i>`;
  document.getElementById('dealAskTitle').textContent = opts.title || 'Are you sure?';
  document.getElementById('dealAskBody').innerHTML = opts.body || '';
  const ok = document.getElementById('dealAskOk');
  ok.textContent = opts.ok || 'Confirm';
  ok.className = `deal-btn ${tone === 'danger' ? 'deal-btn-danger' : 'deal-btn-primary'}`;
  document.getElementById('dealAskCancel').textContent = opts.cancel || 'Cancel';
  return new Promise(resolve => {
    dlAskResolve = resolve;
    if (!modalStack.includes('dealAsk')) dlOpenOverlay('dealAskModal', 'dealAsk');
    setTimeout(() => ok.focus(), 50);
  });
}

async function dlAskAnswer(yes) {
  const r = dlAskResolve; dlAskResolve = null;
  await dlCloseModalThen('dealAsk');
  if (r) r(yes);
}

/* Register our overlays with app.js's modal stack (Back button, Escape),
   and close on a backdrop click like the others. The warning closes only
   with its own buttons: it must be read, not clicked away by accident. */
MODAL_HIDE.dealOffer = () => document.getElementById('dealOfferModal')?.classList.add('hidden');
MODAL_HIDE.deal = () => { document.getElementById('dealModal')?.classList.add('hidden'); dealModalState = null; dlLiveStop(); };
MODAL_HIDE.dealLoan = () => document.getElementById('dealLoanModal')?.classList.add('hidden');
MODAL_HIDE.dealOtp = () => { document.getElementById('dealOtpModal')?.classList.add('hidden'); dlOtpStop(); };
MODAL_HIDE.dealWarn = () => {
  document.getElementById('dealWarnModal')?.classList.add('hidden');
  const r = dlWarnResolve; dlWarnResolve = null;
  if (r) r(false);   // closed with Back/Escape = not agreed
};
MODAL_HIDE.dealAsk = () => {
  document.getElementById('dealAskModal')?.classList.add('hidden');
  const r = dlAskResolve; dlAskResolve = null;
  if (r) r(false);   // Back, Escape or a tap outside = no
};
MODAL_HIDE.dealNotice = () => {
  document.getElementById('dealNoticeModal')?.classList.add('hidden');
  // Closed with Back/Escape without tapping OK: not recorded as seen, and
  // not shown again until the next page load, so it doesn't nag.
  if (dlNoticeDeal) dlNoticeSkipped.add('cancel:' + dlNoticeDeal.id);
  dlNoticeDeal = null;
};
document.addEventListener('DOMContentLoaded', () => {
  [['dealOfferModal', 'dealOffer'], ['dealModal', 'deal'], ['dealLoanModal', 'dealLoan'], ['dealOtpModal', 'dealOtp'], ['dealAskModal', 'dealAsk']].forEach(([id, name]) => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target.id === id) closeTopModal(name);
    });
  });
});

let dealRulesCache = null;
async function dlRules() {
  if (dealRulesCache) return dealRulesCache;
  try { dealRulesCache = await dealsApi.rules(); } catch { dealRulesCache = null; }
  return dealRulesCache || { offer_valid_hours: 48, max_counter_rounds: 3, reservation_days: 7, confirm_hours: 24,
    cancel_limit: 3, ban_days: 7, categories: [], doc_types: [], doc_max_mb: 8, doc_extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'] };
}

/* =====================================================
   THE DEAL WARNING (English + Hindi, big, centred)
   Both sides read it before a deal is locked: first the BUYER, after an
   offer is accepted (the seller can't confirm until the buyer has), then
   the SELLER, before the password or SMS code. The server refuses both steps without
   the tick. Making, countering and accepting offers shows no warning.
   ===================================================== */
let dlWarnResolve = null;

function dlWarnContent(kind, ctx, rules) {
  const days = rules.reservation_days, limit = rules.cancel_limit, ban = rules.ban_days;
  const docsDays = rules.docs_days || days;
  const price = `<strong>${dlRupees(ctx.price)}</strong>`;
  const vehicle = (ctx.loanType || 'vehicle') === 'vehicle';
  const title = `<strong>${dlEsc(ctx.title || 'this listing')}</strong>`;
  if (kind === 'seller') {
    const buyer = dlEsc(ctx.buyer || 'the buyer');
    return {
      titleEn: 'You are about to lock this deal',
      titleHi: 'आप यह डील लॉक करने जा रहे हैं',
      en: [
        `You agree to sell ${title} to ${buyer} for ${price}. From now on no one else can start a deal on it.`,
        vehicle
          ? (ctx.listingDocs === 'verified'
              ? `Next, within ${docsDays} days, the buyer uploads their PAN card and Aadhaar card (your vehicle documents on the listing are already verified). Once the buyer’s are verified the deal is locked, and the listing reserved for this buyer for ${days} days.`
              : `Next, within ${docsDays} days, the buyer uploads their PAN card and Aadhaar card, and you upload your vehicle documents on the listing (My Listings, Edit listing) if you haven’t already. Only when DealBriz or the lender has verified all of them is the deal locked, and the listing reserved for this buyer for ${days} days.`)
          : `Next, within ${docsDays} days, the buyer uploads their PAN card and Aadhaar card. Only when they are verified is the deal locked, and the listing reserved for this buyer for ${days} days.`,
        `The lender pays you directly, never through DealBriz. Hand over the ${vehicle ? 'vehicle' : 'item'} only after the money is in your bank, then enter the buyer’s handover code.`,
        `After you confirm, cancelling needs the buyer’s agreement. If they don’t agree you can force-cancel, but force-cancelling ${limit} deals in a row stops you posting listings or making deals for ${ban} days.`,
      ],
      hi: [
        `आप ${title} को ${buyer} को ${price} में बेचने के लिए सहमत हैं। अब कोई और इस पर डील शुरू नहीं कर सकता।`,
        vehicle
          ? (ctx.listingDocs === 'verified'
              ? `लिस्टिंग पर आपके वाहन के दस्तावेज़ों की जाँच हो चुकी है। इसके बाद ${docsDays} दिन के अंदर खरीदार अपना PAN और आधार कार्ड अपलोड करे। उनकी जाँच होते ही डील लॉक होगी और लिस्टिंग ${days} दिन के लिए इसी खरीदार के लिए रिज़र्व होगी।`
              : `इसके बाद ${docsDays} दिन के अंदर खरीदार अपना PAN और आधार कार्ड अपलोड करे, और अगर आपने अभी तक नहीं किया है तो आप लिस्टिंग पर (My Listings, Edit listing) अपने वाहन के दस्तावेज़ अपलोड करें। DealBriz या लोन देने वाली कंपनी द्वारा सभी की जाँच होने पर ही डील लॉक होगी और लिस्टिंग ${days} दिन के लिए इसी खरीदार के लिए रिज़र्व होगी।`)
          : `इसके बाद ${docsDays} दिन के अंदर खरीदार अपना PAN और आधार कार्ड अपलोड करे। उनकी जाँच होने पर ही डील लॉक होगी और लिस्टिंग ${days} दिन के लिए इसी खरीदार के लिए रिज़र्व होगी।`,
        `लोन देने वाली कंपनी सीधे आपको भुगतान करती है, DealBriz के ज़रिए कभी नहीं। ${vehicle ? 'वाहन' : 'सामान'} तभी सौंपें जब पैसे आपके बैंक में आ जाएँ, फिर खरीदार का हैंडओवर कोड डालें।`,
        `पुष्टि के बाद डील रद्द करने के लिए खरीदार की सहमति चाहिए। सहमति न मिलने पर आप फ़ोर्स कैंसल कर सकते हैं, लेकिन लगातार ${limit} डील फ़ोर्स कैंसल करने पर आप ${ban} दिन तक न लिस्टिंग डाल पाएँगे, न डील कर पाएँगे।`,
      ],
    };
  }
  if (kind === 'buyer') {
    return {
      titleEn: 'Read this before the seller locks the deal',
      titleHi: 'डील लॉक होने से पहले इसे ज़रूर पढ़ें',
      en: [
        `You are agreeing to buy ${title} at ${price}. The seller takes the final decision, and can confirm only after you accept this.`,
        `After the seller confirms, you upload your PAN card and Aadhaar card within ${docsDays} days${vehicle ? '. The seller’s vehicle documents are uploaded on the listing and checked too' : ''}. Only when DealBriz or the lender has verified them is the deal locked, and the listing reserved for you for ${days} days.`,
        `Apply for the loan as soon as the deal locks. If the lender isn’t ready to pay within those ${days} days, the deal is released.`,
        `After the seller confirms, cancelling needs the seller’s agreement. If they don’t agree you can force-cancel, but force-cancelling ${limit} deals in a row stops you posting listings or making deals for ${ban} days.`,
        `DealBriz never asks you to send money. Pay the down payment only at the handover meeting, and give your handover code only after you have the ${vehicle ? 'vehicle and its papers' : 'item'}.`,
      ],
      hi: [
        `आप ${title} को ${price} में खरीदने के लिए सहमत हो रहे हैं। अंतिम फ़ैसला विक्रेता का है, और वह आपकी सहमति के बाद ही पुष्टि कर सकता है।`,
        `विक्रेता की पुष्टि के बाद ${docsDays} दिन के अंदर आप अपना PAN कार्ड और आधार कार्ड अपलोड करें${vehicle ? '। विक्रेता के वाहन के दस्तावेज़ लिस्टिंग पर अपलोड होते हैं और उनकी भी जाँच होती है' : ''}। DealBriz या लोन देने वाली कंपनी द्वारा जाँच होने पर ही डील लॉक होगी और लिस्टिंग ${days} दिन के लिए आपके लिए रिज़र्व होगी।`,
        `डील लॉक होते ही लोन के लिए आवेदन करें। अगर उन ${days} दिनों में लोन देने वाली कंपनी भुगतान के लिए तैयार नहीं होती, तो डील रद्द हो जाएगी।`,
        `विक्रेता की पुष्टि के बाद डील रद्द करने के लिए विक्रेता की सहमति चाहिए। सहमति न मिलने पर आप फ़ोर्स कैंसल कर सकते हैं, लेकिन लगातार ${limit} डील फ़ोर्स कैंसल करने पर आप ${ban} दिन तक न लिस्टिंग डाल पाएँगे, न डील कर पाएँगे।`,
        `DealBriz कभी पैसे भेजने के लिए नहीं कहता। डाउन पेमेंट सिर्फ़ हैंडओवर मीटिंग में दें, और अपना हैंडओवर कोड ${vehicle ? 'वाहन और उसके कागज़' : 'सामान'} मिलने के बाद ही दें।`,
      ],
    };
  }
  return null;
}

/* Resolves true only when the person ticked "I understand" and pressed
   Continue. Any other way out resolves false. */
async function dlWarn(kind, ctx) {
  const rules = await dlRules();
  const c = dlWarnContent(kind, ctx, rules);
  if (!c) return false;
  document.getElementById('dealWarnTitle').innerHTML =
    `${dlEsc(c.titleEn)}<span lang="hi">${dlEsc(c.titleHi)}</span>`;
  document.getElementById('dealWarnBody').innerHTML = `
    <div class="deal-warn-lang" lang="en"><ul>${c.en.map(x => `<li>${x}</li>`).join('')}</ul></div>
    <div class="deal-warn-lang" lang="hi"><div class="deal-warn-langname">हिंदी</div><ul>${c.hi.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
  const check = document.getElementById('dealWarnCheck');
  check.checked = false;
  document.getElementById('dealWarnGo').disabled = true;
  if (dlWarnResolve) { const old = dlWarnResolve; dlWarnResolve = null; old(false); }
  return new Promise(resolve => {
    dlWarnResolve = resolve;
    dlOpenOverlay('dealWarnModal', 'dealWarn');
    document.querySelector('#dealWarnModal .deal-warn-box')?.scrollTo?.({ top: 0 });
  });
}

function dlWarnToggle() {
  document.getElementById('dealWarnGo').disabled = !document.getElementById('dealWarnCheck').checked;
}

async function dlWarnAnswer(ok) {
  const r = dlWarnResolve;
  dlWarnResolve = null;   // so closing below doesn't count as "not agreed"
  const agreed = !!ok && document.getElementById('dealWarnCheck').checked;
  await dlCloseModalThen('dealWarn');
  if (r) r(agreed);
}

/* =====================================================
   POPUPS FOR THINGS WAITING ON THE VIEWER
   - the buyer's deal warning, after an offer is accepted (the seller can't
     confirm until the buyer accepts it)
   - a cancel request from the other side, to agree or disagree with
   Checked on sign-in, with the nav badges every minute, and whenever an
   open chat's deal changes. One popup at a time. Closing one without an
   answer hides it until the next page load; the deal sheet still has the
   same buttons.
   ===================================================== */
const dlNoticeSkipped = new Set();    // "warn:<id>" / "cancel:<id>" closed without answering
let dlNoticeBusy = false;
let dlNoticeDeal = null;              // the deal the cancel-request popup is showing

async function dealsCheckBuyerNotices() {
  if (!currentUser || dlNoticeBusy) return;
  dlNoticeBusy = true;
  try {
    const n = await dealsApi.notices();
    const warn = (n.warnings || []).find(d => d.can_acknowledge && !dlNoticeSkipped.has('warn:' + d.id));
    if (warn) { await dlBuyerAcceptWarning(warn, { fromPopup: true }); return; }
    const req = (n.cancel_requests || []).find(d => d.can_answer_cancel && !dlNoticeSkipped.has('cancel:' + d.id));
    if (req) await dlShowCancelRequest(req);
  } catch (err) {
    console.warn('Deal notice check failed:', err);
  } finally {
    dlNoticeBusy = false;
  }
}

/* The buyer reads and ticks the warning; the server records it and the
   seller is told they can confirm. Returns true if accepted. */
async function dlBuyerAcceptWarning(d, { fromPopup = false } = {}) {
  const ok = await dlWarn('buyer', {
    price: d.agreed_price, title: d.product && d.product.title, loanType: d.loan_type,
  });
  if (!ok) { if (fromPopup) dlNoticeSkipped.add('warn:' + d.id); return false; }
  try {
    const fresh = await dealsApi.acknowledge(d.id);
    showToast('Thanks. The seller can now confirm the deal.', 'success');
    if (dealModalState && dealModalState.deal.id === d.id) { dealModalState.deal = fresh; renderDealModal(); }
    if (currentChatConversation) refreshChatDealBar();
    if (currentPage === 'mydeals') renderMyDeals();
    return true;
  } catch (err) {
    showToast(err.message || 'Could not save that. Please try again.', 'error');
    return false;
  }
}

async function dlShowCancelRequest(d) {
  const who = d.cancel_request.by_role === 'seller' ? 'seller' : 'buyer';
  const whoHi = who === 'seller' ? 'विक्रेता' : 'खरीदार';
  const reason = d.cancel_request.reason;
  dlNoticeDeal = d;
  document.getElementById('dealNoticeTitle').innerHTML =
    `${dlEsc(`The ${who} asked to cancel this deal`)}<span lang="hi">${dlEsc(`${whoHi} ने यह डील रद्द करने को कहा है`)}</span>`;
  document.getElementById('dealNoticeBody').innerHTML = `
    <div class="deal-warn-lang" lang="en"><ul>
      <li><strong>${dlEsc((d.product && d.product.title) || 'Listing')}</strong> at <strong>${dlRupees(d.agreed_price)}</strong>.${reason ? ` Reason: “${dlEsc(reason)}”` : ''}</li>
      <li><strong>Agree</strong>: the deal is cancelled, the listing goes back on sale, and nobody is penalised.</li>
      <li><strong>Disagree</strong>: the deal carries on. The ${who} can still force-cancel, which counts against them.</li>
      <li>Answer by <strong>${dlEsc(dlWhen(d.cancel_request.expires_at))}</strong>. If you don’t, the request lapses and the deal carries on.</li>
    </ul></div>
    <div class="deal-warn-lang" lang="hi"><div class="deal-warn-langname">हिंदी</div><ul>
      <li><strong>सहमत</strong>: डील रद्द हो जाएगी, लिस्टिंग फिर से बिक्री पर आ जाएगी, और किसी पर कोई जुर्माना नहीं होगा।</li>
      <li><strong>असहमत</strong>: डील जारी रहेगी। ${whoHi} फिर भी फ़ोर्स कैंसल कर सकता है, जो उसके ख़िलाफ़ गिना जाएगा।</li>
    </ul></div>`;
  document.getElementById('dealNoticeError').classList.add('hidden');
  document.getElementById('dealNoticeActions').innerHTML = `
    <button class="deal-btn" onclick="dlNoticeCancelAnswer(null)">View deal</button>
    <button class="deal-btn" onclick="dlNoticeCancelAnswer(false)">Disagree <span lang="hi">/ असहमत</span></button>
    <button class="deal-btn deal-btn-danger" onclick="dlNoticeCancelAnswer(true)">Agree to cancel <span lang="hi">/ सहमत</span></button>`;
  dlOpenOverlay('dealNoticeModal', 'dealNotice');
  document.querySelector('#dealNoticeModal .deal-warn-box')?.scrollTo?.({ top: 0 });
}

/* agree true/false answers; null just opens the deal (no answer yet). */
async function dlNoticeCancelAnswer(agree) {
  const d = dlNoticeDeal;
  if (!d) return;
  if (agree === null) {
    dlNoticeSkipped.add('cancel:' + d.id);
    dlNoticeDeal = null;
    await dlCloseModalThen('dealNotice');
    openDeal(d.id);
    return;
  }
  const err = document.getElementById('dealNoticeError');
  const btns = document.querySelectorAll('#dealNoticeActions .deal-btn');
  btns.forEach(b => { b.disabled = true; });
  try {
    await dealsApi.cancelAnswer(d.id, agree);
  } catch (e) {
    err.textContent = e.message || 'Could not save that. Please try again.';
    err.classList.remove('hidden');
    btns.forEach(b => { b.disabled = false; });
    return;
  }
  dlNoticeDeal = null;   // answered: closing below must not mark it skipped
  await dlCloseModalThen('dealNotice');
  showToast(agree ? 'Deal cancelled. Nobody is penalised.' : 'You disagreed. The deal carries on.', 'success');
  if (currentChatConversation) loadChatMessages();
  if (currentPage === 'mydeals') renderMyDeals();
  setTimeout(dealsCheckBuyerNotices, 300);
}

/* =====================================================
   CHAT: offer cards, system lines, the deal bar
   ===================================================== */

let dealChatThread = null;      // last /deals/thread response for the open chat
let dealChatSignature = null;   // last message id seen; a change means "refresh the bar"

/* Called by loadChatMessages() for every message. Returns HTML for offer
   and system messages, or '' to let app.js draw a normal bubble. */
function renderDealChatMessage(m, isSent, time) {
  const kind = m.kind || 'text';
  if (kind === 'system') {
    return `<div class="chat-system"><i class="fas fa-circle-info"></i><span>${dlEsc(m.body)}</span><time>${dlEsc(time)}</time></div>`;
  }
  if (kind !== 'offer' || !m.offer) return '';

  const o = m.offer;
  const isCounter = o.round_number > 1;
  const isLock = o.use_deallock !== false;
  const rules = (dealChatThread && dealChatThread.rules) || { max_counter_rounds: 3 };
  const countersLeft = Math.max(0, rules.max_counter_rounds - (o.round_number - 1));
  const who = o.from_role === 'buyer' ? 'Buyer’s' : 'Seller’s';
  const label = isCounter ? `${who} counter-offer` : `${who} offer`;
  const meta = o.status === 'open'
    ? `Valid till ${dlEsc(dlWhen(o.expires_at))}`
    : dlEsc(OFFER_STATUS_LABEL[o.status] || o.status);

  let actions = '';
  if (o.can_respond) {
    actions = `
      <div class="deal-card-actions">
        <button class="deal-btn deal-btn-primary" onclick="dealAcceptOffer('${dlEsc(o.id)}', ${Number(o.price)}, ${isLock})"><i class="fas fa-check"></i> Accept</button>
        ${countersLeft > 0 ? `<button class="deal-btn" onclick="openOfferComposer('counter', '${dlEsc(o.id)}', ${Number(o.price)}, ${countersLeft}, ${isLock})">Counter</button>` : ''}
        <button class="deal-btn deal-btn-quiet" onclick="dealDeclineOffer('${dlEsc(o.id)}')">Decline</button>
      </div>
      ${countersLeft === 0 ? `<div class="deal-card-hint">No counter-offers left. Accept or decline.</div>` : ''}`;
  } else if (o.can_withdraw) {
    actions = `
      <div class="deal-card-actions">
        <button class="deal-btn deal-btn-quiet" onclick="dealWithdrawOffer('${dlEsc(o.id)}')">Withdraw</button>
      </div>`;
  }

  return `
    <div class="deal-card ${isSent ? 'sent' : 'received'} deal-card-${dlEsc(o.status)}">
      <div class="deal-card-kicker"><i class="fas fa-handshake"></i> ${label}</div>
      ${dlOfferTypeBadge(isLock)}
      <div class="deal-card-price">${dlRupees(o.price)}</div>
      ${o.note ? `<div class="deal-card-note">${dlEsc(o.note)}</div>` : ''}
      <div class="deal-card-meta"><span class="deal-dot deal-dot-${dlEsc(o.status)}"></span>${meta}</div>
      ${actions}
      <div class="chat-msg-time">${dlEsc(time)}</div>
    </div>`;
}

/* Which kind of offer: DealLock (EMI, becomes a locked deal) or a normal
   offer (only agrees the price). Shown on every offer card to both sides. */
function dlOfferTypeBadge(isLock) {
  return isLock
    ? `<div class="deal-offer-type is-lock" title="Accepting starts a DealLock deal: EMI through a DealBriz lending partner, documents checked, listing reserved"><i class="fas fa-lock"></i> DealLock · with EMI</div>`
    : `<div class="deal-offer-type is-normal" title="Accepting only agrees the price. No EMI, the listing isn't reserved, payment is settled directly"><i class="fas fa-handshake-simple"></i> Normal offer · no EMI</div>`;
}

/* Called by loadChatMessages() after each draw. The bar is refetched only
   when the conversation changed: every deal action writes a chat message,
   so a new last message is the signal. */
let dealChatBarAt = 0;
function dealsAfterChatRender(msgs) {
  const last = msgs && msgs.length ? msgs[msgs.length - 1].id : 'none';
  // A new message, or every ~12 s anyway: some deal changes (a document
  // checked, the lender's progress) don't post a chat message.
  if (last === dealChatSignature && Date.now() - dealChatBarAt < 12000) return;
  dealChatSignature = last;
  dealChatBarAt = Date.now();
  refreshChatDealBar();
}

function dealsOnChatOpen() {
  dealChatThread = null;
  dealChatSignature = null;
  const bar = document.getElementById('chatDealBar');
  if (bar) { bar.innerHTML = ''; bar.classList.add('hidden'); }
}

async function refreshChatDealBar() {
  const c = currentChatConversation;
  const bar = document.getElementById('chatDealBar');
  if (!c || !bar || !c.listingId || !c.sellerId) return;
  let t;
  try { t = await dealsApi.thread(c.listingId, c.sellerId); }
  catch { bar.classList.add('hidden'); return; }
  // The chat may have closed or switched while we waited.
  if (currentChatConversation !== c) return;
  dealChatThread = t;
  bar.innerHTML = chatDealBarHtml(t);
  bar.classList.toggle('hidden', !bar.innerHTML.trim());
  // Something in this chat's deal now waits on the viewer: the buyer's
  // warning, or the other side's cancel request.
  if (t.deal && ((t.deal.can_acknowledge && !dlNoticeSkipped.has('warn:' + t.deal.id))
      || (t.deal.can_answer_cancel && !dlNoticeSkipped.has('cancel:' + t.deal.id)))) dealsCheckBuyerNotices();
}

function chatDealBarHtml(t) {
  const deal = t.deal;
  const isSeller = t.my_role === 'seller';

  if (deal && (LIVE_DEAL.includes(deal.status) || deal.status === 'completed')) {
    let line = `${dealPill(deal.status)} <strong>${dlRupees(deal.agreed_price)}</strong>`;
    if (deal.status === 'awaiting_seller') {
      const step = deal.waiting_for_buyer_ack
        ? (isSeller ? 'buyer accepts the warning' : 'accept the warning')
        : (isSeller ? 'confirm' : 'seller confirms');
      line += ` <span class="deal-bar-muted">· ${step} by ${dlEsc(dlWhen(deal.confirm_by))}</span>`;
    } else if (deal.status === 'docs_pending') {
      line += ` <span class="deal-bar-muted">· documents due by ${dlEsc(dlDay(deal.reserved_until))}</span>`;
    } else if (['locked', 'loan_in_progress'].includes(deal.status)) {
      line += ` <span class="deal-bar-muted">· reserved till ${dlEsc(dlDay(deal.reserved_until))}</span>`;
    }
    if (deal.cancel_request) {
      line += ` <span class="deal-bar-attn">· ${deal.can_answer_cancel ? 'cancel requested: answer it' : 'you asked to cancel'}</span>`;
    }
    const btn = deal.can_confirm
      ? `<button class="deal-btn deal-btn-primary" onclick="openDealAndConfirm('${dlEsc(deal.id)}')"><i class="fas fa-lock"></i> Confirm deal</button>`
      : deal.can_acknowledge
        ? `<button class="deal-btn deal-btn-primary" onclick="openDeal('${dlEsc(deal.id)}').then(() => dealStartBuyerAccept())"><i class="fas fa-shield-halved"></i> Accept warning</button>`
        : `<button class="deal-btn deal-btn-primary" onclick="openDeal('${dlEsc(deal.id)}')">Open deal</button>`;
    return `
      <div class="deal-bar">
        <div class="deal-bar-text">${line}</div>
        ${btn}
      </div>`;
  }

  if (!isSeller && t.listing_reserved_for_someone_else) {
    return `<div class="deal-bar deal-bar-info"><i class="fas fa-lock"></i> Another buyer is in a deal for this listing right now.</div>`;
  }

  if (t.can_send_offer) {
    const pending = t.current_offer;   // only ever the viewer's own, when sending is allowed
    const type = t.deallock_available ? loanTypeTag(t.loan_type) : '';
    // The newest offer was a normal one that got accepted: say so, the
    // price is agreed and settled between the two of them.
    const latest = (t.offers || [])[0];
    const agreed = !pending && latest && latest.status === 'accepted' && latest.use_deallock === false;
    const idle = agreed
      ? `Agreed (normal offer): <strong>${dlRupees(latest.price)}</strong> <span class="deal-bar-muted">· no EMI, settle payment directly</span>`
      : isSeller
        ? `<span class="deal-bar-muted">${t.deallock_available ? 'Agree a price, with or without EMI' : 'Agree a price with the buyer'}</span>`
        : `<span class="deal-bar-muted">${t.deallock_available ? 'Make an offer, with or without EMI' : 'Make an offer to the seller'}</span>`;
    const pendingKind = pending ? (pending.use_deallock === false ? ' <span class="deal-bar-muted">· normal</span>' : ' <span class="deal-bar-muted">· DealLock</span>') : '';
    return `
      <div class="deal-bar">
        <div class="deal-bar-text">${pending ? `Your offer: <strong>${dlRupees(pending.price)}</strong>${pendingKind}` : idle} ${type}</div>
        <button class="deal-btn deal-btn-primary" onclick="openOfferComposer('new')"><i class="fas fa-handshake"></i> ${pending ? 'New offer' : (isSeller ? 'Send offer' : 'Make offer')}</button>
      </div>`;
  }
  if (t.cannot_send_offer_reason) {
    const icon = t.my_deal_ban_until ? 'fa-ban' : 'fa-circle-info';
    return `<div class="deal-bar deal-bar-info${t.my_deal_ban_until ? ' deal-bar-ban' : ''}"><i class="fas ${icon}"></i> <span>${dlEsc(t.cannot_send_offer_reason)}${t.my_deal_ban_until ? ` <strong data-countdown="${dlEsc(t.my_deal_ban_until)}">${dlEsc(dlTimeLeft(t.my_deal_ban_until))}</strong>` : ''}</span></div>`;
  }
  return '';
}

/* ---------- Offer composer (new offer or counter) ---------- */
let offerComposer = null;

async function openOfferComposer(mode, offerId = null, offerPrice = null, countersLeft = null, currentIsLock = true) {
  const c = currentChatConversation;
  if (!c) return;
  const rules = await dlRules();
  const isSeller = dealChatThread?.my_role === 'seller';
  offerComposer = { mode, offerId, isSeller, rules };
  const isCounter = mode === 'counter';
  const listPrice = dealChatThread?.product?.price;
  const startPrice = isCounter ? offerPrice : listPrice;

  document.getElementById('dealOfferTitle').textContent = isCounter ? 'Counter-offer' : (isSeller ? 'Send a deal offer' : 'Make an offer');
  document.getElementById('dealOfferSub').textContent = isCounter
    ? `Their offer: ${dlRupees(offerPrice)}. ${countersLeft} counter-offer${countersLeft === 1 ? '' : 's'} left.`
    : (listPrice ? `Listed at ${dlRupees(listPrice)}.` : '');
  const price = document.getElementById('dealOfferPrice');
  price.value = startPrice ? Math.round(startPrice).toLocaleString('en-IN') : '';
  document.getElementById('dealOfferNote').value = '';
  document.getElementById('dealOfferError').classList.add('hidden');
  document.getElementById('dealOfferSubmit').textContent = isCounter ? 'Send counter-offer' : 'Send offer';
  // DealLock (with EMI) or a normal offer. Ticked by default when DealLock
  // is available; a counter starts as the offer it answers.
  const available = dealChatThread ? dealChatThread.deallock_available !== false : true;
  const box = document.getElementById('dealOfferDeallock');
  box.checked = available && (isCounter ? currentIsLock !== false : true);
  box.disabled = !available;
  document.getElementById('dealOfferModeTitle').textContent = isSeller ? 'Sell with EMI (DealLock)' : 'Buy with EMI (DealLock)';
  const off = document.getElementById('dealOfferModeOff');
  off.textContent = available ? '' : ((dealChatThread && dealChatThread.deallock_unavailable_reason) || 'EMI isn’t available on this listing. This will be a normal offer.');
  off.classList.toggle('hidden', available);
  dlOfferModeChanged();
  dlOpenOverlay('dealOfferModal', 'dealOffer');
  setTimeout(() => price.focus(), 50);
}

/* The composer's texts follow the DealLock tick box. */
function dlOfferModeChanged() {
  const comp = offerComposer;
  if (!comp) return;
  const rules = comp.rules || dealRulesCache || { offer_valid_hours: 48, reservation_days: 7 };
  const isSeller = comp.isSeller;
  const lock = document.getElementById('dealOfferDeallock').checked;
  const vehicle = sellDocsIsVehicle(dealChatThread?.product?.category);
  document.getElementById('dealOfferModeHint').textContent = lock
    ? (isSeller
      ? 'The buyer pays through a loan from a DealBriz lending partner, who pays you. The listing is held and documents are verified.'
      : 'Pay in EMIs through a DealBriz lending partner, who pays the seller. The listing is held for you and documents are verified.')
    : 'Normal offer: no EMI, the listing isn’t held, and the payment is settled directly. Tick to use EMI.';
  document.getElementById('dealOfferWrap').classList.toggle('is-lock', lock);
  document.getElementById('dealOfferInfo').innerHTML = lock
    ? (isSeller
      ? `DealLock offer, valid for ${rules.offer_valid_hours} hours. If the buyer accepts, they read the deal warning, then you confirm with ${dlConfirmWords(rules)}. The deal locks once the buyer’s documents${vehicle ? ' and your listing’s documents' : ''} are verified.`
      : `DealLock offer, valid for ${rules.offer_valid_hours} hours. If it’s accepted, you read the deal warning and the seller confirms. The deal locks, and the listing is reserved for you for ${rules.reservation_days} days, once your documents${vehicle ? ' and the seller’s vehicle documents' : ''} are verified.`)
    : `Normal offer, valid for ${rules.offer_valid_hours} hours. If it’s accepted, the price is agreed in this chat and that’s all: DealBriz doesn’t reserve the listing or arrange a loan, and the ${isSeller ? 'buyer pays you' : 'payment goes to the seller'} directly.`;
}

function closeOfferComposer() { closeTopModal('dealOffer'); }

async function submitOfferComposer() {
  const c = currentChatConversation;
  const errEl = document.getElementById('dealOfferError');
  const btn = document.getElementById('dealOfferSubmit');
  const price = dlParseRupees(document.getElementById('dealOfferPrice').value);
  const note = document.getElementById('dealOfferNote').value.trim();
  if (!c || !offerComposer) return;
  if (!price || price < 1) {
    errEl.textContent = 'Enter the price in rupees.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  const composer = offerComposer;
  const useDeallock = !!document.getElementById('dealOfferDeallock')?.checked;
  // No warning here, for either side: the warning comes with the seller's
  // final confirmation, and the buyer is told when that happens.
  btn.disabled = true;
  try {
    if (composer.mode === 'counter') {
      await dealsApi.counter(composer.offerId, price, note, useDeallock);
    } else if (composer.isSeller) {
      // In a seller's chat the other party is the buyer.
      await dealsApi.sendOffer({ productId: c.listingId, buyerId: c.sellerId, price, note, useDeallock });
    } else {
      await dealsApi.sendOffer({ productId: c.listingId, price, note, useDeallock });
    }
    await dlCloseModalThen('dealOffer');
    const what = composer.mode === 'counter' ? 'Counter-offer' : 'Offer';
    showToast(useDeallock ? `DealLock ${what.toLowerCase()} sent.` : `Normal ${what.toLowerCase()} sent.`, 'success');
    await loadChatMessages();
  } catch (err) {
    errEl.textContent = err.message || 'Could not send the offer.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

/* What accepting an offer starts, for the side accepting it. */
function dlAcceptOfferDialog(price, isSeller, rules) {
  const hours = rules.confirm_hours || 24;
  const vehicle = sellDocsIsVehicle(dealChatThread?.product?.category);
  const steps = isSeller
    ? [
        `The buyer reviews and accepts the deal terms within ${hours} hours.`,
        `You give the final confirmation with ${dlConfirmWords(rules)}.`,
        `The buyer uploads their PAN card and Aadhaar card${vehicle ? ', and your vehicle documents on the listing are verified' : ''}. The deal then locks and the listing is reserved for the buyer.`,
      ]
    : [
        `You review and accept the deal terms within ${hours} hours.`,
        'The seller gives the final confirmation.',
        `You upload your PAN card and Aadhaar card. Once they’re verified${vehicle ? ', along with the seller’s vehicle documents,' : ''} the deal locks and the listing is reserved for you.`,
      ];
  return {
    tone: 'info',
    title: 'Accept this offer?',
    body: `
      <div class="deal-ask-amount"><span>Agreed price</span><strong>${dlRupees(price)}</strong></div>
      <div class="deal-ask-sub">What happens next</div>
      <ol class="deal-ask-steps">${steps.map(t => `<li>${t}</li>`).join('')}</ol>
      <p class="deal-ask-note"><i class="fas fa-circle-info"></i> ${isSeller
        ? 'Nobody else can start a deal on this listing meanwhile. You can still decline until you give the final confirmation.'
        : 'Nothing is reserved yet, and you can still withdraw until the seller confirms.'}</p>`,
    ok: 'Accept offer',
    cancel: 'Not now',
  };
}

/* Accepting a normal offer: the price is agreed, nothing else happens. */
function dlAcceptNormalOfferDialog(price, isSeller) {
  return {
    tone: 'info',
    title: 'Accept this normal offer?',
    body: `
      <div class="deal-ask-amount"><span>Agreed price</span><strong>${dlRupees(price)}</strong></div>
      <p>This is a <strong>normal offer, not DealLock</strong>: no EMI through DealBriz, and the listing isn’t reserved.</p>
      <p class="deal-ask-note"><i class="fas fa-circle-info"></i> ${isSeller
        ? 'Agree the payment and the handover with the buyer yourselves, and mark the listing sold once it’s done.'
        : 'Agree the payment and the handover with the seller yourselves. Pay only once you have checked the item, and meet in a safe public place.'}</p>`,
    ok: 'Accept offer',
    cancel: 'Not now',
  };
}

async function dealAcceptOffer(offerId, price, isLock = true) {
  const isSeller = dealChatThread?.my_role === 'seller';
  const rules = await dlRules();
  if (isLock === false) {
    if (!(await dlAsk(dlAcceptNormalOfferDialog(price, isSeller)))) return;
    try {
      await dealsApi.accept(offerId);
      showToast('Offer accepted. The price is agreed.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not accept the offer.', 'error');
    }
    loadChatMessages();
    return;
  }
  if (!(await dlAsk(dlAcceptOfferDialog(price, isSeller, rules)))) return;
  try {
    const deal = await dealsApi.accept(offerId);
    showToast(isSeller ? 'Accepted. The buyer now accepts the deal warning, then you confirm.' : 'Accepted.', 'success');
    await loadChatMessages();
    if (isSeller) { openDeal(deal.id); return; }
    // The buyer's turn: the warning, straight away.
    await dlBuyerAcceptWarning({ ...deal, product: dealChatThread && dealChatThread.product });
    openDeal(deal.id);
  } catch (err) {
    showToast(err.message || 'Could not accept the offer.', 'error');
    loadChatMessages();
  }
}

async function dealDeclineOffer(offerId) {
  if (!(await dlAsk({ tone: 'warn', title: 'Decline this offer?', body: '<p>The other side is told you declined. You can still send or receive a new offer in the chat.</p>', ok: 'Decline offer', cancel: 'Keep it' }))) return;
  try { await dealsApi.decline(offerId); await loadChatMessages(); }
  catch (err) { showToast(err.message || 'Could not decline.', 'error'); loadChatMessages(); }
}

async function dealWithdrawOffer(offerId) {
  if (!(await dlAsk({ tone: 'warn', title: 'Withdraw your offer?', body: '<p>The other side can no longer accept it. You can send a new offer at any time.</p>', ok: 'Withdraw offer', cancel: 'Keep it' }))) return;
  try { await dealsApi.withdraw(offerId); await loadChatMessages(); }
  catch (err) { showToast(err.message || 'Could not withdraw.', 'error'); loadChatMessages(); }
}

/* =====================================================
   SELLER CONFIRMATION: warning, then the password (or SMS code)
   ===================================================== */
let dlOtpState = null;

async function openDealAndConfirm(dealId) {
  await openDeal(dealId);
  const d = dealModalState && dealModalState.deal;
  if (d && d.can_confirm) dealStartConfirm();
}

/* The buyer's "Read and accept the deal warning" button in the deal sheet. */
async function dealStartBuyerAccept() {
  const d = dealModalState && dealModalState.deal;
  if (!d || !d.can_acknowledge) return;
  await dlBuyerAcceptWarning(d);
}

/* The seller confirms with their account password (no SMS provider set up
   yet) or a 6-digit SMS code: the server says which (confirm_method). */
function dlConfirmWords(d) {
  const m = d && d.confirm_method;
  return m === 'password' ? 'your password' : m === 'email' ? 'the code sent to your email' : 'the SMS code';
}
function dlConfirmLabel(d) {
  const m = d && d.confirm_method;
  return m === 'password' ? 'Confirm with your password' : m === 'email' ? 'Confirm with email code' : 'Confirm with SMS code';
}

async function dealStartConfirm() {
  const d = dealModalState && dealModalState.deal;
  if (!d || !d.can_confirm) {
    if (d && d.waiting_for_buyer_ack) showToast('Waiting for the buyer to accept the deal warning first.', 'info');
    return;
  }
  const ok = await dlWarn('seller', {
    price: d.agreed_price, title: d.product && d.product.title,
    buyer: d.other_user && d.other_user.name, loanType: d.loan_type,
    listingDocs: d.listing_docs && d.listing_docs.state,
  });
  if (!ok) return;
  // How the seller proves it's them: a 6-digit code by email (or SMS, if
  // an SMS provider is set up), or, if neither is, their account password.
  const pw = d.confirm_method === 'password';
  const method = pw ? 'password' : (d.confirm_method === 'email' ? 'email' : 'sms');
  dlOtpState = { dealId: d.id, timer: null, method };
  document.getElementById('dealOtpTitle').textContent = pw ? 'Confirm with your password'
    : method === 'email' ? 'Confirm with the code from your email' : 'Confirm with the SMS code';
  document.getElementById('dealOtpCode').value = '';
  document.getElementById('dealOtpPassword').value = '';
  document.getElementById('dealOtpCode').classList.toggle('hidden', pw);
  document.getElementById('dealOtpPassword').classList.toggle('hidden', !pw);
  document.getElementById('dealOtpResend').classList.toggle('hidden', pw);
  document.getElementById('dealOtpError').classList.add('hidden');
  document.getElementById('dealOtpSub').textContent = pw
    ? 'Enter your DealBriz account password to confirm that this decision is really yours.'
    : (method === 'email' ? 'Sending the code to your email...' : 'Sending the code to your mobile number...');
  dlOpenOverlay('dealOtpModal', 'dealOtp');
  if (pw) setTimeout(() => document.getElementById('dealOtpPassword').focus(), 50);
  else await dlOtpSend();
}

function dlOtpStop() {
  if (dlOtpState && dlOtpState.timer) clearInterval(dlOtpState.timer);
  if (dlOtpState) dlOtpState.timer = null;
}

function dlOtpCountdown(seconds) {
  const btn = document.getElementById('dealOtpResend');
  dlOtpStop();
  let left = seconds;
  const tick = () => {
    if (left <= 0) { dlOtpStop(); btn.disabled = false; btn.textContent = 'Send the code again'; return; }
    btn.disabled = true;
    btn.textContent = `Send again in ${left}s`;
    left -= 1;
  };
  tick();
  if (dlOtpState) dlOtpState.timer = setInterval(tick, 1000);
}

async function dlOtpSend() {
  if (!dlOtpState) return;
  const err = document.getElementById('dealOtpError');
  const sub = document.getElementById('dealOtpSub');
  const btn = document.getElementById('dealOtpResend');
  btn.disabled = true;
  err.classList.add('hidden');
  try {
    const r = await dealsApi.confirmSendCode(dlOtpState.dealId);
    sub.textContent = `We sent a 6-digit code to ${r.sent_to}. It works for ${r.expires_in_minutes} minutes.`
      + (dlOtpState.method === 'email' ? ' Check your spam folder too.' : '');
    dlOtpCountdown(r.resend_after_seconds || 60);
    setTimeout(() => document.getElementById('dealOtpCode').focus(), 50);
  } catch (e) {
    err.textContent = e.message || 'Could not send the code.';
    err.classList.remove('hidden');
    sub.textContent = dlOtpState.method === 'email'
      ? 'The code is sent to the email address of your DealBriz account.'
      : 'The code is sent by SMS to the mobile number on your profile.';
    btn.disabled = false;
    btn.textContent = 'Send the code again';
  }
}

async function dlOtpSubmit() {
  if (!dlOtpState) return;
  const pw = dlOtpState.method === 'password';
  const code = document.getElementById('dealOtpCode').value.replace(/\D/g, '');
  const password = document.getElementById('dealOtpPassword').value;
  const err = document.getElementById('dealOtpError');
  const btn = document.getElementById('dealOtpSubmit');
  if (pw && !password) { err.textContent = 'Enter your password.'; err.classList.remove('hidden'); return; }
  if (!pw && code.length !== 6) { err.textContent = `Enter the 6-digit code from the ${dlOtpState.method === 'email' ? 'email' : 'SMS'}.`; err.classList.remove('hidden'); return; }
  btn.disabled = true;
  err.classList.add('hidden');
  const dealId = dlOtpState.dealId;
  try {
    const d = await dealsApi.confirm(dealId, pw ? { password } : { code });
    await dlCloseModalThen('dealOtp');
    showToast(d.status === 'locked' ? 'Deal locked.' : 'Confirmed. The deal locks once the documents are verified.', 'success');
    if (modalStack.includes('deal')) { dealModalState = { deal: d, panel: null }; renderDealModal(); }
    else openDeal(dealId);
    if (currentChatConversation) loadChatMessages();
    if (currentPage === 'mydeals') renderMyDeals();
  } catch (e) {
    err.textContent = e.message || 'That didn’t work. Please try again.';
    err.classList.remove('hidden');
    if (pw) document.getElementById('dealOtpPassword').value = '';
  } finally {
    btn.disabled = false;
  }
}

/* =====================================================
   DEAL SHEET (opened from chat, My Deals, or a listing)
   ===================================================== */
let dealModalState = null;

async function openDeal(dealId) {
  if (!currentUser) { pendingAction = () => openDeal(dealId); openModal(); return; }
  const body = document.getElementById('dealModalBody');
  body.innerHTML = `<div class="deal-loading"><i class="fas fa-spinner fa-spin"></i> Loading deal...</div>`;
  if (!modalStack.includes('deal')) dlOpenOverlay('dealModal', 'deal');
  // The deal's id in the address bar: a browser refresh reopens this deal
  // (dlRestoreFromUrl) instead of dropping back to the page underneath.
  // Only this history entry carries it, so closing the deal removes it.
  dlUrlDeal(dealId);
  await reloadDealModal(dealId);
  dlLiveStart();
}

/* ---------- Live updates ----------
   While a deal is open it is fetched again every few seconds and redrawn
   in place when something changed (the other side confirmed, a document
   was checked...). It never navigates or closes anything. It waits while
   the person is typing in the deal, has a form or a dialog open on top of
   it, or the tab is in the background. */
const DL_LIVE_MS = 4000;
let dlLiveTimer = null;
let dlLiveBusy = false;

function dlLiveStart() {
  dlLiveStop();
  dlLiveTimer = setInterval(dlLiveTick, DL_LIVE_MS);
}

function dlLiveStop() {
  if (dlLiveTimer) clearInterval(dlLiveTimer);
  dlLiveTimer = null;
}

function dlDealSignature(d) {
  if (!d) return '';
  return JSON.stringify([d.status, d.updated_at, (d.events || []).length,
    (d.documents || []).map(x => `${x.type}:${x.status}`), d.listing_docs && d.listing_docs.state,
    d.cancel_request ? [d.cancel_request.by_role, d.cancel_request.created_at] : null,
    d.loan ? [d.loan.status, d.loan.lender] : null, d.lender, d.buyer_ack_at, d.seller_confirmed_at,
    d.down_payment_at, d.buyer_ready_at, d.seller_ready_at, d.money_received_at, d.utr]);
}

async function dlLiveTick() {
  if (!dealModalState || !modalStack.includes('deal')) { dlLiveStop(); return; }
  if (document.hidden || dlLiveBusy) return;
  if (modalStack[modalStack.length - 1] !== 'deal') return;          // a dialog is open on top
  if (dealModalState.uploading || dealModalState.panel) return;       // uploading, or a form is open
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest('#dealModal') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  const id = dealModalState.deal.id;
  dlLiveBusy = true;
  try {
    const d = await dealsApi.get(id);
    if (!dealModalState || dealModalState.deal.id !== id || dealModalState.panel || dealModalState.uploading) return;
    if (dlDealSignature(d) === dlDealSignature(dealModalState.deal)) return;
    const box = document.querySelector('#dealModal .modal-box');
    const top = box ? box.scrollTop : 0;
    dealModalState.deal = d;
    renderDealModal();
    if (box) box.scrollTop = top;
    // Keep the chat's deal bar and My Deals in step too.
    if (currentChatConversation && typeof refreshChatDealBar === 'function') refreshChatDealBar();
    if (currentPage === 'mydeals' && typeof renderMyDeals === 'function') renderMyDeals();
  } catch { /* a missed tick is fine */ } finally {
    dlLiveBusy = false;
  }
}

function dlUrlDeal(dealId) {
  try {
    const url = new URL(window.location.href);
    if (dealId) url.searchParams.set('deal', dealId); else url.searchParams.delete('deal');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}

/* After a browser refresh: reopen the deal that was open (app.js calls
   this once the page and the signed-in user are restored). */
function dlRestoreFromUrl(id) {
  if (!id) {
    try { id = new URL(window.location.href).searchParams.get('deal'); } catch { /* ignore */ }
  }
  if (!id) return;
  dlUrlDeal(null);           // this entry is the page; the deal gets its own
  if (currentUser) openDeal(id);
}

/* The other side's actions that need an answer here (accept the warning,
   a cancel request) pop up within seconds, not at the next 60 s check. */
const DL_NOTICE_MS = 10000;
let dlNoticeTimer = null;
function dlNoticeLoopStart() {
  if (dlNoticeTimer) return;
  dlNoticeTimer = setInterval(() => {
    if (!currentUser || document.hidden) return;
    if (modalStack.length && ['dealWarn', 'dealNotice', 'dealOtp', 'dealAsk', 'dealLoan', 'dealOffer'].includes(modalStack[modalStack.length - 1])) return;
    dealsCheckBuyerNotices();
  }, DL_NOTICE_MS);
}

async function reloadDealModal(dealId) {
  const body = document.getElementById('dealModalBody');
  let d;
  try { d = await dealsApi.get(dealId); }
  catch (err) {
    body.innerHTML = `<div class="deal-loading">${dlEsc(err.message || 'Could not load this deal.')}</div>`;
    return;
  }
  await dlRules();
  dealModalState = { deal: d, panel: null, uploading: null };
  renderDealModal();
}

function renderDealModal() {
  if (!dealModalState) return;
  const d = dealModalState.deal;
  const body = document.getElementById('dealModalBody');
  const p = d.product || {};
  const other = d.other_user || {};
  const role = d.my_role;

  body.innerHTML = `
    ${dealModalState.notice ? `<div class="deal-ban-banner"><i class="fas fa-ban"></i> ${dlEsc(dealModalState.notice)}</div>` : ''}
    <div class="deal-head">
      <div class="deal-head-img"><i class="fas ${isVehicle(d) ? 'fa-car' : 'fa-box'}"></i>${p.image_url ? `<img src="${dlEsc(toAbsoluteUrl(p.image_url))}" alt="" onerror="this.remove()">` : ''}</div>
      <div class="deal-head-text">
        <div class="deal-head-title">${dlEsc(p.title || 'Listing')}</div>
        <div class="deal-head-sub">${role === 'seller' ? 'Buyer' : 'Seller'}: ${dlEsc(other.name || '—')}</div>
        <div class="deal-head-type">${loanTypeTag(d.loan_type)}</div>
      </div>
    </div>
    <div class="deal-price-row">
      <div><span class="deal-label">Agreed price</span><strong>${dlRupees(d.agreed_price)}</strong></div>
      ${dealPill(d.status)}
    </div>

    ${dealStepper(d)}
    ${dealNextStepHtml(d)}
    ${dealDocsHtml(d)}
    ${d.loan ? dealLoanHtml(d) : ''}
    ${dealTimelineHtml(d)}
    ${dealFooterHtml(d)}`;
}

function dealStepper(d) {
  const status = d.status;
  if (status === 'released') {
    return `<div class="deal-ended"><i class="fas fa-rotate-left"></i> This deal was released. The listing is back on sale.</div>`;
  }
  // Five steps. After the loan application, the lender's checks, the
  // handover and the payout all lead to step 5, which is ticked only when
  // the deal is completed.
  const steps = ['Warning & confirm', 'Documents', 'Locked', 'Apply for loan', 'Deal complete'];
  const at = { awaiting_seller: 0, docs_pending: 1, locked: 3,
               loan_in_progress: 4, ready_to_pay: 4, paid: 4, disputed: 4 }[status];
  const allDone = status === 'completed';
  return `<ol class="deal-steps" style="grid-template-columns:repeat(${steps.length},1fr)">${steps.map((label, i) => `
    <li class="${allDone || i < at ? 'is-done' : i === at ? 'is-current' : ''}">
      <span class="deal-step-dot">${allDone || i < at ? '<i class="fas fa-check"></i>' : i + 1}</span>
      <span class="deal-step-label">${label}</span>
    </li>`).join('')}</ol>`;
}

function docsProgress(d, party = null) {
  const need = (d.documents || []).filter(x => x.required && (!party || x.party === party));
  return { need: need.length, approved: need.filter(x => x.status === 'approved').length,
    uploaded: need.filter(x => ['uploaded', 'approved'].includes(x.status)).length,
    rejected: need.filter(x => x.status === 'rejected').length };
}

/* What happens next, for whoever is looking, plus their buttons. */
function dealNextStepHtml(d) {
  const role = d.my_role;
  const loan = d.loan;
  const lender = (loan && loan.lender) || d.lender || 'the lender';
  const box = (icon, title, text, actions = '', extra = '') => `
    <div class="deal-next ${extra}">
      <div class="deal-next-head"><i class="fas ${icon}"></i> ${title}</div>
      ${text ? `<p>${text}</p>` : ''}
      ${actions}
    </div>`;

  switch (d.status) {
    case 'awaiting_seller':
      if (role === 'seller') {
        return d.waiting_for_buyer_ack
          ? box('fa-hourglass-half', 'Waiting for the buyer to accept the deal warning',
              `The buyer reads and accepts the deal warning first, by <strong>${dlEsc(dlWhen(d.confirm_by))}</strong>. Then you decide: confirm with ${dlConfirmWords(d)}, or decline. Nobody else can start a deal on this listing meanwhile.`,
              `<button class="deal-btn deal-btn-primary deal-btn-wide" disabled><i class="fas fa-shield-halved"></i> ${dlConfirmLabel(d)}</button>
               <button class="deal-btn deal-btn-quiet deal-btn-wide" onclick="dealSetPanel('cancel')">Decline this deal</button>`)
          : box('fa-lock', 'Confirm and lock this deal',
              `The buyer agreed to <strong>${dlRupees(d.agreed_price)}</strong> and accepted the deal warning. The decision is yours: confirm with ${dlConfirmWords(d)} by <strong>${dlEsc(dlWhen(d.confirm_by))}</strong>, or decline. If you do neither, the deal is released.`,
              `<button class="deal-btn deal-btn-primary deal-btn-wide" onclick="dealStartConfirm()"><i class="fas fa-shield-halved"></i> ${dlConfirmLabel(d)}</button>
               <button class="deal-btn deal-btn-quiet deal-btn-wide" onclick="dealSetPanel('cancel')">Decline this deal</button>`);
      }
      return d.can_acknowledge
        ? box('fa-shield-halved', 'Read and accept the deal warning',
            `Before the seller can lock this deal, read what it means for you and accept it, by <strong>${dlEsc(dlWhen(d.confirm_by))}</strong>. If you don’t, the deal is released.`,
            `<button class="deal-btn deal-btn-primary deal-btn-wide" onclick="dealStartBuyerAccept()"><i class="fas fa-shield-halved"></i> Read and accept the deal warning</button>`, 'deal-next-attn')
        : box('fa-hourglass-half', 'Waiting for the seller to confirm',
            `You accepted the deal warning. The seller takes the final decision, by <strong>${dlEsc(dlWhen(d.confirm_by))}</strong>. Nobody else can start a deal on this listing meanwhile.`);

    case 'docs_pending': {
      const pr = docsProgress(d);
      const buyer = docsProgress(d, 'buyer');
      const lst = (d.listing_docs && d.listing_docs.state) || 'none';
      const bar = `<div class="deal-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.need}" aria-valuenow="${pr.approved}">
          <span style="width:${pr.need ? Math.round(100 * pr.approved / pr.need) : 0}%"></span></div>
        <div class="deal-progress-text">${pr.approved} of ${pr.need} verified${role === 'buyer' && buyer.rejected ? ` · <strong class="deal-red">${buyer.rejected} of yours to upload again</strong>` : ''}</div>`;
      const who = d.lender ? `${dlEsc(d.lender)} or DealBriz` : 'DealBriz or the lender';
      const days = ((dealRulesCache || {}).reservation_days) || 7;
      const due = `Documents due by <strong>${dlEsc(dlWhen(d.reserved_until))}</strong>, or the deal is released.`;
      const buyerUp = (d.docs_uploaded || {}).buyer;
      // The seller's vehicle documents live on the listing (checked once).
      const listingLine = (mineSide) => {
        if (lst === 'none') return '';
        if (lst === 'verified') return `<p class="deal-small"><i class="fas fa-circle-check deal-green"></i> ${mineSide ? 'Your listing’s documents are verified.' : 'The seller’s vehicle documents are verified.'}</p>`;
        if (lst === 'checking') return `<p class="deal-small"><i class="fas fa-hourglass-half"></i> ${mineSide ? `Your listing’s documents are uploaded and being checked by ${who}.` : 'The seller’s vehicle documents are uploaded and being checked.'}</p>`;
        const ls = d.listing_docs || {};
        const pid = dlEsc((d.product || {}).id || d.product_id || '');
        return mineSide
          ? `<p class="deal-small deal-red"><i class="fas fa-circle-exclamation"></i> Your listing still needs its vehicle documents${ls.rejected ? ' (one was sent back)' : ''}. Upload them on the listing.</p>
             <button class="deal-btn deal-btn-primary deal-btn-wide" onclick="dlGoToListingDocs('${pid}')"><i class="fas fa-upload"></i> Upload documents on the listing</button>`
          : `<p class="deal-small"><i class="fas fa-hourglass-half"></i> Waiting for the seller to upload their vehicle documents on the listing.</p>`;
      };
      if (role === 'seller') {
        const buyerLine = buyerUp
          ? `<p class="deal-small"><i class="fas fa-circle-check deal-green"></i> The buyer has uploaded their PAN card and Aadhaar card. ${buyer.approved === buyer.need ? 'All verified.' : 'They’re being checked.'}</p>`
          : `<p class="deal-small"><i class="fas fa-hourglass-half"></i> Waiting for the buyer to upload their PAN card and Aadhaar card (${buyer.uploaded} of ${buyer.need} so far).</p>`;
        return box('fa-file-shield', 'Documents pending',
          `The deal locks, and the listing is reserved for ${days} days, once the buyer’s documents${lst === 'none' ? '' : ' and your listing’s documents'} are verified. ${due}`,
          bar + listingLine(true) + buyerLine, 'deal-next-docs');
      }
      if (role === 'buyer') {
        const myText = buyerUp
          ? `Your documents are uploaded and being checked by ${who}.`
          : 'Upload your PAN card and Aadhaar card below.';
        return box('fa-file-shield', 'Documents pending',
          `${myText} The deal locks, and the listing is reserved for you for ${days} days, once they${lst === 'none' ? ' are' : ' and the seller’s vehicle documents are'} verified. ${due}`,
          bar + listingLine(false), 'deal-next-docs');
      }
      return box('fa-file-shield', 'Documents pending', due, bar, 'deal-next-docs');
    }

    case 'locked':
      return role === 'buyer'
        ? box('fa-file-signature', 'Next: your loan application',
            `The listing is reserved for you until <strong>${dlEsc(dlWhen(d.reserved_until))}</strong>. Apply now so the lender has time to check you${isVehicle(d) ? ' and the vehicle' : ''}.`,
            `<button class="deal-btn deal-btn-primary deal-btn-wide" onclick="openLoanForm()"><i class="fas fa-hand-holding-usd"></i> Apply for the loan</button>`)
        : box('fa-hourglass-half', 'Waiting for the buyer to apply for the loan',
            `The listing is reserved for this buyer until <strong>${dlEsc(dlWhen(d.reserved_until))}</strong>. If the loan isn't ready to pay by then, the deal is released automatically.`);

    case 'loan_in_progress': {
      const st = loan ? (LOAN_STATUS_LABEL[loan.status] || loan.status) : 'In progress';
      return box('fa-magnifying-glass-dollar', `Loan: ${dlEsc(st)}`,
        loan && loan.status === 'approved'
          ? `The loan is approved. ${dlEsc(lender)} will ${isVehicle(d) ? 'check the vehicle and documents, then ' : ''}mark the deal Ready to pay. Reserved until <strong>${dlEsc(dlWhen(d.reserved_until))}</strong>.`
          : (role === 'buyer'
              ? `Your application has been submitted to ${dlEsc(lender)}, who will contact you to complete it. The listing stays reserved for you until <strong>${dlEsc(dlWhen(d.reserved_until))}</strong>.`
              : `The buyer’s application is with ${dlEsc(lender)}. Reserved until <strong>${dlEsc(dlWhen(d.reserved_until))}</strong>.`));
    }

    case 'ready_to_pay':
      return box('fa-people-arrows', 'Handover meeting',
        `${dlEsc(lender)} is ready to pay. Meet to hand over the ${itemWord(d)}. The seller keeps ${isVehicle(d) ? 'the keys, RC and forms' : 'the item'} until the money arrives.`,
        dealHandoverHtml(d) + (role === 'buyer' ? handoverCodeCard(d) : ''));

    case 'paid':
      return box('fa-indian-rupee-sign', `${dlEsc(lender)} paid the seller`,
        `UTR <strong class="deal-utr">${dlEsc(d.utr)}</strong>`,
        dealPaidActionsHtml(d));

    case 'disputed':
      return box('fa-life-ring', 'Under review by DealBriz support',
        `Support will contact both of you. ${isVehicle(d) ? 'Keys, RC and forms' : 'The item'} should stay where ${isVehicle(d) ? 'they are' : 'it is'} until it is sorted out.`);

    case 'completed':
      return box('fa-circle-check', 'Deal completed',
        `Completed on ${dlEsc(dlWhen(d.completed_at))}.${d.utr ? ` UTR <strong class="deal-utr">${dlEsc(d.utr)}</strong>.` : ''}`);

    case 'released': {
      const why = RELEASE_REASON_LABEL[d.release_reason] || 'it was released';
      return box('fa-circle-info', 'Deal released', `Released because ${dlEsc(why)}.${d.release_note ? ` Note: ${dlEsc(d.release_note)}` : ''}`);
    }
  }
  return '';
}

/* The buyer's code. Only the buyer gets it from the server. */
function handoverCodeCard(d) {
  if (!d.handover_code) return '';
  return `
    <div class="deal-code-card">
      <div class="deal-code-label">Your handover code</div>
      <div class="deal-code" aria-label="Handover code">${dlEsc(d.handover_code.split('').join(' '))}</div>
      <p>Give this code to the seller only after you have the ${isVehicle(d) ? 'vehicle, keys, original RC and signed forms' : 'item'}. The seller enters it to finish the deal. Don’t share it before that.</p>
    </div>`;
}

function dealHandoverHtml(d) {
  const role = d.my_role;
  const tick = (done, label, sub = '') => `
    <li class="${done ? 'is-done' : ''}">
      <i class="fas ${done ? 'fa-circle-check' : 'fa-circle'}"></i>
      <div><strong>${label}</strong>${sub ? `<span>${sub}</span>` : ''}</div>
    </li>`;

  const checklist = `
    <ul class="deal-checklist">
      ${tick(!!d.down_payment_at, 'Down payment paid to the seller',
        d.down_payment_at ? dlRupees(d.down_payment) + ' by UPI' : 'Buyer pays by UPI and records it')}
      ${tick(!!d.buyer_ready_at, 'Buyer ready', d.buyer_ready_at ? dlEsc(dlWhen(d.buyer_ready_at)) : (isVehicle(d) ? 'Hypothecation form signed' : 'Loan papers signed'))}
      ${tick(!!d.seller_ready_at, 'Seller ready', d.seller_ready_at ? dlEsc(dlWhen(d.seller_ready_at)) : (isVehicle(d) ? 'RC transfer forms signed' : 'Ready to hand over'))}
    </ul>`;

  let actions = '';
  if (role === 'buyer') {
    if (!d.down_payment_at) {
      const suggested = d.loan && d.loan.down_payment != null ? Math.round(d.loan.down_payment).toLocaleString('en-IN') : '';
      actions = `
        <div class="deal-inline-form">
          <label for="dealDownPayment">Down payment paid (₹)</label>
          <div class="deal-inline-row">
            <input id="dealDownPayment" data-rupee inputmode="numeric" value="${suggested}" oninput="dlFormatRupeeInput(this)" placeholder="0 if none">
            <button class="deal-btn deal-btn-primary" onclick="dealRecordDownPayment()">Record</button>
          </div>
        </div>`;
    } else if (!d.buyer_ready_at) {
      actions = `<button class="deal-btn deal-btn-primary deal-btn-wide" onclick="dealReady()"><i class="fas fa-check"></i> I'm ready</button>`;
    }
  } else if (role === 'seller' && !d.seller_ready_at) {
    actions = `<button class="deal-btn deal-btn-primary deal-btn-wide" onclick="dealReady()"><i class="fas fa-check"></i> I'm ready</button>`;
  }
  if (d.buyer_ready_at && d.seller_ready_at) {
    actions = `<div class="deal-wait"><i class="fas fa-spinner fa-spin"></i> Both ready. Waiting for the lender to pay the seller.</div>`;
  }
  return checklist + actions;
}

function dealPaidActionsHtml(d) {
  const role = d.my_role;
  if (role === 'seller') {
    const codeForm = `
      <p class="deal-small">Check your bank for the payment first. Then hand over the ${isVehicle(d) ? 'vehicle, keys, original RC and signed forms' : 'item'} and ask the buyer for their 6-digit handover code.</p>
      <div class="deal-inline-form">
        <label for="dealHandoverCode">Buyer’s handover code</label>
        <div class="deal-inline-row">
          <input id="dealHandoverCode" class="deal-code-input" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 digits"
                 oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)" onkeydown="if(event.key==='Enter') dealEnterHandoverCode()">
          <button class="deal-btn deal-btn-primary" onclick="dealEnterHandoverCode()">Finish deal</button>
        </div>
      </div>`;
    if (!d.money_received_at) {
      return codeForm + `
        <button class="deal-btn deal-btn-quiet deal-btn-wide" onclick="dealMoneyReceived()">No code? Confirm the money arrived and let the buyer confirm instead</button>`;
    }
    return codeForm + `<div class="deal-wait"><i class="fas fa-circle-check"></i> You confirmed the money arrived. Waiting for the buyer to confirm the ${itemWord(d)}, or enter their code.</div>`;
  }
  // Buyer
  const card = handoverCodeCard(d);
  if (!d.money_received_at) {
    return card + `<div class="deal-wait"><i class="fas fa-hourglass-half"></i> The seller checks the money arrived, then hands over the ${itemWord(d)}.</div>`;
  }
  return card + `<p class="deal-small">The seller confirmed the money. Once you have the ${isVehicle(d) ? 'vehicle, keys, original RC and signed forms' : 'item'}, confirm here (or give the seller your code).</p>
    <button class="deal-btn deal-btn-primary deal-btn-wide" onclick="dealVehicleReceived()"><i class="fas ${isVehicle(d) ? 'fa-key' : 'fa-box-open'}"></i> ${isVehicle(d) ? 'Vehicle received' : 'Item received'}</button>`;
}

/* ---------- Documents ----------
   Phase 5: the seller's documents are on the listing (uploaded when posting
   or from Edit listing, checked once). In the deal only the buyer uploads. */
function dealDocRowHtml(d, item, canUpload, accept) {
  const doc = item.document;
  const st = item.status;
  const busy = dealModalState && dealModalState.uploading === item.type;
  const right = `<span class="deal-doc-status deal-doc-${dlEsc(st)}">${dlEsc(DOC_STATUS_LABEL[st] || st)}</span>`;
  let actions = '';
  if (canUpload && item.required && st !== 'approved') {
    actions = busy
      ? `<span class="deal-small"><i class="fas fa-spinner fa-spin"></i> Uploading...</span>`
      : `<label class="deal-btn deal-btn-sm ${st === 'missing' || st === 'rejected' ? 'deal-btn-primary' : ''}">
           <i class="fas fa-upload"></i> ${st === 'missing' ? 'Upload' : 'Replace'}
           <input type="file" accept="${accept}" class="deal-file" onchange="dealUploadDoc('${dlEsc(item.type)}', this)">
         </label>`;
  }
  return `
    <li class="deal-doc deal-doc-row-${dlEsc(st)}${item.required ? '' : ' is-extra'}">
      <div class="deal-doc-main">
        <div class="deal-doc-name">${dlEsc(item.label)}${item.required ? '' : ' <small>(not needed now)</small>'}</div>
        ${st !== 'approved' && canUpload ? `<div class="deal-doc-hint">${dlEsc(item.hint)}</div>` : ''}
        ${doc && doc.file_name && st !== 'rejected' ? `<div class="deal-doc-hint"><i class="fas fa-paperclip"></i> ${dlEsc(doc.file_name)}</div>` : ''}
        ${st === 'rejected' && doc && doc.reject_reason ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(doc.reject_reason)}</div>` : ''}
        ${canUpload && dealModalState && (dealModalState.uploadErrors || {})[item.type] ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(dealModalState.uploadErrors[item.type])}</div>` : ''}
      </div>
      <div class="deal-doc-side">${right}<div class="deal-doc-actions">${actions}</div></div>
    </li>`;
}

function dealDocsHtml(d) {
  const role = d.my_role;
  if (!role || d.status === 'awaiting_seller') return '';
  const all = d.documents || [];
  const pending = d.status === 'docs_pending';

  // After the lock the list is history: one line is enough.
  if (!pending) {
    const verified = all.filter(x => x.required && x.status === 'approved').length;
    if (!verified) return '';
    return `<div class="deal-section"><h4>Documents</h4>
      <div class="deal-row"><span><i class="fas fa-circle-check deal-green"></i> ${verified} document${verified === 1 ? '' : 's'} verified (both sides)</span>
      <strong>${d.docs_approved_at ? dlEsc(dlDay(d.docs_approved_at)) : ''}</strong></div></div>`;
  }

  const rules = dealRulesCache || {};
  const accept = dlDocAccept();
  const privacy = `<p class="deal-small"><i class="fas fa-lock"></i> Private: once uploaded, only DealBriz’s superadmin and the lender can open them. A photo or a PDF, up to ${rules.doc_max_mb || 8} MB each (large photos are shrunk for you).</p>`;

  if (role === 'seller') {
    const docs = all.filter(x => x.party === 'seller');
    if (!docs.length) return '';
    const pid = (d.product || {}).id || d.product_id || '';
    return `
      <div class="deal-section deal-docs">
        <h4>Your listing’s documents</h4>
        ${docs.length ? `<ul class="deal-doc-list">${docs.map(item => dealDocRowHtml(d, item, false, accept)).join('')}</ul>` : ''}
        <p class="deal-small"><i class="fas fa-circle-info"></i> These are uploaded on the listing and checked once for every deal on it. To add or replace one, open the listing.</p>
        <button class="deal-btn deal-btn-wide" onclick="dlGoToListingDocs('${dlEsc(pid)}')"><i class="fas fa-pen"></i> Open the listing’s documents</button>
      </div>`;
  }

  const docs = all.filter(x => x.party === 'buyer');
  if (!docs.length) return '';
  return `
    <div class="deal-section deal-docs">
      <h4>Your documents</h4>
      <ul class="deal-doc-list">${docs.map(item => dealDocRowHtml(d, item, !!d.can_upload_docs, accept)).join('')}</ul>
      ${privacy}
    </div>`;
}

async function dealUploadDoc(type, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || !dealModalState) return;
  await dlRules();
  const id = dealModalState.deal.id;
  dealModalState.uploading = type;
  dealModalState.uploadErrors = { ...(dealModalState.uploadErrors || {}), [type]: null };
  renderDealModal();
  let error = null;
  try {
    const prep = await dlPrepareDocFile(file);
    if (prep.error) throw new Error(prep.error);
    const d = await dealsApi.uploadDoc(id, type, prep.file);
    if (!dealModalState || dealModalState.deal.id !== id) return;
    dealModalState.deal = d;
    showToast('Uploaded. It will be checked soon.', 'success');
  } catch (err) {
    error = dlUploadErrorText(err);
    showToast(error, 'error');
  }
  if (dealModalState && dealModalState.deal.id === id) dealModalState.uploadErrors = { ...(dealModalState.uploadErrors || {}), [type]: error };
  if (dealModalState && dealModalState.deal.id === id) {
    dealModalState.uploading = null;
    renderDealModal();
  }
}

/* Opens a private document. The window is opened straight away (inside
   the click) so it isn't blocked as a popup, and pointed at the file once
   the session is known to be fresh, since the file link carries no token
   of its own. */
async function dlViewDoc(dealId, docId) {
  const w = window.open('about:blank', '_blank');
  try { await apiFetch('/auth/me'); } catch { /* the file request will say what's wrong */ }
  const url = dealsApi.docFileUrl(dealId, docId);
  if (w) { try { w.opener = null; } catch { /* ignore */ } w.location.href = url; }
  else window.location.href = url;
}

function dealLoanHtml(d) {
  const l = d.loan;
  const rows = [
    ['Status', LOAN_STATUS_LABEL[l.status] || l.status],
    l.lender ? ['Lender', l.lender] : null,
    l.loan_amount != null ? ['Loan amount', dlRupees(l.loan_amount)] : null,
    l.down_payment != null ? ['Down payment', dlRupees(l.down_payment)] : null,
    l.monthly_emi != null ? ['EMI (estimate)', `up to ${dlRupees(l.monthly_emi)} × ${l.tenure_months} months`] : null,
    l.interest_rate != null ? ['Interest (estimate)', dlRateRangeText()] : null,
    l.nbfc_application_reference ? ['Lender reference', l.nbfc_application_reference] : null,
  ].filter(Boolean);
  return `
    <div class="deal-section">
      <h4>Loan</h4>
      ${rows.map(([k, v]) => `<div class="deal-row"><span>${k}</span><strong>${dlEsc(v)}</strong></div>`).join('')}
      ${l.kfs_url ? `<a class="deal-link" href="${dlEsc(l.kfs_url)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-contract"></i> Key Fact Statement</a>` : ''}
    </div>`;
}

const DOC_LABEL = (t) => {
  const found = ((dealRulesCache && dealRulesCache.doc_types) || []).find(x => x.type === t);
  return found ? found.label : String(t || '').replace(/_/g, ' ');
};

const DEAL_EVENT_TEXT = {
  accepted: (e) => `Offer of ${dlRupees(e.data.price)} accepted`,
  buyer_acknowledged: () => 'Buyer accepted the deal warning',
  seller_confirmed: () => 'Seller confirmed the deal',
  cancel_requested: (e) => `${e.data.by === 'seller' ? 'Seller' : 'Buyer'} asked to cancel${e.data.reason ? `: ${dlEsc(e.data.reason)}` : ''}`,
  cancel_agreed: (e) => `${e.data.by === 'seller' ? 'Seller' : 'Buyer'} agreed to cancel`,
  cancel_disagreed: (e) => `${e.data.by === 'seller' ? 'Seller' : 'Buyer'} disagreed with cancelling`,
  cancel_withdrawn: (e) => `${e.data.by === 'seller' ? 'Seller' : 'Buyer'} withdrew the cancel request`,
  cancel_request_expired: () => 'Cancel request lapsed (no answer in time)',
  force_cancelled: (e) => `${e.data.by === 'seller' ? 'Seller' : 'Buyer'} force-cancelled`,
  loan_answer: (e) => `Seller said the vehicle ${e.data.had_loan ? 'had' : 'never had'} a loan`,
  document_uploaded: (e) => `${dlEsc(DOC_LABEL(e.data.doc_type))} uploaded`,
  document_approved: (e) => `${dlEsc(DOC_LABEL(e.data.doc_type))} verified`,
  document_rejected: (e) => `${dlEsc(DOC_LABEL(e.data.doc_type))} sent back${e.data.reason ? `: ${dlEsc(e.data.reason)}` : ''}`,
  locked: (e) => (e.data && e.data.price ? `Deal locked at ${dlRupees(e.data.price)}` : 'Deal locked'),
  lender_set: (e) => (e.data && e.data.lender ? `Lender ${e.data.previous ? 'changed' : 'set'} by DealBriz: ${dlEsc(e.data.lender)}` : 'Lender cleared'),
  loan_applied: (e) => (e.data && e.data.lender ? `Buyer applied for the loan with ${dlEsc(e.data.lender)}` : 'Buyer applied for the loan'),
  loan_approved: () => 'Loan approved',
  ready_to_pay: () => 'Lender ready to pay',
  down_payment_recorded: (e) => `Down payment of ${dlRupees(e.data.amount)} recorded`,
  ready: (e) => `${e.data.role === 'seller' ? 'Seller' : 'Buyer'} ready at the handover`,
  payout_requested: () => 'Payout requested from the lender',
  paid: (e) => `Lender paid the seller (UTR ${dlEsc(e.data.utr)})`,
  money_received: () => 'Seller confirmed the money arrived',
  vehicle_received: () => 'Buyer confirmed receiving it',
  handover_code_confirmed: () => 'Seller entered the buyer’s handover code',
  handover_code_reset: () => 'Handover code changed after wrong tries',
  completed: () => 'Deal completed',
  released: (e) => `Deal released: ${dlEsc(RELEASE_REASON_LABEL[e.data.reason] || 'released')}`,
  disputed: () => 'Problem reported to support',
  dispute_resolved: (e) => `Support resolved the problem${e.data.note ? `: ${dlEsc(e.data.note)}` : ''}`,
};

/* Fewer timeline lines: within a run of document events, all the uploads
   become one line and all the verifications another ("Buyer's PAN card and
   Aadhaar card verified"), at the time of the last one. A sent-back
   document keeps its own line (with the reason) and ends the run. */
function dlMergeDocEvents(events) {
  const out = [];
  let run = null;   // { uploaded: item, approved: item }
  for (const e of events) {
    const t = e.event_type;
    if (t === 'document_uploaded' || t === 'document_approved') {
      run = run || {};
      const key = t === 'document_uploaded' ? 'uploaded' : 'approved';
      if (run[key]) {
        run[key].docs.push(e.data && e.data.doc_type);
        run[key].created_at = e.created_at;
      } else {
        run[key] = { ...e, docs: [e.data && e.data.doc_type] };
        out.push(run[key]);
      }
      continue;
    }
    run = null;
    out.push(e);
  }
  return out;
}

function dlDocListText(types) {
  const labels = types.map(t => DOC_LABEL(t));
  const m = labels.every(l => /^(\w+’s|\w+'s) /.test(l)) && labels.map(l => l.split(' ')[0]);
  let prefix = '';
  let names = labels;
  if (m && m.every(x => x === m[0])) {
    prefix = m[0] + ' ';
    names = labels.map(l => l.slice(prefix.length));
  }
  const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return prefix + joined;
}

function dealTimelineHtml(d, { staff = false } = {}) {
  const events = dlMergeDocEvents((d.events || []).filter(e => staff || DEAL_EVENT_TEXT[e.event_type]));
  if (!events.length) return '';
  return `
    <div class="deal-section">
      <h4>Timeline</h4>
      <ol class="deal-timeline">
        ${events.map(e => `
          <li><span>${e.docs && e.docs.length > 1
            ? `${dlEsc(dlDocListText(e.docs))} ${e.event_type === 'document_uploaded' ? 'uploaded' : 'verified'}`
            : (DEAL_EVENT_TEXT[e.event_type] || (() => dlEsc(e.event_type.replace(/_/g, ' '))))(e)}</span>
              <time>${dlEsc(dlWhen(e.created_at))}</time></li>`).join('')}
      </ol>
    </div>`;
}

function dealFooterHtml(d) {
  const panel = dealModalState && dealModalState.panel;
  const role = d.my_role;
  const other = role === 'seller' ? 'buyer' : 'seller';
  const bits = [];
  const rules = dealRulesCache || { cancel_limit: 3, ban_days: 7, cancel_request_hours: 24 };

  if (panel === 'cancel') {
    let title, warn, button;
    if (d.status === 'awaiting_seller' && role === 'seller') {
      title = 'Decline this deal?';
      button = 'Decline deal';
      warn = `<p class="deal-small">The buyer is told and the listing stays on sale. Declining before you confirm doesn’t count against you.</p>`;
    } else if (d.status === 'awaiting_seller') {
      title = 'Withdraw from this deal?';
      button = 'Withdraw';
      warn = `<p class="deal-small">The seller hasn’t confirmed yet, so this doesn’t count against you.</p>`;
    } else {
      title = 'Ask to cancel this deal?';
      button = 'Send cancel request';
      warn = `<p class="deal-small">The ${other} is asked to agree. If they agree, the deal is cancelled and nobody is penalised. They have ${rules.cancel_request_hours || 24} hours to answer. While you wait, you can also force-cancel, which counts against you.</p>`;
    }
    return `
      <div class="deal-confirm">
        <h4>${title}</h4>
        ${warn}
        <textarea id="dealCancelReason" rows="2" maxlength="255" placeholder="Reason (optional, the other side sees it)"></textarea>
        <div class="deal-confirm-actions">
          <button class="deal-btn" onclick="dealSetPanel(null)">Keep the deal</button>
          <button class="deal-btn deal-btn-danger" onclick="dealConfirmCancel()">${button}</button>
        </div>
      </div>`;
  }
  if (panel === 'force') {
    return `
      <div class="deal-confirm deal-force">
        <h4>Force cancel this deal?</h4>
        <p class="deal-warn"><i class="fas fa-triangle-exclamation"></i><span>This ends the deal now, without the ${other}’s agreement, and <strong>counts against you</strong>. Force-cancel ${rules.cancel_limit} deals in a row and you can’t post listings or make deals for ${rules.ban_days} days. Finishing a deal resets the count.<br><span lang="hi">इससे डील अभी ख़त्म हो जाएगी, ${other === 'seller' ? 'विक्रेता' : 'खरीदार'} की सहमति के बिना, और यह <strong>आपके ख़िलाफ़ गिना जाएगा</strong>। लगातार ${rules.cancel_limit} डील फ़ोर्स कैंसल करने पर आप ${rules.ban_days} दिन तक न लिस्टिंग डाल पाएँगे, न डील कर पाएँगे।</span></span></p>
        ${role === 'buyer' ? '<p class="deal-small">The listing goes back on sale and your loan application is withdrawn.</p>' : '<p class="deal-small">The listing goes back on sale.</p>'}
        <label class="deal-warn-check">
          <input type="checkbox" id="dealForceCheck" onchange="document.getElementById('dealForceGo').disabled = !this.checked">
          <span>I understand this counts against me.<br><span lang="hi">मैं समझता/समझती हूँ कि यह मेरे ख़िलाफ़ गिना जाएगा।</span></span>
        </label>
        <div class="deal-confirm-actions">
          <button class="deal-btn" onclick="dealSetPanel(null)">Keep the deal</button>
          <button id="dealForceGo" class="deal-btn deal-btn-danger" disabled onclick="dealForceCancel()">Force cancel</button>
        </div>
      </div>`;
  }
  if (panel === 'dispute') {
    return `
      <div class="deal-confirm">
        <h4>Report a problem</h4>
        <p class="deal-small">DealBriz support will contact both of you. The lender has already paid, so the deal can't simply be cancelled.</p>
        <textarea id="dealDisputeReason" rows="3" maxlength="255" placeholder="What went wrong?"></textarea>
        <div class="deal-confirm-actions">
          <button class="deal-btn" onclick="dealSetPanel(null)">Back</button>
          <button class="deal-btn deal-btn-danger" onclick="dealConfirmDispute()">Send to support</button>
        </div>
      </div>`;
  }

  // An open cancel request, from either side.
  let request = '';
  const cr = d.cancel_request;
  if (cr && d.can_answer_cancel) {
    request = `
      <div class="deal-cancel-req is-theirs">
        <div class="deal-cancel-req-head"><i class="fas fa-circle-question"></i> The ${dlEsc(cr.by_role)} asked to cancel this deal</div>
        ${cr.reason ? `<p class="deal-small">Reason: “${dlEsc(cr.reason)}”</p>` : ''}
        <p class="deal-small">Agree and the deal is cancelled, with no penalty for anyone. Disagree and it carries on. Answer by <strong>${dlEsc(dlWhen(cr.expires_at))}</strong>.</p>
        <div class="deal-confirm-actions">
          <button class="deal-btn" onclick="dealAnswerCancel(false)">Disagree</button>
          <button class="deal-btn deal-btn-danger" onclick="dealAnswerCancel(true)">Agree to cancel</button>
        </div>
      </div>`;
  } else if (cr && d.can_withdraw_cancel) {
    request = `
      <div class="deal-cancel-req is-mine">
        <div class="deal-cancel-req-head"><i class="fas fa-hourglass-half"></i> You asked to cancel this deal</div>
        <p class="deal-small">Waiting for the ${other} to agree, until <strong>${dlEsc(dlWhen(cr.expires_at))}</strong>. If they agree, nobody is penalised.</p>
        <div class="deal-confirm-actions">
          <button class="deal-btn" onclick="dealWithdrawCancel()">Withdraw request</button>
          <button class="deal-btn deal-btn-quiet-danger" onclick="dealSetPanel('force')">Force cancel</button>
        </div>
      </div>`;
  }

  bits.push(`<button class="deal-btn" onclick="dealOpenChat()"><i class="fas fa-comment-dots"></i> Chat</button>`);
  if (d.can_cancel && !(d.status === 'awaiting_seller' && role === 'seller')) {
    bits.push(`<button class="deal-btn deal-btn-quiet-danger" onclick="dealSetPanel('cancel')">Withdraw</button>`);
  }
  if (d.can_request_cancel) {
    bits.push(`<button class="deal-btn deal-btn-quiet-danger" onclick="dealSetPanel('cancel')">Cancel deal</button>`);
  }
  if (d.status === 'paid') bits.push(`<button class="deal-btn deal-btn-quiet-danger" onclick="dealSetPanel('dispute')">Report a problem</button>`);
  return `${request}<div class="deal-footer">${bits.join('')}</div>`;
}

function dealSetPanel(panel) {
  if (!dealModalState) return;
  dealModalState.panel = panel;
  renderDealModal();
  if (panel) {
    const box = document.querySelector('#dealModal .deal-confirm');
    box?.scrollIntoView?.({ block: 'nearest' });
    box?.querySelector('textarea')?.focus();
  }
}

/* One wrapper for every deal action: run it, then redraw the sheet (and
   the chat behind it, which gets a system message for most actions).
   Returns the action's result, or null if it failed. */
async function dealAct(fn, okMessage) {
  if (!dealModalState) return null;
  const id = dealModalState.deal.id;
  let result = null;
  document.querySelectorAll('#dealModal .deal-btn').forEach(b => { b.disabled = true; });
  try {
    result = await fn(id);
    if (okMessage) showToast(okMessage, 'success');
  } catch (err) {
    showToast(err.message || 'That didn’t work. Please try again.', 'error');
  }
  await reloadDealModal(id);
  if (currentChatConversation) loadChatMessages();
  if (currentPage === 'mydeals') renderMyDeals();
  return result;
}

function dealRecordDownPayment() {
  const raw = document.getElementById('dealDownPayment').value.trim();
  const amount = raw === '' ? NaN : dlParseRupees(raw);
  if (isNaN(amount)) { showToast('Enter the down payment in rupees (0 if none).', 'error'); return; }
  dealAct(id => dealsApi.handover(id, 'down-payment', { amount }), 'Down payment recorded.');
}

async function dealReady() {
  if (!(await dlAsk({ title: 'Mark yourself ready?', body: '<p>Only do this once the lender’s forms are signed at the handover meeting. When both sides are ready, the lender pays the seller.</p>', ok: 'I’m ready', cancel: 'Not yet' }))) return;
  dealAct(id => dealsApi.handover(id, 'ready'), 'Marked ready.');
}

async function dealMoneyReceived() {
  if (!(await dlAsk({ tone: 'warn', title: 'Has the money arrived?', body: '<p>Check your bank account first. Confirm only when the lender’s payment is in your account.</p>', ok: 'Yes, it has arrived', cancel: 'Not yet' }))) return;
  dealAct(id => dealsApi.handover(id, 'money-received'), 'Confirmed.');
}

async function dealVehicleReceived() {
  const d = dealModalState && dealModalState.deal;
  const what = isVehicle(d) ? 'the vehicle, keys, original RC and signed forms' : 'the item';
  if (!(await dlAsk({ tone: 'warn', title: isVehicle(d) ? 'Vehicle received?' : 'Item received?', body: `<p>Confirm only once you have ${what}. This completes the deal.</p>`, ok: 'Yes, complete the deal', cancel: 'Not yet' }))) return;
  dealAct(id => dealsApi.handover(id, 'vehicle-received'), 'Deal completed.');
}

async function dealEnterHandoverCode() {
  const el = document.getElementById('dealHandoverCode');
  const code = (el?.value || '').replace(/\D/g, '');
  if (code.length !== 6) { showToast('Enter the buyer’s 6-digit code.', 'error'); return; }
  if (!(await dlAsk({ tone: 'warn', title: 'Complete the deal?', body: '<p>Only do this once the money is in your bank account and you have handed everything over to the buyer.</p>', ok: 'Complete the deal', cancel: 'Not yet' }))) return;
  dealAct(id => dealsApi.handover(id, 'code', { code }), 'Deal completed.');
}

async function dealConfirmCancel() {
  const reason = (document.getElementById('dealCancelReason')?.value || '').trim();
  const d = dealModalState && dealModalState.deal;
  if (!d) return;
  const ok = d.status === 'awaiting_seller'
    ? (d.my_role === 'seller' ? 'Deal declined.' : 'You withdrew from the deal.')
    : 'Cancel request sent. You’ll be told when they answer.';
  await dealAct(id => dealsApi.cancel(id, reason), ok);
}

async function dealWithdrawCancel() {
  await dealAct(id => dealsApi.cancelWithdraw(id), 'Cancel request withdrawn.');
}

async function dealAnswerCancel(agree) {
  if (agree && !(await dlAsk({ tone: 'warn', title: 'Agree to cancel the deal?', body: '<p>The deal ends and the listing goes back on sale. Nobody is penalised.</p>', ok: 'Agree to cancel', cancel: 'Go back' }))) return;
  await dealAct(id => dealsApi.cancelAnswer(id, agree),
    agree ? 'Deal cancelled. Nobody is penalised.' : 'You disagreed. The deal carries on.');
}

async function dealForceCancel() {
  if (!document.getElementById('dealForceCheck')?.checked) return;
  const res = await dealAct(id => dealsApi.cancelForce(id), 'Deal force-cancelled.');
  if (!res) return;
  const banDays = (dealRulesCache || {}).ban_days || 7;
  let notice = '';
  if (res.deal_ban_until) {
    const until = dlWhen(res.deal_ban_until);
    notice = `You force-cancelled ${res.cancel_limit} deals in a row, so new listings and deals are paused until ${until}. Deals you already have carry on.`;
    showToast(`Paused until ${until}.`, 'error');
    if (currentUser) currentUser.dealBanUntil = res.deal_ban_until;
  } else if (res.counted && res.consecutive_cancels >= 1) {
    const left = res.cancel_limit - res.consecutive_cancels;
    notice = `That is ${res.consecutive_cancels} force-cancelled deal${res.consecutive_cancels === 1 ? '' : 's'} in a row. `
      + (left === 1 ? `One more and new listings and deals are paused for ${banDays} days.`
                    : `After ${res.cancel_limit}, new listings and deals are paused for ${banDays} days.`)
      + ' Finishing a deal resets the count.';
  }
  if (notice && dealModalState && dealModalState.deal.id === res.id) {
    dealModalState.notice = notice;
    renderDealModal();
  }
}

function dealConfirmDispute() {
  const reason = (document.getElementById('dealDisputeReason')?.value || '').trim();
  if (!reason) { showToast('Please say what went wrong.', 'error'); return; }
  dealAct(id => dealsApi.dispute(id, reason), 'Sent to DealBriz support.');
}

/* From the deal sheet back to the conversation it belongs to. If the chat
   is already open underneath, just close the sheet. */
async function dealOpenChat() {
  const d = dealModalState && dealModalState.deal;
  if (!d) return;
  const otherId = d.my_role === 'seller' ? d.buyer_id : d.seller_id;
  const chatOpen = currentChatConversation && currentChatConversation.listingId === d.product_id
    && currentChatConversation.sellerId === otherId;
  await dlCloseModalThen('deal');
  if (!chatOpen) openConversation(d.product_id, otherId);
}

/* The listing page's "View deal" for its seller. */
async function openDealForProduct(productId) {
  try {
    const deals = await dealsApi.mine('live');
    const d = deals.find(x => x.product_id === productId);
    if (d) { openDeal(d.id); return; }
  } catch { /* fall through */ }
  showToast('No active deal on this listing.', 'info');
}

/* =====================================================
   LOAN FORM (buyer, locked deal)
   ===================================================== */
let loanFormExisting = [];
let loanFormLenders = [];

async function openLoanForm() {
  const d = dealModalState && dealModalState.deal;
  if (!d) return;
  document.getElementById('dealLoanDone').classList.add('hidden');
  document.getElementById('dealLoanFormArea').classList.remove('hidden');
  // The lenders the buyer may choose (active, funding this loan type,
  // serving the area). Loaded fresh each time the form opens.
  const lenderSel = document.getElementById('dealLoanLender');
  loanFormLenders = [];
  lenderSel.innerHTML = '<option value="">Loading lenders...</option>';
  lenderSel.disabled = true;
  dlLoanLenderHint('');
  const lendersLoad = dealsApi.loanLenders(d.id).then(res => {
    loanFormLenders = (res && res.lenders) || [];
    dlLoanLendersRender();
  }).catch(err => {
    lenderSel.innerHTML = '<option value="">Could not load lenders</option>';
    dlLoanLenderHint(err.message || 'Could not load the lenders. Close this and try again.', true);
  });
  document.getElementById('dealLoanPrice').textContent = dlRupees(d.agreed_price);
  document.getElementById('dealLoanDown').value = '';
  document.getElementById('dealLoanName').value = [currentUser?.name, currentUser?.lastName].filter(Boolean).join(' ');
  document.getElementById('dealLoanPhone').value = currentUser?.phone || '';
  document.getElementById('dealLoanIncome').value = '';
  document.getElementById('dealLoanError').classList.add('hidden');
  const typeEl = document.getElementById('dealLoanType');
  if (typeEl) typeEl.innerHTML = loanTypeTag(d.loan_type);
  calcDealLoan();

  // An EMI application already sent for this listing can be linked instead
  // of filling the form again.
  const existingBox = document.getElementById('dealLoanExisting');
  existingBox.innerHTML = '';
  loanFormExisting = [];
  try {
    const apps = await db.getMyEmiApplications();
    loanFormExisting = (apps || []).filter(a => a.product_id === d.product_id && !a.deal_id
      && ['pending', 'review', 'approved'].includes(a.status) && Number(a.loan_amount) <= Number(d.agreed_price));
  } catch { /* the form still works without it */ }
  if (loanFormExisting.length) {
    existingBox.innerHTML = `
      <div class="deal-existing">
        <p>You already applied for EMI on this listing.</p>
        ${loanFormExisting.map(a => `
          <button class="deal-btn deal-btn-wide" onclick="submitDealLoan('${dlEsc(a.id)}')">
            Use that application: ${dlRupees(a.loan_amount)} over ${a.tenure_months} months
          </button>`).join('')}
        <div class="deal-or"><span>or apply again below</span></div>
      </div>`;
  }
  await lendersLoad;
  dlOpenOverlay('dealLoanModal', 'dealLoan');
}

function dlLoanLenderHint(text, isError = false) {
  const el = document.getElementById('dealLoanLenderHint');
  if (!el) return;
  el.textContent = text || 'Your application and verified documents are sent only to the lender you choose.';
  el.classList.toggle('is-error', !!isError);
}

function dlLoanLendersRender() {
  const sel = document.getElementById('dealLoanLender');
  if (!sel) return;
  if (!loanFormLenders.length) {
    sel.innerHTML = '<option value="">No lender available yet</option>';
    sel.disabled = true;
    dlLoanLenderHint('No lending partner is available for this loan yet. Please contact DealBriz support.', true);
    return;
  }
  sel.innerHTML = '<option value="">Select a lender</option>' + loanFormLenders.map(f =>
    `<option value="${dlEsc(f.financer_id)}">${dlEsc(f.name)}</option>`).join('');
  // With only one lender there is nothing to choose between.
  if (loanFormLenders.length === 1) sel.value = String(loanFormLenders[0].financer_id);
  sel.disabled = false;
  dlLoanLenderHint('');
}

function dlLoanLenderChanged() {
  const sel = document.getElementById('dealLoanLender');
  if (sel && sel.value) {
    sel.classList.remove('is-invalid');
    document.getElementById('dealLoanError')?.classList.add('hidden');
  }
}

/* The chosen lender's id, or null (with the form showing why). */
function dlLoanChosenLender() {
  const sel = document.getElementById('dealLoanLender');
  const errEl = document.getElementById('dealLoanError');
  const v = sel ? sel.value : '';
  const chosen = loanFormLenders.find(f => String(f.financer_id) === String(v));
  if (chosen) return chosen.financer_id;
  errEl.textContent = loanFormLenders.length
    ? 'Choose your lender first.'
    : 'No lending partner is available for this loan yet. Please contact DealBriz support.';
  errEl.classList.remove('hidden');
  if (sel && loanFormLenders.length) { sel.classList.add('is-invalid'); sel.focus(); }
  return null;
}

function closeLoanForm() { closeTopModal('dealLoan'); }

/* What the buyer sees once the application is sent. */
function dlLoanDoneHtml(app, d) {
  const lender = app.lender || (d && d.lender) || '';
  const who = lender ? dlEsc(lender) : 'the lending partner';
  const title = dlEsc((d && d.product && d.product.title) || 'this item');
  const phone = app.applicant_phone ? dlEsc(app.applicant_phone) : 'the phone number in your application';
  const until = (app.deal && app.deal.reserved_until) || (d && d.reserved_until);
  const ref = (app.id || '').slice(0, 8).toUpperCase();
  const row = (k, v) => `<div class="deal-loan-done-row"><span>${k}</span><strong>${v}</strong></div>`;
  return `
    <div class="deal-loan-done">
      <div class="deal-loan-done-icon"><i class="fas fa-circle-check"></i></div>
      <h3>Application submitted</h3>
      <p class="deal-loan-done-lead">Your loan application for <strong>${title}</strong> has been submitted to <strong>${who}</strong>${lender ? '' : ', which DealBriz assigns to your deal'}.</p>
      <div class="deal-loan-done-card">
        ${ref ? row('Application reference', dlEsc(ref)) : ''}
        ${row('Loan amount requested', dlRupees(app.loan_amount))}
        ${app.down_payment != null ? row('Down payment', dlRupees(app.down_payment)) : ''}
        ${app.monthly_emi != null ? row('Estimated EMI', `${dlRupees(dlEmi(Number(app.loan_amount), Number(app.tenure_months), dlLoanRates().lo))} – ${dlRupees(app.monthly_emi)} × ${dlEsc(app.tenure_months)} months`) : ''}
      </div>
      <div class="deal-ask-sub">What happens next</div>
      <ol class="deal-ask-steps">
        <li>${lender ? who : 'The lending partner'} reviews your application together with the verified documents.</li>
        <li>A representative from ${who} will contact you on <strong>${phone}</strong> to complete your application. They may ask for further details to finish their checks.</li>
        <li>Once your loan is sanctioned, ${who} confirms the final interest rate and EMI in its Key Fact Statement. Please read it carefully before you sign.</li>
        <li>You and the seller then meet for the handover, and ${who} pays the seller directly.</li>
      </ol>
      <p class="deal-ask-note"><i class="fas fa-circle-info"></i> ${until ? `The listing stays reserved for you until <strong>${dlEsc(dlWhen(until))}</strong>. ` : ''}You can follow your application under <strong>My Deals</strong>. Never pay anyone who offers to speed up your loan approval.</p>
      <button class="btn-primary full-width" onclick="closeLoanForm()">Done</button>
    </div>`;
}

function dealLoanNumbers() {
  const d = dealModalState && dealModalState.deal;
  const price = d ? Number(d.agreed_price) : 0;
  const downRaw = document.getElementById('dealLoanDown').value.trim();
  const down = downRaw ? dlParseRupees(downRaw) : 0;
  const tenure = parseInt(document.getElementById('dealLoanTenure').value, 10);
  const loan = Math.max(0, price - (isNaN(down) ? 0 : down));
  const { lo, hi } = dlLoanRates();
  const emiLow = dlEmi(loan, tenure, lo);
  const emi = dlEmi(loan, tenure, hi);   // stored estimate: the top of the range
  return { price, down, tenure, rate: hi, loan, emi, emiLow };
}

/* The DealLock loan rate is fixed (a range), not chosen by the buyer. */
function dlLoanRates() {
  const r = dealRulesCache || {};
  return { lo: r.loan_rate_min || 10, hi: r.loan_rate_max || 16 };
}
function dlEmi(loan, tenure, rate) {
  const mr = rate / 12 / 100;
  if (!loan || !tenure) return 0;
  return mr > 0 ? loan * mr * Math.pow(1 + mr, tenure) / (Math.pow(1 + mr, tenure) - 1) : loan / tenure;
}
function dlRateRangeText() { const { lo, hi } = dlLoanRates(); return `${lo}–${hi}% p.a.`; }

function calcDealLoan() {
  const n = dealLoanNumbers();
  document.getElementById('dealLoanAmount').textContent = dlRupees(n.loan);
  document.getElementById('dealLoanEmi').textContent = `${dlRupees(n.emiLow)} – ${dlRupees(n.emi)}`;
  document.getElementById('dealLoanTotal').textContent = `${dlRupees(n.emiLow * n.tenure)} – ${dlRupees(n.emi * n.tenure)}`;
  const rateEl = document.getElementById('dealLoanRate');
  if (rateEl) rateEl.textContent = dlRateRangeText();
}

async function submitDealLoan(existingId = null) {
  const d = dealModalState && dealModalState.deal;
  const errEl = document.getElementById('dealLoanError');
  if (!d) return;
  const financerId = dlLoanChosenLender();
  if (!financerId) return;
  let body;
  if (existingId) {
    body = { deal_id: d.id, financer_id: financerId, emi_application_id: existingId };
  } else {
    const n = dealLoanNumbers();
    const name = document.getElementById('dealLoanName').value.trim();
    const phone = document.getElementById('dealLoanPhone').value.trim();
    const income = dlParseRupees(document.getElementById('dealLoanIncome').value);
    if (isNaN(n.down) || n.down < 0 || n.down >= n.price) {
      errEl.textContent = 'The down payment must be less than the agreed price.';
      errEl.classList.remove('hidden'); return;
    }
    if (!name || !phone || !income) {
      errEl.textContent = 'Please fill in your name, phone and monthly income.';
      errEl.classList.remove('hidden'); return;
    }
    body = {
      deal_id: d.id, financer_id: financerId, down_payment: n.down, tenure_months: n.tenure, interest_rate: n.rate,
      loan_amount: Math.round(n.loan), monthly_emi: Math.round(n.emi),
      total_payable: Math.round(n.emi * n.tenure),
      applicant_name: name, applicant_phone: phone, applicant_income: income,
    };
  }
  errEl.classList.add('hidden');
  const btns = document.querySelectorAll('#dealLoanModal button');
  btns.forEach(b => { b.disabled = true; });
  try {
    const res = await dealsApi.applyLoan(body);
    // The confirmation replaces the form; the deal sheet underneath updates.
    document.getElementById('dealLoanFormArea').classList.add('hidden');
    const done = document.getElementById('dealLoanDone');
    done.innerHTML = dlLoanDoneHtml(res, d);
    done.classList.remove('hidden');
    document.querySelector('#dealLoanModal .modal-box')?.scrollTo?.({ top: 0 });
    await reloadDealModal(d.id);
    if (currentChatConversation) loadChatMessages();
  } catch (err) {
    errEl.textContent = err.message || 'Could not send the application.';
    errEl.classList.remove('hidden');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

/* =====================================================
   MY DEALS page
   ===================================================== */
let myDealsTab = 'live';

function setMyDealsTab(tab) {
  myDealsTab = tab;
  renderMyDeals();
}

async function renderMyDeals() {
  const el = document.getElementById('myDealsContent');
  if (!el || !currentUser) return;
  document.querySelectorAll('#mydealsPage .deal-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === myDealsTab));
  el.innerHTML = `<div class="deal-loading"><i class="fas fa-spinner fa-spin"></i> Loading deals...</div>`;
  let deals = [];
  try { deals = await dealsApi.mine(myDealsTab); }
  catch (err) {
    el.innerHTML = `<div class="deal-loading">${dlEsc(err.message || 'Could not load deals.')}</div>`;
    return;
  }
  const banner = currentUser.dealBanUntil && new Date(currentUser.dealBanUntil) > new Date()
    ? `<div class="deal-ban-banner"><i class="fas fa-ban"></i> <span>New listings and deals are paused until ${dlEsc(dlWhen(currentUser.dealBanUntil))} (<strong data-countdown="${dlEsc(currentUser.dealBanUntil)}">${dlEsc(dlTimeLeft(currentUser.dealBanUntil))}</strong>), ${currentUser.dealBanReason ? `by DealBriz. Reason: ${dlEsc(currentUser.dealBanReason)}.` : `because ${((dealRulesCache || {}).cancel_limit) || 3} deals were force-cancelled in a row.`} Your current deals carry on as normal.</span></div>`
    : '';
  if (!deals.length) {
    el.innerHTML = banner + (myDealsTab === 'live'
      ? `<div class="empty-state"><i class="fas fa-handshake"></i><h3>No active deals</h3><p>When an offer is accepted in chat, the deal shows up here.</p><button class="btn-primary" onclick="showPage('mychats')">Go to My Chats</button></div>`
      : `<div class="empty-state"><i class="fas fa-box-archive"></i><h3>No past deals</h3></div>`);
    return;
  }
  el.innerHTML = banner + deals.map(d => {
    const p = d.product || {};
    const other = d.other_user || {};
    let sub = `${d.my_role === 'seller' ? 'Buyer' : 'Seller'}: ${dlEsc(other.name || '—')}`;
    if (d.status === 'awaiting_seller') {
      if (d.can_confirm) sub += ` · <strong class="deal-attn">confirm by ${dlEsc(dlWhen(d.confirm_by))}</strong>`;
      else if (d.can_acknowledge) sub += ` · <strong class="deal-attn">accept the deal warning by ${dlEsc(dlWhen(d.confirm_by))}</strong>`;
      else if (d.waiting_for_buyer_ack) sub += ` · buyer accepts the warning by ${dlEsc(dlWhen(d.confirm_by))}`;
      else sub += ` · seller confirms by ${dlEsc(dlWhen(d.confirm_by))}`;
    } else if (d.status === 'docs_pending') sub += ` · documents due by ${dlEsc(dlDay(d.reserved_until))}`;
    else if (['locked', 'loan_in_progress'].includes(d.status)) sub += ` · reserved till ${dlEsc(dlDay(d.reserved_until))}`;
    if (d.cancel_request) sub += d.can_answer_cancel ? ` · <strong class="deal-attn">cancel requested: answer it</strong>` : ` · you asked to cancel`;
    return `
      <button class="deal-list-item" onclick="${d.can_confirm ? 'openDealAndConfirm' : 'openDeal'}('${dlEsc(d.id)}')">
        <div class="deal-list-img"><i class="fas ${isVehicle(d) ? 'fa-car' : 'fa-box'}"></i>${p.image_url ? `<img src="${dlEsc(toAbsoluteUrl(p.image_url))}" alt="" onerror="this.remove()">` : ''}</div>
        <div class="deal-list-info">
          <div class="deal-list-title">${dlEsc(p.title || 'Listing')}</div>
          <div class="deal-list-sub">${sub}</div>
          <div class="deal-list-price">${dlRupees(d.agreed_price)} ${loanTypeTag(d.loan_type)}</div>
        </div>
        ${dealPill(d.status)}
      </button>`;
  }).join('');
}

/* =====================================================
   DOCUMENT REVIEW (admin deal detail and the lender portal)
   ===================================================== */
function dlDocsReviewHtml(d, ctx) {
  const all = d.documents || [];
  if (!all.length) {
    if (d.status === 'docs_pending') return `<p class="deal-small">Nothing uploaded yet.</p>`;
    return '';
  }
  const canReview = !!d.can_review_docs;
  const canView = !!d.can_view_doc_files;
  const pid = (d.product || {}).id || d.product_id || '';
  const group = (party, docs) => !docs.length ? '' : `
    <div class="deal-doc-group-head">${party === 'buyer' ? 'Buyer’s documents' : 'Seller’s documents (on the listing)'}
      <small>${(d.docs_uploaded || {})[party] ? 'all uploaded' : 'not all uploaded yet'}</small></div>
    <ul class="deal-doc-list deal-doc-review">
      ${docs.map(item => {
        const doc = item.document;
        const st = item.status;
        const onListing = item.source === 'listing';
        let actions = '';
        if (doc && !doc.file_deleted && canView) {
          actions += onListing
            ? `<button class="btn-sm" onclick="ldViewDoc('${dlEsc(pid)}','${dlEsc(doc.id)}')"><i class="fas fa-eye"></i> View</button>`
            : `<button class="btn-sm" onclick="dlViewDoc('${dlEsc(d.id)}','${dlEsc(doc.id)}')"><i class="fas fa-eye"></i> View</button>`;
        }
        if (canReview && doc && st === 'uploaded') {
          actions += onListing
            ? ` <button class="btn-sm btn-sm-blue" onclick="dlReviewListingDoc('${dlEsc(d.id)}','${dlEsc(pid)}','${dlEsc(doc.id)}','approve','${ctx}')">Approve</button>
                <button class="btn-sm btn-sm-red" onclick="dlReviewListingDoc('${dlEsc(d.id)}','${dlEsc(pid)}','${dlEsc(doc.id)}','reject','${ctx}')">Reject</button>`
            : ` <button class="btn-sm btn-sm-blue" onclick="dlReviewDoc('${dlEsc(d.id)}','${dlEsc(doc.id)}','approve','${ctx}')">Approve</button>
                <button class="btn-sm btn-sm-red" onclick="dlReviewDoc('${dlEsc(d.id)}','${dlEsc(doc.id)}','reject','${ctx}')">Reject</button>`;
        }
        return `
          <li class="deal-doc">
            <div class="deal-doc-main">
              <div class="deal-doc-name">${dlEsc(item.label)}${item.required ? '' : ' <small>(not needed now)</small>'}</div>
              ${doc ? `<div class="deal-doc-hint">${dlEsc(doc.file_name || '')} · ${dlEsc(dlWhen(doc.uploaded_at))}${doc.file_deleted ? ' · file deleted after the deal closed' : ''}</div>` : ''}
              ${st === 'rejected' && doc && doc.reject_reason ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(doc.reject_reason)}</div>` : ''}
            </div>
            <div class="deal-doc-side"><span class="deal-doc-status deal-doc-${dlEsc(st)}">${dlEsc(DOC_STATUS_LABEL[st] || st)}</span>
              <div class="deal-doc-actions">${actions}</div></div>
          </li>`;
      }).join('')}
    </ul>`;
  return `
    ${group('seller', all.filter(x => x.party === 'seller'))}
    ${group('buyer', all.filter(x => x.party === 'buyer'))}
    ${canReview ? '<p class="deal-small">Check each file: the RC is for this vehicle and in the seller’s name, the insurance is valid, the buyer’s PAN and Aadhaar card are the buyer’s own and the names match. The seller’s documents belong to the listing and are checked once for every deal on it. When the listing’s documents and the buyer’s are all verified, the deal locks.</p>'
      : (canView ? '' : '<p class="deal-small"><i class="fas fa-lock"></i> Only a superadmin or the deal’s lender can open and verify these files.</p>')}`;
}

/* A seller document seen from a deal: it lives on the listing. */
async function dlReviewListingDoc(dealId, pid, docId, decision, ctx) {
  let reason = '';
  if (decision === 'reject') {
    reason = (prompt('What is wrong with it? The seller sees this and uploads it again on the listing.') || '').trim();
    if (!reason) return;
  }
  try {
    await listingDocsApi.review(pid, docId, decision, reason);
    const d = await dealsApi.get(dealId).catch(() => null);
    showToast(d && d.status === 'locked' ? 'All documents verified. The deal is locked.' : (decision === 'approve' ? 'Verified.' : 'Sent back to the seller.'), 'success');
  } catch (err) {
    showToast(err.message || 'That didn’t work.', 'error');
  }
  if (ctx === 'lender') { lenderRefresh(); lenderViewDeal(dealId); }
  else { renderAdminDeals(); adminViewDeal(dealId); }
}

async function dlReviewDoc(dealId, docId, decision, ctx) {
  let reason = '';
  if (decision === 'reject') {
    reason = (prompt('What is wrong with it? The person who uploaded it sees this and uploads it again.') || '').trim();
    if (!reason) return;
  }
  try {
    const d = await dealsApi.reviewDoc(dealId, docId, decision, reason);
    showToast(d.status === 'locked' ? 'All documents verified. The deal is locked.' : (decision === 'approve' ? 'Verified.' : 'Sent back to be uploaded again.'), 'success');
  } catch (err) {
    showToast(err.message || 'That didn’t work.', 'error');
  }
  if (ctx === 'lender') { lenderRefresh(); lenderViewDeal(dealId); }
  else { renderAdminDeals(); adminViewDeal(dealId); }
}

/* =====================================================
   ADMIN: Deals section and deal detail
   ===================================================== */
let adminDealsCache = [];
let adminDealsFilter = '';

async function renderAdminDeals() {
  const ldBtn = document.getElementById('adminListingDocsBtn');
  if (ldBtn) ldBtn.classList.toggle('hidden', !(currentUser && currentUser.isSuperadmin));
  if (ldQueue.open && document.getElementById('adminListingDocs') && !document.getElementById('adminListingDocs').classList.contains('hidden')) {
    ldShowQueue(ldQueue.adminState);
  }
  document.querySelectorAll('#adminSection-deals .admin-filter-btn').forEach(b =>
    b.classList.toggle('active', (b.dataset.status || '') === adminDealsFilter));
  try { adminDealsCache = await dealsApi.staffQueue(adminDealsFilter); }
  catch (err) { adminDealsCache = []; showToast(err.message || 'Could not load deals.', 'error'); }
  dlRules();
  renderAdminDealsTable();
}

function adminDealsSetFilter(status) {
  adminDealsFilter = status;
  adminResetPage('deals');
  renderAdminDeals();
}

ADMIN_TABLE_RERENDER.deals = renderAdminDealsTable;

function adminDealsSearchChanged() { adminResetPage('deals'); renderAdminDealsTable(); }

function renderAdminDealsTable() {
  const tbody = document.getElementById('adminDealsBody');
  const none = document.getElementById('adminNoDeals');
  if (!tbody) return;
  const q = document.getElementById('adminDealSearch')?.value || '';
  const filtered = adminDealsCache.filter(d => adminMatches(q,
    d.product && d.product.title, d.buyer && d.buyer.name, d.seller && d.seller.name,
    d.buyer && d.buyer.email, d.seller && d.seller.email, d.utr, d.lender));
  const rows = adminPaginate('deals', filtered);
  document.getElementById('adminDealCount').textContent = `${filtered.length} of ${adminDealsCache.length}`;
  if (!filtered.length) { tbody.innerHTML = ''; none.classList.remove('hidden'); return; }
  none.classList.add('hidden');

  tbody.innerHTML = rows.map(d => {
    const loan = d.loan;
    const attention = adminDealNeedsAction(d);
    const until = d.status === 'awaiting_seller' ? d.confirm_by : d.reserved_until;
    return `
    <tr>
      <td><div class="admin-product-cell"><img src="${dlEsc(toAbsoluteUrl(d.product?.image_url || ''))}" alt="" onerror="this.style.display='none'"><span>${dlEsc(d.product?.title || '—')}</span></div>${loanTypeTag(d.loan_type)}</td>
      <td>${dlEsc(d.buyer?.name || '—')}<br><small>${dlEsc(d.buyer?.phone || '')}</small></td>
      <td>${dlEsc(d.seller?.name || '—')}<br><small>${dlEsc(d.seller?.phone || '')}</small></td>
      <td>${dlRupees(d.agreed_price)}</td>
      <td>${loan ? `${dlEsc(LOAN_STATUS_LABEL[loan.status] || loan.status)}<br><small>${dlEsc(d.lender || 'No lender chosen')}</small>` : `<small>Not applied${d.lender ? `<br>${dlEsc(d.lender)}` : ''}</small>`}</td>
      <td>${dealPill(d.status)}${attention ? `<br><small class="deal-attn">${dlEsc(attention)}</small>` : ''}</td>
      <td><small>${dlEsc(dlWhen(until))}</small></td>
      <td><button class="btn-sm btn-sm-blue" onclick="adminViewDeal('${dlEsc(d.id)}')">Details</button></td>
    </tr>`;
  }).join('');
}

/* The one thing staff are waiting on for this deal, if any. */
function adminDealNeedsAction(d) {
  if (d.status === 'docs_pending' && d.docs_summary) {
    if (d.docs_summary.to_check > 0) return `Check ${d.docs_summary.to_check} document${d.docs_summary.to_check === 1 ? '' : 's'}`;
    return 'Waiting for documents';
  }
  if (d.status === 'loan_in_progress' && d.loan) {
    if (d.loan.status !== 'approved') return 'Review the loan';
    if (!d.lender) return 'Set the lender';
    return 'Mark Ready to pay';
  }
  if (d.status === 'ready_to_pay' && d.buyer_ready_at && d.seller_ready_at) return 'Payout needed';
  if (d.status === 'disputed') return 'Resolve dispute';
  return '';
}

function dlOpenAdminModal(html) {
  const content = document.getElementById('productModalContent');
  content.innerHTML = html;
  // Staff sheets (deal, loan, restrictions...) fill a phone or tablet screen
  // edge to edge, with square corners (deals.css #productModal.staff-sheet).
  const overlay = document.getElementById('productModal');
  overlay.classList.add('staff-sheet');
  overlay.classList.remove('pdp-modal');
  if (!modalStack.includes('product')) {
    document.getElementById('productModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    pushModal('product');
  }
  return content;
}

const DL_LOADING = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;

async function adminViewDeal(dealId) {
  const content = dlOpenAdminModal(DL_LOADING);
  let d;
  try {
    d = await dealsApi.get(dealId);
    await dlRules();
  } catch (err) {
    content.innerHTML = `<div style="text-align:center;padding:60px 20px">${dlEsc(err.message || 'Could not load this deal.')}</div>`;
    return;
  }
  // The staff row carries buyer and seller contact details; the deal itself
  // only names the people.
  const row = adminDealsCache.find(x => x.id === dealId) ||
    (await dealsApi.staffQueue(d.status).catch(() => [])).find(x => x.id === dealId) || {};
  const can = userCan('deals.manage');
  const r = (label, value) => `<div class="admin-detail-row"><span>${label}</span><strong>${value}</strong></div>`;
  const loan = d.loan;

  let action = '';
  if (d.status === 'awaiting_seller') {
    action = d.buyer_ack_at
      ? `<p class="deal-small">Waiting for the seller to confirm with ${dlConfirmWords(d)}, until ${dlEsc(fmtDateTime(d.confirm_by))}. If they don't, the deal is released automatically.</p>`
      : `<p class="deal-small">Waiting for the buyer to accept the deal warning, until ${dlEsc(fmtDateTime(d.confirm_by))}. The seller confirms after that.</p>`;
  } else if (d.status === 'docs_pending') {
    action = d.can_review_docs
      ? `<p class="deal-small">Check the documents below: the seller's (on the listing) and the buyer's. When every one is verified the deal locks, the listing is reserved and the buyer can apply for the loan.</p>`
      : `<p class="deal-small">Waiting for the seller's listing documents and the buyer's documents to be checked by a superadmin or the lender.</p>`;
  } else if (d.status === 'loan_in_progress') {
    if (!loan) {
      action = `<p class="deal-small">Waiting for the buyer to apply.</p>`;
    } else if (loan.status !== 'approved' || !(row.lender || loan.lender)) {
      action = `<p class="deal-small">Before Ready to pay: the loan must be approved. The buyer’s chosen lender does this in its portal, or approve it on the EMI application.</p>
        <button class="btn-sm btn-sm-blue" onclick="adminViewEmiApplication('${dlEsc(loan.application_id)}')">Open EMI application</button>`;
    } else if (can) {
      action = `<p class="deal-small">Confirm the lender has sanctioned the loan, the agreement and EMI auto-debit are signed${isVehicle(d) ? ", and the seller's documents and vehicle are checked" : ''}.</p>
        <textarea id="adminDealNote" rows="2" style="width:100%" placeholder="Note (optional)"></textarea>
        <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="adminDealReady('${dlEsc(d.id)}')">Mark Ready to pay</button>`;
    }
  } else if (d.status === 'ready_to_pay') {
    if (!(d.buyer_ready_at && d.seller_ready_at)) {
      action = `<p class="deal-small">Waiting for both sides to tap Ready at the handover meeting.</p>`;
    } else if (can) {
      action = `<p class="deal-small">Ask the lender to pay the seller, then enter the UTR they give for the transfer. Both sides see it.</p>
        <input id="adminDealUtr" type="text" style="width:100%" placeholder="UTR (e.g. SBIN0012345678)" autocomplete="off">
        <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="adminDealPaid('${dlEsc(d.id)}')">Mark paid</button>`;
    }
  } else if (d.status === 'disputed' && can) {
    action = `<p class="deal-small">Record how it was resolved. Money back goes through the lender, outside DealBriz.</p>
      <select id="adminDealOutcome" style="width:100%;margin-bottom:8px">
        <option value="paid">Back to Paid: the two sides will finish the handover</option>
        <option value="completed">Completed: the handover did happen</option>
      </select>
      <textarea id="adminDealResolveNote" rows="2" style="width:100%" placeholder="What was agreed"></textarea>
      <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="adminDealResolve('${dlEsc(d.id)}')">Resolve</button>`;
  }

  // The buyer chooses the lender on the loan form. Once the application was
  // emailed to that lender, staff who manage deals can move it to another
  // one (e.g. the chosen lender can't take it).
  const lenderPick = can && ['loan_in_progress', 'ready_to_pay'].includes(d.status) && d.lender_email
    ? `<div class="admin-detail-section"><h4>Change lender</h4>
        <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 8px;line-height:1.5">If ${dlEsc(d.lender || 'the buyer’s chosen lender')} can’t take this loan, move it to another active lender that funds ${dlEsc((LOAN_TYPE_LABEL[d.loan_type] || d.loan_type).toLowerCase())}s. The loan application moves with the deal, and the new lender is emailed the application and documents.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><select id="adminDealFinancer" style="flex:1;min-width:160px"><option value="">Loading...</option></select>
        <button class="btn-sm btn-sm-blue" onclick="adminDealSetFinancer('${dlEsc(d.id)}')">Save</button></div></div>`
    : '';

  dlOpenAdminModal(`
    <div class="pm-body" style="padding-top:20px">
      <div class="staff-mod-bar">
        <span><i class="fas fa-handshake"></i> DealLock deal</span>
        ${dealPill(d.status)}
      </div>
      <h2 class="pm-title" style="margin-bottom:4px">${dlEsc(d.product?.title || 'Listing')}</h2>
      <div class="pm-meta">Deal ID: ${dlEsc(d.id)} ${loanTypeTag(d.loan_type)}</div>

      ${action ? `<div class="admin-detail-section"><h4>Next step</h4>${action}</div>` : ''}

      ${(d.documents || []).length || d.status === 'docs_pending' ? `<div class="admin-detail-section"><h4>Documents</h4>${dlDocsReviewHtml(d, 'admin')}</div>` : ''}
      ${dlLenderEmailHtml(d, 'admin')}

      <div class="admin-detail-section"><h4>Deal</h4>
        ${r('Agreed price', dlRupees(d.agreed_price))}
        ${r('Offer accepted', dlEsc(fmtDateTime(d.locked_at)))}
        ${d.seller_confirmed_at ? r('Seller confirmed', dlEsc(fmtDateTime(d.seller_confirmed_at))) : ''}
        ${d.docs_approved_at ? r('Documents verified', dlEsc(fmtDateTime(d.docs_approved_at))) : ''}
        ${d.status === 'awaiting_seller' ? r('Seller must confirm by', dlEsc(fmtDateTime(d.confirm_by))) : r('Reserved until', dlEsc(fmtDateTime(d.reserved_until)))}
        ${r('Buyer accepted the warning', d.buyer_ack_at ? dlEsc(fmtDateTime(d.buyer_ack_at)) : 'Not yet')}
        ${r('Seller accepted the warning', d.seller_ack_at ? dlEsc(fmtDateTime(d.seller_ack_at)) : 'Not yet')}
        ${d.cancel_request ? r('Cancel requested', `by the ${dlEsc(d.cancel_request.by_role)}, answer due ${dlEsc(fmtDateTime(d.cancel_request.expires_at))}${d.cancel_request.reason ? `<br><small>${dlEsc(d.cancel_request.reason)}</small>` : ''}`) : ''}
        ${r('Lender', d.lender ? dlEsc(d.lender) : 'Not chosen yet (the buyer chooses it when applying for the loan)')}
        ${d.utr ? r('UTR', dlEsc(d.utr)) : ''}
        ${d.release_reason ? r('Released because', dlEsc(RELEASE_REASON_LABEL[d.release_reason] || d.release_reason)) : ''}
        ${d.release_note ? r('Release note', dlEsc(d.release_note)) : ''}
      </div>

      <div class="admin-detail-section"><h4>People</h4>
        ${row.buyer ? r('Buyer', `${dlEsc(row.buyer.name)}<br><small>${dlEsc(row.buyer.email)} · ${dlEsc(row.buyer.phone || '')}</small>`) : (d.buyer ? r('Buyer', dlEsc(d.buyer.name)) : '')}
        ${row.seller ? r('Seller', `${dlEsc(row.seller.name)}<br><small>${dlEsc(row.seller.email)} · ${dlEsc(row.seller.phone || '')}</small>`) : (d.seller ? r('Seller', dlEsc(d.seller.name)) : '')}
      </div>

      ${loan ? `<div class="admin-detail-section"><h4>Loan</h4>
        ${r('Status', dlEsc(LOAN_STATUS_LABEL[loan.status] || loan.status))}
        ${r('Lender', dlEsc(loan.lender || row.lender || 'Not set'))}
        ${loan.loan_amount != null ? r('Loan amount', dlRupees(loan.loan_amount)) : ''}
        ${loan.down_payment != null ? r('Down payment (planned)', dlRupees(loan.down_payment)) : ''}
        ${loan.nbfc_application_reference ? r('Lender reference', dlEsc(loan.nbfc_application_reference)) : ''}
        ${loan.kfs_url ? r('KFS', `<a href="${dlEsc(loan.kfs_url)}" target="_blank" rel="noopener noreferrer">Open</a>`) : ''}
        <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="adminViewEmiApplication('${dlEsc(loan.application_id)}')">Open EMI application</button>
      </div>` : ''}
      ${lenderPick}

      ${['ready_to_pay', 'paid', 'disputed', 'completed'].includes(d.status) ? `<div class="admin-detail-section"><h4>Handover</h4>
        ${r('Down payment', d.down_payment_at ? dlRupees(d.down_payment) : 'Not recorded')}
        ${r('Buyer ready', d.buyer_ready_at ? dlEsc(fmtDateTime(d.buyer_ready_at)) : 'No')}
        ${r('Seller ready', d.seller_ready_at ? dlEsc(fmtDateTime(d.seller_ready_at)) : 'No')}
        ${r('Money received', d.money_received_at ? dlEsc(fmtDateTime(d.money_received_at)) : 'No')}
        ${r(isVehicle(d) ? 'Vehicle received' : 'Item received', d.vehicle_received_at ? dlEsc(fmtDateTime(d.vehicle_received_at)) : 'No')}
      </div>` : ''}

      <div class="admin-detail-section">${dealTimelineHtml(d, { staff: true }).replace('class="deal-section"', 'class="deal-section deal-section-flat"')}</div>
    </div>`);

  if (lenderPick) {
    const sel = document.getElementById('adminDealFinancer');
    try {
      const fits = (await db.adminGetFinancers() || []).filter(f => (f.status || 'active') === 'active'
        && (f.loan_types || []).includes(d.loan_type));
      if (sel) sel.innerHTML = (d.financer_id ? '' : '<option value="">Choose a lender</option>') + fits.map(f =>
        `<option value="${f.financer_id}" ${d.financer_id === f.financer_id ? 'selected' : ''}>${dlEsc(f.name)}</option>`).join('');
    } catch {
      if (sel) sel.innerHTML = '<option value="">Could not load lenders</option>';
    }
  }
}

async function adminDealSetFinancer(dealId) {
  const v = document.getElementById('adminDealFinancer')?.value || '';
  if (!v) { showToast('Choose a lender.', 'error'); return; }
  const name = document.getElementById('adminDealFinancer').selectedOptions[0]?.textContent || 'this lender';
  if (!(await dlAsk({ title: `Change the lender to ${name}?`, body: '<p>The deal and its loan application move to this lender. If the loan has been applied for, the new lender is emailed the application and documents.</p>', ok: 'Change lender' }))) return;
  adminDealRun(dealId, () => apiFetch(`/deals/staff/${encodeURIComponent(dealId)}/financer`, { method: 'POST', body: { financer_id: Number(v) } }), 'Lender changed.');
}

async function adminDealRun(dealId, fn, ok) {
  try {
    await fn();
    showToast(ok, 'success');
  } catch (err) {
    showToast(err.message || 'That didn’t work.', 'error');
  }
  await renderAdminDeals();
  adminViewDeal(dealId);
}

async function adminDealReady(dealId) {
  const note = document.getElementById('adminDealNote')?.value.trim() || '';
  if (!(await dlAsk({ title: 'Mark Ready to pay?', body: '<p>Both sides are told to meet for the handover.</p>', ok: 'Mark Ready to pay' }))) return;
  adminDealRun(dealId, () => dealsApi.staffReady(dealId, note), 'Marked Ready to pay.');
}

async function adminDealPaid(dealId) {
  const utr = (document.getElementById('adminDealUtr')?.value || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,30}$/.test(utr)) { showToast('Enter the UTR from the lender (6 to 30 letters and digits).', 'error'); return; }
  if (!(await dlAsk({ tone: 'warn', title: 'Mark the deal paid?', body: `<p>UTR <strong>${dlEsc(utr)}</strong>. Only do this once the lender has confirmed the transfer.</p>`, ok: 'Mark paid' }))) return;
  adminDealRun(dealId, () => dealsApi.staffPaid(dealId, utr), 'Marked paid.');
}

function adminDealResolve(dealId) {
  const outcome = document.getElementById('adminDealOutcome')?.value;
  const note = document.getElementById('adminDealResolveNote')?.value.trim() || '';
  if (!note) { showToast('Add a note saying how it was resolved.', 'error'); return; }
  adminDealRun(dealId, () => dealsApi.staffResolve(dealId, outcome, note), 'Dispute resolved.');
}

/* Opened from a staff or lender bell notification ("Payout needed",
   "Documents to check"...): straight to the section that person works in. */
async function openAdminDeals(n) {
  await openAdminPanel();
  const s = userSections();
  // A lender user chose their company, or asks to change it: Users, where a
  // superadmin changes it (Assign role, Lender).
  if (n && n.kind === 'lender_firm' && s.includes('users')) { adminSwitchSection('users'); return; }
  let ctx = '';
  if (s.includes('deals')) { adminSwitchSection('deals'); ctx = 'admin'; }
  else if (s.includes('lender')) { adminSwitchSection('lender'); ctx = 'lender'; }
  // "Listing documents to check": open that listing's documents.
  if (n && n.kind === 'listing_docs' && n.link_ref && ctx) ldOpenReview(n.link_ref, ctx);
}

/* ---------- Admin EMI detail: the DealLock part ---------- */
function adminEmiDealSectionHtml(a) {
  if (!a.deal_id) return '';
  return `
    <div class="admin-detail-section"><h4>DealLock deal</h4>
      <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.5">
        This loan pays for a locked deal. Approving or rejecting it here moves the deal too.
        Ready to pay and Paid are done on the deal.
      </p>
      <div id="emiDealStatus" class="admin-detail-row"><span>Deal</span><strong>Loading...</strong></div>
      <label style="font-size:12px;font-weight:600;display:block;margin:10px 0 4px">Lender's application reference</label>
      <input id="emiNbfcRef" type="text" style="width:100%" maxlength="150" value="${dlEsc(a.nbfc_application_reference || '')}" autocomplete="off">
      <label style="font-size:12px;font-weight:600;display:block;margin:10px 0 4px">Key Fact Statement link (https)</label>
      <input id="emiKfsUrl" type="url" style="width:100%" maxlength="500" value="${dlEsc(a.kfs_url || '')}" placeholder="https://..." autocomplete="off">
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn-sm btn-sm-blue" onclick="adminSaveEmiDealFields('${dlEsc(a.id)}')">Save</button>
        <button class="btn-sm" onclick="adminViewDeal('${dlEsc(a.deal_id)}')">Open deal</button>
      </div>
    </div>`;
}

async function adminFillEmiDealStatus(dealId) {
  const el = document.getElementById('emiDealStatus');
  if (!el || !dealId) return;
  try {
    const d = await dealsApi.get(dealId);
    el.querySelector('strong').innerHTML = `${dealPill(d.status)} ${dlRupees(d.agreed_price)} ${loanTypeTag(d.loan_type)}`;
  } catch {
    el.querySelector('strong').textContent = 'Could not load';
  }
}

async function adminSaveEmiDealFields(eid) {
  const ref = document.getElementById('emiNbfcRef').value.trim();
  const kfs = document.getElementById('emiKfsUrl').value.trim();
  if (kfs && !kfs.startsWith('https://')) { showToast('The KFS link must start with https://', 'error'); return; }
  try {
    await db.adminUpdateEmi(eid, { nbfc_application_reference: ref, kfs_url: kfs });
    showToast('Saved.', 'success');
  } catch (err) { showToast(err.message || 'Could not save.', 'error'); }
}

/* ---------- Admin Users: the lender role needs a lender ---------- */
async function adminAssignLenderRole(uid) {
  const u = (typeof adminUsersCache !== 'undefined' ? adminUsersCache : []).find(x => x.id === uid) || {};
  const content = dlOpenAdminModal(DL_LOADING);
  let financers = [];
  try { financers = await db.adminGetFinancers(); }
  catch (err) { content.innerHTML = `<div style="text-align:center;padding:60px 20px">${dlEsc(err.message || 'Could not load lenders.')}</div>`; return; }
  if (!financers.length) {
    content.innerHTML = `<div class="pm-body" style="padding:30px 20px"><h3>No lenders yet</h3><p class="deal-small">Add the lender in Financers first, then give this user the lender role.</p></div>`;
    return;
  }
  content.innerHTML = `
    <div class="pm-body" style="padding-top:20px">
      <h2 class="pm-title" style="margin-bottom:4px">Lender (NBFC) role</h2>
      <p class="deal-small">${dlEsc(`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'This user')} will see only this lender's loans, deals and seller documents, in the Lender portal tab of the admin panel. What else the role can open is set in Roles &amp; Access.</p>
      <label style="font-size:12px;font-weight:600;display:block;margin:10px 0 4px" for="lenderRoleFinancer">Works for</label>
      <select id="lenderRoleFinancer" style="width:100%">
        <option value="" ${u.lender ? '' : 'selected'}>Let them choose in the Lender portal</option>
        ${financers.map(f => `<option value="${f.financer_id}" ${u.lender && u.lender.financer_id === f.financer_id ? 'selected' : ''}>${dlEsc(f.name)}${f.status !== 'active' ? ' (inactive)' : ''}</option>`).join('')}
      </select>
      <p class="deal-small" style="margin-top:6px">If they choose it themselves, it is locked once saved: only a superadmin can change it, here.${u.lender ? ' Choosing “Let them choose” clears their current company.' : ''}</p>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn-sm" onclick="closeTopModal('product')">Cancel</button>
        <button class="btn-sm btn-sm-blue" onclick="adminSaveLenderRole('${dlEsc(uid)}')">Give lender role</button>
      </div>
    </div>`;
}

async function adminSaveLenderRole(uid) {
  const fid = Number(document.getElementById('lenderRoleFinancer')?.value || 0);
  try {
    await db.adminUpdateUser(uid, { role_name: 'lender', financer_id: fid || null });
    showToast('Lender role given.', 'success');
    await dlCloseModalThen('product');
    renderAdminUsers();
  } catch (err) {
    showToast(err.message || 'Could not assign the role.', 'error');
  }
}

/* Superadmin: a user's restriction (no new listings, offers or deals):
   impose it, shorten or extend it, lift it, and set the force-cancel count. */
function adminRestrictionsOpen(uid) {
  const u = (typeof adminUsersCache !== 'undefined' ? adminUsersCache : []).find(x => x.id === uid);
  if (!u) return;
  const rules = dealRulesCache || { cancel_limit: 3, ban_days: 7 };
  const active = !!u.deal_ban_until;
  const pad = (n) => String(n).padStart(2, '0');
  const local = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const start = active ? new Date(u.deal_ban_until) : new Date(Date.now() + (rules.ban_days || 7) * 86400000);
  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
  const self = currentUser && u.id === currentUser.id;
  dlOpenAdminModal(`
    <div class="pm-body" style="padding-top:20px">
      <h2 class="pm-title" style="margin-bottom:4px">Restrictions</h2>
      <p class="deal-small">${dlEsc(name)} · ${dlEsc(u.email)}</p>
      <div class="admin-detail-section"><h4>Now</h4>
        <div class="admin-detail-row"><span>New listings, offers and deals</span><strong>${active
          ? `<span class="status-pill status-rejected">Paused till ${dlEsc(fmtDateTime(u.deal_ban_until))}</span>` : '<span class="status-pill status-approved">Allowed</span>'}</strong></div>
        ${active ? `<div class="admin-detail-row"><span>Time left</span><strong data-countdown="${dlEsc(u.deal_ban_until)}">${dlEsc(dlTimeLeft(u.deal_ban_until))}</strong></div>` : ''}
        ${active ? `<div class="admin-detail-row"><span>Why</span><strong>${u.deal_ban_reason ? dlEsc(u.deal_ban_reason) : `${rules.cancel_limit} force cancels in a row (automatic)`}</strong></div>` : ''}
        <div class="admin-detail-row"><span>Force cancels in a row</span><strong>${u.consecutive_cancels || 0} of ${rules.cancel_limit}</strong></div>
      </div>
      ${self ? `<div class="admin-detail-section"><h4>Your own account</h4>
        <p class="deal-small">You can lift a restriction on your own account and set its cancel count, but not restrict it.</p>
        <label style="font-size:12px;font-weight:600;display:block;margin:0 0 4px" for="restrictCancels">Force cancels in a row</label>
        <select id="restrictCancels" style="width:100%">${Array.from({ length: rules.cancel_limit }, (_, i) =>
          `<option value="${i}" ${i === Math.min(u.consecutive_cancels || 0, rules.cancel_limit - 1) ? 'selected' : ''}>${i}</option>`).join('')}</select>
        <p id="restrictError" class="auth-error hidden"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${active ? `<button class="btn-sm btn-sm-blue" onclick="adminRestrictionSave('${dlEsc(uid)}', 'lift')">Lift now</button>` : ''}
          <button class="btn-sm" onclick="adminRestrictionSave('${dlEsc(uid)}', 'cancels')">Save cancel count only</button>
        </div></div>` : `
      <div class="admin-detail-section"><h4>${active ? 'Change the end, or lift it' : 'Restrict this user'}</h4>
        <label style="font-size:12px;font-weight:600;display:block;margin:0 0 4px" for="restrictUntil">Paused until</label>
        <input id="restrictUntil" type="datetime-local" style="width:100%" value="${local(start)}" min="${local(new Date())}">
        <label style="font-size:12px;font-weight:600;display:block;margin:10px 0 4px" for="restrictReason">Reason (the user sees it)</label>
        <input id="restrictReason" type="text" maxlength="255" style="width:100%" value="${dlEsc(u.deal_ban_reason || '')}" placeholder="e.g. Repeated no-shows at handovers" autocomplete="off">
        <label style="font-size:12px;font-weight:600;display:block;margin:10px 0 4px" for="restrictCancels">Force cancels in a row</label>
        <select id="restrictCancels" style="width:100%">${Array.from({ length: rules.cancel_limit }, (_, i) =>
          `<option value="${i}" ${i === Math.min(u.consecutive_cancels || 0, rules.cancel_limit - 1) ? 'selected' : ''}>${i}</option>`).join('')}</select>
        <p class="deal-small" style="margin-top:6px">While paused, the user can't post listings or send offers, and their open offers are withdrawn. Deals already running carry on.</p>
        <p id="restrictError" class="auth-error hidden"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="btn-sm btn-sm-red" onclick="adminRestrictionSave('${dlEsc(uid)}', 'set')">${active ? 'Save new end' : 'Restrict'}</button>
          ${active ? `<button class="btn-sm btn-sm-blue" onclick="adminRestrictionSave('${dlEsc(uid)}', 'lift')">Lift now</button>` : ''}
          <button class="btn-sm" onclick="adminRestrictionSave('${dlEsc(uid)}', 'cancels')">Save cancel count only</button>
        </div>
      </div>`}
    </div>`);
}

/* "2d 04h 12m 30s left" until an ISO time; '' once it has passed. Every
   element with data-countdown="<ISO>" is kept ticking (dlCountdownTick). */
function dlTimeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (!(ms > 0)) return 'Ended';
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p = (n) => String(n).padStart(2, '0');
  return d ? `${d}d ${p(h)}h ${p(m)}m ${p(s)}s left` : `${h}h ${p(m)}m ${p(s)}s left`;
}
function dlCountdownTick() {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const t = dlTimeLeft(el.dataset.countdown);
    if (el.textContent !== t) el.textContent = t;
  });
}
setInterval(dlCountdownTick, 1000);

async function adminRestrictionSave(uid, action) {
  const err = document.getElementById('restrictError');
  const cancels = Number(document.getElementById('restrictCancels')?.value || 0);
  const body = { cancels };
  if (action === 'set') {
    const v = document.getElementById('restrictUntil')?.value;
    const reason = (document.getElementById('restrictReason')?.value || '').trim();
    if (!v) { err.textContent = 'Choose until when.'; err.classList.remove('hidden'); return; }
    if (!reason) { err.textContent = 'Add a reason. The user is shown it.'; err.classList.remove('hidden'); return; }
    body.until = new Date(v).toISOString();
    body.reason = reason;
  } else if (action === 'lift') {
    if (!(await dlAsk({ title: 'Lift the restriction?', body: '<p>The user can post listings and make deals again straight away.</p>', ok: 'Lift now' }))) return;
    body.until = null;
  }
  try {
    await apiFetch(`/admin/users/${encodeURIComponent(uid)}/restriction`, { method: 'POST', body });
    showToast(action === 'lift' ? 'Restriction lifted.' : action === 'set' ? 'Restriction saved.' : 'Cancel count saved.', 'success');
    await dlCloseModalThen('product');
    renderAdminUsers();
  } catch (e) {
    if (err) { err.textContent = e.message || 'Could not save.'; err.classList.remove('hidden'); }
  }
}

async function adminLiftDealBan(uid) {
  if (!(await dlAsk({ title: 'Lift the pause?', body: '<p>This user can post listings and make deals again straight away, and their cancel count goes back to 0.</p>', ok: 'Lift the pause' }))) return;
  try {
    await apiFetch(`/admin/users/${encodeURIComponent(uid)}/deal-ban`, { method: 'DELETE' });
    showToast('Pause lifted.', 'success');
    renderAdminUsers();
  } catch (err) { showToast(err.message || 'Could not lift it.', 'error'); }
}

/* =====================================================
   LENDER PORTAL (admin panel tab "Lender portal")
   ===================================================== */
let lenderState = { me: null, fid: null, tab: 'deals', dealFilter: 'docs_pending', showListings: false, loans: [], deals: [], loanStatus: '' };

async function renderLenderPortal() {
  const head = document.getElementById('lenderHeader');
  const body = document.getElementById('lenderBody');
  const tabs = document.querySelector('#adminSection-lender .lender-tabs');
  if (!head || !body) return;
  body.innerHTML = DL_LOADING;
  try {
    lenderState.me = await lenderApi.me();
  } catch (err) {
    head.innerHTML = '';
    tabs?.classList.add('hidden');
    body.innerHTML = `<div class="empty-state"><i class="fas fa-building-columns"></i><h3>Lender portal</h3><p>${dlEsc(err.message || 'Not available.')}</p></div>`;
    return;
  }
  await dlRules();
  const me = lenderState.me;
  // A lender user who hasn't said which company they are with yet.
  if (me.needs_firm) {
    head.innerHTML = '';
    tabs?.classList.add('hidden');
    body.innerHTML = lenderFirmPickHtml(me.firms || []);
    return;
  }
  tabs?.classList.remove('hidden');
  if (me.financer) {
    lenderState.fid = null;   // a lender user: the server knows their lender
    head.innerHTML = `
      <div class="lender-head-name"><i class="fas fa-building-columns"></i> ${dlEsc(me.financer.name)}
        <span class="lender-firm-lock" title="Only a DealBriz superadmin can change your company"><i class="fas fa-lock"></i> Locked</span></div>
      <div class="lender-head-sub">Funds: ${(me.financer.loan_types || []).map(t => loanTypeTag(t)).join(' ') || 'no loan types set'}</div>
      <div class="lender-firm-note">Your company can only be changed by a DealBriz superadmin.
        <button class="btn-sm" onclick="lenderFirmRequestToggle()"><i class="fas fa-envelope"></i> Contact the superadmin</button></div>
      <div id="lenderFirmRequest" class="lender-firm-request hidden"></div>
      <div id="lenderDocsEmail" class="lender-docs-email"></div>`;
    lenderState.docsEmail = me.financer.docs_email || '';
    lenderState.canEditEmail = true;
  } else {
    const list = me.financers || [];
    if (!lenderState.fid || !list.some(f => String(f.financer_id) === String(lenderState.fid))) {
      lenderState.fid = list.length ? list[0].financer_id : null;
    }
    head.innerHTML = `
      <div class="lender-head-sub">DealBriz staff view. See and act as:</div>
      <select id="lenderPick" onchange="lenderPickFinancer(this.value)" style="min-width:220px">
        ${list.map(f => `<option value="${f.financer_id}" ${String(f.financer_id) === String(lenderState.fid) ? 'selected' : ''}>${dlEsc(f.name)}${f.status !== 'active' ? ' (inactive)' : ''}</option>`).join('')}
      </select>
      <div id="lenderDocsEmail" class="lender-docs-email"></div>`;
    if (!lenderState.fid) {
      body.innerHTML = `<div class="empty-state"><i class="fas fa-building-columns"></i><h3>No lenders yet</h3><p>Add one in Financers.</p></div>`;
      return;
    }
    const picked = list.find(f => String(f.financer_id) === String(lenderState.fid));
    lenderState.docsEmail = (picked && picked.docs_email) || '';
    lenderState.canEditEmail = typeof userCan === 'function' && userCan('financers.manage');
  }
  lenderState.editingEmail = false;
  lenderDocsEmailRender();
  await lenderRefresh();
}

/* A lender user chooses their company once. After that it is locked and
   only a superadmin can change it, so the warning comes first. */
function lenderFirmPickHtml(firms) {
  const help = `
    <div class="lender-firm-help">${firms.length ? 'Your company isn’t listed, or you need help?' : 'No lending companies are set up on DealBriz yet.'}
      <button class="btn-sm" onclick="lenderFirmRequestToggle()"><i class="fas fa-envelope"></i> Contact the superadmin</button></div>
    <div id="lenderFirmRequest" class="lender-firm-request hidden"></div>`;
  return `
    <div class="lender-firm">
      <div class="lender-firm-icon"><i class="fas fa-building-columns"></i></div>
      <h3>Which company are you with?</h3>
      <p class="deal-small">Choose the lender (NBFC) you work for. You will see the deals and loan applications where the buyer chose this company.</p>
      ${firms.length ? `
        <label for="lenderFirmSelect">Your company</label>
        <select id="lenderFirmSelect">
          <option value="">Select your company</option>
          ${firms.map(f => `<option value="${dlEsc(f.financer_id)}">${dlEsc(f.name)}</option>`).join('')}
        </select>
        <div class="lender-firm-warn" role="note"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          <span><strong>Choose carefully.</strong> Once you save, your company is locked and you can’t change it yourself. Only a DealBriz superadmin can change it.</span></div>
        <p id="lenderFirmError" class="auth-error hidden"></p>
        <button class="btn-primary full-width" onclick="lenderFirmSave()">Save my company</button>` : ''}
      ${help}
    </div>`;
}

async function lenderFirmSave() {
  const sel = document.getElementById('lenderFirmSelect');
  const err = document.getElementById('lenderFirmError');
  const firm = ((lenderState.me && lenderState.me.firms) || []).find(f => String(f.financer_id) === String(sel ? sel.value : ''));
  if (!firm) {
    if (err) { err.textContent = 'Select your company first.'; err.classList.remove('hidden'); }
    return;
  }
  if (err) err.classList.add('hidden');
  const ok = await dlAsk({
    tone: 'warn',
    title: `Save ${firm.name} as your company?`,
    body: `<p>Once saved, your company is <strong>locked</strong>. You can’t change it yourself; only a DealBriz superadmin can.</p>`,
    ok: 'Save and lock',
    cancel: 'Go back',
  });
  if (!ok) return;
  try {
    await lenderApi.chooseFirm(firm.financer_id);
    showToast(`Saved: ${firm.name}.`, 'success');
  } catch (e) {
    if (err) { err.textContent = e.message || 'Could not save.'; err.classList.remove('hidden'); }
    return;
  }
  renderLenderPortal();
}

/* Ask the superadmins (bell notification) to change, or set, the company. */
function lenderFirmRequestToggle(open) {
  const box = document.getElementById('lenderFirmRequest');
  if (!box) return;
  const show = open === undefined ? box.classList.contains('hidden') : !!open;
  if (!show) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = `
    <label for="lenderFirmRequestMsg">Message to the DealBriz superadmin</label>
    <textarea id="lenderFirmRequestMsg" rows="3" maxlength="500" placeholder="Which company you are with, and what should change"></textarea>
    <p id="lenderFirmRequestError" class="auth-error hidden"></p>
    <div class="lender-firm-request-actions">
      <button class="btn-sm" onclick="lenderFirmRequestToggle(false)">Cancel</button>
      <button class="btn-sm btn-sm-blue" onclick="lenderFirmRequestSend()">Send</button>
    </div>
    <small>The superadmin is notified in DealBriz. You can also email support@dealbriz.com.</small>`;
  box.classList.remove('hidden');
  setTimeout(() => document.getElementById('lenderFirmRequestMsg')?.focus(), 30);
}

async function lenderFirmRequestSend() {
  const msg = (document.getElementById('lenderFirmRequestMsg')?.value || '').trim();
  const err = document.getElementById('lenderFirmRequestError');
  if (msg.length < 5) {
    if (err) { err.textContent = 'Say which company you are with and what should change.'; err.classList.remove('hidden'); }
    return;
  }
  try {
    await lenderApi.firmRequest(msg);
    showToast('Sent to the DealBriz superadmin. They will get back to you.', 'success');
    lenderFirmRequestToggle(false);
  } catch (e) {
    if (err) { err.textContent = e.message || 'Could not send.'; err.classList.remove('hidden'); }
  }
}

function lenderPickFinancer(fid) {
  lenderState.fid = fid;
  const picked = ((lenderState.me && lenderState.me.financers) || []).find(f => String(f.financer_id) === String(fid));
  lenderState.docsEmail = (picked && picked.docs_email) || '';
  lenderState.editingEmail = false;
  lenderDocsEmailRender();
  lenderRefresh();
}

/* Where this lender receives each new loan application, with the buyer's
   and the seller's documents attached. */
function lenderDocsEmailRender() {
  const box = document.getElementById('lenderDocsEmail');
  if (!box) return;
  const email = lenderState.docsEmail || '';
  const can = !!lenderState.canEditEmail;
  if (lenderState.editingEmail && can) {
    box.innerHTML = `
      <label for="lenderDocsEmailInput">Email for loan applications and documents</label>
      <div class="lender-docs-email-row">
        <input id="lenderDocsEmailInput" type="text" inputmode="email" autocomplete="off" maxlength="255"
               value="${dlEsc(email)}" placeholder="e.g. loans@yourcompany.in" onkeydown="if(event.key==='Enter') lenderDocsEmailSave()">
        <button class="btn-sm btn-sm-blue" onclick="lenderDocsEmailSave()">Save</button>
        <button class="btn-sm" onclick="lenderState.editingEmail=false;lenderDocsEmailRender()">Cancel</button>
      </div>
      <small>Up to 3 addresses, separated by commas. Every new loan application on a DealBriz deal is sent here with the buyer’s and the seller’s verified documents attached.</small>
      <p id="lenderDocsEmailError" class="auth-error hidden"></p>`;
    setTimeout(() => document.getElementById('lenderDocsEmailInput')?.focus(), 30);
    return;
  }
  box.innerHTML = email
    ? `<span><i class="fas fa-envelope"></i> Loan applications and documents are emailed to <strong>${dlEsc(email)}</strong></span>
       ${can ? `<button class="btn-sm" onclick="lenderState.editingEmail=true;lenderDocsEmailRender()">Change</button>` : ''}`
    : `<span class="lender-docs-email-missing"><i class="fas fa-circle-exclamation"></i> No email set for loan applications. Add one so each new application and its documents reach your team.</span>
       ${can ? `<button class="btn-sm btn-sm-blue" onclick="lenderState.editingEmail=true;lenderDocsEmailRender()">Add email</button>` : ''}`;
}

async function lenderDocsEmailSave() {
  const input = document.getElementById('lenderDocsEmailInput');
  const err = document.getElementById('lenderDocsEmailError');
  if (!input) return;
  try {
    const res = await lenderApi.saveSettings(lenderState.fid, input.value.trim());
    lenderState.docsEmail = (res.financer && res.financer.docs_email) || '';
    const list = (lenderState.me && lenderState.me.financers) || [];
    const picked = list.find(f => String(f.financer_id) === String(lenderState.fid));
    if (picked) picked.docs_email = lenderState.docsEmail;
    if (lenderState.me && lenderState.me.financer) lenderState.me.financer.docs_email = lenderState.docsEmail;
    lenderState.editingEmail = false;
    lenderDocsEmailRender();
    showToast(res.queued ? `Saved. ${res.queued} waiting application${res.queued === 1 ? ' is' : 's are'} being emailed now.` : 'Saved.', 'success');
  } catch (e) {
    if (err) { err.textContent = e.message || 'Could not save.'; err.classList.remove('hidden'); }
  }
}

/* The documents email to the lender, on a deal (staff and lender views). */
function dlLenderEmailHtml(d, ctx) {
  const m = d.lender_email;
  const canResend = ctx === 'admin' && d.can_resend_lender_email;
  if (!m && !canResend) return '';
  let line;
  if (!m) line = '<p class="deal-small">Not sent yet.</p>';
  else if (m.status === 'sent') line = `<p class="deal-small"><i class="fas fa-circle-check deal-green"></i> Loan application and documents emailed to <strong>${dlEsc(m.to_email || '')}</strong> on ${dlEsc(dlWhen(m.sent_at))}${m.parts > 1 ? ` (in ${m.parts} emails)` : ''}.</p>`;
  else if (m.status === 'no_email') line = `<p class="deal-small deal-red"><i class="fas fa-circle-exclamation"></i> Not sent: the lender has no email set for loan applications. It goes out as soon as one is added (Lender portal or Financers).</p>`;
  else if (m.status === 'failed') line = `<p class="deal-small deal-red"><i class="fas fa-circle-exclamation"></i> Sending failed (${m.attempts} ${m.attempts === 1 ? 'try' : 'tries'}): ${dlEsc(m.last_error || '')}. It is retried automatically.</p>`;
  else line = `<p class="deal-small"><i class="fas fa-hourglass-half"></i> Being sent to <strong>${dlEsc(m.to_email || '')}</strong>${m.last_error ? `. ${dlEsc(m.last_error)}` : ''}.</p>`;
  return `<div class="admin-detail-section"><h4>Email to the lender</h4>${line}
    ${canResend ? `<button class="btn-sm" onclick="dlResendLenderEmail('${dlEsc(d.id)}')"><i class="fas fa-paper-plane"></i> Send again</button>` : ''}</div>`;
}

async function dlResendLenderEmail(dealId) {
  if (!(await dlAsk({ title: 'Send the documents email again?', body: '<p>The lender gets the loan application with the buyer’s and the seller’s documents again, at its current email address.</p>', ok: 'Send again' }))) return;
  try {
    await dealsApi.staffResendLenderEmail(dealId);
    showToast('Sending.', 'success');
  } catch (err) { showToast(err.message || 'Could not send.', 'error'); }
  setTimeout(() => adminViewDeal(dealId), 1500);
}

function lenderSetTab(tab) {
  lenderState.tab = tab;
  lenderRefresh();
}

async function lenderRefresh() {
  const body = document.getElementById('lenderBody');
  if (!body) return;
  if (!['deals', 'loans'].includes(lenderState.tab)) lenderState.tab = 'deals';
  document.querySelectorAll('#adminSection-lender .admin-filter-btn[data-ltab]').forEach(b =>
    b.classList.toggle('active', b.dataset.ltab === lenderState.tab));
  body.innerHTML = DL_LOADING;
  const fid = lenderState.fid;
  if (lenderState.tab === 'loans') {
    try { lenderState.loans = await lenderApi.loans(fid, lenderState.loanStatus); }
    catch (err) { body.innerHTML = `<div class="empty-state"><p>${dlEsc(err.message || 'Could not load.')}</p></div>`; return; }
    body.innerHTML = lenderLoansHtml();
    return;
  }
  // Deals: the same layout as Admin -> Deals.
  if (lenderState.showListings) {
    try { ldQueue.rows = (await listingDocsApi.queue(ldQueue.lenderState)).rows || []; }
    catch (err) { body.innerHTML = lenderDealsSwitchHtml() + `<div class="empty-state"><p>${dlEsc(err.message || 'Could not load.')}</p></div>`; return; }
    body.innerHTML = lenderDealsSwitchHtml() + ldQueueHtml('lender', ldQueue.lenderState);
    return;
  }
  const filter = lenderState.dealFilter;
  try {
    const [deals, lq] = await Promise.all([
      lenderApi.deals(fid, filter),
      // "Documents to check" also lists the sellers' listing documents.
      filter === 'docs_pending' ? listingDocsApi.queue('checking').then(r => r.rows || []).catch(() => []) : Promise.resolve([]),
    ]);
    lenderState.deals = deals || [];
    ldQueue.rows = lq;
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><p>${dlEsc(err.message || 'Could not load.')}</p></div>`;
    return;
  }
  body.innerHTML = lenderDealsShellHtml();
  renderLenderDealsTable();
}

// "Documents to check" also lists deals at the documents step with no
// lender yet (the buyer chooses after they are verified). Every other tab,
// All included, shows only the deals whose buyer chose this lender.
const LENDER_DEAL_FILTERS = [
  ['all', 'All'],
  ['docs_pending', 'Documents to check'],
  ['', 'In progress'],
  ['locked', 'Locked'],
  ['loan_in_progress', 'Loan in progress'],
  ['ready_to_pay', 'Ready to pay'],
  ['paid', 'Paid'],
  ['completed', 'Completed'],
  ['released', 'Released'],
];

function lenderDealsSwitchHtml() {
  return `<div class="admin-deals-switch">
    <button id="lenderListingDocsBtn" class="btn-sm ${lenderState.showListings ? 'active' : ''}" onclick="lenderToggleListings()">
      ${lenderState.showListings ? '<i class="fas fa-arrow-left"></i> Back to deals' : '<i class="fas fa-file-shield"></i> Listing documents'}</button>
  </div>`;
}

function lenderToggleListings() {
  lenderState.showListings = !lenderState.showListings;
  lenderRefresh();
}

function lenderDealsSetFilter(status) {
  lenderState.dealFilter = status;
  adminResetPage('lenderdeals');
  lenderRefresh();
}

function lenderDealsShellHtml() {
  const f = lenderState.dealFilter;
  const lrows = f === 'docs_pending' ? (ldQueue.rows || []) : [];
  return `
    ${lenderDealsSwitchHtml()}
    <div class="admin-filters">
      ${LENDER_DEAL_FILTERS.map(([v, l]) => `<button class="admin-filter-btn ${v === f ? 'active' : ''}" onclick="lenderDealsSetFilter('${v}')">${l}</button>`).join('')}
    </div>
    ${lrows.length ? `
      <h4 class="lender-group-head"><i class="fas fa-car"></i> Vehicle listings <small>the seller’s documents, checked once for every deal on the listing</small></h4>
      ${ldQueueTableHtml(lrows, 'lender')}
      <h4 class="lender-group-head"><i class="fas fa-handshake"></i> Deals waiting for documents <small>the buyer’s PAN card and Aadhaar</small></h4>` : ''}
    <div class="admin-search-bar">
      <i class="fas fa-search"></i>
      <input type="text" id="lenderDealSearch" placeholder="Search listing, buyer, seller or UTR..." oninput="adminResetPage('lenderdeals'); renderLenderDealsTable()" autocomplete="off">
      <span id="lenderDealCount" class="admin-search-count"></span>
    </div>
    <div id="adminPager-lenderdeals" class="admin-pager"></div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Listing</th><th>Buyer</th><th>Seller</th><th>Price</th><th>Loan</th><th>Status</th><th>Until</th><th>Action</th></tr></thead>
        <tbody id="lenderDealsBody"></tbody>
      </table>
      <div id="lenderNoDeals" class="empty-state hidden"><i class="fas fa-handshake"></i><h3>${f === 'docs_pending' ? (lrows.length ? 'No deals waiting for documents' : 'No documents to check') : 'No deals here'}</h3></div>
    </div>`;
}

ADMIN_TABLE_RERENDER.lenderdeals = renderLenderDealsTable;

function renderLenderDealsTable() {
  const tbody = document.getElementById('lenderDealsBody');
  const none = document.getElementById('lenderNoDeals');
  if (!tbody) return;
  const all = lenderState.deals || [];
  const q = document.getElementById('lenderDealSearch')?.value || '';
  const filtered = all.filter(d => adminMatches(q, d.product && d.product.title, d.buyer && d.buyer.name,
    d.seller && d.seller.name, d.buyer && d.buyer.phone, d.seller && d.seller.phone, d.utr));
  const rows = adminPaginate('lenderdeals', filtered);
  const count = document.getElementById('lenderDealCount');
  if (count) count.textContent = `${filtered.length} of ${all.length}`;
  if (!filtered.length) { tbody.innerHTML = ''; none.classList.remove('hidden'); return; }
  none.classList.add('hidden');
  tbody.innerHTML = rows.map(d => {
    const loan = d.loan;
    const next = lenderDealNext(d);
    const until = d.status === 'awaiting_seller' ? d.confirm_by : d.reserved_until;
    const check = d.status === 'docs_pending' && d.docs_to_check;
    return `
    <tr>
      <td><div class="admin-product-cell"><img src="${dlEsc(toAbsoluteUrl(d.product?.image_url || ''))}" alt="" onerror="this.style.display='none'"><span>${dlEsc(d.product?.title || '—')}</span></div>${loanTypeTag(d.loan_type)}</td>
      <td>${dlEsc(d.buyer?.name || '—')}<br><small>${dlEsc(d.buyer?.phone || '')}</small></td>
      <td>${dlEsc(d.seller?.name || '—')}<br><small>${dlEsc(d.seller?.phone || '')}</small></td>
      <td>${dlRupees(d.agreed_price)}</td>
      <td>${loan ? `${dlEsc(LOAN_STATUS_LABEL[loan.status] || loan.status)}<br><small>${dlEsc(loan.loan_amount != null ? dlRupees(loan.loan_amount) : '')}</small>` : '<small>Not applied</small>'}</td>
      <td>${dealPill(d.status)}${d.status === 'docs_pending' && d.docs_needed ? `<br><small>${d.docs_approved || 0} of ${d.docs_needed} verified</small>` : ''}${next ? `<br><small class="deal-attn">${dlEsc(next)}</small>` : ''}</td>
      <td><small>${dlEsc(dlWhen(until))}</small></td>
      <td><button class="btn-sm btn-sm-blue" onclick="lenderViewDeal('${dlEsc(d.id)}')">${check ? 'Check documents' : 'Details'}</button></td>
    </tr>`;
  }).join('');
}

function lenderLoansHtml() {
  const rows = lenderState.loans;
  const filter = `
    <div class="lender-toolbar">
      <label for="lenderLoanStatus">Status</label>
      <select id="lenderLoanStatus" onchange="lenderState.loanStatus=this.value;lenderRefresh()">
        <option value="">All</option>
        ${Object.entries(LOAN_STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${lenderState.loanStatus === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>`;
  if (!rows.length) return filter + `<div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3>No loan applications</h3><p>Applications sent to this lender show up here.</p></div>`;
  return filter + `
    <div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>Applicant</th><th>Listing</th><th>Loan</th><th>Status</th><th>Deal</th><th>Applied</th><th></th></tr></thead>
      <tbody>${rows.map(a => `
        <tr>
          <td>${dlEsc(a.applicant_name)}<br><small>${dlEsc(a.applicant_phone)}</small></td>
          <td>${dlEsc(a.product?.title || a.product_title_snapshot || '—')}${a.deal ? `<br>${loanTypeTag(a.deal.loan_type)}` : ''}</td>
          <td>${dlRupees(a.loan_amount)}<br><small>${dlRupees(a.monthly_emi)} × ${a.tenure_months}</small></td>
          <td><span class="status-pill status-${dlEsc(a.status)}">${dlEsc(LOAN_STATUS_LABEL[a.status] || a.status)}</span></td>
          <td>${a.deal ? dealPill(a.deal.status) : '<small>EMI enquiry</small>'}</td>
          <td><small>${dlEsc(dlDay(a.applied_at))}</small></td>
          <td><button class="btn-sm btn-sm-blue" onclick="lenderViewLoan('${dlEsc(a.id)}')">Open</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function lenderDealNext(d) {
  if (d.status === 'docs_pending') {
    if (d.docs_to_check) return `Check ${d.docs_to_check} document${d.docs_to_check === 1 ? '' : 's'}`;
    return 'Waiting for documents';
  }
  if (d.status === 'loan_in_progress') return 'Work the loan, then Ready to pay';
  if (d.status === 'ready_to_pay' && d.buyer_ready_at && d.seller_ready_at) return 'Pay the seller, then mark Paid';
  if (d.status === 'ready_to_pay') return 'Handover meeting';
  return '';
}

function lenderDealActionsHtml(d, app) {
  if (d.status === 'loan_in_progress') {
    if (!app || app.status !== 'approved') return `<p class="deal-small">Approve the loan first, then mark the deal Ready to pay once the agreement and auto-debit are signed${isVehicle(d) ? ' and the vehicle is checked' : ''}.</p>`;
    return `<p class="deal-small">Ready to pay means: loan sanctioned, agreement and EMI auto-debit signed${isVehicle(d) ? ', vehicle and documents checked' : ''}. Both sides are then told to meet for the handover.</p>
      <textarea id="lenderReadyNote" rows="2" style="width:100%" placeholder="Note (optional)"></textarea>
      <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="lenderReady('${dlEsc(d.id)}')">Mark Ready to pay</button>`;
  }
  if (d.status === 'ready_to_pay') {
    if (!(d.buyer_ready_at && d.seller_ready_at)) return `<p class="deal-small">Waiting for both sides to tap Ready at the handover meeting.</p>`;
    return `<p class="deal-small">Both sides are ready. Pay the seller, then enter the UTR of the transfer. Both sides see it.</p>
      <input id="lenderUtr" type="text" style="width:100%" placeholder="UTR" autocomplete="off">
      <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="lenderPaid('${dlEsc(d.id)}')">Mark paid</button>`;
  }
  return '';
}

async function lenderViewDeal(dealId) {
  const content = dlOpenAdminModal(DL_LOADING);
  let d;
  try { d = await dealsApi.get(dealId); }
  catch (err) { content.innerHTML = `<div style="text-align:center;padding:60px 20px">${dlEsc(err.message || 'Could not load this deal.')}</div>`; return; }
  // The list row carries the phone numbers; the deal itself only names people.
  const row = (lenderState.deals || []).find(x => x.id === dealId) || {};
  const r = (label, value) => `<div class="admin-detail-row"><span>${label}</span><strong>${value}</strong></div>`;
  const loan = d.loan;
  let action = lenderDealActionsHtml(d, loan);
  if (!action && d.status === 'docs_pending') {
    action = d.can_review_docs
      ? `<p class="deal-small">Check the documents below: the seller's (on the listing) and the buyer's. When every one is verified the deal locks and the buyer can apply for the loan.</p>`
      : `<p class="deal-small">Waiting for the documents to be uploaded.</p>`;
  } else if (!action && d.status === 'locked') {
    action = `<p class="deal-small">The deal is locked. Waiting for the buyer to apply for the loan.</p>`;
  }
  // Same layout as Admin -> Deals -> Details.
  dlOpenAdminModal(`
    <div class="pm-body" style="padding-top:20px">
      <div class="staff-mod-bar"><span><i class="fas fa-handshake"></i> DealLock deal</span>${dealPill(d.status)}</div>
      <h2 class="pm-title" style="margin-bottom:4px">${dlEsc(d.product?.title || 'Listing')}</h2>
      <div class="pm-meta">Deal ID: ${dlEsc(d.id)} ${loanTypeTag(d.loan_type)}</div>
      ${action ? `<div class="admin-detail-section"><h4>Next step</h4>${action}</div>` : ''}
      ${(d.documents || []).length || d.status === 'docs_pending' ? `<div class="admin-detail-section"><h4>Documents</h4>${dlDocsReviewHtml(d, 'lender')}</div>` : ''}
      ${dlLenderEmailHtml(d, 'lender')}
      <div class="admin-detail-section"><h4>Deal</h4>
        ${r('Agreed price', dlRupees(d.agreed_price))}
        ${r('Offer accepted', dlEsc(fmtDateTime(d.locked_at)))}
        ${d.seller_confirmed_at ? r('Seller confirmed', dlEsc(fmtDateTime(d.seller_confirmed_at))) : ''}
        ${d.docs_approved_at ? r('Documents verified', dlEsc(fmtDateTime(d.docs_approved_at))) : ''}
        ${d.status === 'awaiting_seller' ? r('Seller must confirm by', dlEsc(fmtDateTime(d.confirm_by))) : r('Reserved until', dlEsc(fmtDateTime(d.reserved_until)))}
        ${d.lender ? r('Lender', dlEsc(d.lender)) : ''}
        ${d.utr ? r('UTR', dlEsc(d.utr)) : ''}
      </div>
      <div class="admin-detail-section"><h4>People</h4>
        ${r('Buyer', `${dlEsc((row.buyer || d.buyer || {}).name || '—')}${row.buyer && row.buyer.phone ? `<br><small>${dlEsc(row.buyer.phone)}</small>` : ''}`)}
        ${r('Seller', `${dlEsc((row.seller || d.seller || {}).name || '—')}${row.seller && row.seller.phone ? `<br><small>${dlEsc(row.seller.phone)}</small>` : ''}`)}
      </div>
      ${loan ? `<div class="admin-detail-section"><h4>Loan</h4>
        ${r('Status', dlEsc(LOAN_STATUS_LABEL[loan.status] || loan.status))}
        ${loan.loan_amount != null ? r('Loan amount', dlRupees(loan.loan_amount)) : ''}
        ${loan.down_payment != null ? r('Down payment (planned)', dlRupees(loan.down_payment)) : ''}
        ${loan.nbfc_application_reference ? r('Your reference', dlEsc(loan.nbfc_application_reference)) : ''}
        ${loan.application_id ? `<button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="lenderViewLoan('${dlEsc(loan.application_id)}')">Open loan application</button>` : ''}
      </div>` : ''}
      <div class="admin-detail-section">${dealTimelineHtml(d, { staff: true }).replace('class="deal-section"', 'class="deal-section deal-section-flat"')}</div>
    </div>`);
}

async function lenderViewLoan(appId) {
  const content = dlOpenAdminModal(DL_LOADING);
  let a;
  try { a = await lenderApi.loan(lenderState.fid, appId); await dlRules(); }
  catch (err) { content.innerHTML = `<div style="text-align:center;padding:60px 20px">${dlEsc(err.message || 'Could not load this loan.')}</div>`; return; }
  const r = (label, value) => `<div class="admin-detail-row"><span>${label}</span><strong>${value}</strong></div>`;
  const d = a.deal && a.deal.events ? a.deal : null;   // full deal only when it is this lender's
  const closed = ['disbursed', 'completed', 'cancelled'].includes(a.status);
  const statusBtns = closed ? `<p class="deal-small">This loan is ${dlEsc(LOAN_STATUS_LABEL[a.status] || a.status).toLowerCase()}.</p>` : `
    <textarea id="lenderDecisionNotes" rows="2" style="width:100%" placeholder="Notes (needed to reject; the buyer is told the status)">${dlEsc(a.decision_notes || '')}</textarea>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      <button class="btn-sm" onclick="lenderSetStatus('${dlEsc(a.id)}','review')">Under review</button>
      <button class="btn-sm btn-sm-blue" onclick="lenderSetStatus('${dlEsc(a.id)}','approved')">Approve</button>
      <button class="btn-sm btn-sm-red" onclick="lenderSetStatus('${dlEsc(a.id)}','rejected')">Reject</button>
    </div>
    ${a.deal_id ? '<p class="deal-small" style="margin-top:8px">Rejecting releases the deal and puts the listing back on sale.</p>' : ''}`;
  dlOpenAdminModal(`
    <div class="pm-body" style="padding-top:20px">
      <div class="staff-mod-bar"><span><i class="fas fa-file-invoice-dollar"></i> Loan application</span>
        <span class="status-pill status-${dlEsc(a.status)}">${dlEsc(LOAN_STATUS_LABEL[a.status] || a.status)}</span></div>
      <h2 class="pm-title" style="margin-bottom:4px">${dlEsc(a.applicant_name)}</h2>
      <div class="pm-meta">${dlEsc(a.product?.title || a.product_title_snapshot || '')} ${a.deal ? loanTypeTag(a.deal.loan_type) : ''}</div>

      <div class="admin-detail-section"><h4>Decision</h4>${statusBtns}</div>

      ${d ? (() => { const x = lenderDealActionsHtml(d, a); return x ? `<div class="admin-detail-section"><h4>Deal: next step</h4>${x}</div>` : ''; })() : ''}

      <div class="admin-detail-section"><h4>Applicant</h4>
        ${r('Name', dlEsc(a.applicant_name))}
        ${r('Phone', dlEsc(a.applicant_phone))}
        ${a.applicant ? r('Email', dlEsc(a.applicant.email || '')) : ''}
        ${a.applicant_income != null ? r('Monthly income', dlRupees(a.applicant_income)) : ''}
      </div>
      <div class="admin-detail-section"><h4>Loan asked for</h4>
        ${r('Price', dlRupees(a.product_price_snapshot))}
        ${r('Down payment', dlRupees(a.down_payment))}
        ${r('Loan amount', dlRupees(a.loan_amount))}
        ${r('EMI (estimate)', `${dlRupees(a.monthly_emi)} × ${a.tenure_months} months`)}
        ${r('Interest (estimate)', `${dlRateRangeText()}${a.deal_id ? `, EMI worked out at ${dlEsc(a.interest_rate)}%` : ''}`)}
      </div>
      <div class="admin-detail-section"><h4>Your reference and KFS</h4>
        <input id="lenderRef" type="text" style="width:100%" maxlength="150" placeholder="Your application reference" value="${dlEsc(a.nbfc_application_reference || '')}" autocomplete="off">
        <input id="lenderKfs" type="url" style="width:100%;margin-top:6px" maxlength="500" placeholder="Key Fact Statement link (https://...)" value="${dlEsc(a.kfs_url || '')}" autocomplete="off">
        <button class="btn-sm btn-sm-blue" style="margin-top:8px" onclick="lenderSaveDetails('${dlEsc(a.id)}')">Save</button>
        <p class="deal-small" style="margin-top:6px">The buyer sees both in their deal.</p>
      </div>
      ${d && ((d.documents || []).length || d.status === 'docs_pending') ? `<div class="admin-detail-section"><h4>Documents</h4>${dlDocsReviewHtml(d, 'lender')}</div>` : ''}
      ${a.deal ? `<div class="admin-detail-section"><h4>Deal</h4>
        ${r('Status', dealPill(a.deal.status))}
        ${r('Agreed price', dlRupees(a.deal.agreed_price))}
        ${a.deal.id ? `<button class="btn-sm" style="margin-top:8px" onclick="lenderViewDeal('${dlEsc(a.deal.id)}')">Open deal</button>` : ''}
      </div>` : ''}
      ${(a.events || []).length ? `<div class="admin-detail-section"><h4>Loan timeline</h4>
        <ol class="deal-timeline">${a.events.map(e => `<li><span>${dlEsc(LOAN_STATUS_LABEL[e.status] || e.status.replace(/_/g, ' '))}${e.source ? ` <small>(${dlEsc(e.source)})</small>` : ''}${e.note ? `: ${dlEsc(e.note)}` : ''}</span><time>${dlEsc(dlWhen(e.created_at))}</time></li>`).join('')}</ol>
      </div>` : ''}
    </div>`);
}

async function lenderSetStatus(appId, status) {
  const notes = (document.getElementById('lenderDecisionNotes')?.value || '').trim();
  if (status === 'rejected' && !notes) { showToast('Add a note saying why the loan isn’t approved.', 'error'); return; }
  const ask = {
    review: { title: 'Mark this loan Under review?', body: '<p>The buyer sees that the lender is checking the application.</p>', ok: 'Mark Under review' },
    approved: { title: 'Approve this loan?', body: '<p>The buyer and seller are told the loan is approved.</p>', ok: 'Approve loan' },
    rejected: { tone: 'danger', title: 'Reject this loan?', body: '<p>A deal waiting on this loan is released, and the listing goes back on sale.</p>', ok: 'Reject loan' },
  }[status];
  if (!(await dlAsk(ask))) return;
  try {
    await lenderApi.setStatus(lenderState.fid, appId, status, notes);
    showToast('Saved.', 'success');
  } catch (err) { showToast(err.message || 'Could not save.', 'error'); }
  lenderRefresh();
  lenderViewLoan(appId);
}

async function lenderSaveDetails(appId) {
  const ref = document.getElementById('lenderRef').value.trim();
  const kfs = document.getElementById('lenderKfs').value.trim();
  if (kfs && !kfs.startsWith('https://')) { showToast('The KFS link must start with https://', 'error'); return; }
  try { await lenderApi.setDetails(lenderState.fid, appId, ref, kfs); showToast('Saved.', 'success'); }
  catch (err) { showToast(err.message || 'Could not save.', 'error'); }
}

async function lenderReady(dealId) {
  const note = (document.getElementById('lenderReadyNote')?.value || '').trim();
  if (!(await dlAsk({ title: 'Mark Ready to pay?', body: '<p>Both sides are told to meet for the handover.</p>', ok: 'Mark Ready to pay' }))) return;
  try { await lenderApi.ready(lenderState.fid, dealId, note); showToast('Marked Ready to pay.', 'success'); }
  catch (err) { showToast(err.message || 'That didn’t work.', 'error'); }
  lenderRefresh();
  lenderViewDeal(dealId);
}

async function lenderPaid(dealId) {
  const utr = (document.getElementById('lenderUtr')?.value || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,30}$/.test(utr)) { showToast('Enter the UTR (6 to 30 letters and digits).', 'error'); return; }
  if (!(await dlAsk({ tone: 'warn', title: 'Mark the deal paid?', body: `<p>UTR <strong>${dlEsc(utr)}</strong>. Only do this once the money has gone to the seller.</p>`, ok: 'Mark paid' }))) return;
  try { await lenderApi.paid(lenderState.fid, dealId, utr); showToast('Marked paid.', 'success'); }
  catch (err) { showToast(err.message || 'That didn’t work.', 'error'); }
  lenderRefresh();
  lenderViewDeal(dealId);
}

/* =====================================================
   LISTING DOCUMENTS (phase 5)

   A car or bike listing carries the seller's documents: the RC and the
   insurance policy. They are chosen in the Sell form and upload right after
   the ad is saved; for listings posted before this, the seller adds them
   from My Listings, Edit listing. A superadmin or a lender that funds
   vehicle loans checks them once, for every deal on the listing.
   ===================================================== */
const listingDocsApi = {
  get: (pid) => apiFetch(`/listing-docs/${encodeURIComponent(pid)}`),
  loanAnswer: (pid, hadLoan) =>
    apiFetch(`/listing-docs/${encodeURIComponent(pid)}/loan-answer`, { method: 'POST', body: { had_loan: hadLoan } }),
  upload: (pid, type, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch(`/listing-docs/${encodeURIComponent(pid)}/${encodeURIComponent(type)}`, { method: 'POST', body: form, isForm: true });
  },
  review: (pid, docId, decision, reason) =>
    apiFetch(`/listing-docs/${encodeURIComponent(pid)}/review/${encodeURIComponent(docId)}`, { method: 'POST', body: { decision, reason } }),
  fileUrl: (pid, docId) => `${API_BASE}/listing-docs/${encodeURIComponent(pid)}/files/${encodeURIComponent(docId)}`,
  queue: (state = 'checking') => apiFetch(`/listing-docs/queue?state=${encodeURIComponent(state)}`),
};

const LD_STATE_LABEL = {
  needed: 'Documents needed',
  checking: 'Documents being checked',
  verified: 'Documents verified',
};

/* The small badge on a My Listings card. */
function ldBadgeHtml(state) {
  if (!LD_STATE_LABEL[state]) return '';
  const icon = state === 'verified' ? 'fa-circle-check' : state === 'checking' ? 'fa-hourglass-half' : 'fa-circle-exclamation';
  return `<span class="ld-badge ld-badge-${dlEsc(state)}"><i class="fas ${icon}"></i> ${LD_STATE_LABEL[state]}</span>`;
}

function dlDocLabel(type) {
  const t = ((dealRulesCache || {}).doc_types || []).find(x => x.type === type);
  return t ? t.label : type;
}
function dlDocHint(type) {
  const t = ((dealRulesCache || {}).doc_types || []).find(x => x.type === type);
  return t ? t.hint : '';
}
/* image/* lets phones offer the camera as well as the gallery. */
function dlDocAccept() {
  return 'image/*,application/pdf,.pdf';
}

/* Gets a chosen document ready to upload. Phone photos of an RC or a
   policy are often 5 to 20 MB, sometimes HEIC (iPhone), and sometimes
   named .jpg when they're something else. Every photo the browser can open
   is redrawn as a JPEG of at most 2400 px on its long side (sharp enough
   to read, usually under 1.5 MB). PDFs go as they are.
   Resolves to { file } or { error }. */
const DL_DOC_MAX_SIDE = 2400;
async function dlPrepareDocFile(file) {
  const rules = dealRulesCache || {};
  const maxBytes = (rules.doc_max_mb || 8) * 1024 * 1024;
  const name = file.name || 'document';
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  if (isPdf) {
    if (file.size > maxBytes) return { error: `This PDF is too big. Files can be up to ${rules.doc_max_mb || 8} MB. Try a smaller scan, or a photo of the page.` };
    return { file: ext === 'pdf' ? file : new File([file], name + '.pdf', { type: 'application/pdf' }) };
  }
  const isHeic = /hei[cf]/.test(file.type) || ext === 'heic' || ext === 'heif';
  const looksImage = (file.type || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
  if (!looksImage) return { error: 'Upload a photo (JPG, PNG or WEBP) or a PDF.' };
  let bmp = null;
  try { bmp = await createImageBitmap(file); } catch { bmp = null; }
  if (!bmp) {
    if (isHeic) return { error: 'This photo is in HEIC format, which this browser can’t convert. Take a screenshot of it, or set the camera to “Most compatible” (JPG), and upload that.' };
    if (file.size > maxBytes) return { error: `That file is too big. Files can be up to ${rules.doc_max_mb || 8} MB.` };
    return { file };   // let the server decide what it is
  }
  const small = file.size <= 1.5 * 1024 * 1024 && Math.max(bmp.width, bmp.height) <= DL_DOC_MAX_SIDE
    && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (small) { bmp.close && bmp.close(); return { file }; }
  const scale = Math.min(1, DL_DOC_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // transparent PNGs: white, not black
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) return file.size <= maxBytes ? { file } : { error: `That file is too big. Files can be up to ${rules.doc_max_mb || 8} MB.` };
  if (blob.size > maxBytes) return { error: `That photo is too big even after shrinking it. Files can be up to ${rules.doc_max_mb || 8} MB.` };
  const base = name.replace(/\.[^.]*$/, '') || 'document';
  return { file: new File([blob], base + '.jpg', { type: 'image/jpeg' }) };
}

/* A clear message for a failed upload. */
function dlUploadErrorText(err) {
  const m = (err && err.message) || '';
  if (/\(413\)/.test(m)) return `That file is too big. Files can be up to ${(dealRulesCache || {}).doc_max_mb || 8} MB.`;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'The upload didn’t reach DealBriz. Check your internet connection and try again.';
  return m || 'Upload failed. Please try again.';
}

/* ---------- Sell form ---------- */
// create: { mode, files: {type: File} }
// edit:   { mode, pid, cat, view, busy }
let sellDocsState = { mode: 'create', files: {} };

/* "Offer EMI option" (under the categories) is ticked and visible here. */
function sellEmiOn() {
  const cb = document.getElementById('sellEmiEligible');
  if (!cb || !cb.checked) return false;
  return typeof emiVisibleHere !== 'function' || emiVisibleHere();
}

function sellDocsIsVehicle(cat) {
  return ((dealRulesCache || {}).vehicle_categories || ['cars', 'bikes']).includes(cat);
}

/* What the form asks for in create mode, for the chosen category. */
function sellDocsNeeded(cat) {
  const ld = (dealRulesCache || {}).listing_docs || { vehicle: [], vehicle_loan_extra: [], other: [] };
  if (sellDocsIsVehicle(cat)) {
    return [...(ld.vehicle || [])];
  }
  return [...(ld.other || [])];
}

function sellDocsSection(show, title) {
  const sec = document.getElementById('sellDocs');
  if (!sec) return null;
  sec.classList.toggle('hidden', !show);
  if (title) {
    const h = sec.querySelector('h3');
    if (h) h.innerHTML = `<span class="sell-step"><i class="fas fa-file-shield"></i></span> ${dlEsc(title)}`;
  }
  return document.getElementById('sellDocsBody');
}

function sellDocsReset() {
  sellDocsState = { mode: 'create', files: {} };
  sellDocsSection(false);
  const body = document.getElementById('sellDocsBody');
  if (body) body.innerHTML = '';
}

const SELL_DOCS_PRIVACY = () => `<p class="deal-small"><i class="fas fa-lock"></i> Private: never shown on the ad. Only DealBriz’s superadmin and the lender can open them. A photo or a PDF, up to ${(dealRulesCache || {}).doc_max_mb || 8} MB each (large photos are shrunk for you).</p>`;

async function sellDocsRender() {
  await dlRules();
  const cat = typeof selectedSellCat !== 'undefined' ? selectedSellCat : '';
  if (sellDocsState.mode === 'edit') {
    // Category changed while editing: the documents follow once it's saved.
    if (cat === sellDocsState.cat) { sellDocsRenderEdit(); return; }
    if (!sellDocsIsVehicle(cat) || !sellEmiOn()) { sellDocsSection(false); return; }
    const body = sellDocsSection(true, 'Vehicle documents');
    if (body) body.innerHTML = `<p class="deal-small"><i class="fas fa-circle-info"></i> Save your changes first. The documents for this category show here after that.</p>`;
    return;
  }
  const vehicle = sellDocsIsVehicle(cat);
  const need = cat ? sellDocsNeeded(cat) : [];
  // Asked only when the seller offers EMI.
  if (!cat || (!vehicle && !need.length) || !sellEmiOn()) { sellDocsSection(false); return; }
  const body = sellDocsSection(true, vehicle ? 'Vehicle documents' : 'Your documents');
  if (!body) return;
  const accept = dlDocAccept();
  const rows = need.map(type => {
    const f = sellDocsState.files[type];
    return `
      <li class="deal-doc ${f ? 'deal-doc-row-ready' : 'deal-doc-row-missing'}">
        <div class="deal-doc-main">
          <div class="deal-doc-name">${dlEsc(dlDocLabel(type))}</div>
          ${f ? `<div class="deal-doc-hint"><i class="fas fa-paperclip"></i> ${dlEsc(f.name)}</div>`
              : `<div class="deal-doc-hint">${dlEsc(dlDocHint(type))}</div>`}
          ${!f && (sellDocsState.errors || {})[type] ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(sellDocsState.errors[type])}</div>` : ''}
        </div>
        <div class="deal-doc-side">
          <span class="deal-doc-status ${f ? 'deal-doc-uploaded' : 'deal-doc-missing'}">${f ? 'Ready' : 'Not added'}</span>
          <div class="deal-doc-actions">
            <label class="deal-btn deal-btn-sm ${f ? '' : 'deal-btn-primary'}">
              <i class="fas fa-paperclip"></i> ${f ? 'Change' : 'Choose file'}
              <input type="file" accept="${accept}" class="deal-file sell-doc-file" onchange="sellDocsPick('${dlEsc(type)}', this)">
            </label>
            ${f ? `<button type="button" class="deal-btn deal-btn-sm deal-btn-quiet" onclick="sellDocsUnpick('${dlEsc(type)}')" aria-label="Remove">Remove</button>` : ''}
          </div>
        </div>
      </li>`;
  }).join('');
  body.innerHTML = `
    <p class="sell-docs-intro">You’re offering EMI, so add the ${cat === 'bikes' ? 'bike' : 'vehicle'}’s RC and insurance policy. They upload when you post the ad and are checked once by DealBriz or the lender. A buyer’s deal can only lock after they’re verified.</p>
    <ul class="deal-doc-list">${rows}</ul>
    ${SELL_DOCS_PRIVACY()}`;
}

async function sellDocsPick(type, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  await dlRules();
  const prep = await dlPrepareDocFile(file);
  sellDocsState.errors = { ...(sellDocsState.errors || {}), [type]: prep.error || null };
  if (prep.error) { showToast(prep.error, 'error'); sellDocsRender(); return; }
  sellDocsState.files[type] = prep.file;
  sellDocsRender();
}

function sellDocsUnpick(type) {
  delete sellDocsState.files[type];
  sellDocsRender();
}

/* Create mode: what still stops the ad being posted, or null. */
function sellDocsProblem() {
  if (sellDocsState.mode !== 'create') return null;
  const cat = typeof selectedSellCat !== 'undefined' ? selectedSellCat : '';
  if (!cat || !dealRulesCache) return null;
  const vehicle = sellDocsIsVehicle(cat);
  const need = sellDocsNeeded(cat);
  if ((!vehicle && !need.length) || !sellEmiOn()) return null;
  const missing = need.filter(t => !sellDocsState.files[t]);
  if (missing.length) {
    return `Add ${missing.length === 1 ? 'this document' : 'these documents'}: ${missing.map(dlDocLabel).join(', ')}.`;
  }
  return null;
}

function sellDocsLoanAnswer() {
  // The "had a loan" question was removed (22 Oct 2026): nothing to send.
  return null;
}

/* Right after the ad is saved. A failed upload doesn't undo the post: the
   seller adds what's missing from My Listings, Edit listing. */
async function sellDocsUploadAfterCreate(pid) {
  if (sellDocsState.mode !== 'create') return;
  const cat = typeof selectedSellCat !== 'undefined' ? selectedSellCat : '';
  const need = cat && sellEmiOn() ? sellDocsNeeded(cat) : [];
  const files = need.map(t => [t, sellDocsState.files[t]]).filter(([, f]) => f);
  if (!files.length) return;
  const failed = [];
  for (const [type, file] of files) {
    try { await listingDocsApi.upload(pid, type, file); }
    catch (err) { failed.push([type, dlUploadErrorText(err)]); console.warn('Listing document upload failed', type, err); }
  }
  if (failed.length) {
    const names = failed.map(([t]) => dlDocLabel(t)).join(', ');
    showToast(`Your ad is live, but ${names} didn’t upload (${failed[0][1]}). Add ${failed.length === 1 ? 'it' : 'them'} from My Listings, Add documents.`, 'error');
  }
}

/* Edit mode: everything comes from the server and saves at once. */
async function sellDocsLoadForEdit(pid, viaAdmin = false) {
  sellDocsState = { mode: 'edit', pid, cat: typeof selectedSellCat !== 'undefined' ? selectedSellCat : '', view: null, busy: null };
  if (viaAdmin) { sellDocsSection(false); return; }   // staff check them from the Deals section
  await dlRules();
  let view;
  try { view = await listingDocsApi.get(pid); }
  catch (err) { sellDocsSection(false); return; }
  if (!sellDocsState || sellDocsState.pid !== pid) return;
  sellDocsState.view = view;
  sellDocsRenderEdit();
}

function sellDocsRenderEdit() {
  const v = sellDocsState.view;
  if (!v || !v.needs_docs) { sellDocsSection(false); return; }
  // Shown when the listing offers EMI, or when a deal on it needs them.
  if (!sellEmiOn() && !v.deal_status) { sellDocsSection(false); return; }
  const vehicle = sellDocsIsVehicle(v.category);
  const body = sellDocsSection(true, vehicle ? 'Vehicle documents' : 'Your documents');
  if (!body) return;
  const s = v.summary || {};
  const canUpload = !!v.can_upload;
  const accept = dlDocAccept();
  const head = {
    needed: `<div class="ld-summary ld-summary-needed"><i class="fas fa-circle-exclamation"></i> <strong>Documents needed</strong>
               <span>${s.uploaded || 0} of ${s.needed || 0} uploaded${s.rejected ? `, ${s.rejected} to upload again` : ''}. A deal on this ${vehicle ? 'vehicle' : 'listing'} can only lock once they’re all verified.</span></div>`,
    checking: `<div class="ld-summary ld-summary-checking"><i class="fas fa-hourglass-half"></i> <strong>Documents being checked</strong>
               <span>${s.approved || 0} of ${s.needed || 0} verified. DealBriz or the lender checks them soon.</span></div>`,
    verified: `<div class="ld-summary ld-summary-verified"><i class="fas fa-circle-check"></i> <strong>Documents verified</strong>
               <span>Buyers can lock a deal on this ${vehicle ? 'vehicle' : 'listing'}.</span></div>`,
  }[s.state] || '';
  const rows = (v.documents || []).map(item => {
    const doc = item.document;
    const st = item.status;
    const busy = sellDocsState.busy === item.type;
    let actions = '';
    if (canUpload && item.required) {
      actions = busy
        ? `<span class="deal-small"><i class="fas fa-spinner fa-spin"></i> Uploading...</span>`
        : `<label class="deal-btn deal-btn-sm ${st === 'missing' || st === 'rejected' ? 'deal-btn-primary' : ''}">
             <i class="fas fa-upload"></i> ${st === 'missing' ? 'Upload' : 'Replace'}
             <input type="file" accept="${accept}" class="deal-file sell-doc-file" onchange="sellDocsUploadEdit('${dlEsc(item.type)}', this)">
           </label>`;
    }
    return `
      <li class="deal-doc deal-doc-row-${dlEsc(st)}${item.required ? '' : ' is-extra'}">
        <div class="deal-doc-main">
          <div class="deal-doc-name">${dlEsc(item.label)}${item.required ? '' : ' <small>(not needed now)</small>'}</div>
          ${st !== 'approved' && canUpload ? `<div class="deal-doc-hint">${dlEsc(item.hint)}</div>` : ''}
          ${doc && doc.file_name && st !== 'rejected' ? `<div class="deal-doc-hint"><i class="fas fa-paperclip"></i> ${dlEsc(doc.file_name)}</div>` : ''}
          ${st === 'rejected' && doc && doc.reject_reason ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(doc.reject_reason)}</div>` : ''}
          ${(sellDocsState.errors || {})[item.type] ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(sellDocsState.errors[item.type])}</div>` : ''}
        </div>
        <div class="deal-doc-side"><span class="deal-doc-status deal-doc-${dlEsc(st)}">${dlEsc(DOC_STATUS_LABEL[st] || st)}</span>
          <div class="deal-doc-actions">${actions}</div></div>
      </li>`;
  }).join('');
  body.innerHTML = `
    ${head}
    ${v.frozen ? '<p class="deal-small"><i class="fas fa-lock"></i> A deal on this listing is locked, so its documents can’t be changed now.</p>' : ''}
    <ul class="deal-doc-list">${rows}</ul>
    <p class="deal-small"><i class="fas fa-circle-info"></i> Each file saves as soon as you choose it. You don’t need to press Save Changes for documents.</p>
    ${SELL_DOCS_PRIVACY()}`;
}

async function sellDocsUploadEdit(type, input) {
  const file = input.files && input.files[0];
  input.value = '';
  const st = sellDocsState;
  if (!file || st.mode !== 'edit' || !st.view) return;
  const row = (st.view.documents || []).find(x => x.type === type);
  if (row && row.status === 'approved' && !(await dlAsk({
    tone: 'warn', title: 'Replace a verified document?',
    body: `<p><strong>${dlEsc(row.label)}</strong> is already verified. The new file has to be checked again, and a deal on this listing can’t lock until it is.</p>`,
    ok: 'Replace document', cancel: 'Keep current',
  }))) return;
  const pid = st.pid;
  st.busy = type;
  st.errors = { ...(st.errors || {}), [type]: null };
  sellDocsRenderEdit();
  let error = null;
  try {
    await dlRules();
    const prep = await dlPrepareDocFile(file);
    if (prep.error) throw new Error(prep.error);
    const v = await listingDocsApi.upload(pid, type, prep.file);
    if (sellDocsState.pid === pid) sellDocsState.view = v;
    showToast('Uploaded. It will be checked soon.', 'success');
  } catch (err) {
    error = dlUploadErrorText(err);
    showToast(error, 'error');
  }
  if (sellDocsState.pid === pid) {
    sellDocsState.busy = null;
    sellDocsState.errors = { ...(sellDocsState.errors || {}), [type]: error };
    sellDocsRenderEdit();
  }
}

/* My Listings "Add documents": the Edit listing form, at its documents. */
async function dlGoToListingDocsFromMyListings(pid) {
  if (!pid || typeof editListing !== 'function') return;
  await editListing(pid);
  const sec = document.getElementById('sellDocs');
  if (sec && !sec.classList.contains('hidden')) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* From a deal sheet: close it, then the same. */
async function dlGoToListingDocs(pid) {
  if (!pid) return;
  if (modalStack.includes('deal')) await dlCloseModalThen('deal');
  dlGoToListingDocsFromMyListings(pid);
}

/* ---------- Staff: queue and review ---------- */
const ldQueue = { open: false, adminState: 'checking', lenderState: 'checking', rows: [] };

const LD_QUEUE_FILTERS = [
  ['checking', 'To check'],
  ['needed', 'Waiting for the seller'],
  ['verified', 'Verified'],
  ['all', 'All'],
];

function ldToggleQueue() {
  ldQueue.open = !ldQueue.open;
  const box = document.getElementById('adminListingDocs');
  const table = document.getElementById('adminDealsTableArea');
  const btn = document.getElementById('adminListingDocsBtn');
  if (box) box.classList.toggle('hidden', !ldQueue.open);
  if (table) table.classList.toggle('hidden', ldQueue.open);
  if (btn) {
    btn.classList.toggle('active', ldQueue.open);
    btn.innerHTML = ldQueue.open
      ? '<i class="fas fa-arrow-left"></i> Back to deals'
      : '<i class="fas fa-file-shield"></i> Listing documents';
  }
  if (ldQueue.open) ldShowQueue(ldQueue.adminState);
}

async function ldShowQueue(state, ctx = 'admin') {
  if (ctx === 'lender') { ldQueue.lenderState = state; lenderRefresh(); return; }
  ldQueue.adminState = state;
  const box = document.getElementById('adminListingDocs');
  if (!box) return;
  box.innerHTML = DL_LOADING;
  try { ldQueue.rows = (await listingDocsApi.queue(state)).rows || []; }
  catch (err) { box.innerHTML = `<div class="empty-state"><p>${dlEsc(err.message || 'Could not load.')}</p></div>`; return; }
  box.innerHTML = ldQueueHtml('admin', state);
}

function ldQueueHtml(ctx, state) {
  const rows = ldQueue.rows || [];
  const filters = `
    <div class="admin-filters">
      ${LD_QUEUE_FILTERS.map(([v, l]) => `<button class="admin-filter-btn ${v === state ? 'active' : ''}" onclick="ldShowQueue('${v}','${ctx}')">${l}</button>`).join('')}
    </div>
    <p class="deal-small ld-queue-note">Seller documents on car and bike listings. Checked once, they count for every deal on the listing. Listings with a deal waiting on them come first.</p>`;
  if (!rows.length) {
    return filters + `<div class="empty-state"><i class="fas fa-file-shield"></i><h3>Nothing here</h3><p>${state === 'checking' ? 'No listing documents are waiting for a check.' : 'No listings in this list.'}</p></div>`;
  }
  return filters + ldQueueTableHtml(rows, ctx);
}

function ldQueueTableHtml(rows, ctx) {
  const stateCell = (r) => {
    const s = r.summary || {};
    if (s.state === 'verified') return `<span class="ld-badge ld-badge-verified"><i class="fas fa-circle-check"></i> Verified</span>`;
    if (s.state === 'checking') return `<span class="ld-badge ld-badge-checking">Waiting for a check</span><br><small>${s.to_check} to check</small>`;
    return `<span class="ld-badge ld-badge-needed">Waiting for the seller</span><br><small>${s.uploaded} of ${s.needed} uploaded${s.to_check ? ` · ${s.to_check} to check` : ''}</small>`;
  };
  return `
    <div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th>Listing</th><th>Seller</th><th>Documents</th><th>Deal</th><th>Waiting since</th><th></th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td><div class="admin-product-cell"><img src="${dlEsc(toAbsoluteUrl(r.product?.image_url || ''))}" alt="" onerror="this.style.display='none'"><span>${dlEsc(r.product?.title || '—')}</span></div>
            <small>${dlRupees(r.product?.price)}${r.product?.status && r.product.status !== 'active' ? ` · ${dlEsc(r.product.status)}` : ''}</small></td>
          <td>${dlEsc(r.seller?.name || '—')}<br><small>${dlEsc(r.seller?.phone || '')}</small></td>
          <td>${stateCell(r)}</td>
          <td>${r.deal_status ? dealPill(r.deal_status) : '<small>None</small>'}</td>
          <td><small>${r.waiting_since ? dlEsc(dlWhen(r.waiting_since)) : '—'}</small></td>
          <td><button class="btn-sm btn-sm-blue" onclick="ldOpenReview('${dlEsc(r.product?.id || '')}','${ctx}')">Open</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}

async function ldOpenReview(pid, ctx = 'admin') {
  const content = dlOpenAdminModal(DL_LOADING);
  let v;
  try { v = await listingDocsApi.get(pid); await dlRules(); }
  catch (err) {
    content.innerHTML = `<div style="text-align:center;padding:60px 20px">${dlEsc(err.message || 'Could not load these documents.')}</div>`;
    return;
  }
  ldRenderReview(v, ctx);
}

function ldRenderReview(v, ctx) {
  const row = (ldQueue.rows || []).find(r => r.product && r.product.id === v.product_id);
  const s = v.summary || {};
  const stateWord = { verified: 'Verified', checking: 'Being checked', needed: 'Documents needed', none: 'Not needed' }[s.state] || s.state;
  const docs = v.documents || [];
  const rows = docs.map(item => {
    const doc = item.document;
    const st = item.status;
    let actions = '';
    if (doc && !doc.file_deleted && v.can_view_files) {
      actions += `<button class="btn-sm" onclick="ldViewDoc('${dlEsc(v.product_id)}','${dlEsc(doc.id)}')"><i class="fas fa-eye"></i> View</button>`;
    }
    if (v.can_review && doc && st === 'uploaded') {
      actions += ` <button class="btn-sm btn-sm-blue" onclick="ldReview('${dlEsc(v.product_id)}','${dlEsc(doc.id)}','approve','${ctx}')">Approve</button>
                   <button class="btn-sm btn-sm-red" onclick="ldReview('${dlEsc(v.product_id)}','${dlEsc(doc.id)}','reject','${ctx}')">Reject</button>`;
    }
    return `
      <li class="deal-doc">
        <div class="deal-doc-main">
          <div class="deal-doc-name">${dlEsc(item.label)}${item.required ? '' : ' <small>(not needed now)</small>'}</div>
          ${doc ? `<div class="deal-doc-hint">${dlEsc(doc.file_name || '')} · ${dlEsc(dlWhen(doc.uploaded_at))}${doc.file_deleted && st !== 'rejected' ? ' · file deleted' : ''}${doc.checked_by_lender && st === 'approved' ? ' · checked by the lender' : ''}</div>` : ''}
          ${st === 'rejected' && doc && doc.reject_reason ? `<div class="deal-doc-reason"><i class="fas fa-circle-exclamation"></i> ${dlEsc(doc.reject_reason)}</div>` : ''}
        </div>
        <div class="deal-doc-side"><span class="deal-doc-status deal-doc-${dlEsc(st)}">${dlEsc(DOC_STATUS_LABEL[st] || st)}</span>
          <div class="deal-doc-actions">${actions}</div></div>
      </li>`;
  }).join('');
  dlOpenAdminModal(`
    <div class="pm-body" style="padding-top:20px">
      <div class="staff-mod-bar"><span><i class="fas fa-file-shield"></i> Listing documents</span><strong class="ld-state ld-state-${dlEsc(s.state)}">${dlEsc(stateWord)}</strong></div>
      <h2 class="pm-title" style="margin-bottom:4px">${dlEsc(v.title || 'Listing')}</h2>
      <div class="pm-meta">${row && row.seller ? `Seller: ${dlEsc(row.seller.name || '—')}${row.seller.phone ? ` · ${dlEsc(row.seller.phone)}` : ''} · ` : ''}${s.approved || 0} of ${s.needed || 0} verified${v.deal_status ? ` · Deal: ${dealPill(v.deal_status)}` : ''}</div>
      <div class="admin-detail-section">
        ${v.frozen ? '<p class="deal-small"><i class="fas fa-lock"></i> A deal on this listing is locked: these documents can’t change now.</p>' : ''}
        ${docs.length ? `<ul class="deal-doc-list deal-doc-review">${rows}</ul>` : '<p class="deal-small">Nothing uploaded yet.</p>'}
        ${v.can_review ? '<p class="deal-small">Check each file: the RC is for this vehicle and in the seller’s name, and the insurance policy is valid for this vehicle. Your decision counts for every deal on this listing.</p>'
          : '<p class="deal-small"><i class="fas fa-lock"></i> Only a superadmin or a lender that funds this kind of loan can open and check these files.</p>'}
      </div>
    </div>`);
}

async function ldReview(pid, docId, decision, ctx) {
  let reason = '';
  if (decision === 'reject') {
    reason = (prompt('What is wrong with it? The seller sees this and uploads it again.') || '').trim();
    if (!reason) return;
  }
  try {
    const v = await listingDocsApi.review(pid, docId, decision, reason);
    showToast(v.summary && v.summary.state === 'verified' ? 'All documents on this listing are verified.'
      : (decision === 'approve' ? 'Verified.' : 'Sent back to the seller.'), 'success');
    ldRenderReview(v, ctx);
  } catch (err) {
    showToast(err.message || 'That didn’t work.', 'error');
    ldOpenReview(pid, ctx);
  }
  // Keep the list behind the modal current.
  if (ctx === 'lender') { if (lenderState.tab === 'deals') lenderRefresh(); }
  else if (ldQueue.open) ldShowQueue(ldQueue.adminState);
}

/* Same as dlViewDoc, for a listing's file. */
async function ldViewDoc(pid, docId) {
  const w = window.open('about:blank', '_blank');
  try { await apiFetch('/auth/me'); } catch { /* the file request will say what's wrong */ }
  const url = listingDocsApi.fileUrl(pid, docId);
  if (w) { try { w.opener = null; } catch { /* ignore */ } w.location.href = url; }
  else window.location.href = url;
}
