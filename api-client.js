/* =====================================================
   DealBriz — Flask API Client
   Mirrors the same db.* function names as the old
   supabase-client.js, so app.js needs minimal changes.
   ===================================================== */

/* API location.
   Set window.DEALBRIZ_API_ORIGIN before this script loads (see the
   inline config block in index.html) to point at a different backend
   without editing this file. Falls back to same-origin when served
   behind one domain (the Docker/nginx setup), then to localhost for
   plain local development. */
const API_ORIGIN =
  (typeof window !== "undefined" && window.DEALBRIZ_API_ORIGIN) ||
  (typeof location !== "undefined" && location.protocol.startsWith("http")
    ? location.origin
    : "http://127.0.0.1:5000");
const API_BASE = `${API_ORIGIN}/api`;

// Converts a relative path like "/uploads/xyz.jpg" (returned by Flask) into
// a full URL pointing at the Flask server, since the frontend may be served
// from a different port/origin (e.g. Live Server on :5500 vs Flask on :5000).
function toAbsoluteUrl(path) {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Inverse of toAbsoluteUrl. Image URLs get absolutised for display, so when
// an existing image is saved back (e.g. editing a listing without replacing
// its photos) we must strip the origin again — otherwise the DB ends up
// storing "http://127.0.0.1:5000/uploads/x.jpg", which breaks as soon as the
// app is served from a real domain. Only our own origin is stripped;
// genuinely external URLs are left alone.
function toRelativeUrl(url) {
  if (!url) return url;
  if (url.startsWith(API_ORIGIN)) return url.slice(API_ORIGIN.length) || "/";
  return url;
}

/* ============================================================
   SESSION HANDLING

   The token lives in an httpOnly cookie the browser sends automatically.
   It is deliberately NOT in localStorage: anything in localStorage is
   readable by any script on the page, so one XSS hole anywhere becomes
   full account takeover. An httpOnly cookie cannot be read by JavaScript
   at all.

   The cost of cookies is CSRF — a hostile site can cause the browser to
   send them. The server issues a double-submit CSRF token in a readable
   cookie, which we echo back in a header. A hostile site cannot read that
   cookie (same-origin policy), so it cannot forge the header.
   ============================================================ */

function readCookie(name) {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

// Set by flask-jwt-extended alongside the httpOnly token cookie.
function csrfToken(forRefresh = false) {
  return readCookie(forRefresh ? "csrf_refresh_token" : "csrf_access_token");
}

let refreshInFlight = null;

/* Swaps the refresh token for a new access token. Shared promise so that
   ten requests failing at once trigger one refresh, not ten. */
async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-TOKEN": csrfToken(true) || "" },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all see this result.
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

async function apiFetch(path, { method = "GET", body, isForm = false, _retry = false } = {}) {
  const headers = {};
  if (!isForm && body) headers["Content-Type"] = "application/json";
  // Only state-changing methods need the CSRF header.
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers["X-CSRF-TOKEN"] = token;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",     // sends the httpOnly session cookies
    body: isForm ? body : body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  // An expired access token is normal — they last 30 minutes. Refresh once
  // and retry, so a user is never logged out mid-action. Never retry the
  // refresh route itself, or a dead session loops forever.
  if (res.status === 401 && !_retry && !path.startsWith("/auth/refresh")
      && !path.startsWith("/auth/login")) {
    if (await refreshSession()) {
      return apiFetch(path, { method, body, isForm, _retry: true });
    }
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

const db = {

  /* ============ AUTH ============ */

  async signUp({ firstName, lastName, email, phone, city, password }) {
    return apiFetch("/auth/signup", {
      method: "POST",
      body: { first_name: firstName, last_name: lastName, email, phone, city, password }
    });
  },

  async logIn({ email, password }) {
    // The server sets httpOnly cookies; nothing is returned for us to store.
    return apiFetch("/auth/login", { method: "POST", body: { email, password } });
  },

  async logOut() {
    // The server revokes the session AND clears the cookies. There is
    // nothing left for us to delete client-side — which is the point.
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Revocation failing must not trap the user in a logged-in state.
    }
  },

  async logOutEverywhere() {
    return apiFetch("/auth/logout-all", { method: "POST" });
  },

  async getMySessions() {
    return apiFetch("/auth/sessions");
  },

  async getCurrentSession() {
    // The session cookie is httpOnly, so we cannot inspect it. The CSRF
    // cookie is readable and is set alongside it, which makes it a
    // reliable "is there a session?" signal without a network call.
    return csrfToken() ? { user: { id: null } } : null;
  },

  async getCurrentProfile() {
    // Ask the server rather than trusting a local flag. If the cookie has
    // expired or been revoked, apiFetch tries a refresh first and only
    // then gives up.
    try {
      const user = await apiFetch("/auth/me");
      return { ...user, avatar_url: toAbsoluteUrl(user.avatar_url) };
    } catch {
      return null;
    }
  },

  async updateProfile(updates) {
    const payload = {};
    if (updates.first_name !== undefined) payload.first_name = updates.first_name;
    if (updates.last_name !== undefined) payload.last_name = updates.last_name;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.city !== undefined) payload.city = updates.city;
    return apiFetch("/profile", { method: "PUT", body: payload });
  },

  async changePassword(currentPassword, newPassword) {
    return apiFetch("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword }
    });
  },

  async uploadAvatar(file) {
    const form = new FormData();
    form.append("file", file);
    const data = await apiFetch("/profile/avatar", { method: "POST", body: form, isForm: true });
    return toAbsoluteUrl(data.avatar_url);
  },

  // Clears the profile picture. The UI falls back to drawn initials, so
  // there is always something to render.
  async removeAvatar() {
    return apiFetch("/profile/avatar", { method: "DELETE" });
  },

  /* ============ PROFILE LOOKUP (for chat) ============ */

  async getProfileById(id) {
    const user = await apiFetch(`/users/${id}`);
    return { ...user, avatar_url: toAbsoluteUrl(user.avatar_url) };
  },

  /* ============ BUY (paginated + filtered listing, single product) ============ */

  async getProducts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.condition) params.set("condition", filters.condition);
    if (filters.search) params.set("search", filters.search);
    if (filters.minPrice != null) params.set("min_price", filters.minPrice);
    if (filters.maxPrice != null) params.set("max_price", filters.maxPrice);
    if (filters.pincode) params.set("pincode", filters.pincode);
    if (filters.near) params.set("near", filters.near);
    if (filters.emiOnly) params.set("emi_only", "true");
    if (filters.sort) params.set("sort", filters.sort);
    params.set("page", filters.page || 1);
    params.set("per_page", filters.perPage || 30);

    const data = await apiFetch(`/buy?${params.toString()}`);
    // map Flask's field names to what app.js's normalizeListing() expects,
    // keeping the pagination metadata alongside the mapped items
    return {
      items: data.items.map(mapProductFromApi),
      page: data.page, perPage: data.per_page, total: data.total, totalPages: data.total_pages
    };
  },

  async searchProducts(query, filters = {}) {
    const params = new URLSearchParams();
    params.set("q", query);
    if (filters.category) params.set("category", filters.category);
    params.set("page", filters.page || 1);
    params.set("per_page", filters.perPage || 30);
    const data = await apiFetch(`/buy/search?${params.toString()}`);
    return {
      items: data.items.map(mapProductFromApi),
      page: data.page, perPage: data.per_page, total: data.total, totalPages: data.total_pages
    };
  },

  async getProductById(id) {
    const row = await apiFetch(`/buy/${id}`);
    return mapProductFromApi(row);
  },

  async incrementProductViews(id) {
    return apiFetch(`/buy/${id}/view`, { method: "POST" });
  },

  /* ============ SELL (create listing, image upload) ============ */

  async createProduct(product) {
    const row = await apiFetch("/sell", { method: "POST", body: mapProductToApiPayload(product) });
    return mapProductFromApi(row);
  },

  async uploadProductImage(file) {
    const form = new FormData();
    form.append("file", file);
    const data = await apiFetch("/sell/upload-image", { method: "POST", body: form, isForm: true });
    return toAbsoluteUrl(data.url);
  },

  /* ============ MY LISTINGS (own listings, any status; edit; mark sold) ============ */

  async getMyListings() {
    const rows = await apiFetch("/my-listings");
    return rows.map(mapProductFromApi);
  },

  async updateMyListing(id, updates) {
    const row = await apiFetch(`/my-listings/${id}`, { method: "PUT", body: mapProductToApiPayload(updates) });
    return mapProductFromApi(row);
  },

  async getFeaturePlans() {
    return apiFetch("/my-listings/plans");
  },

  async featureListing(id, plan) {
    const row = await apiFetch(`/my-listings/${id}/feature`, { method: "POST", body: { plan } });
    return mapProductFromApi(row);
  },

  async unfeatureListing(id) {
    const row = await apiFetch(`/my-listings/${id}/feature`, { method: "DELETE" });
    return mapProductFromApi(row);
  },

  async sellMyListing(id, buyerEmail = "") {
    return apiFetch(`/my-listings/${id}/sell`, { method: "POST", body: { buyer_email: buyerEmail } });
  },

  // Undoes an accidental "Mark Sold": relists the item and deletes the
  // purchase record, so sales history doesn't keep counting a sale that
  // never happened.
  async unsellMyListing(id) {
    return apiFetch(`/my-listings/${id}/unsell`, { method: "POST" });
  },

  /* ============ SAVED PRODUCTS ============ */

  async getSavedProducts() {
    const rows = await apiFetch("/saved");
    return rows.map(mapProductFromApi);
  },

  async saveProduct(productId) {
    return apiFetch(`/saved/${productId}`, { method: "POST" });
  },

  async unsaveProduct(productId) {
    return apiFetch(`/saved/${productId}`, { method: "DELETE" });
  },

  /* ============ EMI APPLICATIONS ============ */

  async submitEmiApplication(application) {
    // The snapshot image comes from an already-absolutised listing image, so
    // strip the origin before storing — same reason as mapProductToApiPayload.
    const body = { ...application };
    if (body.product_image_snapshot !== undefined) {
      body.product_image_snapshot = toRelativeUrl(body.product_image_snapshot);
    }
    return apiFetch("/emi", { method: "POST", body });
  },

  async getMyEmiApplications() {
    const rows = await apiFetch("/emi/mine");
    return rows.map(mapEmiFromApi);
  },

  async getAllEmiApplications(includeArchived = false) {
    const qs = includeArchived ? "?include_archived=true" : "";
    const rows = await apiFetch(`/admin/emi${qs}`);
    // shape "profiles" sub-object the same way app.js's admin table expects
    return rows.map(r => ({ ...mapEmiFromApi(r), profiles: null, applicant_email: r.applicant_email }));
  },

  async updateEmiStatus(id, status) {
    return apiFetch(`/admin/emi/${id}`, { method: "PUT", body: { status } });
  },

  async adminArchiveEmi(id, archived = true) {
    return apiFetch(`/admin/emi/${id}/archive`, { method: "POST", body: { archived } });
  },

  async adminDeleteEmi(id) {
    return apiFetch(`/admin/emi/${id}`, { method: "DELETE" });
  },

  async adminGetEmiApplication(id) {
    return mapEmiFromApi(await apiFetch(`/admin/emi/${id}`));
  },

  async adminUpdateEmi(id, updates) {
    return apiFetch(`/admin/emi/${id}`, { method: "PUT", body: updates });
  },

  /* ============ SELLER REPORTS ============ */

  async submitReport({ reportedUserId, productId, reason, details }) {
    return apiFetch("/reports", {
      method: "POST",
      body: { reported_user_id: reportedUserId, product_id: productId, reason, details }
    });
  },

  async adminGetReports(status = "all") {
    const qs = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
    return apiFetch(`/admin/reports${qs}`);
  },

  async adminUpdateReport(rid, updates) {
    return apiFetch(`/admin/reports/${rid}`, { method: "PUT", body: updates });
  },

  async adminSuspendUser(uid, suspended, reason = "") {
    return apiFetch(`/admin/users/${uid}/suspend`, { method: "POST", body: { suspended, reason } });
  },

  /* ============ SMART SEARCH ============ */

  async smartSearch(q, { page = 1, per_page = 30, pincode = "" } = {}) {
    const params = new URLSearchParams({ q, page, per_page });
    if (pincode) params.set("pincode", pincode);
    const data = await apiFetch(`/buy/smart-search?${params}`);
    // Same mapping as every other listing endpoint. The raw rows carry
    // "image_url" (often relative), but the cards read the mapped
    // "ai_image_url": unmapped, a search result had no main photo and
    // showed the category icon until it was opened.
    return { ...data, items: (data.items || []).map(mapProductFromApi) };
  },

  async searchSuggest(q) {
    return apiFetch(`/buy/suggest?q=${encodeURIComponent(q)}`);
  },

  async getCategoryAttributes(category) {
    return apiFetch(`/sell/attributes/${encodeURIComponent(category)}`);
  },

  /* ============ LOGS (staff diagnostics) ============ */

  async getLogFiles() {
    return apiFetch("/logs/files");
  },

  async viewLog(key, { limit = 300, level = "", q = "" } = {}) {
    const params = new URLSearchParams({ limit });
    if (level && level !== "ALL") params.set("level", level);
    if (q) params.set("q", q);
    return apiFetch(`/logs/view/${key}?${params}`);
  },

  /* ============ SUPPORT CHATBOT ============ */

  async getChatbotGreeting() {
    return apiFetch("/chatbot/greeting");
  },

  async getUnansweredQuestions(resolved = false) {
    return apiFetch(`/chatbot/unanswered${resolved ? "?resolved=true" : ""}`);
  },

  async resolveUnanswered(id) {
    return apiFetch(`/chatbot/unanswered/${id}/resolve`, { method: "POST" });
  },

  async deleteUnanswered(id) {
    return apiFetch(`/chatbot/unanswered/${id}`, { method: "DELETE" });
  },

  async askChatbot(message, pincode) {
    return apiFetch("/chatbot", { method: "POST", body: { message, pincode } });
  },

  /* ============ LOCATIONS ============ */

  async searchLocations(q = "", limit = 25) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("limit", limit);
    return apiFetch(`/locations/search?${params}`);
  },

  async getLocationStates() {
    return apiFetch("/locations/states");
  },

  async getLocationDistricts(state = "") {
    const qs = state ? `?state=${encodeURIComponent(state)}` : "";
    return apiFetch(`/locations/districts${qs}`);
  },

  async getEmiAvailability({ pincode, district, state } = {}) {
    const params = new URLSearchParams();
    if (pincode) params.set("pincode", pincode);
    if (district) params.set("district", district);
    if (state) params.set("state", state);
    return apiFetch(`/locations/emi-availability?${params}`);
  },

  async adminGetEmiAreas() {
    return apiFetch("/locations/emi-areas");
  },

  async adminCreateEmiArea(payload) {
    return apiFetch("/locations/emi-areas", { method: "POST", body: payload });
  },

  async adminUpdateEmiArea(id, payload) {
    return apiFetch(`/locations/emi-areas/${id}`, { method: "PUT", body: payload });
  },

  async adminDeleteEmiArea(id) {
    return apiFetch(`/locations/emi-areas/${id}`, { method: "DELETE" });
  },

  /* ============ SITE SETTINGS (feature flags) ============ */

  async getSiteSettings() {
    return apiFetch("/settings");
  },

  async updateSiteSetting(key, value) {
    return apiFetch(`/settings/${key}`, { method: "PUT", body: { value } });
  },

  /* ============ HELP CENTRE: FAQs ============ */

  async getFaqs(all = false) {
    return apiFetch(`/faqs${all ? "?all=true" : ""}`);
  },

  async createFaq(payload) {
    return apiFetch("/faqs", { method: "POST", body: payload });
  },

  async updateFaq(id, payload) {
    return apiFetch(`/faqs/${id}`, { method: "PUT", body: payload });
  },

  async deleteFaq(id) {
    return apiFetch(`/faqs/${id}`, { method: "DELETE" });
  },

  /* ============ BLOG ============ */

  async getBlogPosts(all = false) {
    return apiFetch(`/blog${all ? "?all=true" : ""}`);
  },

  async getBlogPost(slug) {
    return apiFetch(`/blog/${slug}`);
  },

  async createBlogPost(payload) {
    return apiFetch("/blog", { method: "POST", body: payload });
  },

  async updateBlogPost(id, payload) {
    return apiFetch(`/blog/${id}`, { method: "PUT", body: payload });
  },

  async deleteBlogPost(id) {
    return apiFetch(`/blog/${id}`, { method: "DELETE" });
  },

  /* ============ REPORT A PROBLEM / CONTACT US ============ */

  async getProblemReasons() {
    return apiFetch("/reports/problem-reasons");
  },

  async submitProblemReport(payload) {
    return apiFetch("/reports/problem", { method: "POST", body: payload });
  },

  /* ============ CHAT (messaging between buyer and seller) ============ */

  /* ============ LEGAL DOCUMENTS ============ */

  async getLegalDoc(key) {
    return apiFetch(`/legal/${key}`);
  },

  async updateLegalDoc(key, content, title) {
    return apiFetch(`/legal/${key}`, { method: "PUT", body: { content, title } });
  },

  /* ============ SMART SEARCH ============ */

  async smartSearch(q, { page = 1, per_page = 30, pincode = "" } = {}) {
    const params = new URLSearchParams({ q, page, per_page });
    if (pincode) params.set("pincode", pincode);
    const data = await apiFetch(`/buy/smart-search?${params}`);
    // Same mapping as every other listing endpoint. The raw rows carry
    // "image_url" (often relative), but the cards read the mapped
    // "ai_image_url": unmapped, a search result had no main photo and
    // showed the category icon until it was opened.
    return { ...data, items: (data.items || []).map(mapProductFromApi) };
  },

  async searchSuggest(q) {
    return apiFetch(`/buy/suggest?q=${encodeURIComponent(q)}`);
  },

  async getCategoryAttributes(category) {
    return apiFetch(`/sell/attributes/${encodeURIComponent(category)}`);
  },

  /* ============ LOGS (staff diagnostics) ============ */

  async getLogFiles() {
    return apiFetch("/logs/files");
  },

  async viewLog(key, { limit = 300, level = "", q = "" } = {}) {
    const params = new URLSearchParams({ limit });
    if (level && level !== "ALL") params.set("level", level);
    if (q) params.set("q", q);
    return apiFetch(`/logs/view/${key}?${params}`);
  },

  /* ============ SUPPORT CHATBOT ============ */

  async getChatbotGreeting() {
    return apiFetch("/chatbot/greeting");
  },

  async getUnansweredQuestions(resolved = false) {
    return apiFetch(`/chatbot/unanswered${resolved ? "?resolved=true" : ""}`);
  },

  async resolveUnanswered(id) {
    return apiFetch(`/chatbot/unanswered/${id}/resolve`, { method: "POST" });
  },

  async deleteUnanswered(id) {
    return apiFetch(`/chatbot/unanswered/${id}`, { method: "DELETE" });
  },

  async askChatbot(message, pincode) {
    return apiFetch("/chatbot", { method: "POST", body: { message, pincode } });
  },

  /* ============ LOCATIONS ============ */

  async searchLocations(q = "", limit = 25) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("limit", limit);
    return apiFetch(`/locations/search?${params}`);
  },

  async getLocationStates() {
    return apiFetch("/locations/states");
  },

  async getLocationDistricts(state = "") {
    const qs = state ? `?state=${encodeURIComponent(state)}` : "";
    return apiFetch(`/locations/districts${qs}`);
  },

  async getEmiAvailability({ pincode, district, state } = {}) {
    const params = new URLSearchParams();
    if (pincode) params.set("pincode", pincode);
    if (district) params.set("district", district);
    if (state) params.set("state", state);
    return apiFetch(`/locations/emi-availability?${params}`);
  },

  async adminGetEmiAreas() {
    return apiFetch("/locations/emi-areas");
  },

  async adminCreateEmiArea(payload) {
    return apiFetch("/locations/emi-areas", { method: "POST", body: payload });
  },

  async adminUpdateEmiArea(id, payload) {
    return apiFetch(`/locations/emi-areas/${id}`, { method: "PUT", body: payload });
  },

  async adminDeleteEmiArea(id) {
    return apiFetch(`/locations/emi-areas/${id}`, { method: "DELETE" });
  },

  /* ============ SITE SETTINGS (feature flags) ============ */

  async getSiteSettings() {
    return apiFetch("/settings");
  },

  async updateSiteSetting(key, value) {
    return apiFetch(`/settings/${key}`, { method: "PUT", body: { value } });
  },

  /* ============ HELP CENTRE: FAQs ============ */

  async getFaqs(all = false) {
    return apiFetch(`/faqs${all ? "?all=true" : ""}`);
  },

  async createFaq(payload) {
    return apiFetch("/faqs", { method: "POST", body: payload });
  },

  async updateFaq(id, payload) {
    return apiFetch(`/faqs/${id}`, { method: "PUT", body: payload });
  },

  async deleteFaq(id) {
    return apiFetch(`/faqs/${id}`, { method: "DELETE" });
  },

  /* ============ BLOG ============ */

  async getBlogPosts(all = false) {
    return apiFetch(`/blog${all ? "?all=true" : ""}`);
  },

  async getBlogPost(slug) {
    return apiFetch(`/blog/${slug}`);
  },

  async createBlogPost(payload) {
    return apiFetch("/blog", { method: "POST", body: payload });
  },

  async updateBlogPost(id, payload) {
    return apiFetch(`/blog/${id}`, { method: "PUT", body: payload });
  },

  async deleteBlogPost(id) {
    return apiFetch(`/blog/${id}`, { method: "DELETE" });
  },

  /* ============ REPORT A PROBLEM / CONTACT US ============ */

  async getProblemReasons() {
    return apiFetch("/reports/problem-reasons");
  },

  async submitProblemReport(payload) {
    return apiFetch("/reports/problem", { method: "POST", body: payload });
  },

  /* ============ CHAT (messaging between buyer and seller) ============ */

  async sendMessage({ productId, receiverId, body }) {
    return apiFetch("/chat/messages", { method: "POST", body: { product_id: productId, receiver_id: receiverId, body } });
  },

  async getConversationMessages(productId, otherUserId) {
    return apiFetch(`/chat/conversation?product_id=${productId}&other_id=${otherUserId}`);
  },

  async getMyConversations() {
    const rows = await apiFetch("/chat/conversations");
    // map Flask's flat shape to what app.js's renderMyChats() expects
    return rows.map(r => ({
      ...r,
      otherUserId: r.other_user_id,
      otherUserProfile: { first_name: r.other_user_name?.split(" ")[0] || "", last_name: r.other_user_name?.split(" ").slice(1).join(" ") || "", avatar_url: toAbsoluteUrl(r.other_user_avatar) },
      products: { title: r.product_title }
    }));
  },

  async markMessagesRead(productId, otherUserId) {
    return apiFetch("/chat/mark-read", { method: "POST", body: { product_id: productId, other_id: otherUserId } });
  },

  /* ============ NOTIFICATIONS (navbar bell + chat dot) ============ */

  async getNotificationSummary() {
    return apiFetch("/notifications/summary");
  },

  async getNotifications() {
    return apiFetch("/notifications");
  },

  // No id marks every unread notification read.
  async markNotificationsRead(id = null) {
    return apiFetch("/notifications/read", { method: "POST", body: id ? { id } : {} });
  },

  async isCurrentUserAdmin() {
    const profile = await this.getCurrentProfile();
    return !!profile?.is_admin || (profile?.roles && profile.roles.length > 0);
  },

  async verifyAdminAccess() {
    return apiFetch("/admin/verify");
  },

  /* ============ ADMIN: USERS ============ */

  async adminGetUsers() {
    return apiFetch("/admin/users");
  },

  async adminGetUser(uid) {
    return apiFetch(`/admin/users/${uid}`);
  },

  async adminUpdateUser(uid, updates) {
    return apiFetch(`/admin/users/${uid}`, { method: "PUT", body: updates });
  },

  async adminRemoveUserRole(uid) {
    return apiFetch(`/admin/users/${uid}/role`, { method: "DELETE" });
  },

  async adminDeleteUser(uid) {
    return apiFetch(`/admin/users/${uid}`, { method: "DELETE" });
  },

  /* ============ ADMIN: PRODUCTS ============ */

  async adminGetProducts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category && filters.category !== "all") params.set("category", filters.category);
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    if (filters.seller) params.set("seller", filters.seller);
    if (filters.emiOnly) params.set("emi_only", "true");
    if (filters.minPrice != null) params.set("min_price", filters.minPrice);
    if (filters.maxPrice != null) params.set("max_price", filters.maxPrice);
    if (filters.sort) params.set("sort", filters.sort);
    const qs = params.toString();
    const rows = await apiFetch(`/admin/products${qs ? "?" + qs : ""}`);
    return rows.map(mapProductFromApi);
  },

  async adminGetProduct(pid) {
    const row = await apiFetch(`/admin/products/${pid}`);
    // keep the admin-only extras alongside the normalized listing fields
    return {
      ...mapProductFromApi(row),
      seller: row.seller,
      emiApplications: row.emi_applications || [],
      purchase: row.purchase || null
    };
  },

  async adminUpdateProduct(pid, updates) {
    const row = await apiFetch(`/admin/products/${pid}`, { method: "PUT", body: mapProductToApiPayload(updates) });
    return mapProductFromApi(row);
  },

  async adminDeleteProduct(pid) {
    return apiFetch(`/admin/products/${pid}`, { method: "DELETE" });
  },

  /* ============ ADMIN: PURCHASES ============ */

  async adminGetRolePermissions() {
    return apiFetch("/admin/role-permissions");
  },

  async adminSetRolePermissions(role, capabilities) {
    return apiFetch(`/admin/role-permissions/${role}`, { method: "PUT", body: { capabilities } });
  },

  async adminResetRolePermissions(role) {
    return apiFetch(`/admin/role-permissions/${role}/reset`, { method: "POST" });
  },

  async adminGetAnalytics() {
    return apiFetch("/admin/analytics");
  },

  async adminGetPurchases() {
    return apiFetch("/admin/purchases");
  },

  /* ============ FINANCERS ============ */

  async getFinancers(pincode = "") {
    const qs = pincode ? `?pincode=${encodeURIComponent(pincode)}` : "";
    return apiFetch(`/financers${qs}`);
  },

  async adminGetFinancers() {
    return apiFetch("/admin/financers");
  },

  async adminCreateFinancer(financer) {
    return apiFetch("/admin/financers", { method: "POST", body: financer });
  },

  async adminUpdateFinancer(fid, updates) {
    return apiFetch(`/admin/financers/${fid}`, { method: "PUT", body: updates });
  },

  async adminDeleteFinancer(fid) {
    return apiFetch(`/admin/financers/${fid}`, { method: "DELETE" });
  }
};

// EMI applications carry a snapshot image path; absolutise it on read the
// same way listing images are, so it renders regardless of which origin the
// frontend is served from. Older rows may already hold an absolute URL —
// toAbsoluteUrl leaves those untouched.
function mapEmiFromApi(row) {
  return { ...row, product_image_snapshot: toAbsoluteUrl(row.product_image_snapshot) };
}

// Accepts either the legacy sell-form shape (ai_description/ai_image_url,
// from handleSellSubmit) or a plain-named partial patch (e.g. {status:'removed'}
// from deleteListing, or a full edit-form payload) and maps both onto the
// field names the Flask API expects. Only keys that are actually present
// are included, so partial patches stay partial.
function mapProductToApiPayload(product) {
  const aliasToApiKey = {
    title: "title", category: "category", condition: "condition",
    price: "price", original_price: "original_price",
    negotiable: "negotiable", emi_eligible: "emi_eligible",
    description: "description", ai_description: "description",
    image_url: "image_url", ai_image_url: "image_url",
    extra_images: "extra_images",
    show_phone: "show_phone", location: "location", city: "city",
    landmark: "landmark", brand: "brand", model: "model", status: "status",
    // Category fields (year, km_driven, fuel, owners, storage, bedrooms).
    // This whitelist drops anything not listed here, so the omission of
    // "attributes" silently discarded every category value the sell form
    // collected — the request left the browser without them and the server
    // stored nothing, with no error anywhere to show for it.
    attributes: "attributes",
    // DealLock: cars and bikes, "has this vehicle ever had a loan".
    vehicle_had_loan: "vehicle_had_loan"
  };
  const payload = {};
  for (const [key, apiKey] of Object.entries(aliasToApiKey)) {
    if (product[key] !== undefined) payload[apiKey] = product[key];
  }
  // Store image paths relative to the API origin, never absolutised ones
  if (payload.image_url !== undefined) payload.image_url = toRelativeUrl(payload.image_url);
  if (Array.isArray(payload.extra_images)) payload.extra_images = payload.extra_images.map(toRelativeUrl);
  return payload;
}

function mapProductFromApi(row) {
  return {
    id: row.id, title: row.title, category: row.category, condition: row.condition,
    price: row.price, original_price: row.original_price,
    location: row.location, city: row.city,
    fb_link: "", ai_description: row.description, ai_image_url: toAbsoluteUrl(row.image_url),
    extra_images: (row.extra_images || []).map(toAbsoluteUrl),
    emi_eligible: row.emi_eligible, views: row.views, created_at: row.created_at,
    posted_by: row.posted_by, seller_name: row.seller_name, seller_avatar: toAbsoluteUrl(row.seller_avatar),
    is_featured: row.is_featured, featured_until: row.featured_until,
    seller_phone: row.seller_phone, show_phone: row.show_phone,
    negotiable: row.negotiable, brand: row.brand, model: row.model,
    landmark: row.landmark, status: row.status,
    // DealLock: "pending" (a deal waits for the seller or documents),
    // "reserved" (the deal is locked) or null. Only some endpoints send it.
    deal_stage: row.deal_stage || null,
    // DealLock: the listing's documents (My Listings): none | needed |
    // checking | verified.
    docs_state: row.docs_state || null,
    vehicle_had_loan: row.vehicle_had_loan === undefined ? null : row.vehicle_had_loan,
    // Category fields (year, km_driven, fuel, owners...). This mapper
    // rebuilds the object field by field, so anything not named here is
    // dropped — silently, for every listing, on every endpoint. The server
    // was sending all six values and the browser was throwing them away
    // between the response and the render.
    //
    // There are TWO mappers: this one, and normalizeListing() in app.js.
    // Both must carry every field, or whichever path a listing takes decides
    // what survives.
    attributes: row.attributes || {}
  };
}
