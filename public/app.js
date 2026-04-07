'use strict';

// ─── TELEGRAM ───────────────────────────────────────────
const tg = window.Telegram?.WebApp;
const tgVersionAtLeast = (min) => {
  if (!tg?.version) return false;
  const a = String(tg.version).split('.').map(n => Number(n) || 0);
  const b = String(min).split('.').map(n => Number(n) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
};

function tgInsetValue(source, key) {
  const raw = Number(source?.[key]);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

const syncViewportMetrics = () => {
  const vv = window.visualViewport;
  const viewportHeight = Number(tg?.viewportHeight || 0);
  const stableHeight = Number(tg?.viewportStableHeight || viewportHeight || 0);
  const headerOffset = (viewportHeight - stableHeight) > 0
    ? (viewportHeight - stableHeight)
    : 0;
  const vvTop = Math.max(0, Number(vv?.offsetTop || 0));
  const vvHeight = Math.max(0, Number(vv?.height || 0));
  const winHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const rawBottomGap = Math.max(0, winHeight - vvHeight - vvTop);
  const bottomGap = rawBottomGap > 120 ? 0 : rawBottomGap;
  const appHeight = Math.max(0, stableHeight || vvHeight || winHeight || 0);
  const tgSafeTop = tgInsetValue(tg?.safeAreaInset, 'top');
  const tgSafeBottom = tgInsetValue(tg?.safeAreaInset, 'bottom');
  const tgSafeLeft = tgInsetValue(tg?.safeAreaInset, 'left');
  const tgSafeRight = tgInsetValue(tg?.safeAreaInset, 'right');
  const tgContentSafeTop = tgInsetValue(tg?.contentSafeAreaInset, 'top');
  const tgContentSafeBottom = tgInsetValue(tg?.contentSafeAreaInset, 'bottom');
  const tgContentSafeLeft = tgInsetValue(tg?.contentSafeAreaInset, 'left');
  const tgContentSafeRight = tgInsetValue(tg?.contentSafeAreaInset, 'right');
  const topReserve = Math.max(tgSafeTop, tgContentSafeTop, headerOffset + vvTop, vvTop);
  const bottomReserve = Math.max(tgSafeBottom, tgContentSafeBottom, bottomGap);
  const sideLeftReserve = Math.max(tgSafeLeft, tgContentSafeLeft);
  const sideRightReserve = Math.max(tgSafeRight, tgContentSafeRight);

  document.documentElement.style.setProperty('--tg-header-offset', headerOffset + 'px');
  document.documentElement.style.setProperty('--vv-top', vvTop + 'px');
  document.documentElement.style.setProperty('--vv-bottom', bottomGap + 'px');
  document.documentElement.style.setProperty('--tg-safe-top', tgSafeTop + 'px');
  document.documentElement.style.setProperty('--tg-safe-bottom', tgSafeBottom + 'px');
  document.documentElement.style.setProperty('--tg-safe-left', tgSafeLeft + 'px');
  document.documentElement.style.setProperty('--tg-safe-right', tgSafeRight + 'px');
  document.documentElement.style.setProperty('--tg-content-safe-top', tgContentSafeTop + 'px');
  document.documentElement.style.setProperty('--tg-content-safe-bottom', tgContentSafeBottom + 'px');
  document.documentElement.style.setProperty('--tg-content-safe-left', tgContentSafeLeft + 'px');
  document.documentElement.style.setProperty('--tg-content-safe-right', tgContentSafeRight + 'px');
  document.documentElement.style.setProperty('--app-top-reserve', topReserve + 'px');
  document.documentElement.style.setProperty('--app-bottom-reserve', bottomReserve + 'px');
  document.documentElement.style.setProperty('--app-side-left-reserve', sideLeftReserve + 'px');
  document.documentElement.style.setProperty('--app-side-right-reserve', sideRightReserve + 'px');
  document.documentElement.style.setProperty('--overlay-top-reserve', topReserve + 'px');
  document.documentElement.style.setProperty('--overlay-bottom-reserve', bottomReserve + 'px');
  if (appHeight) {
    document.documentElement.style.setProperty('--app-height', appHeight + 'px');
  }
};

if (tg) {
  tg.expand?.();
  tg.ready?.();

  // Unsupported warningsni kamaytirish uchun versiya tekshiruvi
  if (tgVersionAtLeast('6.1')) {
    tg.setHeaderColor?.('#050508');
    tg.setBackgroundColor?.('#050508');
  }

  tg.onEvent?.('viewportChanged', syncViewportMetrics);
}

window.addEventListener('resize', syncViewportMetrics, { passive: true });
window.addEventListener('orientationchange', syncViewportMetrics, { passive: true });
window.addEventListener('focusin', syncViewportMetrics, { passive: true });
window.addEventListener('focusout', syncViewportMetrics, { passive: true });
window.visualViewport?.addEventListener?.('resize', syncViewportMetrics, { passive: true });
window.visualViewport?.addEventListener?.('scroll', syncViewportMetrics, { passive: true });
syncViewportMetrics();

// ─── STORAGE ────────────────────────────────────────────
const store = {
  get: (k, fb = null) => { try { return localStorage.getItem(k) ?? fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch { } },
  del: (k) => { try { localStorage.removeItem(k); } catch { } },
};

const THEME_CONFIG = window.KASSA_THEME_CONFIG || {
  defaultName: 'gold',
  themes: [
    { id: 'gold', label: 'Sariq' },
    { id: 'violet', label: 'Binafsha' },
    { id: 'mono', label: 'Oq-qora' },
  ]
};
const getAccentThemeIds = () => (THEME_CONFIG.themes || []).map(x => x.id);
const getDefaultAccentTheme = () => THEME_CONFIG.defaultName || 'gold';

// ─── USER ID ────────────────────────────────────────────
function getUserId() {
  const tgId = Number(tg?.initDataUnsafe?.user?.id || 0);
  const qId = Number(new URLSearchParams(location.search).get('user_id') || 0);
  const cached = Number(store.get('uid') || 0);
  const id = tgId || qId || cached || 0;
  if (qId && qId !== cached) store.set('uid', qId);
  return id;
}
const UID = getUserId();

// ─── ICONS LIST ─────────────────────────────────────────
const ICON_NAMES = [
  'shopping-cart', 'coffee', 'car', 'home', 'smartphone', 'bus', 'music', 'book',
  'briefcase', 'credit-card', 'gift', 'heart', 'star', 'zap', 'tool', 'truck',
  'shopping-bag', 'banknote', 'pill', 'shirt', 'wifi', 'monitor', 'smile', 'film',
];

const SVGS = {
  'shopping-cart': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'coffee': '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  'car': '<rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'home': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'smartphone': '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  'bus': '<path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  'music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  'gift': '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  'heart': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'tool': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'truck': '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'banknote': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  'pill': '<path d="M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6.5"/><path d="M8 11h8"/><circle cx="12" cy="16" r="3"/>',
  'shirt': '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>',
  'wifi': '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  'monitor': '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'smile': '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  'film': '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
};
function svgIcon(name, cls = '') {
  const p = SVGS[name] || SVGS['star'];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${p}</svg>`;
}

// ─── STATE ───────────────────────────────────────────────
let db = null;
let txList = [];
let cats = { income: [], expense: [] };
let pin = store.get('pin');
let bioOn = store.get('bio') === 'true';
let rate = Number(store.get('rate') || 12850);
let currency = 'UZS';
let typeFilt = 'all';
let dateFilt = 'all';
let histFilt = 'all';
let selTxId = null;
let selCatIdx = null;
let selCatType = null;
let selIcon = 'star';
let draft = {};
let newCatType = null;
let inputCur = 'UZS';
let pinMode = 'unlock';
let pinBuf = '';
let pinTemp = '';
/** PIN oqimi sozlamalardan boshlanganida bekor qilganda asosiy sahifa yopilmasin */
let pinContext = null;
/** USD kursi tahriri — bekor qilishda qayta tiklash */
let rateDraftStg = null;
let bioAvail = false;
let myChart = null;
let histOffset = 0;
let hasMoreTx = true;
let loadingMore = false;
let txSourceColumnSupported = null;
let txSourceRefColumnSupported = null;
let currentReceipt = { src: '', name: '' };
let receiptBlobUrl = null;
let userAvatarColumnSupported = null;

const TX_FETCH_BATCH = 500;
const RECEIPT_MAX_EDGE = 1480;
const RECEIPT_PREVIEW_QUALITY = 0.68;
const RECEIPT_UPLOAD_QUALITY = 0.78;
const AVATAR_MAX_EDGE = 720;
const AVATAR_QUALITY = 0.82;

const profileState = {
  fullName: store.get('display_name') || '',
  username: tg?.initDataUnsafe?.user?.username || '',
  phone: '',
  photoUrl: store.get('profile_avatar_url') || ''
};

const profileEditState = {
  photoUrl: '',
  removeAvatar: false
};

let currentLang = store.get('lang') || 'uz';
let T = {};
let pushNotificationState = {
  supported: false,
  supportReason: 'pending',
  status: 'idle',
  permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  provider: 'telegram',
  publicEnabled: false,
  tokenRegistered: false,
  lastSyncAt: null,
  lastError: null,
  embeddedTelegram: !!tg,
  appKind: tg ? 'mini_app' : 'web_app',
  userSettingsReady: null,
  notificationEnabled: null,
  lastReminderAt: null,
  lastReportAt: null,
};
const subscriptionHelpers = window.KassaSubscription || {};
const SUBSCRIPTION_USER_FIELDS = Array.isArray(subscriptionHelpers.SUBSCRIPTION_FIELDS)
  ? subscriptionHelpers.SUBSCRIPTION_FIELDS.slice()
  : ['plan_code', 'subscription_status', 'subscription_start_at', 'subscription_end_at', 'trial_end_at', 'canceled_at', 'grace_until', 'created_at', 'updated_at'];
const NOTIFICATION_USER_FIELDS = ['daily_reminder_enabled', 'last_daily_reminder_at', 'last_daily_report_at'];
let userSubscriptionColumnsSupported = null;
let userNotificationColumnsSupported = null;
let currentPaywallFeatureKey = null;
let currentPaywallSource = 'settings';
let lastFinanceTab = 'debt';
let subscriptionState = {
  schemaReady: false,
  rawUser: null,
  snapshot: null,
};

const FALLBACK_PRICING_SALE_START_AT = '2026-03-26T00:00:00+05:00';
const FALLBACK_PRICING_SALE_END_AT = '2026-04-26T23:59:59+05:00';
const FALLBACK_PLAN_FEATURE_KEYS = Object.freeze({
  free: Object.freeze([
    'basic_income',
    'basic_expense',
    'history',
    'basic_dashboard',
    'basic_categories',
    'basic_sync',
    'one_plan',
    'one_debt',
    'one_limit',
    'basic_reminder',
  ]),
  premium_monthly: Object.freeze([
    'unlimited_plans',
    'unlimited_debts',
    'unlimited_limits',
    'morning_evening_reminders',
    'custom_reminders',
    'pdf_reports',
    'deep_analytics',
    'ai_ready',
  ]),
});

function tt(key, fallback = '') {
  return (T && T[key]) || fallback || key;
}

function notifText(uz, ru, en) {
  return currentLang === 'ru' ? ru : currentLang === 'en' ? en : uz;
}

function hasSubscriptionSchema(record) {
  if (typeof subscriptionHelpers.hasSubscriptionSchema === 'function') {
    return subscriptionHelpers.hasSubscriptionSchema(record || {});
  }
  return SUBSCRIPTION_USER_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(record || {}, field));
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getLocalizedPlanTitleByCode(code) {
  return code === 'premium_monthly'
    ? tt('subscription_plan_premium', 'Premium')
    : tt('subscription_plan_free', 'Bepul');
}

function getPricingFeatureFallback(key) {
  const map = {
    basic_income: 'Oddiy kirim qo\'shish',
    basic_expense: 'Oddiy chiqim qo\'shish',
    history: 'Tarixni ko\'rish',
    basic_dashboard: 'Basic dashboard',
    basic_categories: 'Basic kategoriya ishlatish',
    basic_sync: 'Bot va mini app asosiy sinxron ishlashi',
    one_plan: '1 ta faol reja',
    one_debt: '1 ta faol qarz',
    one_limit: '1 ta faol limit',
    basic_reminder: 'Basic reminder',
    unlimited_plans: 'Cheksiz reja yaratish',
    unlimited_debts: 'Cheksiz qarz yaratish',
    unlimited_limits: 'Cheksiz limit yaratish',
    morning_evening_reminders: 'Ertalabgi va kechki eslatmalar',
    custom_reminders: 'Custom reminder vaqtlarini sozlash',
    pdf_reports: 'PDF va kengaytirilgan hisobotlar',
    deep_analytics: 'Chuqur statistika va kengaytirilgan analiz',
    ai_ready: 'Kelajakdagi premium-only AI qulayliklar',
  };
  return map[key] || '';
}

function getLocalizedPlanFeatures(plan = {}) {
  const featureKeys = Array.isArray(plan.feature_keys)
    ? plan.feature_keys
    : Array.isArray(FALLBACK_PLAN_FEATURE_KEYS[plan.code])
      ? FALLBACK_PLAN_FEATURE_KEYS[plan.code]
      : [];
  if (!featureKeys.length) {
    return Array.isArray(plan.features) ? plan.features.slice() : [];
  }
  return featureKeys.map((featureKey, index) => {
    const rawFallback = Array.isArray(plan.features) ? plan.features[index] : '';
    return tt(`pricing_feature_${featureKey}`, rawFallback || getPricingFeatureFallback(featureKey));
  });
}

function formatPriceAmountUzs(amount) {
  return `${fmt(amount)} ${tt('suffix_uzs', "so'm")}`;
}

function formatPlanPriceLabelByAmount(amount, billingPeriod = 'monthly') {
  const normalized = formatPriceAmountUzs(amount || 0);
  return billingPeriod === 'monthly'
    ? `${normalized} ${tt('pricing_monthly_suffix', '/ oy')}`
    : normalized;
}

function resolvePlanPricingMeta(plan = {}, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : toMs(now);
  const billingPeriod = plan.billing_period || (plan.code === 'free' ? 'free' : 'monthly');
  const originalPriceCandidate = Number(plan.original_monthly_price_uzs ?? plan.list_price_uzs ?? plan.monthly_price_uzs ?? 0);
  const monthlyPriceCandidate = Number(plan.monthly_price_uzs ?? 0);
  const salePriceCandidate = Number(plan.sale_price_uzs ?? 0);
  const saleStartsAt = parseDateSafe(plan.sale_starts_at || plan.sale_start_at);
  const saleEndsAt = parseDateSafe(plan.sale_ends_at || plan.sale_end_at);
  const explicitSaleActive = plan.sale_active === true;
  const hasSaleWindow = (!saleStartsAt || saleStartsAt.getTime() <= nowMs) && (!!saleEndsAt && saleEndsAt.getTime() > nowMs);
  const inferredSaleActive = plan.code === 'premium_monthly'
    && salePriceCandidate > 0
    && (originalPriceCandidate > salePriceCandidate || monthlyPriceCandidate === salePriceCandidate)
    && hasSaleWindow;
  const saleActive = explicitSaleActive || inferredSaleActive;
  const salePrice = salePriceCandidate > 0 ? salePriceCandidate : null;
  const originalPrice = Math.max(
    saleActive && originalPriceCandidate > 0 ? originalPriceCandidate : 0,
    (!saleActive && monthlyPriceCandidate > 0 ? monthlyPriceCandidate : 0),
    salePrice || 0
  );
  const currentPrice = saleActive
    ? (salePrice || monthlyPriceCandidate || originalPrice || 0)
    : (originalPrice || monthlyPriceCandidate || 0);

  return {
    billingPeriod,
    currentPrice,
    originalPrice: originalPrice || currentPrice || 0,
    salePrice,
    saleActive,
    saleStartsAt: saleStartsAt ? saleStartsAt.toISOString() : null,
    saleEndsAt: saleEndsAt ? saleEndsAt.toISOString() : null,
    discountAmount: saleActive ? Math.max(0, (originalPrice || 0) - (currentPrice || 0)) : 0,
  };
}

function localizePricingPlan(plan = {}) {
  const pricing = resolvePlanPricingMeta(plan, new Date());
  return {
    ...plan,
    title: getLocalizedPlanTitleByCode(plan.code),
    price_label: formatPlanPriceLabelByAmount(pricing.currentPrice, pricing.billingPeriod),
    monthly_price_uzs: pricing.currentPrice,
    original_monthly_price_uzs: pricing.originalPrice,
    sale_price_uzs: pricing.salePrice,
    sale_active: pricing.saleActive,
    sale_starts_at: pricing.saleStartsAt,
    sale_ends_at: pricing.saleEndsAt,
    discount_amount_uzs: pricing.discountAmount,
    features: getLocalizedPlanFeatures(plan),
    pricing,
  };
}

function getFallbackPricingPlansRaw() {
  return [
    {
      code: 'free',
      title: 'Bepul',
      billing_period: 'free',
      price_label: '0 so\'m',
      monthly_price_uzs: 0,
      original_monthly_price_uzs: 0,
      feature_keys: FALLBACK_PLAN_FEATURE_KEYS.free.slice(),
      features: FALLBACK_PLAN_FEATURE_KEYS.free.map(getPricingFeatureFallback),
    },
    {
      code: 'premium_monthly',
      title: 'Premium',
      billing_period: 'monthly',
      price_label: '14 999 so\'m / oy',
      monthly_price_uzs: 21999,
      original_monthly_price_uzs: 21999,
      sale_price_uzs: 14999,
      sale_starts_at: FALLBACK_PRICING_SALE_START_AT,
      sale_ends_at: FALLBACK_PRICING_SALE_END_AT,
      feature_keys: FALLBACK_PLAN_FEATURE_KEYS.premium_monthly.slice(),
      features: FALLBACK_PLAN_FEATURE_KEYS.premium_monthly.map(getPricingFeatureFallback),
    },
  ];
}

function localizeSubscriptionSnapshot(snapshot = {}) {
  const planDescriptor = {
    code: snapshot.planCode || 'free',
    billing_period: snapshot.billingPeriod || (snapshot.planCode === 'free' ? 'free' : 'monthly'),
    monthly_price_uzs: snapshot.originalMonthlyPriceUzs ?? snapshot.monthlyPriceUzs ?? 0,
    original_monthly_price_uzs: snapshot.originalMonthlyPriceUzs ?? snapshot.monthlyPriceUzs ?? 0,
    sale_price_uzs: snapshot.salePriceUzs ?? null,
    sale_active: snapshot.saleActive === true,
    sale_starts_at: snapshot.saleStartsAt || null,
    sale_ends_at: snapshot.saleEndsAt || null,
    feature_keys: Array.isArray(snapshot.featureKeys)
      ? snapshot.featureKeys
      : (Array.isArray(FALLBACK_PLAN_FEATURE_KEYS[snapshot.planCode]) ? FALLBACK_PLAN_FEATURE_KEYS[snapshot.planCode].slice() : []),
    features: Array.isArray(snapshot.features) ? snapshot.features.slice() : [],
  };
  const pricing = resolvePlanPricingMeta(planDescriptor, new Date(snapshot.now || Date.now()));
  return {
    ...snapshot,
    planTitle: getLocalizedPlanTitleByCode(planDescriptor.code),
    priceLabel: formatPlanPriceLabelByAmount(pricing.currentPrice, pricing.billingPeriod),
    monthlyPriceUzs: pricing.currentPrice,
    originalMonthlyPriceUzs: pricing.originalPrice,
    salePriceUzs: pricing.salePrice,
    saleActive: pricing.saleActive,
    saleStartsAt: pricing.saleStartsAt,
    saleEndsAt: pricing.saleEndsAt,
    discountAmountUzs: pricing.discountAmount,
    featureKeys: planDescriptor.feature_keys.slice(),
  };
}

function buildFallbackSubscriptionSnapshot(record = {}, options = {}) {
  const schemaReady = options.schemaReady !== false;
  const planCode = String(record.plan_code || '') === 'premium_monthly' ? 'premium_monthly' : 'free';
  const isPremium = schemaReady && planCode === 'premium_monthly' && String(record.subscription_status || '') === 'active';
  const rawPlans = getFallbackPricingPlansRaw();
  const rawPlan = rawPlans.find((item) => item.code === planCode) || rawPlans[0];
  const pricing = resolvePlanPricingMeta(rawPlan, new Date(options.now || Date.now()));
  return {
    schemaReady,
    planCode,
    rawStatus: isPremium ? 'active' : 'free',
    effectiveStatus: isPremium ? 'active' : 'free',
    planTitle: getLocalizedPlanTitleByCode(planCode),
    priceLabel: formatPlanPriceLabelByAmount(pricing.currentPrice, pricing.billingPeriod),
    monthlyPriceUzs: pricing.currentPrice,
    originalMonthlyPriceUzs: pricing.originalPrice,
    salePriceUzs: pricing.salePrice,
    saleActive: pricing.saleActive,
    saleStartsAt: pricing.saleStartsAt,
    saleEndsAt: pricing.saleEndsAt,
    discountAmountUzs: pricing.discountAmount,
    isPremium,
    uiStatusLabel: isPremium ? 'Obuna bo\'lgan' : 'Obuna bo\'lmagan',
    featureKeys: Array.isArray(rawPlan.feature_keys) ? rawPlan.feature_keys.slice() : [],
    limits: {
      activePlans: isPremium ? null : 1,
      activeDebts: isPremium ? null : 1,
      activeLimits: isPremium ? null : 1,
    },
    features: {
      customReminderTime: isPremium,
      advancedReports: isPremium,
      deepAnalytics: isPremium,
      aiInsights: isPremium,
      dailyMorningReminder: isPremium,
      dailyEveningReminder: isPremium,
    },
    badge: {
      label: isPremium ? 'Obuna bo\'lgan' : 'Obuna bo\'lmagan',
      tone: isPremium ? 'premium' : 'free',
      plan_title: isPremium ? 'Premium' : 'Bepul',
    },
    subscriptionStartAt: null,
    subscriptionEndAt: null,
    trialEndAt: null,
    canceledAt: null,
    graceUntil: null,
    accessUntil: null,
  };
}

function buildSubscriptionSnapshot(record = {}, options = {}) {
  const schemaReady = options.schemaReady !== false;
  if (typeof subscriptionHelpers.getSubscriptionSnapshot === 'function') {
    return localizeSubscriptionSnapshot(subscriptionHelpers.getSubscriptionSnapshot(record, { ...options, schemaReady }));
  }
  return localizeSubscriptionSnapshot(buildFallbackSubscriptionSnapshot(record, { ...options, schemaReady }));
}

function syncSubscriptionState(record = null, options = {}) {
  const raw = record || subscriptionState.rawUser || {};
  const schemaReady = options.schemaReady !== false;
  subscriptionState.rawUser = raw;
  subscriptionState.schemaReady = schemaReady;
  subscriptionState.snapshot = buildSubscriptionSnapshot(raw, { now: options.now || new Date(), schemaReady });
  return subscriptionState.snapshot;
}

function getSubscriptionSnapshotLocal() {
  return subscriptionState.snapshot || syncSubscriptionState(subscriptionState.rawUser || {}, { schemaReady: subscriptionState.schemaReady !== false });
}

function getPricingPlansData() {
  const rawPlans = typeof subscriptionHelpers.getPricingPlans === 'function'
    ? subscriptionHelpers.getPricingPlans()
    : getFallbackPricingPlansRaw();
  return (rawPlans || []).map((plan) => localizePricingPlan(plan));
}

function getFeatureGateResult(featureKey, context = {}) {
  const snapshot = context.snapshot || getSubscriptionSnapshotLocal();
  const record = context.record || subscriptionState.rawUser || {};
  if (typeof subscriptionHelpers.evaluateFeatureGate === 'function') {
    return subscriptionHelpers.evaluateFeatureGate(featureKey, record, {
      ...context,
      snapshot,
      schemaReady: context.schemaReady ?? snapshot.schemaReady,
    });
  }
  return {
    allowed: true,
    featureKey,
    snapshot,
    premiumBenefitKeys: [],
    freeLimit: null,
    usage: null,
    remaining: null,
    reason: null,
    degraded: true,
  };
}

function hasNotificationSchema(record) {
  return NOTIFICATION_USER_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(record || {}, field));
}

function notificationSetupHelp() {
  return notifText(
    'Bildirishnomalar hozircha sozlanmoqda. Bir ozdan keyin qayta urinib ko‘ring yoki administratorga murojaat qiling.',
    'Уведомления пока настраиваются. Попробуйте чуть позже или обратитесь к администратору.',
    'Notifications are still being set up. Please try again shortly or contact the administrator.'
  );
}

function notificationErrorHelp() {
  return notifText(
    'Bildirishnomalarni yangilab bo‘lmadi. Iltimos, keyinroq qayta urinib ko‘ring.',
    'Не удалось обновить уведомления. Попробуйте позже.',
    'Could not refresh notifications. Please try again later.'
  );
}

function syncNotificationUserState(record = null, options = {}) {
  const raw = record || {};
  const schemaReady = options.schemaReady !== false;
  const notificationEnabled = schemaReady ? raw.daily_reminder_enabled !== false : null;
  pushNotificationState = {
    ...pushNotificationState,
    userSettingsReady: schemaReady,
    notificationEnabled,
    lastReminderAt: schemaReady ? raw.last_daily_reminder_at || null : null,
    lastReportAt: schemaReady ? raw.last_daily_report_at || null : null,
    status: options.status || (schemaReady ? (notificationEnabled ? 'ready' : 'disabled') : 'migration_required'),
  };
  return pushNotificationState;
}

function notificationStatusLabel(state = pushNotificationState) {
  if (state?.status === 'migration_required' || state?.userSettingsReady === false) {
    return notifText('Sozlanmoqda', 'Настраивается', 'Setting up');
  }
  if (state?.status === 'syncing') return notifText('Sinxronlanmoqda', 'Синхронизация', 'Syncing');
  if (state?.status === 'error') return notifText('Xatolik', 'Ошибка', 'Error');
  if (state?.status === 'waiting_user' || !UID) return notifText('User kutilmoqda', 'Ожидается user', 'Waiting for user');
  if (state?.notificationEnabled === false) return notifText('O‘chiq', 'Выключено', 'Disabled');
  if (state?.notificationEnabled === true) return notifText('Yoqilgan', 'Включено', 'Enabled');
  return notifText('Tayyor emas', 'Не готово', 'Not ready');
}

function notificationBadgeState(state = pushNotificationState) {
  if (state?.status === 'error') return 'error';
  if (state?.notificationEnabled === true) return 'ready';
  return 'warn';
}

function notificationSupportLabel(state = pushNotificationState) {
  if (state?.userSettingsReady === false) {
    return notifText('Sozlanmoqda', 'Настраивается', 'Setting up');
  }
  return notifText('Telegram bot', 'Telegram bot', 'Telegram bot');
}

function notificationPermissionLabel(state = pushNotificationState) {
  if (state?.userSettingsReady === false) {
    return notifText('Hali tayyor emas', 'Пока не готово', 'Not ready yet');
  }
  return state?.notificationEnabled === false
    ? notifText('O‘chirilgan', 'Отключено', 'Disabled')
    : notifText('Yoqilgan', 'Включено', 'Enabled');
}

function notificationReminderLabel(state = pushNotificationState) {
  if (state?.userSettingsReady === false) {
    return notifText('Hali tayyor emas', 'Пока не готово', 'Not ready yet');
  }
  return state?.notificationEnabled === false
    ? notifText('Basic reminder o‘chiq', 'Базовые напоминания выключены', 'Basic reminders are off')
    : notifText('Basic reminder yoqilgan', 'Базовые напоминания включены', 'Basic reminders are on');
}

function notificationPremiumLabel() {
  const snapshot = getSubscriptionSnapshotLocal();
  if (snapshot?.schemaReady === false) {
    return notifText('Tarif sinxronlanmoqda', 'Тариф синхронизируется', 'Plan is syncing');
  }
  return snapshot?.isPremium
    ? notifText('Ertalabgi va kechki reminder ochiq', 'Утренние и вечерние напоминания доступны', 'Morning and evening reminders are available')
    : notifText('Faqat basic reminder', 'Только базовое напоминание', 'Basic reminder only');
}

function formatNotificationSyncTime(value) {
  if (!value) return notifText('Hali yo‘q', 'Пока нет', 'Not yet');
  try {
    return new Intl.DateTimeFormat(localeTag(), {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function notificationHelpText(state = pushNotificationState) {
  const snapshot = getSubscriptionSnapshotLocal();

  if (state?.userSettingsReady === false) {
    return notificationSetupHelp();
  }

  if (state?.lastError) {
    return notificationErrorHelp();
  }

  if (state?.notificationEnabled === false) {
    return notifText(
      'Telegram eslatmalari o‘chiq. “Yoqish” tugmasi basic reminderni qayta yoqadi va premium bo‘lsa kunlik xabarlarni ham faollashtiradi.',
      'Telegram-напоминания выключены. Кнопка “Включить” вернёт базовое напоминание и при Premium снова активирует ежедневные сообщения.',
      'Telegram reminders are off. “Enable” restores the basic reminder and re-enables daily messages if the user has Premium.'
    );
  }

  if (snapshot?.isPremium) {
    return notifText(
      'Telegram eslatmalari faol. Premium sabab ertalabgi va kechki xabarlar ham ishlaydi.',
      'Telegram-напоминания активны. Благодаря Premium утренние и вечерние сообщения тоже включены.',
      'Telegram reminders are active. Premium also unlocks morning and evening messages.'
    );
  }

  return notifText(
    'Telegram eslatmalari faol. Hozir basic reminder ishlaydi, ertalabgi va kechki xabarlar esa Premium tarifida ochiladi.',
    'Telegram-напоминания активны. Сейчас работает базовое напоминание, а утренние и вечерние сообщения доступны в Premium.',
    'Telegram reminders are active. The basic reminder is on, while morning and evening messages are unlocked on Premium.'
  );
}

function updateNotificationSettingsUI() {
  const state = pushNotificationState || {};
  const badge = $('notif-state-badge');
  if (badge) {
    badge.textContent = notificationStatusLabel(state);
    badge.dataset.state = notificationBadgeState(state);
  }

  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  setText('notif-support-value', notificationSupportLabel(state));
  setText('notif-permission-value', notificationPermissionLabel(state));
  setText('notif-sync-value', formatNotificationSyncTime(state.lastSyncAt || state.lastReminderAt || state.lastReportAt));
  setText('notif-reminders-value', notificationReminderLabel(state));
  setText('notif-premium-value', notificationPremiumLabel(state));
  setText('notif-help-text', notificationHelpText(state));

  const busy = state?.status === 'syncing';
  const canManage = !!UID;
  const schemaReady = state?.userSettingsReady !== false;
  const enableBtn = $('notif-enable-btn');
  if (enableBtn) {
    enableBtn.disabled = !canManage || busy || !schemaReady || state.notificationEnabled === true;
  }
  const refreshBtn = $('notif-refresh-btn');
  if (refreshBtn) {
    refreshBtn.disabled = !UID || busy;
  }
  const disableBtn = $('notif-disable-btn');
  if (disableBtn) {
    disableBtn.disabled = !UID || busy || !schemaReady || (state.notificationEnabled === false && !state.tokenRegistered);
  }
}

window.addEventListener('kassa:push-state', (event) => {
  pushNotificationState = { ...pushNotificationState, ...(event?.detail || {}) };
  updateNotificationSettingsUI();
});

window.addEventListener('kassa:push-message', (event) => {
  const detail = event?.detail || {};
  const title = detail.title || tt('stg_notifications', 'Bildirishnomalar');
  const body = detail.body || '';
  showErr(body ? `${title}: ${body}` : title, 4200);
});

async function configurePushNotifications() {
  const manager = window.__KASSA_PUSH__;
  if (!manager?.configure) return pushNotificationState;
  try {
    const state = await manager.configure({
      userId: UID,
      appConfig: window.__APP_CONFIG__ || {},
    });
    if (state) pushNotificationState = { ...pushNotificationState, ...state, lastError: null };
  } catch (error) {
    console.warn('[push-configure]', error);
    pushNotificationState = {
      ...pushNotificationState,
      status: 'error',
      lastError: error?.message || String(error),
    };
  }
  updateNotificationSettingsUI();
  return pushNotificationState;
}

async function refreshNotificationPreferences(options = {}) {
  if (!UID) {
    pushNotificationState = { ...pushNotificationState, status: 'waiting_user' };
    updateNotificationSettingsUI();
    return null;
  }

  pushNotificationState = {
    ...pushNotificationState,
    status: 'syncing',
    lastError: null,
  };
  updateNotificationSettingsUI();

  try {
    const { data, error } = await selectUserRow(NOTIFICATION_USER_FIELDS);
    if (error) throw error;
    syncNotificationUserState(data || {}, { schemaReady: hasNotificationSchema(data) && userNotificationColumnsSupported !== false });
    pushNotificationState = {
      ...pushNotificationState,
      lastError: null,
      lastSyncAt: new Date().toISOString(),
    };
    updateNotificationSettingsUI();
    if (options.showToast) {
      if (pushNotificationState.userSettingsReady === false) {
        showErr(notificationSetupHelp());
      } else {
        showErr(notifText('Notification holati yangilandi ✅', 'Статус уведомлений обновлён ✅', 'Notification status refreshed ✅'));
      }
    }
    return pushNotificationState;
  } catch (error) {
    console.warn('[notif-refresh]', error);
    pushNotificationState = {
      ...pushNotificationState,
      status: 'error',
      lastError: error?.message || String(error),
    };
    updateNotificationSettingsUI();
    if (options.showToast) {
      showErr(notifText('Notification holatini yangilab bo‘lmadi', 'Не удалось обновить статус уведомлений', 'Failed to refresh notification status'));
    }
    return null;
  }
}

async function syncLegacyPushState(options = {}) {
  const manager = window.__KASSA_PUSH__;
  if (!manager?.sync || !pushNotificationState.publicEnabled || !pushNotificationState.supported) {
    return pushNotificationState;
  }

  try {
    const state = await manager.sync(options);
    if (state) pushNotificationState = { ...pushNotificationState, ...state };
  } catch (error) {
    console.warn('[legacy-push-sync]', error);
    pushNotificationState = {
      ...pushNotificationState,
      lastError: error?.message || String(error),
    };
  }
  return pushNotificationState;
}

async function saveNotificationPreference(enabled) {
  if (!UID) {
    showErr(notifText('Foydalanuvchi topilmadi', 'Пользователь не найден', 'User not found'));
    return null;
  }

  if (userNotificationColumnsSupported === false) {
    showErr(notificationSetupHelp());
    return null;
  }

  pushNotificationState = {
    ...pushNotificationState,
    status: 'syncing',
    lastError: null,
  };
  updateNotificationSettingsUI();

  try {
    const result = await db.from('users')
      .update({ daily_reminder_enabled: !!enabled })
      .eq('user_id', UID)
      .select(`user_id, ${NOTIFICATION_USER_FIELDS.join(', ')}`)
      .maybeSingle();

    if (result.error && NOTIFICATION_USER_FIELDS.some((field) => userFieldMissing(result.error, field))) {
      userNotificationColumnsSupported = false;
      syncNotificationUserState({}, { schemaReady: false, status: 'error' });
      updateNotificationSettingsUI();
      showErr(notificationSetupHelp());
      return null;
    }
    if (result.error) throw result.error;

    if (enabled) {
      await syncLegacyPushState({ requestPermission: true, force: true });
    } else if (pushNotificationState.tokenRegistered && window.__KASSA_PUSH__?.disable) {
      try {
        const state = await window.__KASSA_PUSH__.disable('telegram_notifications_disabled');
        if (state) pushNotificationState = { ...pushNotificationState, ...state };
      } catch (error) {
        console.warn('[notif-disable-legacy]', error);
      }
    }

    syncNotificationUserState(result.data || { daily_reminder_enabled: !!enabled }, { schemaReady: true });
    pushNotificationState = {
      ...pushNotificationState,
      lastError: null,
      lastSyncAt: new Date().toISOString(),
    };
    updateNotificationSettingsUI();

    showErr(
      enabled
        ? notifText('Telegram eslatmalari yoqildi ✅', 'Telegram-напоминания включены ✅', 'Telegram reminders enabled ✅')
        : notifText('Telegram eslatmalari o‘chirildi', 'Telegram-напоминания отключены', 'Telegram reminders disabled')
    );

    return pushNotificationState;
  } catch (error) {
    console.warn('[notif-save]', error);
    pushNotificationState = {
      ...pushNotificationState,
      status: 'error',
      lastError: error?.message || String(error),
    };
    updateNotificationSettingsUI();
    showErr(notifText('Notification sozlamasini saqlab bo‘lmadi', 'Не удалось сохранить настройки уведомлений', 'Failed to save notification settings'));
    return null;
  }
}

async function enablePushNotifications() {
  return saveNotificationPreference(true);
}

async function refreshPushNotifications() {
  await configurePushNotifications();
  return refreshNotificationPreferences({ showToast: true });
}

async function disablePushNotifications() {
  return saveNotificationPreference(false);
}

window.enablePushNotifications = enablePushNotifications;
window.refreshPushNotifications = refreshPushNotifications;
window.disablePushNotifications = disablePushNotifications;

// ─── HELPERS ────────────────────────────────────────────
const fmt = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v);
};
const DAY_MS = 86400000;
const isoNow = (ms = Date.now()) => new Date(ms).toISOString();
const toMs = v => {
  if (typeof v === 'number') return v;
  const p = new Date(v).getTime();
  return Number.isFinite(p) ? p : Date.now();
};
const normTx = r => ({ ...r, amount: Number(r.amount) || 0, ms: toMs(r.date), receipt_url: r.receipt_url || null });
const normAll = rows => (rows || []).map(normTx);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function localeTag() {
  return currentLang === 'ru' ? 'ru-RU' : currentLang === 'en' ? 'en-US' : 'uz-UZ';
}

function getHistoryDayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayStartMs(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatHistoryDayLabel(ms) {
  const now = Date.now();
  if (isSameDay(ms, now)) return currentLang === 'ru' ? 'Сегодня' : currentLang === 'en' ? 'Today' : 'Bugun';
  if (isSameDay(ms, now - 86400000)) return currentLang === 'ru' ? 'Вчера' : currentLang === 'en' ? 'Yesterday' : 'Kecha';
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatHistoryTime(ms) {
  return new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

function receiptDownloadName(tx = null, fallback = '') {
  const base = String((tx?.category || fallback || 'receipt')).toLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'receipt';
  const stamp = new Date(tx?.ms || Date.now()).toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `${base}-${stamp}.jpg`;
}

function revokeReceiptBlobUrl() {
  if (receiptBlobUrl) {
    try { URL.revokeObjectURL(receiptBlobUrl); } catch { }
    receiptBlobUrl = null;
  }
}

async function compressReceipt(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const scale = Math.min(1, RECEIPT_MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const preview = c.toDataURL('image/jpeg', RECEIPT_PREVIEW_QUALITY);
        c.toBlob(blob => {
          URL.revokeObjectURL(blobUrl);
          if (!blob) return reject(new Error("Chekni siqib bo'lmadi"));
          resolve({
            blob,
            preview,
            width: w,
            height: h
          });
        }, 'image/jpeg', RECEIPT_UPLOAD_QUALITY);
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Rasmni o'qib bo'lmadi"));
    };
    img.src = blobUrl;
  });
}

function updateFlowMeta() {
  const wrap = $('flow-input');
  const typeEl = $('flow-type-badge');
  const catEl = $('flow-cat-pill');
  const saveBtn = $('flow-save-btn');
  const recArea = $('rec-area');
  const isIncome = draft.type === 'income';

  if (wrap) wrap.classList.toggle('income-mode', isIncome);
  if (wrap) wrap.classList.toggle('expense-mode', draft.type === 'expense');
  if (recArea) recArea.classList.toggle('income-mode', isIncome);
  if (recArea) recArea.classList.toggle('expense-mode', draft.type === 'expense');

  if (typeEl) {
    typeEl.className = `flow-type-badge ${isIncome ? 'income' : 'expense'}`;
    typeEl.textContent = isIncome ? t('income') : t('expense');
  }
  if (catEl) catEl.textContent = draft.category || tt('flow_cat_unselected', 'Kategoriya tanlanmagan');
  if (saveBtn) {
    saveBtn.classList.toggle('income-mode', isIncome);
    saveBtn.classList.toggle('expense-mode', draft.type === 'expense');
  }
}

function setReceiptViewerState(state = 'loading', errorText = '') {
  const view = $('rec-view');
  const loader = $('rec-loader');
  const err = $('rec-error');
  const img = $('rec-img');
  const saveBtn = $('rec-save-btn');
  const openBtn = $('rec-open-btn');
  if (!view) return;
  view.dataset.state = state;
  if (loader) loader.style.display = state === 'loading' ? 'flex' : 'none';
  if (err) {
    err.textContent = errorText || '';
    err.style.display = state === 'error' ? 'flex' : 'none';
  }
  if (img) img.style.opacity = state === 'ready' ? '1' : '0';
  if (saveBtn) saveBtn.disabled = state === 'loading' || !currentReceipt.src;
  if (openBtn) openBtn.disabled = state === 'loading' || !currentReceipt.src;
}

function closeReceiptViewer(event) {
  if (event) {
    const shell = event.target.closest('.rec-shell');
    if (shell) return;
  }
  const view = $('rec-view');
  const img = $('rec-img');
  if (img) {
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
  }
  if (view) view.classList.remove('on');
  currentReceipt = { src: '', name: '' };
  setReceiptViewerState('loading');
  revokeReceiptBlobUrl();
}

function openReceiptViewer(src, tx = null) {
  if (!src) return;
  const view = $('rec-view');
  const img = $('rec-img');
  if (!view || !img) return;
  currentReceipt = { src, name: receiptDownloadName(tx, 'receipt') };
  setReceiptViewerState('loading');
  view.classList.add('on');
  img.onload = () => setReceiptViewerState('ready');
  img.onerror = () => setReceiptViewerState('error', tt('receipt_load_error', 'Chek yuklanmadi'));
  img.src = src;
}

async function downloadReceipt() {
  if (!currentReceipt.src) return;
  try {
    let href = currentReceipt.src;
    if (!/^data:/i.test(currentReceipt.src)) {
      const res = await fetch(currentReceipt.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      revokeReceiptBlobUrl();
      receiptBlobUrl = URL.createObjectURL(blob);
      href = receiptBlobUrl;
    }
    const a = document.createElement('a');
    a.href = href;
    a.download = currentReceipt.name || 'receipt.jpg';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.warn('[downloadReceipt]', err);
    openReceiptExternal();
    showErr(tt('receipt_download_failed_opened_original', "Yuklab bo'lmadi, asl fayl ochildi"));
  }
}

function openReceiptExternal() {
  if (!currentReceipt.src) return;
  if (tg?.openLink && /^https?:/i.test(currentReceipt.src)) {
    tg.openLink(currentReceipt.src);
    return;
  }
  window.open(currentReceipt.src, '_blank', 'noopener,noreferrer');
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || error?.details || '');
  return msg.includes(`'${column}'`) && msg.includes('schema cache');
}

async function insertTransactions(rows, source = 'mini_app') {
  if (!db) throw new Error('Database client mavjud emas');
  const payload = (rows || []).map(row => ({ ...row }));

  if (txSourceColumnSupported !== false || txSourceRefColumnSupported !== false) {
    const enriched = payload.map(row => {
      const next = { ...row };
      if (txSourceColumnSupported !== false) next.source = source;
      if (txSourceRefColumnSupported !== false && row.source_ref) next.source_ref = row.source_ref;
      return next;
    });

    const res = await db.from('transactions').insert(enriched).select();
    if (!res.error) {
      if (txSourceColumnSupported !== false) txSourceColumnSupported = true;
      if (payload.some(row => row.source_ref)) txSourceRefColumnSupported = true;
      return res;
    }

    if (isMissingColumnError(res.error, 'source_ref')) {
      txSourceRefColumnSupported = false;
      return insertTransactions(rows, source);
    }

    if (isMissingColumnError(res.error, 'source')) {
      txSourceColumnSupported = false;
      return insertTransactions(rows, source);
    }

    return res;
  }

  const plain = payload.map(({ source_ref, ...rest }) => ({ ...rest }));
  return db.from('transactions').insert(plain).select();
}

async function fetchAllTransactions() {
  if (!db || !UID) return [];

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + TX_FETCH_BATCH - 1;
    const { data, error } = await db
      .from('transactions')
      .select('*')
      .eq('user_id', UID)
      .order('date', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const part = data || [];
    rows.push(...part);

    if (part.length < TX_FETCH_BATCH) break;
    from += TX_FETCH_BATCH;
  }

  return normAll(rows);
}

const vib = s => { if (tgVersionAtLeast('6.1')) tg?.HapticFeedback?.impactOccurred?.(s); };
const $ = id => document.getElementById(id);
function refreshOverlayMetrics() {
  syncViewportMetrics();
  requestAnimationFrame(syncViewportMetrics);
}
const showOv = id => {
  const el = $(id);
  if (el) {
    el.classList.add('on');
    refreshOverlayMetrics();
  }
};
const closeOv = (id, e) => {
  if (e) { const sh = e.currentTarget?.querySelector('.sheet'); if (sh && sh.contains(e.target)) return; }
  const el = $(id);
  if (el?.classList.contains('on')) {
    el.classList.remove('on');
    refreshOverlayMetrics();
  }
};

function showErr(msg, dur = 4000) {
  const el = $('err-bar');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, dur);
}

function errorText(error, fallback = '') {
  if (!error) return fallback || 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  if (typeof error?.details === 'string' && error.details.trim()) return error.details.trim();
  if (typeof error?.hint === 'string' && error.hint.trim()) return error.hint.trim();
  if (typeof error?.error_description === 'string' && error.error_description.trim()) return error.error_description.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return serialized;
  } catch (_) { }
  return fallback || 'Unknown error';
}

function formatSubscriptionDate(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const monthMap = currentLang === 'ru'
      ? ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
      : currentLang === 'en'
        ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        : ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const month = monthMap[monthIndex] || '';
    if (currentLang === 'en') return `${month} ${Number(day)}, ${year}`;
    return `${Number(day)} ${month} ${year}`;
  } catch {
    return String(value);
  }
}

function formatSubscriptionDateTime(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(localeTag(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    return formatSubscriptionDate(value);
  }
}

function getSubscriptionRelativeDayInfo(value) {
  const targetMs = toMs(value);
  const now = Date.now();
  const todayStart = getDayStartMs(now);
  const targetStart = getDayStartMs(targetMs);
  return Math.round((targetStart - todayStart) / DAY_MS);
}

function subscriptionText(uz, ru, en) {
  return currentLang === 'ru' ? ru : currentLang === 'en' ? en : uz;
}

function getCountdownParts(value) {
  const targetMs = typeof value === 'number' ? value : toMs(value);
  const totalMs = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor(totalSeconds / 60);
  return { totalMs, totalSeconds, totalHours, totalMinutes, days, hours, minutes, seconds };
}

function formatCountdownSummary(parts) {
  if (!parts || parts.totalMs <= 0) {
    return subscriptionText('Muddat tugadi', 'Срок истёк', 'Expired');
  }
  if (parts.days > 0) {
    return `${parts.days} ${tt('countdown_days_short', 'kun')} ${parts.hours} ${tt('countdown_hours_short', 'soat')}`;
  }
  if (parts.totalHours > 0) {
    return `${parts.totalHours} ${tt('countdown_hours_short', 'soat')} ${parts.minutes} ${tt('countdown_minutes_short', 'min')}`;
  }
  if (parts.totalMinutes > 0) {
    return `${parts.totalMinutes} ${tt('countdown_minutes_short', 'min')} ${parts.seconds} ${tt('countdown_seconds_short', 'sek')}`;
  }
  return `${parts.seconds} ${tt('countdown_seconds_short', 'sek')}`;
}

function formatSaleEndsSummary(value) {
  const formatted = formatSubscriptionDateTime(value);
  return subscriptionText(
    `${formatted} gacha`,
    `До ${formatted}`,
    `Until ${formatted}`
  );
}

function getSubscriptionEndHint(value) {
  if (!value) return subscriptionText(
    'Faol muddat ko‘rsatilmagan',
    'Срок действия не указан',
    'Access period is not available'
  );
  const parts = getCountdownParts(value);
  if (parts.totalMs > 0 && parts.totalMs < DAY_MS) {
    return formatCountdownSummary(parts);
  }
  const diffDays = getSubscriptionRelativeDayInfo(value);
  if (diffDays > 1) {
    return subscriptionText(
      `${diffDays} kun qoldi`,
      `Осталось ${diffDays} дн`,
      `${diffDays} days left`
    );
  }
  if (diffDays === 1) {
    return subscriptionText('1 kun qoldi', 'Остался 1 день', '1 day left');
  }
  if (diffDays === 0) {
    return subscriptionText('Bugun tugaydi', 'Заканчивается сегодня', 'Ends today');
  }
  if (diffDays === -1) {
    return subscriptionText('Kecha tugagan', 'Закончилось вчера', 'Ended yesterday');
  }
  return subscriptionText(
    `${Math.abs(diffDays)} kun oldin tugagan`,
    `Закончилось ${Math.abs(diffDays)} дн. назад`,
    `Ended ${Math.abs(diffDays)} days ago`
  );
}

function getSubscriptionPeriodBadge(snapshot) {
  const target = snapshot?.accessUntil || snapshot?.subscriptionEndAt || snapshot?.trialEndAt || snapshot?.graceUntil;
  if (!target) {
    if (snapshot?.isPremium) {
      return subscriptionText('Faol', 'Активно', 'Active');
    }
    return subscriptionText('Bepul', 'Бесплатно', 'Free');
  }
  return getSubscriptionEndHint(target);
}

function setCountdownUnitValue(unitEl, value, animate = false) {
  if (!unitEl) return;
  const nextValue = String(Math.max(0, Number(value) || 0)).padStart(2, '0');
  const currentEl = unitEl.querySelector('.countdown-roll-current');
  const nextEl = unitEl.querySelector('.countdown-roll-next');
  const previousValue = unitEl.dataset.value || nextValue;
  if (!currentEl || !nextEl) {
    unitEl.textContent = nextValue;
    unitEl.dataset.value = nextValue;
    return;
  }
  if (!animate || previousValue === nextValue) {
    currentEl.textContent = nextValue;
    nextEl.textContent = nextValue;
    unitEl.dataset.value = nextValue;
    unitEl.classList.remove('is-animating');
    unitEl.classList.remove('is-resetting');
    return;
  }
  currentEl.textContent = previousValue;
  nextEl.textContent = nextValue;
  unitEl.dataset.value = nextValue;
  unitEl.classList.remove('is-animating');
  void unitEl.offsetWidth;
  unitEl.classList.add('is-animating');
  clearTimeout(unitEl.__countdownResetTimer);
  unitEl.__countdownResetTimer = setTimeout(() => {
    unitEl.classList.add('is-resetting');
    currentEl.textContent = nextValue;
    nextEl.textContent = nextValue;
    unitEl.classList.remove('is-animating');
    void unitEl.offsetWidth;
    requestAnimationFrame(() => {
      unitEl.classList.remove('is-resetting');
    });
  }, 460);
}

function syncCountdownBoard(boardEl, values = {}, options = {}) {
  if (!boardEl) return;
  const units = boardEl.querySelectorAll('.countdown-unit[data-unit]');
  units.forEach((unitEl) => {
    const unitKey = unitEl.dataset.unit;
    const nextValue = values[unitKey] ?? 0;
    setCountdownUnitValue(unitEl, nextValue, options.animate === true);
    unitEl.dataset.urgent = options.urgent === true ? 'true' : 'false';
  });
}

function updatePricingSaleCountdownUI(plan = null) {
  const bannerEl = $('pricing-premium-sale-banner');
  const summaryEl = $('pricing-premium-sale-summary');
  const discountEl = $('pricing-premium-sale-discount');
  const currentPriceEl = $('pricing-premium-price-current');
  const oldWrapEl = $('pricing-premium-price-old-wrap');
  const oldPriceEl = $('pricing-premium-price-old');
  const countdownCardEl = $('pricing-premium-countdown-card');
  const countdownSummaryEl = $('pricing-premium-countdown-summary');
  const countdownBoardEl = $('pricing-premium-countdown-board');
  const pricing = plan?.pricing || resolvePlanPricingMeta(plan || {}, new Date());

  if (currentPriceEl) currentPriceEl.textContent = formatPriceAmountUzs(pricing.currentPrice);

  const hasVisibleDiscount = pricing.saleActive && pricing.originalPrice > pricing.currentPrice;
  if (oldWrapEl) oldWrapEl.style.display = hasVisibleDiscount ? 'inline-flex' : 'none';
  if (oldPriceEl) oldPriceEl.textContent = formatPriceAmountUzs(pricing.originalPrice);
  if (discountEl) discountEl.textContent = pricing.discountAmount > 0 ? `-${formatPriceAmountUzs(pricing.discountAmount)}` : '';

  if (bannerEl) bannerEl.style.display = hasVisibleDiscount ? 'flex' : 'none';
  if (summaryEl) {
    summaryEl.textContent = hasVisibleDiscount && pricing.saleEndsAt
      ? formatSaleEndsSummary(pricing.saleEndsAt)
      : '';
  }

  const saleTarget = pricing.saleActive ? parseDateSafe(pricing.saleEndsAt) : null;
  if (!saleTarget || !countdownCardEl || !countdownSummaryEl || !countdownBoardEl) {
    if (countdownCardEl) countdownCardEl.style.display = 'none';
    return;
  }

  const parts = getCountdownParts(saleTarget.getTime());
  if (parts.totalMs <= 0) {
    countdownCardEl.style.display = 'none';
    return;
  }

  countdownCardEl.style.display = 'block';
  countdownSummaryEl.textContent = formatCountdownSummary(parts);
  syncCountdownBoard(countdownBoardEl, {
    days: parts.days,
    hours: parts.hours,
    minutes: parts.minutes,
    seconds: parts.seconds,
  }, {
    animate: countdownBoardEl.dataset.initialized === 'true',
    urgent: parts.totalMs <= 3600000,
  });
  countdownBoardEl.dataset.initialized = 'true';
}

function updateSubscriptionExpiryCountdownUI(snapshot = null) {
  const wrapEl = $('stg-subscription-live-countdown');
  const summaryEl = $('stg-subscription-live-summary');
  const boardEl = $('stg-subscription-live-board');
  if (!wrapEl || !summaryEl || !boardEl) return;

  const currentSnapshot = snapshot || getSubscriptionSnapshotLocal();
  const target = parseDateSafe(
    currentSnapshot?.accessUntil
    || currentSnapshot?.subscriptionEndAt
    || currentSnapshot?.trialEndAt
    || currentSnapshot?.graceUntil
  );

  if (!target || !currentSnapshot?.isPremium) {
    wrapEl.style.display = 'none';
    return;
  }

  const parts = getCountdownParts(target.getTime());
  const shouldShow = parts.totalMs > 0 && parts.totalMs < DAY_MS;
  if (!shouldShow) {
    wrapEl.style.display = 'none';
    return;
  }

  wrapEl.style.display = 'flex';
  summaryEl.textContent = formatCountdownSummary(parts);
  syncCountdownBoard(boardEl, {
    hours: parts.totalHours,
    minutes: parts.minutes,
    seconds: parts.seconds,
  }, {
    animate: boardEl.dataset.initialized === 'true',
    urgent: parts.totalMs <= 3600000,
  });
  boardEl.dataset.initialized = 'true';
}

function extractUpgradeFeatureKey(error, fallbackFeatureKey = null) {
  const raw = [
    String(error?.details || ''),
    String(error?.hint || ''),
    String(error?.message || ''),
    errorText(error, ''),
  ].join(' ');
  const match = raw.match(/upgrade_required:([a-z_]+)/i);
  return match?.[1] || fallbackFeatureKey || null;
}

function getPaywallCopy(featureKey, gate) {
  const feature = String(featureKey || '').trim();
  if (feature === 'plan_create' || feature === 'limit_create') {
    return {
      title: tt('paywall_limit_title', 'Siz bepul tarif limitiga yetdingiz'),
      body: tt('paywall_plan_body', 'Bepul tarifda faqat 1 ta faol reja va limit ishlatish mumkin. Premium orqali cheksiz reja, qarz, limit va kengaytirilgan hisobotlardan foydalanishingiz mumkin.'),
    };
  }
  if (feature === 'debt_create') {
    return {
      title: tt('paywall_limit_title', 'Siz bepul tarif limitiga yetdingiz'),
      body: tt('paywall_debt_body', 'Bepul tarifda faqat 1 ta faol qarz saqlanadi. Premium orqali cheksiz qarz, reja, limit va qulay eslatmalardan foydalanishingiz mumkin.'),
    };
  }
  if (feature === 'custom_reminder_time') {
    return {
      title: tt('paywall_custom_reminder_title', 'Custom eslatma vaqti Premium tarifida'),
      body: tt('paywall_custom_reminder_body', 'Bepul tarifda basic reminder ishlaydi. Premium bilan eslatma uchun istalgan sana va vaqtni alohida sozlashingiz mumkin.'),
    };
  }
  if (feature === 'advanced_reports') {
    return {
      title: tt('paywall_reports_title', 'PDF hisobot Premium tarifida'),
      body: tt('paywall_reports_body', 'Premium orqali PDF va Excel ko‘rinishidagi kengaytirilgan hisobotlarni yuklab olishingiz mumkin.'),
    };
  }
  if (feature === 'premium_dashboard') {
    return {
      title: tt('dashboard_premium_locked_title', 'Premium dashboardni oching'),
      body: tt('dashboard_premium_locked_body', 'Balans prognozi, xavfsiz xarajat, limit xavfi va moliyaviy salomatlik skori Premium foydalanuvchilarga ochiladi.'),
    };
  }
  if (feature === 'daily_morning_reminder' || feature === 'daily_evening_reminder') {
    return {
      title: tt('paywall_reminders_title', 'Kunlik eslatmalar Premium tarifida'),
      body: tt('paywall_reminders_body', 'Premium foydalanuvchilar ertalabgi va kechki eslatmalarni oladi. Bepul tarifda esa basic reminder saqlanib qoladi.'),
    };
  }
  if (feature === 'deep_analytics' || feature === 'ai_insights') {
    return {
      title: tt('paywall_analytics_title', 'Kengaytirilgan analiz Premium tarifida'),
      body: tt('paywall_analytics_body', 'Premium orqali chuqur statistika, kengaytirilgan analiz va AI bilan ishlaydigan qulayliklar ochiladi.'),
    };
  }
  return {
    title: tt('paywall_generic_title', 'Premium orqali ko‘proq imkoniyatlarga ega bo‘ling'),
    body: tt('paywall_generic_body', 'Bu imkoniyat Premium tarifida mavjud. Premium orqali ko‘proq funksiyalar va yuqori limitlardan foydalanishingiz mumkin.'),
  };
}

function renderSubscriptionFeatureList(targetId, items = []) {
  const el = $(targetId);
  if (!el) return;
  el.innerHTML = (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function getPremiumPlanActionLabel(snapshot) {
  if (snapshot?.isPremium && snapshot?.planCode === 'premium_monthly') {
    return tt('pricing_current_plan_action', 'Faol tarif');
  }
  if (snapshot?.effectiveStatus === 'expired') {
    return tt('pricing_restore_premium', 'Premiumni qayta yoqish');
  }
  return tt('subscription_upgrade_action', 'Premium ga o‘tish');
}

function getLocalizedSubscriptionPlanTitle(snapshot) {
  return snapshot?.planCode === 'premium_monthly'
    ? tt('subscription_plan_premium', 'Premium')
    : tt('subscription_plan_free', 'Bepul');
}

function getLocalizedSubscriptionStatusLabel(snapshot) {
  if (snapshot?.effectiveStatus === 'trial') {
    return tt('subscription_status_trial', 'Sinov muddati');
  }
  if (snapshot?.effectiveStatus === 'expired') {
    return tt('subscription_status_expired', 'Obuna muddati tugagan');
  }
  if (snapshot?.effectiveStatus === 'active' || snapshot?.effectiveStatus === 'grace' || snapshot?.effectiveStatus === 'canceled') {
    return tt('subscription_status_active', 'Obuna bo‘lgan');
  }
  return tt('subscription_status_free', 'Obuna bo‘lmagan');
}

function getHeaderPlanIconMarkup(isPremium) {
  if (isPremium) {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 3h10l4 6-9 12L3 9z"></path>
        <path d="M3 9h18"></path>
        <path d="M9.5 3 7 9l5 12 5-12-2.5-6"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="7"></circle>
      <path d="M12 8v8"></path>
      <path d="M8 12h8"></path>
    </svg>
  `;
}

function openSubscriptionPanel(source = 'settings') {
  currentPaywallSource = source;
  closeOv('ov-upgrade');
  openStgSub('stg-sub-subscription');
}

function requestPremiumUpgrade(source = 'settings', featureKey = null) {
  currentPaywallSource = source;
  currentPaywallFeatureKey = featureKey || currentPaywallFeatureKey || null;
  showErr(tt('subscription_contact_hint', 'Premium ulash uchun qo‘llab-quvvatlash bilan bog‘laning.'), 2600);
  openSupport();
}

function handlePricingPlanAction(planCode) {
  const snapshot = getSubscriptionSnapshotLocal();
  if (planCode === 'free') {
    showErr(tt('pricing_free_current', 'Sizda hozir bepul tarif faol.'));
    return;
  }
  if (snapshot?.isPremium && snapshot?.planCode === 'premium_monthly') {
    showErr(tt('pricing_current_plan_notice', 'Premium tarifi allaqachon faol.'));
    return;
  }
  requestPremiumUpgrade('pricing', 'advanced_reports');
}

function updateSubscriptionUI() {
  const snapshot = getSubscriptionSnapshotLocal();
  const plans = getPricingPlansData();
  const freePlan = plans.find((item) => item.code === 'free') || plans[0] || { features: [] };
  const premiumPlan = plans.find((item) => item.code === 'premium_monthly') || plans[1] || { features: [] };
  const statusText = getLocalizedSubscriptionStatusLabel(snapshot);
  const planText = getLocalizedSubscriptionPlanTitle(snapshot);
  const statusBadge = {
    ...(snapshot?.badge || {}),
    label: statusText,
    tone: snapshot?.badge?.tone || (snapshot?.isPremium ? 'premium' : (snapshot?.effectiveStatus === 'expired' ? 'expired' : 'free')),
  };
  const priceText = snapshot?.priceLabel || '0 so\'m';
  const startValue = formatSubscriptionDate(snapshot?.subscriptionStartAt);
  const endValue = formatSubscriptionDate(snapshot?.accessUntil || snapshot?.subscriptionEndAt || snapshot?.trialEndAt || snapshot?.graceUntil);
  const startRowVisible = !!snapshot?.subscriptionStartAt;
  const endRowVisible = !!(snapshot?.accessUntil || snapshot?.subscriptionEndAt || snapshot?.trialEndAt || snapshot?.graceUntil);

  const itemSub = $('stg-subscription-sub');
  const itemBadge = $('stg-subscription-badge');
  const headerPlanIndicator = $('dash-plan-indicator');
  const headerPlanIcon = $('dash-plan-indicator-icon');
  if (itemSub) {
    itemSub.textContent = snapshot?.schemaReady === false
      ? tt('subscription_syncing', 'Tarif ma\'lumotlari sinxronlanmoqda')
      : `${planText} · ${statusText}`;
  }
  if (itemBadge) {
    itemBadge.textContent = statusBadge.label || statusText;
    itemBadge.dataset.state = statusBadge.tone || 'free';
  }
  if (headerPlanIndicator) {
    const indicatorTone = snapshot?.isPremium ? 'premium' : (snapshot?.effectiveStatus === 'expired' ? 'expired' : 'free');
    const indicatorLabel = snapshot?.schemaReady === false
      ? tt('subscription_syncing', 'Tarif ma\'lumotlari sinxronlanmoqda')
      : `${planText} · ${statusText}`;
    headerPlanIndicator.dataset.state = indicatorTone;
    headerPlanIndicator.classList.toggle('is-premium', !!snapshot?.isPremium);
    headerPlanIndicator.setAttribute('aria-label', indicatorLabel);
    headerPlanIndicator.setAttribute('title', indicatorLabel);
  }
  if (headerPlanIcon) {
    headerPlanIcon.innerHTML = getHeaderPlanIconMarkup(!!snapshot?.isPremium);
  }

  const planEl = $('stg-subscription-plan');
  const statusEl = $('stg-subscription-status');
  const priceEl = $('stg-subscription-price');
  const badgeEl = $('stg-subscription-status-badge');
  const periodCard = $('stg-subscription-period-card');
  const periodGrid = $('stg-subscription-period-grid');
  const periodDivider = $('stg-subscription-period-divider');
  const periodBadge = $('stg-subscription-period-badge');
  const startRow = $('stg-subscription-start-row');
  const endRow = $('stg-subscription-end-row');
  const startEl = $('stg-subscription-start');
  const endEl = $('stg-subscription-end');
  const statusCardEl = $('stg-subscription-status-card');
  const priceCardEl = $('stg-subscription-price-card');
  const priceMetaEl = $('stg-subscription-price-meta');
  const priceOldEl = $('stg-subscription-price-old');
  const noteEl = $('stg-subscription-note');
  if (planEl) planEl.textContent = planText;
  if (statusEl) statusEl.textContent = statusText;
  if (priceEl) priceEl.textContent = priceText;
  if (badgeEl) {
    badgeEl.textContent = statusBadge.label || statusText;
    badgeEl.dataset.state = statusBadge.tone || 'free';
  }
  if (startRow) startRow.style.display = startRowVisible ? 'flex' : 'none';
  if (endRow) endRow.style.display = endRowVisible ? 'flex' : 'none';
  if (periodCard) periodCard.style.display = startRowVisible || endRowVisible ? 'flex' : 'none';
  if (periodDivider) periodDivider.style.display = startRowVisible && endRowVisible ? 'block' : 'none';
  if (periodGrid) periodGrid.dataset.layout = startRowVisible && endRowVisible ? 'split' : 'single';
  if (periodBadge) {
    periodBadge.textContent = getSubscriptionPeriodBadge(snapshot);
    periodBadge.dataset.state = snapshot?.effectiveStatus || (snapshot?.isPremium ? 'active' : 'free');
  }
  if (startEl) startEl.textContent = startValue;
  if (endEl) endEl.textContent = endValue;
  if (statusCardEl) statusCardEl.dataset.state = statusBadge.tone || 'free';
  if (priceCardEl) priceCardEl.dataset.state = snapshot?.planCode === 'premium_monthly' ? 'premium' : 'free';
  if (priceMetaEl) {
    const hasDiscount = !!(snapshot?.saleActive && snapshot?.originalMonthlyPriceUzs > snapshot?.monthlyPriceUzs);
    priceMetaEl.style.display = hasDiscount ? 'flex' : 'none';
  }
  if (priceOldEl) {
    priceOldEl.textContent = formatPriceAmountUzs(snapshot?.originalMonthlyPriceUzs || snapshot?.monthlyPriceUzs || 0);
  }
  if (noteEl) {
    noteEl.textContent = snapshot?.schemaReady === false
      ? tt('subscription_syncing_hint', 'Tarif ma\'lumotlari bazadan yangilangach avtomatik ko‘rinadi.')
      : (
        snapshot?.isPremium
          ? tt('subscription_premium_ready', 'Premium funksiyalar hozir faol.')
          : tt('subscription_free_hint', 'Bepul tarifda asosiy funksiyalar va basic limitlar mavjud.')
      );
  }

  renderSubscriptionFeatureList('pricing-free-features', freePlan.features || []);
  renderSubscriptionFeatureList('pricing-premium-features', premiumPlan.features || []);

  const freeCard = $('pricing-card-free');
  const premiumCard = $('pricing-card-premium');
  const freeAction = $('pricing-free-action');
  const premiumAction = $('pricing-premium-action');
  if (freeCard) freeCard.classList.toggle('is-current', snapshot?.planCode === 'free');
  if (premiumCard) premiumCard.classList.toggle('is-current', snapshot?.planCode === 'premium_monthly' && snapshot?.isPremium);
  if (freeAction) {
    freeAction.textContent = snapshot?.planCode === 'free'
      ? tt('pricing_current_plan_action', 'Faol tarif')
      : tt('pricing_free_action', 'Bepul tarif');
    freeAction.disabled = snapshot?.planCode === 'free';
  }
  if (premiumAction) {
    premiumAction.textContent = getPremiumPlanActionLabel(snapshot);
    premiumAction.disabled = !!(snapshot?.isPremium && snapshot?.planCode === 'premium_monthly');
  }

  updatePricingSaleCountdownUI(premiumPlan);
  updateSubscriptionExpiryCountdownUI(snapshot);

  const currentPlanEl = $('upgrade-current-plan');
  const currentStatusEl = $('upgrade-current-status');
  if (currentPlanEl) currentPlanEl.textContent = planText;
  if (currentStatusEl) currentStatusEl.textContent = statusText;
  renderDashboardAnalytics();
}

function openUpgradePaywall(featureKey, options = {}) {
  currentPaywallFeatureKey = featureKey;
  currentPaywallSource = options.source || currentPaywallSource || 'feature';
  const gate = options.gate || getFeatureGateResult(featureKey, options);
  const copy = getPaywallCopy(featureKey, gate);
  const titleEl = $('upgrade-feature-title');
  const bodyEl = $('upgrade-feature-body');
  const badgeEl = $('upgrade-feature-badge');
  const benefitsEl = $('upgrade-feature-benefits');

  if (titleEl) titleEl.textContent = copy.title;
  if (bodyEl) bodyEl.textContent = copy.body;
  if (badgeEl) {
    badgeEl.textContent = tt('subscription_upgrade_action', 'Premium ga o‘tish');
    badgeEl.dataset.state = 'premium';
  }
  if (benefitsEl) {
    const premiumPlan = getPricingPlansData().find((item) => item.code === 'premium_monthly');
    benefitsEl.innerHTML = (premiumPlan?.features || []).slice(0, 4)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
  }

  updateSubscriptionUI();
  showOv('ov-upgrade');
  return false;
}

function handleUpgradeRequiredError(error, fallbackFeatureKey = null, source = 'feature') {
  const featureKey = extractUpgradeFeatureKey(error, fallbackFeatureKey);
  if (!featureKey) return false;
  openUpgradePaywall(featureKey, { source });
  return true;
}

function openDashboardAnalyticsPaywall() {
  return openUpgradePaywall('premium_dashboard', { source: 'dashboard_analytics', relaxedWhenSchemaMissing: false });
}

function handleDashboardAnalyticsAction() {
  const snapshot = getSubscriptionSnapshotLocal();
  if (snapshot?.isPremium) {
    return openSubscriptionPanel('dashboard_analytics');
  }
  return openDashboardAnalyticsPaywall();
}

let subscriptionUiTimer = null;

function tickSubscriptionUiTimers() {
  const plans = getPricingPlansData();
  const premiumPlan = plans.find((item) => item.code === 'premium_monthly') || plans[1] || null;
  updatePricingSaleCountdownUI(premiumPlan);
  updateSubscriptionExpiryCountdownUI();
}

function ensureSubscriptionUiTimer() {
  if (subscriptionUiTimer) return;
  tickSubscriptionUiTimers();
  subscriptionUiTimer = setInterval(tickSubscriptionUiTimers, 1000);
}

ensureSubscriptionUiTimer();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tickSubscriptionUiTimers();
});

window.openSubscriptionPanel = openSubscriptionPanel;
window.requestPremiumUpgrade = requestPremiumUpgrade;
window.handlePricingPlanAction = handlePricingPlanAction;
window.openUpgradePaywall = openUpgradePaywall;
window.handleUpgradeRequiredError = handleUpgradeRequiredError;
window.openDashboardAnalyticsPaywall = openDashboardAnalyticsPaywall;
window.handleDashboardAnalyticsAction = handleDashboardAnalyticsAction;
window.getFeatureGateResult = getFeatureGateResult;
window.getSubscriptionSnapshot = getSubscriptionSnapshotLocal;

function getTgUser() {
  return tg?.initDataUnsafe?.user || null;
}

function normalizeName(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function getDisplayName() {
  const tgUser = getTgUser();
  const tgName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim();
  return normalizeName(profileState.fullName) || tgName || `${tt('user_fallback', 'User')} ${UID}`;
}

function getProfileMeta() {
  const parts = [];
  if (profileState.username) parts.push(`@${profileState.username}`);
  if (profileState.phone) parts.push(profileState.phone);
  if (UID) parts.push(`ID ${UID}`);
  return parts.join(' • ');
}

function getInitials(name) {
  const parts = normalizeName(name).split(' ').filter(Boolean).slice(0, 2);
  const initials = parts.map(p => p[0]?.toUpperCase()).join('');
  return initials || 'U';
}

function getHeaderSubText() {
  if (profileState.username) return `@${profileState.username}`;
  if (profileState.phone) return profileState.phone;
  return currentLang === 'ru' ? 'Пользователь Kassa' : currentLang === 'en' ? 'Kassa user' : 'Kassa foydalanuvchisi';
}

function getCurrentProfilePhotoUrl() {
  return String(profileState.photoUrl || '').trim();
}

function getProfileEditPhotoUrl() {
  if (profileEditState.removeAvatar) return '';
  return String(profileEditState.photoUrl || getCurrentProfilePhotoUrl() || '').trim();
}

function resetProfileEditState() {
  profileEditState.photoUrl = getCurrentProfilePhotoUrl();
  profileEditState.removeAvatar = false;
}

function setProfileAvatarCache(url) {
  const clean = String(url || '').trim();
  profileState.photoUrl = clean;
  if (clean) store.set('profile_avatar_url', clean);
  else store.del('profile_avatar_url');
}

function setAvatar(elId, options = {}) {
  const el = $(elId);
  if (!el) return;
  const name = options.name || getDisplayName();
  const photoUrl = String(options.photoUrl ?? getCurrentProfilePhotoUrl() ?? '').trim();
  if (photoUrl) {
    el.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)}">`;
    el.classList.add('has-photo');
    return;
  }
  el.classList.remove('has-photo');
  el.innerHTML = `<span class="stg-avatar-initials">${escapeHtml(getInitials(name))}</span>`;
}

function renderProfileEditorUI() {
  const noteEl = $('profile-photo-note');
  const removeBtn = $('profile-photo-remove-btn');
  const pickBtn = $('profile-photo-pick-btn');
  const hasPhoto = !!getProfileEditPhotoUrl();
  setAvatar('stg-avatar-edit', { photoUrl: getProfileEditPhotoUrl() });

  if (pickBtn) pickBtn.textContent = (T[hasPhoto ? 'profile_photo_change' : 'profile_photo_upload']) || (hasPhoto ? (currentLang === 'ru' ? 'Изменить фото' : currentLang === 'en' ? 'Change photo' : 'Rasmni yangilash') : (currentLang === 'ru' ? 'Загрузить фото' : currentLang === 'en' ? 'Upload photo' : 'Rasm yuklash'));
  if (removeBtn) {
    removeBtn.disabled = !hasPhoto;
    removeBtn.classList.toggle('is-disabled', !hasPhoto);
  }
  if (noteEl) {
    if (profileEditState.removeAvatar) noteEl.textContent = (T.profile_photo_removed) || (currentLang === 'ru' ? 'Фото профиля будет удалено после сохранения' : currentLang === 'en' ? 'Profile photo will be removed after saving' : "Saqlangach profil rasmi o'chiriladi");
    else if (hasPhoto) noteEl.textContent = (T.profile_photo_hint) || (currentLang === 'ru' ? 'Фото появится на главной странице и в настройках' : currentLang === 'en' ? 'The photo will appear on the dashboard and in settings' : "Rasm bosh sahifa va sozlamalarda ko'rinadi");
    else noteEl.textContent = (T.profile_photo_empty) || (currentLang === 'ru' ? 'Выберите фото для профиля' : currentLang === 'en' ? 'Choose a profile photo' : 'Profil uchun rasm tanlang');
  }
}

async function compressAvatarToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const minEdge = Math.min(img.width, img.height);
        const sx = Math.max(0, Math.round((img.width - minEdge) / 2));
        const sy = Math.max(0, Math.round((img.height - minEdge) / 2));
        const size = Math.min(AVATAR_MAX_EDGE, Math.max(320, minEdge));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, minEdge, minEdge, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(tt('err_profile_photo_load', 'Avatar rasmi yuklanmadi')));
    };
    img.src = objectUrl;
  });
}

function pickProfilePhoto() {
  $('profile-photo-input')?.click();
}

async function handleProfilePhotoInput(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressAvatarToDataUrl(file);
    profileEditState.photoUrl = dataUrl;
    profileEditState.removeAvatar = false;
    renderProfileEditorUI();
  } catch (error) {
    console.error('[profile-photo]', error);
    showErr(((T.err_profile_photo_process) || (currentLang === 'ru' ? 'Не удалось обработать фото' : currentLang === 'en' ? 'Could not process photo' : "Rasmni tayyorlab bo'lmadi")) + (error?.message ? ': ' + error.message : ''));
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function removeProfilePhoto() {
  if (!getProfileEditPhotoUrl()) return;
  profileEditState.photoUrl = '';
  profileEditState.removeAvatar = true;
  renderProfileEditorUI();
}

function userFieldMissing(error, field) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(field || '').toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column') ||
    msg.includes('could not find the column')
  );
}

async function selectUserRow(extraFields = []) {
  const requestedExtraFields = Array.from(new Set(extraFields));
  const subscriptionFields = requestedExtraFields.filter((field) => SUBSCRIPTION_USER_FIELDS.includes(field));
  const notificationFields = requestedExtraFields.filter((field) => NOTIFICATION_USER_FIELDS.includes(field));
  const plainFields = requestedExtraFields.filter((field) => !SUBSCRIPTION_USER_FIELDS.includes(field) && !NOTIFICATION_USER_FIELDS.includes(field));
  let allowAvatar = userAvatarColumnSupported !== false;
  let allowSubscription = userSubscriptionColumnsSupported !== false && subscriptionFields.length > 0;
  let allowNotification = userNotificationColumnsSupported !== false && notificationFields.length > 0;
  let result = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fields = Array.from(new Set([
      ...(allowAvatar ? ['avatar_url'] : []),
      'user_id',
      'full_name',
      'phone_number',
      ...plainFields,
      ...(allowSubscription ? subscriptionFields : []),
      ...(allowNotification ? notificationFields : []),
    ])).join(', ');

    result = await db.from('users').select(fields).eq('user_id', UID).maybeSingle();
    if (!result.error) {
      if (allowAvatar) userAvatarColumnSupported = true;
      if (allowSubscription && subscriptionFields.length) userSubscriptionColumnsSupported = true;
      if (allowNotification && notificationFields.length) userNotificationColumnsSupported = true;
      break;
    }

    if (allowAvatar && userFieldMissing(result.error, 'avatar_url')) {
      allowAvatar = false;
      userAvatarColumnSupported = false;
      continue;
    }

    if (allowSubscription && subscriptionFields.some((field) => userFieldMissing(result.error, field))) {
      allowSubscription = false;
      userSubscriptionColumnsSupported = false;
      continue;
    }

    if (allowNotification && notificationFields.some((field) => userFieldMissing(result.error, field))) {
      allowNotification = false;
      userNotificationColumnsSupported = false;
      continue;
    }

    break;
  }
  return result;
}

async function updateUserRow(values) {
  let payload = { ...values };
  if (userAvatarColumnSupported === false) delete payload.avatar_url;
  let result = await db.from('users').update(payload).eq('user_id', UID);
  if (result.error && 'avatar_url' in payload && /avatar_url/i.test(result.error.message || '')) {
    userAvatarColumnSupported = false;
    const { avatar_url, ...fallback } = payload;
    result = await db.from('users').update(fallback).eq('user_id', UID);
  } else if (!result.error && 'avatar_url' in payload) {
    userAvatarColumnSupported = true;
  }
  return result;
}

async function insertUserRow(values) {
  let payload = { ...values };
  if (userAvatarColumnSupported === false) delete payload.avatar_url;
  let result = await db.from('users').insert(payload);
  if (result.error && 'avatar_url' in payload && /avatar_url/i.test(result.error.message || '')) {
    userAvatarColumnSupported = false;
    const { avatar_url, ...fallback } = payload;
    result = await db.from('users').insert(fallback);
  } else if (!result.error && 'avatar_url' in payload) {
    userAvatarColumnSupported = true;
  }
  return result;
}

function renderProfileUI() {
  const displayName = getDisplayName();
  const nameEl = $('stg-user-name');
  const subEl = $('stg-sub-info');
  const inputEl = $('stg-name-in');
  const dashNameEl = $('dash-user-name');
  const dashSubEl = $('dash-user-sub');

  if (nameEl) nameEl.textContent = displayName;
  if (subEl) subEl.textContent = getProfileMeta() || tt('profile_meta_fallback', 'Telegram foydalanuvchisi');
  if (inputEl && !document.activeElement?.isSameNode(inputEl)) inputEl.value = displayName;
  if (dashNameEl) dashNameEl.textContent = displayName;
  if (dashSubEl) dashSubEl.textContent = getHeaderSubText();

  setAvatar('stg-avatar');
  setAvatar('stg-avatar-edit', { photoUrl: getProfileEditPhotoUrl() });
  setAvatar('dash-avatar');
  renderProfileEditorUI();
  updateSubscriptionUI();
}

function addMsg(text, isUser = false) {
  const area = $('chat-area');
  if (!area) return;
  const d = document.createElement('div');
  d.className = 'msg' + (isUser ? ' u' : '');
  d.innerHTML = text;
  area.appendChild(d);
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 60);
}

// ─── LOADER ─────────────────────────────────────────────
let loaderInterval;
function startLoaderMessages() {
  const msgEl = $('loader-msg');
  if (!msgEl) return;
  const msgs = [tt('loading_1', 'Yuklanmoqda...'), tt('loading_2', 'Sozlanyapti...'), tt('loading_3', 'Deyarli tayyor...'), tt('loading_4', 'Yana bir soniya...')];
  let idx = 0;
  loaderInterval = setInterval(() => {
    msgEl.classList.add('fade');
    setTimeout(() => {
      idx = (idx + 1) % msgs.length;
      msgEl.textContent = msgs[idx];
      msgEl.classList.remove('fade');
    }, 300);
  }, 1300);
}

function hideLoader() {
  const el = $('loader');
  if (!el) return;
  clearInterval(loaderInterval);
  el.classList.add('out');
  setTimeout(() => { el.style.display = 'none'; }, 500);
}

// ─── INIT: entry point ──────────────────────────────────
(async () => {
  startLoaderMessages();
  // Avval loader ko'rinsin, faqat hamma narsa tayyor bo'lgach yopiladi

  applyAccentTheme(store.get('accent_theme') || getDefaultAccentTheme());
  if (store.get('theme') === 'light') document.body.classList.add('light');

  // Biometrics init
  if (tg?.BiometricManager && tgVersionAtLeast('7.2')) {
    tg.BiometricManager.init(() => {
      updateSettingsUI();
      if (pin) showPin('unlock');
    });
  } else if (pin) {
    showPin('unlock');
  }

  buildIconGrid();

  await loadConfig();
  await configurePushNotifications();

  if (db && UID) {
    try {
      await ensureUser();
      await loadData();
      initRealtime(); // Real-time ulanishni yoqish
    } catch (e) {
      console.error('[boot]', e);
      showErr(tt('err_boot_data_load', "Ma'lumotlar yuklanmadi") + ': ' + (e?.message || e));
    }
  } else if (!UID) {
    showErr(tt('err_missing_user_id', "Telegram user_id topilmadi. URLga ?user_id=123 qo'shing."));
  }

  // i18n tizimini yuklash
  await loadLang(currentLang);
  applyLang();

  renderAll();
  updateSettingsUI();
  updateNotificationSettingsUI();
  initSettingsUI();
  hideLoader();
  initSwipe();
  const initialTab = routeBridge()?.getCurrentTab?.() || getActiveTabFromDom();
  goTab(initialTab, { fromRouter: true, replace: true });
})();

// ─── REALTIME ───────────────────────────────────────────
function initRealtime() {
  if (!db || !UID) return;

  // Tranzaksiyalar uchun realtime
  db.channel('tx-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${UID}` },
      payload => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
          const tx = normTx(newRow);
          if (!txList.some(t => t.id === tx.id)) txList.unshift(tx);
        } else if (eventType === 'UPDATE') {
          const tx = normTx(newRow);
          const i = txList.findIndex(t => t.id === tx.id);
          if (i !== -1) txList[i] = tx;
        } else if (eventType === 'DELETE') {
          txList = txList.filter(t => t.id !== oldRow.id);
        }
        renderAll();
        renderHistory();
      }
    )
    .subscribe();

  // Kategoriyalar uchun realtime
  db.channel('cat-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${UID}` },
      payload => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const list = cats[newRow.type];
          if (list) {
            const i = list.findIndex(c => c.id === newRow.id);
            if (i !== -1) list[i] = newRow; else list.push(newRow);
            list.sort((a, b) => a.name.localeCompare(b.name));
          }
        } else if (eventType === 'DELETE') {
          cats.income = cats.income.filter(c => c.id !== oldRow.id);
          cats.expense = cats.expense.filter(c => c.id !== oldRow.id);
        }
        if ($('flow-cats').style.display === 'flex') buildCatGrid(draft.type);
        renderAll();
      }
    )
    .subscribe();
}

// ─── CONFIG LOAD ────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/config.js', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    new Function(txt)();
  } catch (e) {
    console.warn('[config] fetch failed:', e.message);
  }

  const cfg = window.__APP_CONFIG__ || {};
  const url = cfg.SUPABASE_URL || '';
  const key = cfg.SUPABASE_ANON_KEY || '';

  if (url && key && window.supabase?.createClient) {
    try { db = window.supabase.createClient(url, key); }
    catch (e) { console.warn('[supabase] init failed:', e.message); }
  }
}

// ─── SUPABASE CALLS ─────────────────────────────────────
async function ensureUser() {
  const tgUser = getTgUser();
  const tgName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim() || `User ${UID}`;
  profileState.username = tgUser?.username || profileState.username || '';

  const { data: existing, error: ue } = await selectUserRow();
  if (ue) throw ue;

  if (!existing) {
    const row = {
      user_id: UID,
      full_name: tgName,
      phone_number: null,
      avatar_url: getCurrentProfilePhotoUrl() || null
    };
    const { error: ie } = await insertUserRow(row);
    if (ie) throw ie;
    profileState.fullName = row.full_name;
    profileState.phone = row.phone_number || '';
    setProfileAvatarCache(row.avatar_url || '');
    store.set('display_name', profileState.fullName);
    resetProfileEditState();
    syncSubscriptionState(row, { schemaReady: false });
    renderProfileUI();
    return;
  }

  profileState.fullName = normalizeName(existing.full_name) || tgName;
  profileState.phone = existing.phone_number || '';
  setProfileAvatarCache(existing.avatar_url || '');
  store.set('display_name', profileState.fullName);

  if (!normalizeName(existing.full_name)) {
    updateUserRow({ full_name: tgName }).then(() => { }).catch(() => { });
  }

  resetProfileEditState();
  syncSubscriptionState(existing, { schemaReady: hasSubscriptionSchema(existing) });
  renderProfileUI();
}

async function loadData() {
  const { data: u, error: ue } = await selectUserRow(['exchange_rate', ...SUBSCRIPTION_USER_FIELDS, ...NOTIFICATION_USER_FIELDS]);
  if (ue) throw ue;

  if (u?.exchange_rate) {
    rate = Number(u.exchange_rate) || rate;
    store.set('rate', rate);
  }
  syncSubscriptionState(u || {}, { schemaReady: hasSubscriptionSchema(u) && userSubscriptionColumnsSupported !== false });
  syncNotificationUserState(u || {}, { schemaReady: hasNotificationSchema(u) && userNotificationColumnsSupported !== false });
  if (u) {
    profileState.fullName = normalizeName(u.full_name) || profileState.fullName;
    profileState.phone = u.phone_number || profileState.phone || '';
    setProfileAvatarCache(u.avatar_url || '');
    if (profileState.fullName) store.set('display_name', profileState.fullName);
    resetProfileEditState();
    renderProfileUI();
  }

  txList = await fetchAllTransactions();
  histOffset = txList.length;
  hasMoreTx = false;

  const { data: cd, error: ce } = await db.from('categories').select('*')
    .eq('user_id', UID).order('name');
  if (ce) throw ce;

  if (!cd || cd.length === 0) await seedCats();
  else {
    cats.income = cd.filter(c => c.type === 'income');
    cats.expense = cd.filter(c => c.type === 'expense');
  }
}

async function seedCats() {
  const defs = [
    { name: 'Oylik', icon: 'banknote', type: 'income' },
    { name: 'Bonus', icon: 'gift', type: 'income' },
    { name: 'Sotuv', icon: 'shopping-bag', type: 'income' },
    { name: 'Ovqat', icon: 'shopping-cart', type: 'expense' },
    { name: 'Transport', icon: 'bus', type: 'expense' },
    { name: 'Kafe', icon: 'coffee', type: 'expense' },
  ].map(c => ({ ...c, user_id: UID }));

  const { data, error } = await db.from('categories').insert(defs).select();
  if (error) throw error;
  cats.income = (data || []).filter(c => c.type === 'income');
  cats.expense = (data || []).filter(c => c.type === 'expense');
}

// ─── NAVIGATION ─────────────────────────────────────────
function routeBridge() {
  return window.__KASSA_ROUTER__ || null;
}

function isFinanceTab(tab) {
  return tab === 'debt' || tab === 'plan';
}

function getFinanceViewTab() {
  const el = $('view-finance');
  const tab = String(el?.dataset?.activeTab || '').trim();
  return tab === 'plan' ? 'plan' : 'debt';
}

function getPreferredFinanceTab() {
  return lastFinanceTab === 'plan' ? 'plan' : getFinanceViewTab();
}

function openFinanceSection() {
  return goTab(getPreferredFinanceTab());
}

function warmViewChunk(tab) {
  try {
    window.__KASSA_VIEW_BRIDGE__?.preloadView?.(tab);
  } catch (error) {
    console.warn('[view-bridge] preload request failed', tab, error);
  }
}

async function ensureViewReady(tab) {
  try {
    await window.__KASSA_VIEW_BRIDGE__?.ensureViewMounted?.(tab);
  } catch (error) {
    console.warn('[view-bridge] mount failed', tab, error);
  }
}

function getActiveTabFromDom() {
  const id = document.querySelector('.view.active')?.id || '';
  if (id === 'view-finance') return getFinanceViewTab();
  return id.startsWith('view-') ? id.slice(5) : 'dash';
}

function syncLegacyRoute(tab, opts = {}) {
  if (opts.fromRouter) return;
  try {
    routeBridge()?.navigateToTab?.(tab, {
      replace: !!opts.replace,
      silent: true,
      source: 'legacy',
    });
  } catch (e) {
    console.warn('[route-bridge] Failed to sync route', e);
  }
}

function bindRouteBridge() {
  if (window.__kassaRouteBridgeBound) return;
  window.__kassaRouteBridgeBound = true;
  window.addEventListener('kassa:route-request', (event) => {
    const tab = event?.detail?.tab;
    if (!tab || tab === getActiveTabFromDom()) return;
    goTab(tab, { fromRouter: true, replace: event?.detail?.source === 'location' });
  });
}

function goTab(tab, opts = {}) {
  return (async () => {
    try {
      syncLegacyRoute(tab, opts);
      await ensureViewReady(tab);
      vib('light');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));

      if (isFinanceTab(tab)) lastFinanceTab = tab;

      const viewId = isFinanceTab(tab) ? 'view-finance' : `view-${tab}`;
      const navId = isFinanceTab(tab) ? 'nb-finance' : `nb-${tab}`;
      const v = $(viewId);
      const n = $(navId);
      if (isFinanceTab(tab) && v) v.dataset.activeTab = tab;
      if (v) v.classList.add('active');
      if (n) n.classList.add('active');

      if (tab === 'dash') renderAll();
      if (tab === 'profile') {
        renderProfileUI();
        updateSettingsUI();
      }
      if (tab === 'hist') {
        renderHistory();
        initHistScroll();
      }
    } catch (e) {
      console.error('[goTab] Error:', e);
    }
  })();
}

bindRouteBridge();
window.openFinanceSection = openFinanceSection;
window.warmViewChunk = warmViewChunk;

async function loadMore() {
  return;
}

function initHistScroll() {
  const v = $('view-hist');
  if (!v || v.dataset.scrollInited) return;
  v.dataset.scrollInited = '1';
  v.onscroll = () => {
    if (v.scrollTop + v.clientHeight >= v.scrollHeight - 100) {
      loadMore();
    }
  };
}

// ─── RENDER ALL ─────────────────────────────────────────
function renderAll() {
  try {
    const { s, e } = getRange();
    const sorted = [...txList].sort((a, b) => b.ms - a.ms);
    const ranged = sorted.filter(t => t.ms >= s && t.ms <= e);
    const shown = typeFilt === 'all' ? ranged : ranged.filter(t => t.type === typeFilt);

    const inc = shown.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const exp = shown.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const bal = inc - exp;

    const balEl = $('total-bal');
    const incEl = $('total-inc');
    const expEl = $('total-exp');

    if (balEl) {
      balEl.classList.remove('loading');
      let txt = '';
      if (currency === 'USD' && rate > 0) {
        txt = `$${fmt(bal / rate)}`;
        incEl.textContent = `+$${fmt(inc / rate)}`;
        expEl.textContent = `-$${fmt(exp / rate)}`;
      } else {
        txt = `${fmt(bal)} ${t('suffix_uzs')}`;
        incEl.textContent = `+${fmt(inc)}`;
        expEl.textContent = `-${fmt(exp)}`;
      }
      balEl.textContent = txt;
      updateBalSize(txt);
    }

    const tci = $('tc-i'), tce = $('tc-e');
    if (tci) { tci.classList.toggle('on-i', typeFilt === 'income'); }
    if (tce) { tce.classList.toggle('on-e', typeFilt === 'expense'); }

    renderDashboardWidgets(ranged);
    renderChart(shown);
    renderTrends();
  } catch (e) {
    console.error('[renderAll] Error:', e);
  }
}

function formatDashboardAmount(value, { signed = false } = {}) {
  const amount = Number(value) || 0;
  const prefix = signed ? (amount > 0 ? '+' : amount < 0 ? '-' : '') : '';
  const abs = Math.abs(amount);
  if (currency === 'USD' && rate > 0) {
    return `${prefix}$${fmt(abs / rate)}`;
  }
  return `${prefix}${fmt(abs)} ${tt('suffix_uzs', "so'm")}`;
}

function getDashboardRangeLabel() {
  if (dateFilt === 'week') return tt('dashboard_widget_range_week', 'So‘nggi hafta');
  if (dateFilt === 'month') return tt('dashboard_widget_range_month', 'Shu oy');
  if (dateFilt === 'custom') return tt('dashboard_widget_range_custom', 'Maxsus davr');
  return tt('dashboard_widget_range_all', 'Barcha davr');
}

function getWeekStartMs(ms = Date.now()) {
  const d = new Date(ms);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff).getTime();
}

function getMonthStartMs(ms = Date.now()) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function getRowsInWindow(rows = [], start = 0, end = Date.now(), type = 'all') {
  return (rows || []).filter((row) => {
    const withinRange = row.ms >= start && row.ms <= end;
    if (!withinRange) return false;
    return type === 'all' ? true : row.type === type;
  });
}

function groupCategoryTotals(rows = []) {
  const grouped = {};
  (rows || []).forEach((row) => {
    const name = String(row?.category || '').trim() || '—';
    grouped[name] = (grouped[name] || 0) + (Number(row?.amount) || 0);
  });
  return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
}

function getTopCategoryInfo(rows = [], preferredType = 'expense') {
  const preferred = rows.filter((row) => row.type === preferredType);
  const source = preferred.length ? preferred : rows;
  const entries = groupCategoryTotals(source);
  if (!entries.length) return null;
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  const [name, amount] = entries[0];
  return {
    name,
    amount,
    share: total > 0 ? (amount / total) * 100 : 0,
    type: preferred.length ? preferredType : (source[0]?.type || preferredType),
  };
}

function summarizeDashboardRows(rows = []) {
  let income = 0;
  let expense = 0;
  let absoluteTotal = 0;
  (rows || []).forEach((row) => {
    const amount = Number(row?.amount) || 0;
    absoluteTotal += Math.abs(amount);
    if (row?.type === 'income') income += amount;
    else expense += amount;
  });
  return {
    count: rows.length,
    income,
    expense,
    balance: income - expense,
    averageTicket: rows.length ? absoluteTotal / rows.length : 0,
    topCategory: getTopCategoryInfo(rows, 'expense'),
  };
}

function getChangeMeta(currentValue = 0, previousValue = 0) {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  if (current === 0 && previous === 0) {
    return { state: 'flat', raw: 0, label: '0%' };
  }
  if (previous === 0) {
    return { state: current === 0 ? 'flat' : 'new', raw: null, label: current === 0 ? '0%' : tt('dashboard_widget_new', 'Yangi') };
  }
  const raw = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(raw) || Math.abs(raw) < 0.5) {
    return { state: 'flat', raw: 0, label: '0%' };
  }
  return {
    state: raw > 0 ? 'up' : 'down',
    raw,
    label: `${raw > 0 ? '+' : '-'}${Math.round(Math.abs(raw))}%`,
  };
}

function getDeltaTone(meta, metricKey = 'balance') {
  if (!meta || meta.state === 'flat') return 'neutral';
  if (meta.state === 'new') return 'accent';
  const positive = metricKey === 'expense' ? meta.state === 'down' : meta.state === 'up';
  return positive ? 'good' : 'bad';
}

function getPeriodComparison(period = 'week') {
  const now = Date.now();
  if (period === 'month') {
    const currentStart = getMonthStartMs(now);
    const previousStart = getMonthStartMs(new Date(new Date(now).getFullYear(), new Date(now).getMonth() - 1, 1).getTime());
    const previousEnd = currentStart - 1;
    const currentRows = getRowsInWindow(txList, currentStart, now);
    const previousRows = getRowsInWindow(txList, previousStart, previousEnd);
    const currentSummary = summarizeDashboardRows(currentRows);
    const previousSummary = summarizeDashboardRows(previousRows);
    return {
      title: tt('dashboard_widget_this_month', 'Shu oy'),
      compareLabel: tt('dashboard_widget_last_month_compare', 'O‘tgan oy bilan'),
      currentRows,
      previousRows,
      currentSummary,
      previousSummary,
      deltas: {
        income: getChangeMeta(currentSummary.income, previousSummary.income),
        expense: getChangeMeta(currentSummary.expense, previousSummary.expense),
        balance: getChangeMeta(currentSummary.balance, previousSummary.balance),
      }
    };
  }

  const currentStart = getWeekStartMs(now);
  const previousEnd = currentStart - 1;
  const previousStart = currentStart - (7 * DAY_MS);
  const currentRows = getRowsInWindow(txList, currentStart, now);
  const previousRows = getRowsInWindow(txList, previousStart, previousEnd);
  const currentSummary = summarizeDashboardRows(currentRows);
  const previousSummary = summarizeDashboardRows(previousRows);
  return {
    title: tt('dashboard_widget_this_week', 'Shu hafta'),
    compareLabel: tt('dashboard_widget_last_week_compare', 'O‘tgan hafta bilan'),
    currentRows,
    previousRows,
    currentSummary,
    previousSummary,
    deltas: {
      income: getChangeMeta(currentSummary.income, previousSummary.income),
      expense: getChangeMeta(currentSummary.expense, previousSummary.expense),
      balance: getChangeMeta(currentSummary.balance, previousSummary.balance),
    }
  };
}

function getCategoryMomentum(period = 'week', limit = 3) {
  const comparison = getPeriodComparison(period);
  const currentEntries = groupCategoryTotals(comparison.currentRows.filter((row) => row.type === 'expense'));
  const previousEntries = Object.fromEntries(groupCategoryTotals(comparison.previousRows.filter((row) => row.type === 'expense')));
  const totalCurrent = currentEntries.reduce((sum, [, amount]) => sum + amount, 0);
  return {
    title: period === 'month'
      ? tt('dashboard_widget_category_month', 'Oylik kategoriya ulushi')
      : tt('dashboard_widget_category_week', 'Haftalik kategoriya ulushi'),
    compareLabel: comparison.compareLabel,
    items: currentEntries.slice(0, limit).map(([name, amount]) => ({
      name,
      amount,
      share: totalCurrent > 0 ? (amount / totalCurrent) * 100 : 0,
      delta: getChangeMeta(amount, previousEntries[name] || 0),
    })),
  };
}

function renderOverviewWidgetCard(card) {
  return `
    <article class="dash-widget-card ${escapeHtml(card.tone || 'neutral')}">
      <div class="dash-widget-label">${escapeHtml(card.label)}</div>
      <div class="dash-widget-value">${escapeHtml(card.value)}</div>
      <div class="dash-widget-sub">${escapeHtml(card.sub)}</div>
    </article>
  `;
}

function renderDashboardOverview(rows = []) {
  const grid = $('dash-overview-grid');
  if (!grid) return;

  const summary = summarizeDashboardRows(rows);
  const topCategory = summary.topCategory;
  const cards = [
    {
      tone: 'tone-balance',
      label: tt('dashboard_widget_net_flow', 'Sof oqim'),
      value: formatDashboardAmount(summary.balance, { signed: true }),
      sub: getDashboardRangeLabel(),
    },
    {
      tone: 'tone-count',
      label: tt('dashboard_widget_transactions', 'Operatsiyalar'),
      value: fmt(summary.count),
      sub: getDashboardRangeLabel(),
    },
    {
      tone: 'tone-average',
      label: tt('dashboard_widget_avg_ticket', 'O‘rtacha chek'),
      value: summary.count ? formatDashboardAmount(summary.averageTicket) : '—',
      sub: tt('dashboard_widget_avg_ticket_sub', 'Har tranzaksiya bo‘yicha'),
    },
    {
      tone: 'tone-category',
      label: tt('dashboard_widget_top_category', 'Top kategoriya'),
      value: topCategory ? topCategory.name : tt('dashboard_widget_no_category', 'Hali yo‘q'),
      sub: topCategory
        ? `${formatDashboardAmount(topCategory.amount)} · ${Math.round(topCategory.share)}%`
        : tt('dashboard_widget_top_category_sub', 'Xarajatlar yig‘ilgach ko‘rinadi'),
    },
  ];

  grid.innerHTML = cards.map(renderOverviewWidgetCard).join('');
}

function getFinanceFeatureSnapshot() {
  try {
    const snapshot = window.__KASSA_FINANCE_FEATURES__?.getSnapshot?.();
    if (!snapshot || typeof snapshot !== 'object') {
      return { planReady: false, debtReady: false, plans: [], debts: [] };
    }
    return {
      planReady: snapshot.planReady === true,
      debtReady: snapshot.debtReady === true,
      plans: Array.isArray(snapshot.plans) ? snapshot.plans : [],
      debts: Array.isArray(snapshot.debts) ? snapshot.debts : [],
    };
  } catch (error) {
    console.warn('[dashboard] finance snapshot failed', error);
    return { planReady: false, debtReady: false, plans: [], debts: [] };
  }
}

function getDashboardMonthContext(ms = Date.now()) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  const prevStart = new Date(year, month - 1, 1).getTime();
  const prevEnd = start - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const elapsedDays = Math.max(1, date.getDate());
  const remainingDays = Math.max(1, daysInMonth - date.getDate() + 1);
  return { start, end, prevStart, prevEnd, daysInMonth, elapsedDays, remainingDays };
}

function formatDashboardPercent(value, { signed = false, decimals = 0 } = {}) {
  if (!Number.isFinite(value)) return '—';
  const amount = Math.abs(value);
  const fixed = decimals > 0 ? amount.toFixed(decimals) : String(Math.round(amount));
  const prefix = signed ? (value > 0 ? '+' : value < 0 ? '-' : '') : '';
  return `${prefix}${fixed}%`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDashboardBaseCategoryName(value = '') {
  return String(value || '').replace(/\s*\(\$.*\)\s*$/u, '').trim();
}

function normalizeDashboardMatchText(value = '') {
  return getDashboardBaseCategoryName(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻ’`']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDashboardMonthKey(ms = Date.now()) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getTotalBalance(rows = []) {
  return summarizeDashboardRows(rows).balance;
}

function getBalanceBefore(rows = [], beforeMs = Date.now()) {
  return getTotalBalance((rows || []).filter((row) => row.ms < beforeMs));
}

function groupRowsByDashboardCategory(rows = [], type = 'expense') {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    if (type !== 'all' && row.type !== type) return;
    const label = getDashboardBaseCategoryName(row.category) || tt('dashboard_premium_uncategorized', 'Kategoriyasiz');
    const key = normalizeDashboardMatchText(label) || label;
    if (!grouped.has(key)) {
      grouped.set(key, { key, name: label, amount: 0, rows: [] });
    }
    const bucket = grouped.get(key);
    bucket.amount += Number(row.amount) || 0;
    bucket.rows.push(row);
  });
  return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
}

function getDashboardPlanStats(plan, monthExpenseRows = []) {
  const budget = Number(plan?.amount) || 0;
  const targetMonth = String(plan?.month_key || getDashboardMonthKey()).trim();
  const spent = (monthExpenseRows || [])
    .filter((row) => getDashboardMonthKey(row.ms) === targetMonth)
    .filter((row) => normalizeDashboardMatchText(row.category) === normalizeDashboardMatchText(plan?.category_name))
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const rawRemaining = budget - spent;
  const remaining = Math.max(0, rawRemaining);
  const percentRaw = budget > 0 ? (spent / budget) * 100 : 0;
  const percent = budget > 0 ? clampNumber(percentRaw, 0, 999) : 0;
  const exceeded = budget > 0 && spent > budget;
  const alertBefore = Number(plan?.alert_before) || 0;
  const near = budget > 0 ? (!exceeded && (remaining <= alertBefore || percent >= 85)) : false;
  return {
    budget,
    spent,
    rawRemaining,
    remaining,
    percent,
    exceeded,
    near,
    overBy: Math.max(0, spent - budget),
  };
}

function getDebtDueTimestamp(item) {
  return item?.due_at ? toMs(item.due_at) : 0;
}

function formatDashboardDayLabel(ms) {
  return new Intl.DateTimeFormat(localeTag(), { weekday: 'short' }).format(new Date(ms));
}

function getTransactionNoteHint(tx) {
  const explicitNote = String(tx?.note || '').trim();
  if (explicitNote) return explicitNote;
  const category = String(tx?.category || '').trim();
  if (category.includes(' · ')) return category.split(' · ').slice(1).join(' · ').trim();
  return '';
}

function averageNumber(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildRecurringPayments(rows = []) {
  const cutoff = Date.now() - (120 * DAY_MS);
  const grouped = new Map();
  rows
    .filter((row) => row.type === 'expense' && row.ms >= cutoff)
    .forEach((row) => {
      const label = getDashboardBaseCategoryName(row.category);
      const key = normalizeDashboardMatchText(label);
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, { name: label, rows: [] });
      grouped.get(key).rows.push(row);
    });

  return Array.from(grouped.values())
    .map((group) => {
      const items = group.rows.slice().sort((a, b) => a.ms - b.ms);
      const monthKeys = [...new Set(items.map((row) => getDashboardMonthKey(row.ms)))];
      if (items.length < 2 || monthKeys.length < 2) return null;
      const intervals = items.slice(1).map((item, index) => (item.ms - items[index].ms) / DAY_MS);
      const monthlyLike = intervals.some((value) => value >= 24 && value <= 38) || monthKeys.length >= 3;
      if (!monthlyLike) return null;
      const amounts = items.map((item) => Number(item.amount) || 0).filter((item) => item > 0);
      const avgAmount = averageNumber(amounts);
      const dayNumbers = items.map((item) => new Date(item.ms).getDate());
      const daySpread = dayNumbers.length ? Math.max(...dayNumbers) - Math.min(...dayNumbers) : 31;
      const avgInterval = intervals.length ? averageNumber(intervals) : 30;
      const nextDateMs = items[items.length - 1].ms + (avgInterval * DAY_MS);
      const amountSpread = avgAmount > 0 && amounts.length ? (Math.max(...amounts) - Math.min(...amounts)) / avgAmount : 1;
      const confidence = clampNumber(
        (daySpread <= 5 ? 0.45 : 0.22)
          + (amountSpread <= 0.25 ? 0.35 : 0.16)
          + (monthKeys.length >= 3 ? 0.2 : 0.08),
        0,
        1
      );
      return {
        name: group.name,
        avgAmount,
        lastDateMs: items[items.length - 1].ms,
        nextDateMs,
        confidence,
        count: items.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.avgAmount - a.avgAmount;
    })
    .slice(0, 5);
}

function buildAbnormalSpendingAlerts(rows = []) {
  const now = Date.now();
  const currentStart = getDayStartMs(now) - (6 * DAY_MS);
  const previousEnd = currentStart - 1;
  const previousStart = currentStart - (7 * DAY_MS);
  const currentRows = getRowsInWindow(rows, currentStart, now, 'expense');
  const previousRows = getRowsInWindow(rows, previousStart, previousEnd, 'expense');
  const currentTotal = currentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const previousTotal = previousRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const alerts = [];

  if (currentTotal > 0 && previousTotal > 0) {
    const change = ((currentTotal - previousTotal) / previousTotal) * 100;
    if (change >= 25 && currentTotal - previousTotal >= 200000) {
      alerts.push({
        tone: 'danger',
        title: tt('dashboard_premium_alert_total_title', 'Haftalik xarajat keskin oshdi'),
        body: notifText(
          `So‘nggi 7 kunda xarajat ${formatDashboardPercent(change, { signed: true })} ga oshdi.`,
          `Расходы за последние 7 дней выросли на ${formatDashboardPercent(change, { signed: true })}.`,
          `Your spending over the last 7 days is up ${formatDashboardPercent(change, { signed: true })}.`
        ),
      });
    }
  }

  const currentCategories = groupRowsByDashboardCategory(currentRows, 'expense');
  const previousMap = Object.fromEntries(groupRowsByDashboardCategory(previousRows, 'expense').map((item) => [item.key, item.amount]));
  currentCategories.slice(0, 4).forEach((item) => {
    const previousAmount = Number(previousMap[item.key] || 0);
    if (item.amount >= 150000 && ((previousAmount > 0 && item.amount >= previousAmount * 1.6) || (previousAmount === 0 && item.amount >= 250000))) {
      const changeText = previousAmount > 0
        ? formatDashboardPercent(((item.amount - previousAmount) / previousAmount) * 100, { signed: true })
        : tt('dashboard_widget_new', 'Yangi');
      alerts.push({
        tone: 'warn',
        title: tt('dashboard_premium_alert_category_title', 'Kategoriya bo‘yicha sakrash'),
        body: notifText(
          `${item.name} bo‘yicha xarajat ${changeText} ga oshdi.`,
          `Траты по категории ${item.name} выросли на ${changeText}.`,
          `${item.name} spending increased by ${changeText}.`
        ),
      });
    }
  });

  return alerts.slice(0, 3);
}

function calculateFinancialHealth(model) {
  const savingsRate = Number.isFinite(model.savingsRate) ? model.savingsRate : null;
  const savingsScore = savingsRate == null
    ? 12
    : clampNumber(((savingsRate + 10) / 30) * 30, 0, 30);

  const activeLimits = model.limitStats.length;
  const exceededLimits = model.limitStats.filter((item) => item.stats.exceeded).length;
  const nearLimits = model.limitStats.filter((item) => item.stats.near).length;
  const limitDisciplineScore = activeLimits
    ? clampNumber((((activeLimits - exceededLimits) + (nearLimits * 0.5)) / activeLimits) * 25, 0, 25)
    : 16;

  const payablePressure = model.monthIncome > 0
    ? model.payableDebts / model.monthIncome
    : (model.payableDebts > 0 ? 1 : 0);
  const debtScore = clampNumber((1 - Math.min(1, payablePressure)) * 20, 0, 20) - Math.min(8, model.overdueDebtCount * 4);

  const currentWeek = model.currentWeekExpense;
  const previousWeek = model.previousWeekExpense;
  const volatility = previousWeek > 0 ? Math.abs(currentWeek - previousWeek) / previousWeek : (currentWeek > 0 ? 1 : 0);
  const stabilityScore = clampNumber((1 - Math.min(1, volatility)) * 15, 0, 15) - Math.min(6, model.abnormalAlerts.length * 2);

  const planCount = model.planProgressItems.length;
  const onTrackCount = model.planProgressItems.filter((item) => !item.stats.exceeded && !item.stats.near).length;
  const nearCount = model.planProgressItems.filter((item) => item.stats.near).length;
  const planScore = planCount
    ? clampNumber((((onTrackCount) + (nearCount * 0.5)) / planCount) * 10, 0, 10)
    : 6;

  const score = clampNumber(
    Math.round(savingsScore + limitDisciplineScore + Math.max(0, debtScore) + Math.max(0, stabilityScore) + planScore),
    0,
    100
  );

  const breakdown = [
    { label: tt('dashboard_premium_health_savings', 'Jamg‘arma'), value: `${Math.round(savingsScore)}/30` },
    { label: tt('dashboard_premium_health_limits', 'Limit'), value: `${Math.round(limitDisciplineScore)}/25` },
    { label: tt('dashboard_premium_health_debts', 'Qarz'), value: `${Math.round(Math.max(0, debtScore))}/20` },
    { label: tt('dashboard_premium_health_stability', 'Barqarorlik'), value: `${Math.round(Math.max(0, stabilityScore))}/15` },
    { label: tt('dashboard_premium_health_plans', 'Rejalar'), value: `${Math.round(planScore)}/10` },
  ];

  const weakest = breakdown.slice().sort((a, b) => {
    const aScore = Number(String(a.value).split('/')[0]) || 0;
    const bScore = Number(String(b.value).split('/')[0]) || 0;
    return aScore - bScore;
  })[0];

  const summary = score >= 80
    ? tt('dashboard_premium_health_summary_strong', 'Pul oqimi nazoratda, xavflar past.')
    : score >= 60
      ? tt('dashboard_premium_health_summary_ok', 'Umumiy holat yaxshi, lekin bir necha xavf signali bor.')
      : tt('dashboard_premium_health_summary_risk', 'Asosiy ko‘rsatkichlarda bosim bor, reja va xarajatni qayta ko‘ring.');

  return {
    score,
    breakdown,
    summary,
    weakest,
  };
}

function buildPremiumDashboardModel() {
  const finance = getFinanceFeatureSnapshot();
  const now = Date.now();
  const month = getDashboardMonthContext(now);
  const monthRows = getRowsInWindow(txList, month.start, now);
  const monthExpenseRows = monthRows.filter((row) => row.type === 'expense');
  const monthSummary = summarizeDashboardRows(monthRows);
  const previousMonthRows = getRowsInWindow(txList, month.prevStart, month.prevEnd);
  const previousMonthSummary = summarizeDashboardRows(previousMonthRows);
  const totalBalance = getTotalBalance(txList);
  const monthStartBalance = getBalanceBefore(txList, month.start);
  const todayStart = getDayStartMs(now);
  const todayRows = getRowsInWindow(txList, todayStart, todayStart + DAY_MS - 1);
  const todayNet = summarizeDashboardRows(todayRows).balance;
  const balanceVsPrevMonth = getChangeMeta(totalBalance, monthStartBalance);
  const forecastExpense = month.elapsedDays > 0 ? (monthSummary.expense / month.elapsedDays) * month.daysInMonth : monthSummary.expense;
  const remainingForecastExpense = Math.max(0, forecastExpense - monthSummary.expense);
  const expectedSavings = monthSummary.income - forecastExpense;
  const forecastBalance = totalBalance - remainingForecastExpense;
  const limitStats = finance.plans
    .filter((plan) => plan?.is_active !== false)
    .filter((plan) => String(plan?.month_key || getDashboardMonthKey()) === getDashboardMonthKey(now))
    .map((plan) => ({ plan, stats: getDashboardPlanStats(plan, monthExpenseRows) }));
  const sortedLimitStats = limitStats.slice().sort((a, b) => {
    const riskA = a.stats.exceeded ? 3 : a.stats.near ? 2 : 1;
    const riskB = b.stats.exceeded ? 3 : b.stats.near ? 2 : 1;
    if (riskB !== riskA) return riskB - riskA;
    if (b.stats.percent !== a.stats.percent) return b.stats.percent - a.stats.percent;
    return b.stats.spent - a.stats.spent;
  });
  const topExpenseCategories = groupRowsByDashboardCategory(monthExpenseRows, 'expense');
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const dayMs = getDayStartMs(now) - ((6 - index) * DAY_MS);
    const dayRows = getRowsInWindow(txList, dayMs, dayMs + DAY_MS - 1);
    const summary = summarizeDashboardRows(dayRows);
    return {
      label: formatDashboardDayLabel(dayMs),
      income: summary.income,
      expense: summary.expense,
      ms: dayMs,
    };
  });
  const maxTrendValue = Math.max(1, ...last7Days.flatMap((item) => [item.income, item.expense]));
  const savingsRate = monthSummary.income > 0 ? ((monthSummary.income - monthSummary.expense) / monthSummary.income) * 100 : null;
  const largestTransactions = monthRows
    .slice()
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return b.ms - a.ms;
    })
    .slice(0, 5);
  const openDebts = finance.debts.filter((item) => item?.status !== 'paid');
  const receivableDebts = openDebts
    .filter((item) => item.direction === 'receivable')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const payableDebts = openDebts
    .filter((item) => item.direction === 'payable')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const dueSoonDebt = openDebts
    .filter((item) => getDebtDueTimestamp(item) > 0)
    .sort((a, b) => getDebtDueTimestamp(a) - getDebtDueTimestamp(b))[0] || null;
  const overdueDebtCount = openDebts.filter((item) => {
    const ts = getDebtDueTimestamp(item);
    return ts > 0 && ts < now;
  }).length;
  const payableDueThisMonth = openDebts
    .filter((item) => item.direction === 'payable')
    .filter((item) => {
      const ts = getDebtDueTimestamp(item);
      return ts > 0 && ts <= month.end;
    })
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const remainingLimitBudget = sortedLimitStats.reduce((sum, item) => sum + item.stats.remaining, 0);
  const safeByPlan = sortedLimitStats.length ? (remainingLimitBudget / month.remainingDays) : Number.POSITIVE_INFINITY;
  const safeByCash = Math.max(0, totalBalance - remainingForecastExpense - payableDueThisMonth) / month.remainingDays;
  const safeToSpend = Math.max(0, Math.floor(Number.isFinite(safeByPlan) ? Math.min(safeByPlan, safeByCash) : safeByCash));
  const abnormalAlerts = buildAbnormalSpendingAlerts(txList);
  const planProgressItems = sortedLimitStats.slice(0, 5);
  const recurringPayments = buildRecurringPayments(txList);
  const currentWeekExpense = getRowsInWindow(txList, getDayStartMs(now) - (6 * DAY_MS), now, 'expense')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const previousWeekExpense = getRowsInWindow(txList, getDayStartMs(now) - (13 * DAY_MS), getDayStartMs(now) - (7 * DAY_MS) - 1, 'expense')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const model = {
    financeReady: finance.planReady && finance.debtReady,
    planReady: finance.planReady,
    debtReady: finance.debtReady,
    totalBalance,
    todayNet,
    monthStartDelta: totalBalance - monthStartBalance,
    balanceVsPrevMonth,
    monthIncome: monthSummary.income,
    monthExpense: monthSummary.expense,
    monthNet: monthSummary.balance,
    previousMonthNet: previousMonthSummary.balance,
    forecastExpense,
    forecastBalance,
    expectedSavings,
    remainingForecastExpense,
    limitStats: sortedLimitStats,
    topExpenseCategories,
    last7Days,
    maxTrendValue,
    safeToSpend,
    payableDueThisMonth,
    receivableDebts,
    payableDebts,
    dueSoonDebt,
    overdueDebtCount,
    savingsRate,
    largestTransactions,
    abnormalAlerts,
    planProgressItems,
    recurringPayments,
    monthRemainingDays: month.remainingDays,
    currentWeekExpense,
    previousWeekExpense,
  };
  model.health = calculateFinancialHealth(model);
  return model;
}

function renderPremiumDashboardCard(card) {
  const classes = ['dash-analytics-card', 'premium-dashboard-card'];
  if (card.size) classes.push(card.size);
  if (card.tone) classes.push(`tone-${card.tone}`);
  if (card.loading) classes.push('is-loading');
  if (card.empty) classes.push('is-empty');

  let body = '';
  if (card.loading) {
    body = `
      <div class="premium-widget-loading">
        <div class="dash-analytics-preview-line w-40"></div>
        <div class="dash-analytics-preview-line w-90"></div>
        <div class="dash-analytics-preview-line w-72"></div>
        <div class="dash-analytics-preview-line w-58"></div>
      </div>
    `;
  } else if (card.empty) {
    body = `
      <div class="dash-widget-empty premium-widget-empty">
        <strong>${escapeHtml(card.emptyTitle || tt('dashboard_widget_empty_title', 'Hali ma‘lumot yetarli emas'))}</strong>
        <span>${escapeHtml(card.emptyBody || tt('dashboard_widget_empty_body', 'Xarajatlar paydo bo‘lgach kategoriya bo‘yicha ulush va o‘sish shu yerda ko‘rinadi.'))}</span>
      </div>
    `;
  } else {
    body = `
      ${Array.isArray(card.metrics) && card.metrics.length ? `
        <div class="premium-widget-metrics">
          ${card.metrics.map((item) => `
            <div class="premium-widget-metric ${escapeHtml(item.tone || 'neutral')}">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${card.body || ''}
    `;
  }

  return `
    <article class="${classes.join(' ')}">
      <div class="premium-widget-head">
        <div class="premium-widget-head-copy">
          <div class="premium-widget-title">${escapeHtml(card.title)}</div>
          <div class="premium-widget-main">${escapeHtml(card.main)}</div>
          <div class="premium-widget-subtext">${escapeHtml(card.sub)}</div>
        </div>
        <span class="premium-widget-icon" aria-hidden="true">${svgIcon(card.icon || 'star', 'premium-widget-icon-svg')}</span>
      </div>
      ${body}
    </article>
  `;
}

function renderDashboardTrendChart(days = [], maxValue = 1) {
  return `
    <div class="premium-trend-chart">
      ${days.map((item) => `
        <div class="premium-trend-col">
          <div class="premium-trend-bars">
            <span class="income" style="height:${Math.max(6, Math.round((item.income / maxValue) * 100))}%"></span>
            <span class="expense" style="height:${Math.max(6, Math.round((item.expense / maxValue) * 100))}%"></span>
          </div>
          <div class="premium-trend-label">${escapeHtml(item.label)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderProgressRows(items = [], { exceededLabel, nearLabel, normalLabel } = {}) {
  return `
    <div class="premium-progress-list">
      ${items.map((item) => {
        const status = item.stats.exceeded ? 'exceeded' : item.stats.near ? 'near' : 'normal';
        const statusText = item.stats.exceeded ? exceededLabel : item.stats.near ? nearLabel : normalLabel;
        const width = clampNumber(item.stats.percent, 4, 100);
        return `
          <div class="premium-progress-row ${status}">
            <div class="premium-progress-head">
              <strong>${escapeHtml(item.plan.category_name || tt('dashboard_premium_uncategorized', 'Kategoriyasiz'))}</strong>
              <span>${escapeHtml(formatDashboardAmount(item.stats.spent))} / ${escapeHtml(formatDashboardAmount(item.stats.budget))}</span>
            </div>
            <div class="premium-progress-bar"><span style="width:${width}%"></span></div>
            <div class="premium-progress-meta">
              <span>${escapeHtml(statusText)}</span>
              <span>${escapeHtml(formatDashboardPercent(item.stats.percent))}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTopCategoryRows(items = []) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return `
    <div class="premium-progress-list">
      ${items.map((item) => {
        const share = total > 0 ? (item.amount / total) * 100 : 0;
        return `
          <div class="premium-progress-row normal">
            <div class="premium-progress-head">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(formatDashboardAmount(item.amount))}</span>
            </div>
            <div class="premium-progress-bar"><span style="width:${Math.max(8, Math.round(share))}%"></span></div>
            <div class="premium-progress-meta">
              <span>${escapeHtml(tt('dashboard_premium_share', 'Ulush'))}</span>
              <span>${escapeHtml(formatDashboardPercent(share))}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTransactionRows(items = []) {
  return `
    <div class="premium-list">
      ${items.map((item) => {
        const note = getTransactionNoteHint(item);
        return `
          <div class="premium-list-row ${item.type === 'income' ? 'income' : 'expense'}">
            <div class="premium-list-copy">
              <strong>${escapeHtml(getDashboardBaseCategoryName(item.category) || tt('dashboard_premium_uncategorized', 'Kategoriyasiz'))}</strong>
              <span>${escapeHtml(new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: 'short' }).format(new Date(item.ms)))}${note ? ` · ${escapeHtml(note)}` : ''}</span>
            </div>
            <div class="premium-list-value">${escapeHtml(formatDashboardAmount(item.amount, { signed: item.type === 'income' }))}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderAlertRows(items = []) {
  return `
    <div class="premium-alert-list">
      ${items.map((item) => `
        <div class="premium-alert-card ${escapeHtml(item.tone || 'warn')}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.body)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecurringRows(items = []) {
  return `
    <div class="premium-list">
      ${items.map((item) => `
        <div class="premium-list-row recurring">
          <div class="premium-list-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(tt('dashboard_premium_next_expected', 'Keyingi kutilmoqda'))}: ${escapeHtml(new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: 'short' }).format(new Date(item.nextDateMs)))}</span>
          </div>
          <div class="premium-list-value">${escapeHtml(formatDashboardAmount(item.avgAmount))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderLockedAnalyticsCards(snapshot) {
  const syncing = snapshot?.schemaReady === false;
  return `
    <article class="dash-analytics-card premium-dashboard-card is-locked wide">
      <span class="subscription-status-badge premium">${escapeHtml(tt('dashboard_widget_premium_badge', 'Premium'))}</span>
      <h3>${escapeHtml(tt('dashboard_premium_locked_title', 'Premium dashboardni oching'))}</h3>
      <p>${escapeHtml(syncing
        ? tt('subscription_syncing_hint', 'Tarif ma\'lumotlari bazadan yangilangach avtomatik ko‘rinadi.')
        : tt('dashboard_premium_locked_body', 'Balans prognozi, xavfsiz xarajat, limit xavfi va moliyaviy salomatlik skori Premium foydalanuvchilarga ochiladi.'))}</p>
      <button type="button" class="bpri pricing-action-btn" onclick="openDashboardAnalyticsPaywall()">${escapeHtml(tt('subscription_upgrade_action', 'Premium ga o‘tish'))}</button>
    </article>
    <article class="dash-analytics-card premium-dashboard-card is-preview" aria-hidden="true">
      <div class="dash-analytics-preview-line w-40"></div>
      <div class="dash-analytics-preview-line w-90"></div>
      <div class="dash-analytics-preview-line w-72"></div>
      <div class="dash-analytics-preview-line w-58"></div>
    </article>
    <article class="dash-analytics-card premium-dashboard-card is-preview" aria-hidden="true">
      <div class="dash-analytics-preview-line w-55"></div>
      <div class="dash-analytics-preview-line w-82"></div>
      <div class="dash-analytics-preview-line w-64"></div>
      <div class="dash-analytics-preview-line w-48"></div>
    </article>
  `;
}

function renderDashboardAnalytics() {
  const panel = $('dash-analytics-panel');
  const grid = $('dash-analytics-grid');
  const action = $('dash-analytics-action');
  const subtitle = $('dash-analytics-subtitle');
  if (!panel || !grid) return;

  const gate = getFeatureGateResult('premium_dashboard', { relaxedWhenSchemaMissing: false });
  const snapshot = gate?.snapshot || getSubscriptionSnapshotLocal();
  const isPremium = !!(gate?.allowed && snapshot?.isPremium);

  if (action) {
    action.textContent = isPremium
      ? tt('pricing_current_plan_action', 'Faol tarif')
      : tt('subscription_upgrade_action', 'Premium ga o‘tish');
    action.classList.toggle('is-premium', isPremium);
  }

  if (subtitle) {
    subtitle.textContent = isPremium
      ? tt('dashboard_premium_sub', 'Pul holati, xavf va prognozlar bir joyda')
      : tt('dashboard_premium_locked_sub', 'Premium bilan balans prognozi, xavf radari va foydali tavsiyalar ochiladi');
  }

  if (!isPremium) {
    grid.innerHTML = renderLockedAnalyticsCards(snapshot);
    return;
  }

  const model = buildPremiumDashboardModel();
  const topCategories = model.topExpenseCategories.slice(0, 5);
  const riskLimits = model.limitStats.slice(0, 5);
  const largestTx = model.largestTransactions.slice(0, 5);
  const recurring = model.recurringPayments.slice(0, 4);
  const dueDebtLabel = model.dueSoonDebt
    ? `${model.dueSoonDebt.person_name} · ${new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: 'short' }).format(new Date(model.dueSoonDebt.due_at || model.dueSoonDebt.created_at))}`
    : tt('dashboard_premium_none', 'Yo‘q');

  const cards = [
    {
      size: 'hero',
      tone: 'balance',
      icon: 'banknote',
      title: tt('dashboard_premium_balance_title', 'Total balance'),
      main: formatDashboardAmount(model.totalBalance, { signed: model.totalBalance < 0 }),
      sub: notifText(
        `Bugun ${formatDashboardAmount(model.todayNet, { signed: true })} · Oy boshidan ${formatDashboardAmount(model.monthStartDelta, { signed: true })}`,
        `Сегодня ${formatDashboardAmount(model.todayNet, { signed: true })} · С начала месяца ${formatDashboardAmount(model.monthStartDelta, { signed: true })}`,
        `Today ${formatDashboardAmount(model.todayNet, { signed: true })} · Since month start ${formatDashboardAmount(model.monthStartDelta, { signed: true })}`
      ),
      metrics: [
        { label: tt('dashboard_premium_balance_today', 'Bugun'), value: formatDashboardAmount(model.todayNet, { signed: true }), tone: model.todayNet >= 0 ? 'good' : 'bad' },
        { label: tt('dashboard_premium_balance_month', 'Oy boshidan'), value: formatDashboardAmount(model.monthStartDelta, { signed: true }), tone: model.monthStartDelta >= 0 ? 'good' : 'bad' },
        { label: tt('dashboard_premium_balance_compare', 'O‘tgan oyga nisbatan'), value: model.balanceVsPrevMonth?.label || '0%', tone: getDeltaTone(model.balanceVsPrevMonth, 'balance') },
      ],
    },
    {
      icon: 'briefcase',
      title: tt('dashboard_premium_cashflow_title', 'Monthly cashflow'),
      main: formatDashboardAmount(model.monthNet, { signed: true }),
      sub: tt('dashboard_premium_cashflow_sub', 'Shu oy bo‘yicha sof natija'),
      metrics: [
        { label: tt('income', 'Kirim'), value: formatDashboardAmount(model.monthIncome), tone: 'good' },
        { label: tt('expense', 'Chiqim'), value: formatDashboardAmount(model.monthExpense), tone: 'bad' },
        { label: tt('dashboard_widget_balance', 'Balans'), value: formatDashboardAmount(model.monthNet, { signed: true }), tone: model.monthNet >= 0 ? 'good' : 'bad' },
      ],
    },
    {
      icon: 'tool',
      title: tt('dashboard_premium_forecast_title', 'Month-end forecast'),
      main: formatDashboardAmount(model.forecastBalance, { signed: model.forecastBalance < 0 }),
      sub: notifText(
        `Shu temp davom etsa, oy oxirida kutilgan balans ${formatDashboardAmount(model.forecastBalance)} bo‘ladi.`,
        `Если темп сохранится, ожидаемый баланс к концу месяца составит ${formatDashboardAmount(model.forecastBalance)}.`,
        `If this pace continues, your expected month-end balance is ${formatDashboardAmount(model.forecastBalance)}.`
      ),
      metrics: [
        { label: tt('dashboard_premium_forecast_expense', 'Prognoz xarajat'), value: formatDashboardAmount(model.forecastExpense), tone: 'bad' },
        { label: tt('dashboard_premium_forecast_savings', 'Kutilgan jamg‘arma'), value: formatDashboardAmount(model.expectedSavings, { signed: true }), tone: model.expectedSavings >= 0 ? 'good' : 'bad' },
      ],
    },
    {
      icon: 'gift',
      title: tt('dashboard_premium_safe_title', 'Safe to spend today'),
      main: formatDashboardAmount(model.safeToSpend),
      sub: tt('dashboard_premium_safe_sub', 'Bugungi limit va prognozga xavfsiz summa'),
      metrics: [
        { label: tt('dashboard_premium_days_left', 'Qolgan kun'), value: String(model.monthRemainingDays), tone: 'neutral' },
        { label: tt('dashboard_premium_due_payables', 'Qarz bosimi'), value: formatDashboardAmount(model.payableDueThisMonth), tone: model.payableDueThisMonth > 0 ? 'warn' : 'good' },
      ],
    },
    {
      icon: 'star',
      title: tt('dashboard_premium_savings_title', 'Savings rate'),
      main: Number.isFinite(model.savingsRate) ? formatDashboardPercent(model.savingsRate, { decimals: 1 }) : '—',
      sub: model.monthIncome > 0
        ? tt('dashboard_premium_savings_sub', '(income - expense) / income')
        : tt('dashboard_premium_no_income_sub', 'Shu oy daromad yozilmagan'),
      metrics: [
        { label: tt('income', 'Kirim'), value: formatDashboardAmount(model.monthIncome), tone: 'good' },
        { label: tt('expense', 'Chiqim'), value: formatDashboardAmount(model.monthExpense), tone: 'bad' },
      ],
      empty: model.monthIncome === 0,
      emptyTitle: tt('dashboard_premium_no_income_title', 'Daromad yozuvi topilmadi'),
      emptyBody: tt('dashboard_premium_no_income_body', 'Jamg‘arma foizi daromad tushgach aniq ko‘rinadi.'),
    },
    {
      icon: 'zap',
      title: tt('dashboard_premium_health_title', 'Financial health score'),
      main: `${model.health.score}/100`,
      sub: model.health.summary,
      metrics: model.health.breakdown,
    },
    {
      size: 'wide',
      icon: 'shopping-bag',
      title: tt('dashboard_premium_limits_title', 'Category limit status'),
      main: riskLimits.length
        ? notifText(
          `${riskLimits.filter((item) => item.stats.exceeded || item.stats.near).length} ta xavfli limit`,
          `${riskLimits.filter((item) => item.stats.exceeded || item.stats.near).length} рискованных лимита`,
          `${riskLimits.filter((item) => item.stats.exceeded || item.stats.near).length} risky limits`
        )
        : tt('dashboard_premium_none', 'Yo‘q'),
      sub: tt('dashboard_premium_limits_sub', 'Faol limitlar ichida eng xavflilari tepada'),
      loading: !model.planReady,
      empty: model.planReady && !riskLimits.length,
      emptyTitle: tt('dashboard_premium_limits_empty_title', 'Faol limit topilmadi'),
      emptyBody: tt('dashboard_premium_limits_empty_body', 'Kategoriya limitlari qo‘shilgach xavf darajasi shu yerda ko‘rinadi.'),
      body: renderProgressRows(riskLimits, {
        exceededLabel: tt('dashboard_premium_limit_exceeded', 'Oshib ketgan'),
        nearLabel: tt('dashboard_premium_limit_near', 'Chegaraga yaqin'),
        normalLabel: tt('dashboard_premium_limit_normal', 'Nazoratda'),
      }),
    },
    {
      size: 'wide',
      icon: 'shopping-cart',
      title: tt('dashboard_premium_top_categories_title', 'Top expense categories'),
      main: topCategories[0] ? topCategories[0].name : tt('dashboard_premium_none', 'Yo‘q'),
      sub: tt('dashboard_premium_top_categories_sub', 'Shu oy eng ko‘p pul ketayotgan yo‘nalishlar'),
      empty: !topCategories.length,
      emptyTitle: tt('dashboard_premium_top_categories_empty_title', 'Xarajat kategoriyalari yo‘q'),
      emptyBody: tt('dashboard_premium_top_categories_empty_body', 'Shu oy xarajatlar paydo bo‘lgach eng katta kategoriyalar chiqadi.'),
      body: renderTopCategoryRows(topCategories),
    },
    {
      icon: 'credit-card',
      title: tt('dashboard_premium_debts_title', 'Debts overview'),
      main: formatDashboardAmount(model.payableDebts),
      sub: tt('dashboard_premium_debts_sub', 'Beriladigan qarzlar bo‘yicha hozirgi bosim'),
      loading: !model.debtReady,
      metrics: [
        { label: tt('debts_receivable', 'Olinadigan'), value: formatDashboardAmount(model.receivableDebts), tone: 'good' },
        { label: tt('debts_payable', 'Beriladigan'), value: formatDashboardAmount(model.payableDebts), tone: 'bad' },
        { label: tt('dashboard_premium_next_due', 'Eng yaqin muddat'), value: dueDebtLabel, tone: model.overdueDebtCount > 0 ? 'warn' : 'neutral' },
      ],
      empty: model.debtReady && model.receivableDebts === 0 && model.payableDebts === 0,
      emptyTitle: tt('dashboard_premium_debts_empty_title', 'Qarzlar yo‘q'),
      emptyBody: tt('dashboard_premium_debts_empty_body', 'Qarz yozuvlari qo‘shilganda eng yaqin muddat va xavf shu yerda ko‘rinadi.'),
      body: model.debtReady && (model.receivableDebts > 0 || model.payableDebts > 0)
        ? renderAlertRows(model.overdueDebtCount > 0 ? [{
          tone: 'danger',
          title: tt('dashboard_premium_debts_overdue_title', 'Kechikkan qarz bor'),
          body: notifText(
            `${model.overdueDebtCount} ta qarz muddati o‘tgan.`,
            `${model.overdueDebtCount} долга просрочено.`,
            `${model.overdueDebtCount} debts are overdue.`
          ),
        }] : [{
          tone: 'good',
          title: tt('dashboard_premium_debts_ok_title', 'Qarzlar nazoratda'),
          body: tt('dashboard_premium_debts_ok_body', 'Eng yaqin muddat kuzatilmoqda, kechikkan qarz yo‘q.'),
        }])
        : '',
    },
    {
      size: 'wide',
      icon: 'monitor',
      title: tt('dashboard_premium_trend_title', 'Last 7 days trend'),
      main: formatDashboardAmount(model.currentWeekExpense),
      sub: tt('dashboard_premium_trend_sub', 'Kunlik kirim va chiqim ritmi'),
      empty: model.last7Days.every((item) => item.income === 0 && item.expense === 0),
      emptyTitle: tt('dashboard_premium_trend_empty_title', '7 kunlik trend uchun ma‘lumot yo‘q'),
      emptyBody: tt('dashboard_premium_trend_empty_body', 'So‘nggi 7 kun tranzaksiyalari paydo bo‘lgach grafik chiziladi.'),
      body: `
        ${renderDashboardTrendChart(model.last7Days, model.maxTrendValue)}
        <div class="premium-chart-legend">
          <span><i class="income"></i>${escapeHtml(tt('income', 'Kirim'))}</span>
          <span><i class="expense"></i>${escapeHtml(tt('expense', 'Chiqim'))}</span>
        </div>
      `,
    },
    {
      size: 'wide',
      icon: 'banknote',
      title: tt('dashboard_premium_transactions_title', 'Largest transactions'),
      main: largestTx[0] ? formatDashboardAmount(largestTx[0].amount, { signed: largestTx[0].type === 'income' }) : '—',
      sub: tt('dashboard_premium_transactions_sub', 'Shu oy eng katta operatsiyalar'),
      empty: !largestTx.length,
      emptyTitle: tt('dashboard_premium_transactions_empty_title', 'Yirik tranzaksiyalar yo‘q'),
      emptyBody: tt('dashboard_premium_transactions_empty_body', 'Tranzaksiyalar qo‘shilgach eng katta kirim va chiqimlar shu yerda ko‘rinadi.'),
      body: renderTransactionRows(largestTx),
    },
    {
      size: 'wide',
      icon: 'zap',
      title: tt('dashboard_premium_alerts_title', 'Abnormal spending alert'),
      main: String(model.abnormalAlerts.length),
      sub: tt('dashboard_premium_alerts_sub', 'Qoidaga asoslangan noodatiy xarajat signallari'),
      empty: !model.abnormalAlerts.length,
      emptyTitle: tt('dashboard_premium_alerts_empty_title', 'Keskin spike topilmadi'),
      emptyBody: tt('dashboard_premium_alerts_empty_body', 'Xarajatlar odatdagi oraliqda. Noodatiy o‘sish bo‘lsa shu yerda ogohlantiramiz.'),
      body: renderAlertRows(model.abnormalAlerts),
    },
    {
      size: 'wide',
      icon: 'star',
      title: tt('dashboard_premium_plans_title', 'Plan / goal progress'),
      main: model.planProgressItems.length
        ? notifText(
          `${model.planProgressItems.filter((item) => !item.stats.exceeded).length}/${model.planProgressItems.length} nazoratda`,
          `${model.planProgressItems.filter((item) => !item.stats.exceeded).length}/${model.planProgressItems.length} в норме`,
          `${model.planProgressItems.filter((item) => !item.stats.exceeded).length}/${model.planProgressItems.length} on track`
        )
        : tt('dashboard_premium_none', 'Yo‘q'),
      sub: tt('dashboard_premium_plans_sub', 'Yaqin tugayotgan va xavfdagi rejalarga e‘tibor bering'),
      loading: !model.planReady,
      empty: model.planReady && !model.planProgressItems.length,
      emptyTitle: tt('dashboard_premium_plans_empty_title', 'Rejalar topilmadi'),
      emptyBody: tt('dashboard_premium_plans_empty_body', 'Maqsad va limit qo‘shilgach progress shu yerda chiqadi.'),
      body: renderProgressRows(model.planProgressItems, {
        exceededLabel: tt('dashboard_premium_limit_exceeded', 'Oshib ketgan'),
        nearLabel: tt('dashboard_premium_goal_at_risk', 'Xavf ostida'),
        normalLabel: tt('dashboard_premium_goal_near_complete', 'Yakuniga yaqin'),
      }),
    },
    {
      size: 'wide',
      icon: 'wifi',
      title: tt('dashboard_premium_recurring_title', 'Recurring payments'),
      main: recurring.length ? formatDashboardAmount(recurring.reduce((sum, item) => sum + item.avgAmount, 0)) : '—',
      sub: tt('dashboard_premium_recurring_sub', 'Takrorlanayotgan oylik xarajatlar heuristikasi'),
      empty: !recurring.length,
      emptyTitle: tt('dashboard_premium_recurring_empty_title', 'Takrorlanuvchi to‘lov topilmadi'),
      emptyBody: tt('dashboard_premium_recurring_empty_body', 'Bir necha oy davomida bir xil xarajat qaytalansa shu yerda chiqadi.'),
      body: renderRecurringRows(recurring),
    },
  ];

  grid.innerHTML = cards.map(renderPremiumDashboardCard).join('');
}

function renderDashboardWidgets(rows = []) {
  renderDashboardOverview(rows);
  renderDashboardAnalytics();
}

window.renderDashboardAnalytics = renderDashboardAnalytics;

function updateBalSize(txt) {
  const el = $('total-bal');
  if (!el) return;
  el.classList.remove('sm', 'xs', 'xxs');
  const len = txt.length;
  if (len > 18) el.classList.add('xxs');
  else if (len > 14) el.classList.add('xs');
  else if (len > 10) el.classList.add('sm');
}

function renderChart(data) {
  const canvas = $('myChart');
  const noData = $('no-data');
  const table = $('cat-table');
  if (!canvas) return;

  const src = typeFilt === 'income'
    ? data.filter(x => x.type === 'income')
    : data.filter(x => x.type === 'expense');

  if (noData) noData.style.display = src.length === 0 ? 'flex' : 'none';

  const grouped = {};
  src.forEach(t => { grouped[t.category] = (grouped[t.category] || 0) + t.amount; });
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);

  if (myChart) { myChart.destroy(); myChart = null; }

  if (src.length > 0 && window.Chart) {
    const ctx = canvas.getContext('2d');
    myChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#7c3aed', '#3b82f6', '#ec4899', '#06b6d4', '#84cc16'],
          borderWidth: 0, hoverOffset: 4
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { display: false } }
      },
    });
  }

  if (table) {
    const color = typeFilt === 'income' ? 'var(--green)' : 'var(--red)';
    table.innerHTML = entries.slice(0, 5).map(([k, v]) =>
      `<div class="ctr"><span class="ctr-n">${k}</span><span class="ctr-v" style="color:${color}">${fmt(v)}</span></div>`
    ).join('');
  }
}

function renderTrends() {
  const sec = $('trend-sec');
  const grid = $('trend-grid');
  if (!sec || !grid) return;

  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const lastEnd = thisStart - 1;

  const grp = arr => arr.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount; return acc;
  }, {});

  const curr = grp(txList.filter(t => t.ms >= thisStart && t.type === 'expense'));
  const prev = grp(txList.filter(t => t.ms >= lastStart && t.ms <= lastEnd && t.type === 'expense'));

  let html = '';
  [...new Set([...Object.keys(curr), ...Object.keys(prev)])].forEach(c => {
    const cv = curr[c] || 0, pv = prev[c] || 0;
    if (cv > 0 && pv > 0) {
      const pct = ((cv - pv) / pv) * 100;
      if (Math.abs(pct) > 5) {
        const up = pct > 0;
        html += `<div class="tcard">
          <div><div class="tc-cat">${c}</div><div class="tc-val">${fmt(cv)}</div></div>
          <div class="tc-pct ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.round(Math.abs(pct))}%</div>
        </div>`;
      }
    }
  });

  grid.innerHTML = html;
  sec.style.display = html ? 'flex' : 'none';
}

function renderHistory() {
  try {
    const list = $('tx-list');
    const empty = $('empty-s');
    if (!list) return;

    const sorted = [...txList].sort((a, b) => b.ms - a.ms);
    const filtered = histFilt === 'all' ? sorted : sorted.filter(t => t.type === histFilt);

    if (empty) empty.style.display = filtered.length === 0 ? 'flex' : 'none';
    if (!filtered.length) {
      list.innerHTML = '';
      return;
    }

    const groups = [];
    const byKey = new Map();
    filtered.forEach(tx => {
      const key = getHistoryDayKey(tx.ms);
      if (!byKey.has(key)) {
        const group = {
          key,
          dayMs: getDayStartMs(tx.ms),
          label: formatHistoryDayLabel(tx.ms),
          income: 0,
          expense: 0,
          items: []
        };
        byKey.set(key, group);
        groups.push(group);
      }
      const group = byKey.get(key);
      group.items.push(tx);
      if (tx.type === 'income') group.income += tx.amount;
      else group.expense += tx.amount;
    });

    const html = groups
      .sort((a, b) => b.dayMs - a.dayMs)
      .map(group => {
        const sums = [];
        if (group.income > 0) sums.push(`<span class="tx-day-sum-inc">+${fmt(group.income)}</span>`);
        if (group.expense > 0) sums.push(`<span class="tx-day-sum-exp">-${fmt(group.expense)}</span>`);
        const head = `
          <div class="tx-day-head">
            <div class="tx-day-date">${escapeHtml(group.label)}</div>
            <div class="tx-day-sums">${sums.join('<span class="tx-day-sep">/</span>')}</div>
          </div>`;

        const items = group.items.map(tx => {
          const isI = tx.type === 'income';
          const chek = (tx.receipt || tx.receipt_url) ? `<span class="chek-b">📎 ${escapeHtml(t('hist_receipt'))}</span>` : '';
          const arrow = isI
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
          const typeBadge = `<span class="txi-type ${isI ? 'i' : 'e'}">${escapeHtml(isI ? t('income') : t('expense'))}</span>`;
          return `<div class="txi" onclick="openAction(${Number(tx.id)})">
            <div class="txi-l">
              <div class="txi-ico ${isI ? 'i' : 'e'}">${arrow}</div>
              <div>
                <div class="txi-cat">${escapeHtml(tx.category)} ${typeBadge} ${chek}</div>
                <div class="txi-dt">${escapeHtml(formatHistoryTime(tx.ms))}</div>
              </div>
            </div>
            <div class="txi-amt ${isI ? 'i' : 'e'}">${isI ? '+' : '-'}${fmt(tx.amount)}</div>
          </div>`;
        }).join('');

        return `<section class="tx-day">${head}<div class="tx-day-list">${items}</div></section>`;
      })
      .join('');

    list.innerHTML = html;
  } catch (e) {
    console.error('[renderHistory] Error:', e);
  }
}

function setHistFilter(f) {
  histFilt = f;
  document.querySelectorAll('[data-hf]').forEach(b => b.classList.toggle('on', b.dataset.hf === f));
  renderHistory();
}

// ─── DATE RANGE ─────────────────────────────────────────
function getRange() {
  const now = new Date();
  let s = 0, e = new Date().setHours(23, 59, 59, 999);
  if (dateFilt === 'week') s = Date.now() - 7 * 86400000;
  else if (dateFilt === 'month') s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  else if (dateFilt === 'custom') {
    s = new Date($('d-from')?.value || 0).getTime();
    e = new Date($('d-to')?.value || Date.now()).getTime() + 86400000;
  }
  return { s, e };
}

function setDate(f) {
  vib('soft');
  dateFilt = f;
  document.querySelectorAll('.fp[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  renderAll();
}

function toggleType(t) {
  vib('soft');
  typeFilt = typeFilt === t ? 'all' : t;
  renderAll();
}

function openDateMod() { dateFilt = 'custom'; showOv('ov-date'); }
function applyDate() { closeOv('ov-date'); document.querySelector('.fp[data-f="custom"]')?.classList.add('on'); renderAll(); }

// ─── CURRENCY ────────────────────────────────────────────
function setCur(c) {
  currency = c;
  $('pill-uzs')?.classList.toggle('on', c === 'UZS');
  $('pill-usd')?.classList.toggle('on', c === 'USD');
  vib('medium');

  const bc = $('bc');
  if (bc) {
    bc.style.transform = c === 'USD' ? 'translateX(-6px)' : 'translateX(6px)';
    setTimeout(() => { bc.style.transform = ''; }, 150);
  }
  renderAll();
}

function initSwipe() {
  const card = $('bc');
  if (!card) return;
  let sx = 0;
  card.addEventListener('touchstart', e => { sx = e.changedTouches[0].screenX; }, { passive: true });
  card.addEventListener('touchend', e => { const dx = sx - e.changedTouches[0].screenX; if (Math.abs(dx) > 50) setCur(dx > 0 ? 'USD' : 'UZS'); }, { passive: true });
  card.addEventListener('mousedown', e => { sx = e.clientX; });
  card.addEventListener('mouseup', e => { const dx = sx - e.clientX; if (Math.abs(dx) > 50) setCur(dx > 0 ? 'USD' : 'UZS'); });
}

// ─── INPUT FORMAT ────────────────────────────────────────
// Raqam kiritishda bo'shliq bilan formatlash (type="text" bilan ishlaydi)
function formatInputAmount(e) {
  const input = e.target;
  const cursorPos = input.selectionStart;
  const oldLen = input.value.length;

  // Faqat raqam va nuqtani qoldirish
  let rawVal = input.value.replace(/[^\d.]/g, '');

  // Bir nechta nuqtaga yo'l qo'ymaslik
  const dotIdx = rawVal.indexOf('.');
  if (dotIdx !== -1) {
    rawVal = rawVal.slice(0, dotIdx + 1) + rawVal.slice(dotIdx + 1).replace(/\./g, '');
  }

  // Integer qismini formatlash
  const parts = rawVal.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = parts.length > 1 ? intPart + '.' + parts[1] : intPart;

  input.value = formatted;

  // Cursor pozitsiyasini saqlash
  const newLen = input.value.length;
  const diff = newLen - oldLen;
  try {
    input.setSelectionRange(cursorPos + diff, cursorPos + diff);
  } catch (_) { }
}

// Bo'shliqlarni olib tashlash va sof raqam olish
function getCleanAmount(val) {
  if (!val && val !== 0) return 0;
  let s = String(val).trim();
  // Minglik ajratuvchi (nuqta yoki bo'shliq)ni olib tashlash: 500.000 -> 500000
  s = s.replace(/[. ](?=\d{3}(?:\D|$))/g, '');
  // Vergulni nuqtaga almashtirish (decimal separator): 1,5 -> 1.5
  s = s.replace(/,/g, '.');
  // Qolgan bo'shliqlarni olib tashlash
  s = s.replace(/\s/g, '');
  return parseFloat(s) || 0;
}

// Settings rate inputi uchun
function handleRateInput(input) {
  const rawVal = input.value.replace(/[^\d]/g, '');
  const formatted = rawVal.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cursor = input.selectionStart;
  const oldLen = input.value.length;
  input.value = formatted;
  const diff = formatted.length - oldLen;
  try { input.setSelectionRange(cursor + diff, cursor + diff); } catch (_) { }
}

// ─── BOT FLOW ────────────────────────────────────────────
function startFlow(type) {
  draft = { type, category: '', receipt: null, rawFile: null, receiptBlob: null };
  $('flow-start').style.display = 'none';
  $('flow-cats').style.display = 'flex';
  $('flow-input').style.display = 'none';
  updateFlowMeta();
  buildCatGrid(type);
  vib('light');
}

function buildCatGrid(type) {
  const grid = $('cat-grid');
  if (!grid) return;
  grid.innerHTML = '';
  (cats[type] || []).forEach((c, idx) => {
    const btn = document.createElement('div');
    btn.className = `ci ci-${type === 'income' ? 'i' : 'e'}`;
    btn.innerHTML = svgIcon(c.icon) + `<span>${c.name}</span>`;
    btn.onclick = () => {
      draft.category = c.name;
      $('flow-cats').style.display = 'none';
      $('flow-input').style.display = 'flex';
      updateFlowMeta();
      const amtIn = $('amt-in');
      if (amtIn) { amtIn.value = ''; amtIn.focus(); }
      vib('light');
    };
    btn.oncontextmenu = e => { e.preventDefault(); showCtxMenu(e, idx, type); };
    let lpt;
    btn.ontouchstart = e => { lpt = setTimeout(() => showCtxMenu(e.touches[0], idx, type), 500); };
    btn.ontouchend = () => clearTimeout(lpt);
    grid.appendChild(btn);
  });
}

function cancelFlow() {
  $('flow-start').style.display = 'grid';
  $('flow-cats').style.display = 'none';
  $('flow-input').style.display = 'none';
  clearRec();
  draft = {};
  updateFlowMeta();
}

function toggleCur() {
  inputCur = inputCur === 'UZS' ? 'USD' : 'UZS';
  const btn = $('cur-btn');
  if (!btn) return;
  btn.textContent = inputCur;
  btn.className = 'cur-btn' + (inputCur === 'USD' ? ' usd' : '');
  $('amt-in').placeholder = inputCur === 'USD' ? tt('add_amount_placeholder_usd', 'Necha dollar?') : tt('add_amount_placeholder', 'Summani kiriting...');
  vib('light');
}

async function handleFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const prepared = await compressReceipt(file);
    draft.rawFile = file;
    draft.receiptBlob = prepared.blob;
    draft.receipt = prepared.preview;
    const ra = $('rec-area'), th = $('rec-thumb');
    if (ra) ra.style.display = 'flex';
    if (th) th.src = draft.receipt;
    updateFlowMeta();
  } catch (err) {
    console.warn('[handleFile]', err);
    showErr(tt('err_receipt_process', "Chekni tayyorlab bo'lmadi"));
  } finally {
    if (e.target) e.target.value = '';
  }
}

function clearRec() {
  draft.receipt = null;
  draft.rawFile = null;
  draft.receiptBlob = null;
  const ra = $('rec-area');
  const th = $('rec-thumb');
  if (ra) ra.style.display = 'none';
  if (th) th.removeAttribute('src');
}

async function submitFlow() {
  vib('heavy');
  let tempId = null;
  try {
    // Bo'shliqli formatlangan qiymatdan sof raqam olish
    const raw = getCleanAmount($('amt-in')?.value || '');
    if (!raw || !draft.category) {
      showErr(tt('err_amount_required', 'Summa kiritilmagan!'));
      return;
    }

    let amount = Math.round(raw);
    let note = '';
    if (inputCur === 'USD') { amount = Math.round(raw * rate); note = ` ($${raw})`; }

    let recUrl = null;
    if ((draft.receiptBlob || draft.rawFile) && db) {
      try { recUrl = await uploadReceipt(draft.receiptBlob || draft.rawFile); }
      catch (err) { console.warn('[submitFlow:receipt]', err); }
    }

    const newTx = {
      user_id: UID, amount, category: draft.category + note,
      type: draft.type, date: isoNow(), receipt_url: recUrl,
    };

    tempId = Date.now();
    txList.unshift(normTx({ ...newTx, id: tempId, receipt: draft.receipt }));
    renderAll();

    const amtStr = inputCur === 'USD' ? `$${raw} → ${fmt(amount)} ${tt('suffix_uzs', "so'm")}` : `${fmt(amount)} ${tt('suffix_uzs', "so'm")}`;
    addMsg(`✅ <b>${escapeHtml(tt('tx_saved_label', 'Saqlandi'))}:</b> ${amtStr}<br><small style="opacity:.6">${escapeHtml(draft.category + note)}</small>`);

    $('amt-in').value = '';
    if (inputCur === 'USD') toggleCur();
    const localReceipt = draft.receipt;
    cancelFlow();

    if (db) {
      const { data, error } = await insertTransactions([newTx], 'mini_app');
      if (error) {
        txList = txList.filter(t => t.id !== tempId);
        renderAll();
        showErr(tt('err_save_failed', 'Saqlashda xatolik') + ': ' + errorText(error, tt('err_save_failed', 'Saqlashda xatolik')));
        return;
      }
      const saved = Array.isArray(data) ? data[0] : data;
      const i = txList.findIndex(t => t.id === tempId);
      if (i !== -1 && saved) txList[i] = normTx({ ...txList[i], ...saved, receipt: localReceipt });
      if (saved) await notifyMiniAppTxSaved({ ...saved, receipt: localReceipt, source: 'mini_app' });
    }
  } catch (error) {
    console.warn('[submitFlow]', error);
    if (tempId !== null) {
      txList = txList.filter(t => t.id !== tempId);
      renderAll();
    }
    showErr(tt('err_save_failed', 'Saqlashda xatolik') + ': ' + errorText(error, 'Unknown error'));
  }
}

async function uploadReceipt(file) {
  const ext = String(file?.type || '').includes('png') ? 'png' : 'jpg';
  const name = `${UID}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db.storage.from('receipts').upload(name, file, {
    contentType: file?.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: false
  });
  if (error) throw error;
  const { data: { publicUrl } } = db.storage.from('receipts').getPublicUrl(name);
  return publicUrl;
}

// ─── CATEGORIES ─────────────────────────────────────────
function buildIconGrid() {
  const grid = $('icon-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ICON_NAMES.forEach(name => {
    const d = document.createElement('div');
    d.className = 'io';
    d.dataset.icon = name;
    d.innerHTML = svgIcon(name);
    d.onclick = () => {
      grid.querySelectorAll('.io').forEach(x => x.classList.remove('on'));
      d.classList.add('on');
      selIcon = name;
    };
    grid.appendChild(d);
  });
}

function openAddCat(typeOverride = null) {
  newCatType = typeOverride || newCatType || draft.type || stgCatType || 'expense';
  $('nc-name').value = '';
  selIcon = 'star';
  buildIconGrid();
  const grid = $('icon-grid');
  if (grid) {
    grid.querySelectorAll('.io').forEach(el => {
      el.classList.toggle('on', el.dataset.icon === 'star');
    });
  }
  showOv('ov-addcat');
  setTimeout(() => { $('nc-name')?.focus(); }, 100);
}

async function saveNewCat() {
  const name = $('nc-name')?.value.trim();
  const targetType = newCatType || draft.type || stgCatType || '';
  if (!name) {
    showErr(t('err_cat_name_required'));
    return;
  }
  if (!targetType) {
    showErr(t('err_cat_type_missing'));
    return;
  }
  const payload = { user_id: UID, name, icon: selIcon, type: targetType };

  if (db) {
    // .single() RLS yoki 0 qator qaytishi bilan PGRST116 beradi; insert bo‘lsa ham xato ko‘rinadi
    const { data, error } = await db.from('categories').insert([payload]).select();
    if (error) {
      console.warn('[saveNewCat]', error);
      showErr(t('err_cat_save') + ': ' + errorText(error, t('err_cat_save')));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      cats[targetType].push(row);
    } else {
      const { data: cd, error: ce } = await db.from('categories').select('*')
        .eq('user_id', UID).order('name');
      if (ce) {
        console.warn('[saveNewCat] refetch', ce);
        showErr(t('err_cat_save') + ': ' + errorText(ce, t('err_cat_save')));
        return;
      }
      if (cd?.length) {
        cats.income = cd.filter(c => c.type === 'income');
        cats.expense = cd.filter(c => c.type === 'expense');
      }
    }
  } else {
    cats[targetType].push({ ...payload, id: Date.now() });
  }
  cats[targetType].sort((a, b) => a.name.localeCompare(b.name));
  buildCatGrid(targetType);
  if ($('stg-sub-cats')?.classList.contains('on')) renderStgCats();
  closeOv('ov-addcat');
  newCatType = null;
  vib('light');
}

let ctxTimer;
function showCtxMenu(pos, idx, type) {
  selCatIdx = idx; selCatType = type;
  const m = $('ctx-menu');
  if (!m) return;
  m.style.left = Math.min((pos.clientX || 0), innerWidth - 160) + 'px';
  m.style.top = Math.min((pos.clientY || 0), innerHeight - 100) + 'px';
  m.style.display = 'block';
}
document.addEventListener('click', () => { const m = $('ctx-menu'); if (m) m.style.display = 'none'; });

function ctxEdit() {
  const cat = cats[selCatType]?.[selCatIdx];
  if (!cat) return;
  $('ec-name').value = cat.name;
  showOv('ov-editcat');
}
async function saveEditCat() {
  const n = $('ec-name')?.value.trim();
  if (!n) return;
  const cat = cats[selCatType]?.[selCatIdx];
  if (!cat) return;
  cats[selCatType][selCatIdx] = { ...cat, name: n };
  buildCatGrid(selCatType);
  closeOv('ov-editcat');
  if (db && cat.id) {
    const { error } = await db.from('categories').update({ name: n }).eq('id', cat.id).eq('user_id', UID);
    if (error) showErr(tt('err_update_failed', 'Yangilashda xatolik'));
  }
}
async function ctxDel() {
  if (!confirm(tt('confirm_delete_category', "Bu kategoriyani o'chirasizmi?"))) return;
  const cat = cats[selCatType]?.[selCatIdx];
  if (!cat) return;
  cats[selCatType].splice(selCatIdx, 1);
  buildCatGrid(selCatType);
  if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
}

// ─── TRANSACTION ACTIONS ─────────────────────────────────
function openAction(id) {
  selTxId = id;
  const t = txList.find(x => x.id === id);
  if (!t) return;
  const btns = $('action-btns');
  if (!btns) return;
  btns.innerHTML = '';

  if (t.receipt || t.receipt_url) {
    const b = document.createElement('button');
    b.className = 'as-b green';
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${escapeHtml(tt('action_view_receipt', "Chekni ko'rish"))}`;
    b.onclick = () => { openReceiptViewer(t.receipt_url || t.receipt, t); closeOv('ov-action'); };
    btns.appendChild(b);
  }

  const editB = document.createElement('button');
  editB.className = 'as-b blue';
  editB.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>${escapeHtml(tt('action_edit', 'Tahrirlash'))}`;
  editB.onclick = () => { openEdit(); closeOv('ov-action'); };
  btns.appendChild(editB);

  const delB = document.createElement('button');
  delB.className = 'as-b red';
  delB.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>${escapeHtml(tt('action_delete', "O'chirish"))}`;
  delB.onclick = () => { closeOv('ov-action'); showOv('ov-delete'); };
  btns.appendChild(delB);

  showOv('ov-action');
}

function openEdit() {
  const t = txList.find(x => x.id === selTxId);
  if (!t) return;
  $('ed-cat').value = t.category;
  // Formatlangan ko'rinishda ko'rsatish
  $('ed-amt').value = fmt(t.amount).replace(/\s/g, ' ');
  $('ed-type').value = t.type;
  showOv('ov-edit');
}

async function saveEdit() {
  const cat = $('ed-cat')?.value.trim();
  const amt = getCleanAmount($('ed-amt')?.value);
  const typ = $('ed-type')?.value;
  if (!cat || !amt) return;

  const i = txList.findIndex(x => x.id === selTxId);
  if (i !== -1) txList[i] = { ...txList[i], category: cat, amount: amt, type: typ };
  closeOv('ov-edit');
  renderAll();
  renderHistory();

  if (db) {
    const { error } = await db.from('transactions').update({ category: cat, amount: amt, type: typ })
      .eq('id', selTxId).eq('user_id', UID);
    if (error) showErr(tt('err_update_failed', 'Yangilashda xatolik'));
  }
}

async function confirmDel() {
  txList = txList.filter(t => t.id !== selTxId);
  closeOv('ov-delete');
  renderAll();
  renderHistory();
  if (db) await db.from('transactions').delete().eq('id', selTxId).eq('user_id', UID);
}

// ─── PIN ─────────────────────────────────────────────────
async function checkBioAvail() {
  return tg?.BiometricManager?.isBiometricAvailable || false;
}

function refreshPinIfOpen() {
  if (!$('pin-screen')?.classList.contains('on')) return;
  showPin(pinMode);
}

function showPin(mode) {
  pinMode = mode; pinBuf = '';
  updatePinDots();
  $('pin-screen')?.classList.add('on');
  const ttl = $('pin-ttl'), sub = $('pin-sub'), c = $('pin-cancel-b'), bio = $('pin-bio-b');

  const msgs = {
    unlock: [t('pin_title'), t('pin_enter')],
    setup_new: [t('pin_new'), t('pin_new_sub')],
    setup_confirm: [t('pin_confirm'), t('pin_confirm_sub')],
    change_old: [t('pin_old'), t('pin_old_sub')],
  };
  const [tt, ss] = msgs[mode] || msgs.unlock;
  if (ttl) ttl.textContent = tt;
  if (sub) sub.textContent = ss;
  if (c) {
    c.style.display = mode !== 'unlock' ? 'block' : 'none';
    c.textContent = t('pin_cancel');
  }
  const canBio = tg?.BiometricManager?.isBiometricAvailable && tg?.BiometricManager?.isAccessGranted;
  if (bio) bio.style.display = (mode === 'unlock' && canBio) ? 'flex' : 'none';
  const bioTxt = $('pin-bio-txt');
  if (bioTxt) bioTxt.textContent = t('pin_bio_btn');
  if (mode === 'unlock' && tg?.BiometricManager?.isBiometricTokenSaved) setTimeout(triggerBio, 300);
}

function pp(n) {
  vib('medium');
  if (pinBuf.length >= 4) return;
  pinBuf += n;
  updatePinDots();
  if (pinBuf.length === 4) setTimeout(checkPin, 200);
}
function pd() { pinBuf = pinBuf.slice(0, -1); updatePinDots(); }

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    $('pd' + i)?.classList.toggle('on', i < pinBuf.length);
  }
}

function checkPin() {
  const shake = () => {
    $('pin-dots')?.classList.add('shk');
    setTimeout(() => { $('pin-dots')?.classList.remove('shk'); pinBuf = ''; updatePinDots(); }, 420);
  };

  if (pinMode === 'unlock') {
    if (pinBuf === pin) hidePinScreen();
    else shake();
  } else if (pinMode === 'change_old') {
    if (pinBuf === pin) showPin('setup_new');
    else shake();
  } else if (pinMode === 'setup_new') {
    pinTemp = pinBuf;
    showPin('setup_confirm');
  } else if (pinMode === 'setup_confirm') {
    if (pinBuf === pinTemp) {
      pin = pinTemp;
      store.set('pin', pin);
      hidePinScreen();
      updateSettingsUI();
      showErr(tt('pin_set_success', "PIN o'rnatildi ✅"));
    } else {
      shake();
      setTimeout(() => showPin('setup_new'), 500);
    }
  }
}

async function triggerBio() {
  if (!tg?.BiometricManager?.isBiometricAvailable) return;
  tg.BiometricManager.authenticate({ reason: tt('biometric_reason_auth', 'Kassa-ga xavfsiz kirish') }, (success, token) => {
    if (success) {
      hidePinScreen();
    }
  });
}

function hidePinScreen() {
  $('pin-screen')?.classList.remove('on');
  pinContext = null;
}

function cancelPin() {
  $('pin-screen')?.classList.remove('on');
  if (pinContext === 'settings') {
    goTab('profile');
    updateSettingsUI();
  }
  pinContext = null;
}

function setupPin() {
  pinContext = 'settings';
  pin ? showPin('change_old') : showPin('setup_new');
}

function removePin() {
  if (!confirm(tt('confirm_remove_pin', "PIN kodni o'chirasizmi?"))) return;
  store.del('pin');
  pin = null;
  updateSettingsUI();
}

function toggleBio(ev) {
  ev?.stopPropagation?.();
  const bm = tg?.BiometricManager;
  if (!bm?.isBiometricAvailable) {
    showErr(tt('err_biometric_unavailable', 'Biometrika qurilmangizda mavjud emas'));
    return;
  }

  if (bm.isAccessRequested && !bm.isAccessGranted) {
    bm.openSettings();
    return;
  }

  const tokenLabel = 'kassa-token';

  const afterTokenUpdate = (updated) => {
    if (!updated) showErr(tt('err_biometric_update_failed', 'Biometrika holati yangilanmadi. Qayta urinib ko‘ring.'));
    else vib('light');
    updateSettingsUI();
  };

  if (!bm.isAccessRequested) {
    bm.requestAccess({ reason: tt('biometric_reason_enable', 'Xavfsizlik uchun biometrikadan foydalanish') }, (granted) => {
      if (!granted) return;
      bm.updateBiometricToken(tokenLabel, afterTokenUpdate);
    });
  } else {
    const newToken = bm.isBiometricTokenSaved ? '' : tokenLabel;
    bm.updateBiometricToken(newToken, afterTokenUpdate);
  }
}

// ─── SETTINGS ────────────────────────────────────────────
function openSettings() {
  updateSettingsUI();
  goTab('profile');
}

function updateSettingsUI() {
  // Legacy check for old IDs (kept for compatibility)
  const ps = $('pin-status'), rb = $('pin-rm-b'), ri = $('rate-in');
  const br = $('bio-row'), bt = $('bio-tgl');
  if (ps) ps.textContent = pin ? tt('stg_pin_set', 'Faol ✅') : tt('stg_pin_not_set', "O'rnatilmagan");
  if (rb) rb.style.display = pin ? 'block' : 'none';
  if (ri) ri.value = rate ? fmt(rate).replace(/\s/g, ' ') : '';
  if (br) br.style.display = tg?.BiometricManager?.isBiometricAvailable ? 'flex' : 'none';
  if (bt) bt.classList.toggle('on', tg?.BiometricManager?.isBiometricTokenSaved);
  // Yangi sozlamalar: toggle holati faqat Telegram API (isBiometricTokenSaved) bo'yicha
  const stgBioTgl = $('stg-bio-tgl');
  const bm = tg?.BiometricManager;
  if (bm?.isBiometricAvailable && stgBioTgl) {
    const saved = !!bm.isBiometricTokenSaved;
    stgBioTgl.classList.toggle('on', saved);
    bioOn = saved;
    store.set('bio', saved ? 'true' : 'false');
  } else if (stgBioTgl && !bm?.isBiometricAvailable) {
    stgBioTgl.classList.remove('on');
  }
  // New settings UI
  updatePinUI();
  updateThemeIcon();
  updateAccentThemeUI();
  updateNotificationSettingsUI();
  updateSubscriptionUI();
}

async function saveRate(v) {
  const n = Number(v);
  if (!n || n <= 0) {
    showErr(t('err_rate_invalid'));
    return;
  }

  rate = n;
  store.set('rate', rate);

  // Update UI immediately (dashboard balances)
  renderAll();

  if (db) {
    try {
      const { error } = await db.from('users').upsert(
        { user_id: UID, exchange_rate: rate },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      showErr(tt('rate_saved', 'Kurs saqlandi ✅'));
    } catch (e) {
      console.error('[saveRate]', e);
      showErr(tt('err_db_save', 'Bazaga saqlashda xatolik') + ': ' + (e.message || e));
    }
  } else {
    showErr(tt('rate_saved_local', 'Kurs saqlandi (Lokal) ✅'));
  }
}

async function saveRateFromStg() {
  const raw = $('stg-rate-in')?.value;
  const n = getCleanAmount(raw);
  if (!n || n <= 0) {
    showErr(t('err_rate_invalid'));
    return;
  }
  await saveRate(n);
  rateDraftStg = fmt(rate);
  closeOv('stg-sub-rate');
}

function closeStgRate(saved) {
  if (!saved) {
    const rateIn = $('stg-rate-in');
    if (rateIn && rateDraftStg !== null) rateIn.value = rateDraftStg;
  }
  closeOv('stg-sub-rate');
}

function closeStgRateBackdrop(e) {
  if (e) { const sh = e.currentTarget?.querySelector('.sheet'); if (sh && sh.contains(e.target)) return; }
  closeStgRate(false);
}

function toggleTheme() {
  document.body.classList.toggle('light');
  store.set('theme', document.body.classList.contains('light') ? 'light' : 'dark');
  updateThemeIcon();
  updateAccentThemeUI();
}

function applyAccentTheme(name = getDefaultAccentTheme()) {
  const allowed = getAccentThemeIds();
  const fallback = getDefaultAccentTheme();
  const next = allowed.includes(name) ? name : fallback;
  document.body.dataset.accentTheme = next;
  store.set('accent_theme', next);
}

function setAccentTheme(name = 'gold') {
  applyAccentTheme(name);
  updateAccentThemeUI();
  vib('light');
}

function updateAccentThemeUI() {
  const current = document.body.dataset.accentTheme || getDefaultAccentTheme();
  document.querySelectorAll('#theme-palette .theme-swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.themeColor === current);
  });
}

// ─── EXPORT / IMPORT ─────────────────────────────────────
function formatDateInputValue(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatPdfDateTime(ms) {
  return new Intl.DateTimeFormat(localeTag(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(ms));
}

function getExportRange() {
  const sStr = $('ex-from')?.value;
  const eStr = $('ex-to')?.value;
  const start = sStr ? new Date(`${sStr}T00:00:00`).getTime() : 0;
  const end = eStr ? new Date(`${eStr}T23:59:59.999`).getTime() : Date.now();
  return { sStr, eStr, start, end };
}

function getExportFileName() {
  const { sStr, eStr } = getExportRange();
  const from = (sStr || formatDateInputValue(new Date())).replaceAll('-', '.');
  const to = (eStr || formatDateInputValue(new Date())).replaceAll('-', '.');
  return `Kassa_${from}_${to}.pdf`;
}

function getExportExcelFileName() {
  return getExportFileName().replace(/\.pdf$/i, '.xls');
}

function getExportDataset() {
  const { sStr, eStr, start, end } = getExportRange();
  const data = txList
    .filter(t => t.ms >= start && t.ms <= end)
    .sort((a, b) => a.ms - b.ms);
  const income = data.filter(t => t.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const expense = data.filter(t => t.type === 'expense').reduce((sum, row) => sum + row.amount, 0);
  const receipts = data.filter(t => t.receipt || t.receipt_url).length;
  const balance = income - expense;
  return { sStr, eStr, start, end, data, income, expense, receipts, balance };
}

function setExportPreset(preset) {
  const now = new Date();
  let from = new Date(now);
  let to = new Date(now);

  if (preset === 'today') {
    // today
  } else if (preset === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'last30') {
    from = new Date(now.getTime() - 29 * 86400000);
  }

  const fromEl = $('ex-from');
  const toEl = $('ex-to');
  if (fromEl) fromEl.value = formatDateInputValue(from);
  if (toEl) toEl.value = formatDateInputValue(to);

  document.querySelectorAll('[data-exp-preset]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.expPreset === preset);
  });

  updateExportPreview();
}

function openExport() {
  const gate = getFeatureGateResult('advanced_reports');
  if (!gate.allowed) {
    closeOv('ov-settings');
    return openUpgradePaywall(gate.featureKey, { gate, source: 'report' });
  }
  closeOv('ov-settings');
  setExportPreset('month');
  $('ex-from').onchange = () => {
    document.querySelectorAll('[data-exp-preset]').forEach(btn => btn.classList.remove('active'));
    updateExportPreview();
  };
  $('ex-to').onchange = () => {
    document.querySelectorAll('[data-exp-preset]').forEach(btn => btn.classList.remove('active'));
    updateExportPreview();
  };
  showOv('ov-export');
}

function updateExportPreview() {
  const { sStr, eStr, data, income, expense, receipts, balance } = getExportDataset();

  const cntEl = $('ex-cnt');
  const recEl = $('ex-rec');
  const incEl = $('ex-inc');
  const expEl = $('ex-exp');
  const balEl = $('ex-bal');
  const fileEl = $('ex-file');
  const periodEl = $('ex-period');

  if (cntEl) cntEl.textContent = String(data.length);
  if (recEl) recEl.textContent = String(receipts);
  if (incEl) incEl.textContent = `+${fmt(income)} ${tt('suffix_uzs', "so'm")}`;
  if (expEl) expEl.textContent = `-${fmt(expense)} ${tt('suffix_uzs', "so'm")}`;
  if (balEl) balEl.textContent = `${fmt(balance)} ${tt('suffix_uzs', "so'm")}`;
  if (fileEl) fileEl.textContent = `${getExportFileName()} + ${getExportExcelFileName()}`;
  if (periodEl) periodEl.textContent = sStr && eStr ? `${sStr.replaceAll('-', '.')} — ${eStr.replaceAll('-', '.')}` : '—';
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildExcelSpreadsheetXml(dataset) {
  const rows = (dataset?.data || []).map((row) => `
    <Row>
      <Cell><Data ss:Type="String">${xmlEscape(formatPdfDateTime(row.ms))}</Data></Cell>
      <Cell><Data ss:Type="String">${xmlEscape(String(row.category || '—'))}</Data></Cell>
      <Cell><Data ss:Type="String">${xmlEscape(row.type === 'income' ? tt('income', 'Kirim') : tt('expense', 'Chiqim'))}</Data></Cell>
      <Cell ss:StyleID="amount"><Data ss:Type="Number">${Number(row.amount || 0)}</Data></Cell>
      <Cell><Data ss:Type="String">${xmlEscape(row.receipt || row.receipt_url ? 'Bor' : "Yo'q")}</Data></Cell>
      <Cell><Data ss:Type="String">${xmlEscape(String(row.source || 'mini_app'))}</Data></Cell>
    </Row>`).join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="head">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#111827" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="title">
   <Font ss:Bold="1" ss:Size="13"/>
  </Style>
  <Style ss:ID="amount">
   <NumberFormat ss:Format="#,##0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Hisobot">
  <Table>
   <Column ss:Width="130"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="70"/>
   <Column ss:Width="100"/>
   <Row><Cell ss:MergeAcross="5" ss:StyleID="title"><Data ss:Type="String">Kassa - Excel hisobot</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="5"><Data ss:Type="String">Davr: ${xmlEscape(`${dataset.sStr.replaceAll('-', '.')} — ${dataset.eStr.replaceAll('-', '.')}`)}</Data></Cell></Row>
   <Row>
    <Cell><Data ss:Type="String">Kirim</Data></Cell>
    <Cell ss:StyleID="amount"><Data ss:Type="Number">${Number(dataset.income || 0)}</Data></Cell>
    <Cell><Data ss:Type="String">Chiqim</Data></Cell>
    <Cell ss:StyleID="amount"><Data ss:Type="Number">${Number(dataset.expense || 0)}</Data></Cell>
    <Cell><Data ss:Type="String">Qoldiq</Data></Cell>
    <Cell ss:StyleID="amount"><Data ss:Type="Number">${Number(dataset.balance || 0)}</Data></Cell>
   </Row>
   <Row><Cell><Data ss:Type="String">Operatsiyalar</Data></Cell><Cell><Data ss:Type="Number">${dataset.data.length}</Data></Cell><Cell><Data ss:Type="String">Cheklar</Data></Cell><Cell><Data ss:Type="Number">${Number(dataset.receipts || 0)}</Data></Cell><Cell><Data ss:Type="String">Yaratildi</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(formatPdfDateTime(Date.now()))}</Data></Cell></Row>
   <Row/>
   <Row>
    <Cell ss:StyleID="head"><Data ss:Type="String">Sana</Data></Cell>
    <Cell ss:StyleID="head"><Data ss:Type="String">Kategoriya</Data></Cell>
    <Cell ss:StyleID="head"><Data ss:Type="String">Tur</Data></Cell>
    <Cell ss:StyleID="head"><Data ss:Type="String">Summa (so'm)</Data></Cell>
    <Cell ss:StyleID="head"><Data ss:Type="String">Chek</Data></Cell>
    <Cell ss:StyleID="head"><Data ss:Type="String">Manba</Data></Cell>
   </Row>${rows}
  </Table>
 </Worksheet>
</Workbook>`;
}

function buildExcelBlob(dataset) {
  return new Blob([buildExcelSpreadsheetXml(dataset)], { type: 'application/vnd.ms-excel;charset=utf-8' });
}

function downloadBlob(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

function downloadPdfBlob(blob, fileName) {
  downloadBlob(blob, fileName);
}

function downloadExcelBlob(blob, fileName) {
  downloadBlob(blob, fileName);
}

async function blobToDataUrl(blob) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function sendReportFilesToBot(pdfBlob, pdfFileName, dataset) {
  const pdfBase64 = await blobToDataUrl(pdfBlob);
  const resp = await fetch('/api/send-report-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: UID,
      pdf_file_name: pdfFileName,
      pdf_caption: `📄 ${tt('pdf_title', 'PDF Hisobot')}
${dataset.sStr.replaceAll('-', '.')} — ${dataset.eStr.replaceAll('-', '.')}`,
      pdf_base64: pdfBase64,
      excel_file_name: getExportExcelFileName(),
      excel_caption: `📊 Excel hisobot
${dataset.sStr.replaceAll('-', '.')} — ${dataset.eStr.replaceAll('-', '.')}`,
      rows: dataset.data.map((row) => ({
        date: new Date(row.ms || Date.now()).toISOString(),
        category: row.category,
        type: row.type,
        amount: row.amount,
        receipt_url: row.receipt_url || '',
        source: row.source || 'mini_app'
      })),
      meta: {
        period: `${dataset.sStr.replaceAll('-', '.')} — ${dataset.eStr.replaceAll('-', '.')}`,
        generatedAt: formatPdfDateTime(Date.now())
      },
      summary: {
        count: dataset.data.length,
        receipts: dataset.receipts,
        income: dataset.income,
        expense: dataset.expense,
        balance: dataset.balance
      }
    })
  });

  let payload = {};
  try { payload = await resp.json(); } catch { }
  if (!resp.ok || payload?.ok === false) {
    console.warn('[sendReportFilesToBot]', payload || { status: resp.status });
    const error = new Error(payload?.error || `HTTP ${resp.status}`);
    if (payload?.detail) error.details = payload.detail;
    throw error;
  }
}

async function notifyMiniAppTxSaved(row) {
  if (!UID || !row) return;
  try {
    const resp = await fetch('/api/notify-miniapp-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: UID,
        tg_user_id: Number(tg?.initDataUnsafe?.user?.id || UID || 0),
        amount: Number(row.amount || 0),
        type: row.type,
        category: row.category,
        receipt_url: row.receipt_url || '',
        source: row.source || 'mini_app'
      })
    });
    let payload = {};
    try { payload = await resp.json(); } catch { }
    if (!resp.ok || payload?.ok === false) {
      console.warn('[notifyMiniAppTxSaved]', payload || { status: resp.status });
    }
  } catch (error) {
    console.warn('[notifyMiniAppTxSaved]', error);
  }
}

function makePDF() {
  const gate = getFeatureGateResult('advanced_reports');
  if (!gate.allowed) {
    return openUpgradePaywall(gate.featureKey, { gate, source: 'report' });
  }
  const pdfMake = window.pdfMake;
  const createBtn = $('ex-create-btn');
  if (!pdfMake?.createPdf) {
    showErr(tt('err_pdf_lib_missing', 'PDF moduli yuklanmagan!'));
    return;
  }

  const dataset = getExportDataset();
  const { sStr, eStr, data, income: inc, expense: exp, receipts, balance } = dataset;
  if (!sStr || !eStr) return;

  if (!data.length) {
    showErr(tt('no_data_error', "Hozircha ma'lumot yo'q"));
    return;
  }

  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = tt('pdf_create_loading', 'Tayyorlanmoqda...');
  }

  const fileName = getExportFileName();
  const excelFileName = getExportExcelFileName();

  const tableBody = [
    [
      { text: tt('date_start', 'Sana'), style: 'th' },
      { text: tt('edit_category', 'Kategoriya'), style: 'th' },
      { text: tt('edit_type', 'Tur'), style: 'th' },
      { text: tt('edit_amount', 'Summa'), style: 'th', alignment: 'right' }
    ],
    ...data.map(row => {
      const isIncome = row.type === 'income';
      return [
        { text: formatPdfDateTime(row.ms), style: 'td' },
        { text: String(row.category || '—'), style: 'td' },
        { text: isIncome ? tt('income', 'Kirim') : tt('expense', 'Chiqim'), style: 'td' },
        {
          text: `${isIncome ? '+' : '-'}${fmt(row.amount)} ${tt('suffix_uzs', "so'm")}`,
          style: 'tdAmount',
          color: isIncome ? '#10b981' : '#ef4444',
          alignment: 'right'
        }
      ];
    })
  ];

  const dd = {
    info: {
      title: fileName,
      author: 'Kassa',
      subject: tt('pdf_title', 'PDF Hisobot')
    },
    pageSize: 'A4',
    pageMargins: [24, 26, 24, 30],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: '#111827'
    },
    content: [
      {
        stack: [
          { text: tt('pdf_report_header', 'Kassa — Moliyaviy Hisobot'), style: 'title' },
          { text: `${tt('pdf_period_label', 'Davr')}: ${sStr.replaceAll('-', '.')} — ${eStr.replaceAll('-', '.')}`, style: 'subtle' },
          { text: `${tt('pdf_generated_at', 'Yaratilgan vaqt')}: ${formatPdfDateTime(Date.now())}`, style: 'subtle' }
        ],
        margin: [0, 0, 0, 14]
      },
      {
        columns: [
          { width: '*', stack: [{ text: tt('income', 'Kirim'), style: 'sumLabel' }, { text: `+${fmt(inc)} ${tt('suffix_uzs', "so'm")}`, style: 'sumIncome' }] },
          { width: '*', stack: [{ text: tt('expense', 'Chiqim'), style: 'sumLabel' }, { text: `-${fmt(exp)} ${tt('suffix_uzs', "so'm")}`, style: 'sumExpense' }] },
          { width: '*', stack: [{ text: tt('balance_title', 'Qoldiq'), style: 'sumLabel' }, { text: `${fmt(balance)} ${tt('suffix_uzs', "so'm")}`, style: 'sumBalance' }] }
        ],
        columnGap: 10,
        margin: [0, 0, 0, 8]
      },
      {
        columns: [
          { width: '*', text: `${tt('pdf_ops', 'Operatsiyalar')}: ${data.length}`, style: 'metaLine' },
          { width: '*', text: `${tt('pdf_receipts', 'Cheklar')}: ${receipts}`, style: 'metaLine', alignment: 'right' }
        ],
        margin: [0, 0, 0, 14]
      },
      {
        table: {
          headerRows: 1,
          widths: [90, '*', 62, 92],
          body: tableBody
        },
        layout: {
          fillColor: (rowIndex) => rowIndex === 0 ? '#111827' : rowIndex % 2 === 0 ? '#f8fafc' : null,
          hLineColor: () => '#e5e7eb',
          vLineColor: () => '#e5e7eb',
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6
        }
      }
    ]
  };

  dd.styles = {
    title: { fontSize: 18, bold: true, color: '#0f172a' },
    subtle: { fontSize: 9, color: '#6b7280' },
    sumLabel: { fontSize: 9, color: '#6b7280', margin: [0, 0, 0, 3] },
    sumIncome: { fontSize: 13, bold: true, color: '#10b981' },
    sumExpense: { fontSize: 13, bold: true, color: '#ef4444' },
    sumBalance: { fontSize: 13, bold: true, color: '#7c3aed' },
    metaLine: { fontSize: 9, color: '#475569' },
    th: { color: '#ffffff', bold: true, fontSize: 9 },
    td: { fontSize: 9, color: '#111827' },
    tdAmount: { fontSize: 9, bold: true }
  };

  pdfMake.createPdf(dd).getBlob(async (blob) => {
    const excelBlob = buildExcelBlob(dataset);
    try {
      if (UID && tg?.initDataUnsafe?.user?.id) {
        await sendReportFilesToBot(blob, fileName, dataset);
        showErr(currentLang === 'ru' ? 'PDF va Excel botga yuborildi ✅' : currentLang === 'en' ? 'PDF and Excel were sent to the bot ✅' : 'PDF va Excel botga yuborildi ✅', 2800);
      } else {
        downloadPdfBlob(blob, fileName);
        downloadExcelBlob(excelBlob, excelFileName);
      }
      closeOv('ov-export');
    } catch (error) {
      console.warn('[makePDF]', error);
      if (handleUpgradeRequiredError(error, 'advanced_reports', 'report')) {
        closeOv('ov-export');
        return;
      }
      downloadPdfBlob(blob, fileName);
      downloadExcelBlob(excelBlob, excelFileName);
      showErr(currentLang === 'ru' ? 'Botga yuborilmadi. PDF va Excel yuklab olindi.' : currentLang === 'en' ? 'Sending to the bot failed. PDF and Excel were downloaded.' : "Botga yuborilmadi. PDF va Excel yuklab olindi.", 3400);
      closeOv('ov-export');
    } finally {
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.textContent = tt('pdf_create', 'Yaratish');
      }
    }
  });
}

function doExport() {

  const blob = new Blob([JSON.stringify({ txList, cats, pin, bio: bioOn }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `kassa_${isoNow().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function doImport(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const bk = JSON.parse(ev.target.result);
      if (bk.pin) store.set('pin', bk.pin);
      if (bk.bio !== undefined) store.set('bio', bk.bio);
      if (Array.isArray(bk.txList) && bk.txList.length && db) {
        const rows = bk.txList.map(({ id, ms, receipt, ...r }) => ({
          ...r, user_id: UID, date: isoNow(r.date || ms || Date.now()),
        }));
        const { error } = await insertTransactions(rows, 'import');
        if (error) throw error;
      }
      showErr(tt('import_success_reload', 'Muvaffaqiyatli import! Qayta yuklanmoqda...'));
      setTimeout(() => location.reload(), 1500);
    } catch (err) { showErr(tt('err_import_failed', 'Import xatolik') + ': ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetData() {
  if (!confirm(tt('confirm_reset_data', "DIQQAT! Barcha tranzaksiyalar o'chadi. Davom etasizmi?"))) return;
  txList = [];
  renderAll();
  renderHistory();
  closeOv('ov-settings');
  if (db) db.from('transactions').delete().eq('user_id', UID).then(({ error }) => {
    if (error) showErr(tt('err_delete_failed', "O'chirishda xatolik"));
    else showErr(tt('reset_success', 'Tozalandi ✅'));
  });
}

// ─── I18N (INTERNATIONALIZATION) ─────────────────────────

async function loadLang(lang) {
  try {
    // Har qanday hostda doim ildizdan: /lang/uz.json
    const url = new URL(`/lang/${lang}.json`, window.location.origin);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Lang file not found');
    T = await res.json();
    currentLang = lang;
    store.set('lang', lang);
  } catch (e) {
    console.warn('[i18n] Failed to load lang:', lang, e);
  }
}

function t(key) {
  return T[key] || key;
}


function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (T[key]) el.textContent = T[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (T[key]) el.placeholder = T[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (T[key]) el.title = T[key];
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (T[key]) el.innerHTML = T[key];
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.dataset.i18nAriaLabel;
    if (T[key]) el.setAttribute('aria-label', T[key]);
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.dataset.i18nAlt;
    if (T[key]) el.setAttribute('alt', T[key]);
  });
  ['uz', 'ru', 'en'].forEach(l => {
    const check = $(`lang-check-${l}`);
    if (check) check.textContent = l === currentLang ? '✓' : '';
  });
  document.documentElement.lang = currentLang === 'ru' ? 'ru' : currentLang === 'en' ? 'en' : 'uz';
  document.title = tt('app_name', 'Kassa');
  renderProfileUI();
  updateNotificationSettingsUI();
}

window.applyLang = applyLang;

async function changeLang(lang) {
  await loadLang(lang);
  applyLang();
  refreshPinIfOpen();
  renderAll();
  renderHistory();
  updateSettingsUI();
  initSettingsUI();
  closeOv('stg-sub-lang');
  vib('light');
}

// ─── SETTINGS SUB-PAGES ─────────────────────────────────
function openStgSub(id) {
  showOv(id);
  // Pre-fill data
  if (id === 'stg-sub-profile') {
    const nameIn = $('stg-name-in');
    if (nameIn) nameIn.value = getDisplayName();
    resetProfileEditState();
    renderProfileEditorUI();
    renderProfileUI();
  }
  if (id === 'stg-sub-rate') {
    const rateIn = $('stg-rate-in');
    if (rateIn) {
      rateDraftStg = fmt(rate);
      rateIn.value = rateDraftStg;
    }
  }
  if (id === 'stg-sub-cats') {
    stgCatTab('income');
  }
  if (id === 'stg-sub-notifications') {
    updateNotificationSettingsUI();
    configurePushNotifications()
      .then(() => refreshNotificationPreferences())
      .catch(() => { });
  }
  if (id === 'stg-sub-subscription') {
    updateSubscriptionUI();
  }
  if (id === 'stg-sub-terms') {
    const el = $('stg-terms-text');
    if (el) el.textContent = (T.terms_text || '').replace(/\\n/g, '\n');
  }
  if (id === 'stg-sub-privacy') {
    const el = $('stg-privacy-text');
    if (el) el.textContent = (T.privacy_text || '').replace(/\\n/g, '\n');
  }
}

// ─── PROFILE ────────────────────────────────────────────
async function saveProfile() {
  const raw = $('stg-name-in')?.value || '';
  const name = normalizeName(raw);
  if (!name) {
    showErr((T.err_profile_name_required) || (currentLang === 'ru' ? 'Введите имя' : currentLang === 'en' ? 'Enter a name' : 'Ism kiriting'));
    return;
  }

  const nextAvatarUrl = profileEditState.removeAvatar ? '' : (profileEditState.photoUrl || getCurrentProfilePhotoUrl() || '');
  const prevState = {
    fullName: profileState.fullName,
    photoUrl: getCurrentProfilePhotoUrl()
  };

  profileState.fullName = name;
  setProfileAvatarCache(nextAvatarUrl);
  store.set('display_name', name);
  renderProfileUI();

  if (db) {
    const payload = { full_name: name, avatar_url: nextAvatarUrl || null };
    const { error } = await updateUserRow(payload);
    if (error) {
      profileState.fullName = prevState.fullName;
      setProfileAvatarCache(prevState.photoUrl);
      store.set('display_name', prevState.fullName || '');
      resetProfileEditState();
      renderProfileUI();
      showErr(((T.err_profile_save) || (currentLang === 'ru' ? 'Не удалось сохранить профиль' : currentLang === 'en' ? 'Could not save profile' : "Profilni saqlab bo'lmadi")) + (error.message ? ': ' + error.message : ''));
      return;
    }
  }

  resetProfileEditState();
  renderProfileUI();
  closeOv('stg-sub-profile');
  vib('light');
  showErr((T.profile_saved) || (currentLang === 'ru' ? 'Профиль сохранён ✅' : currentLang === 'en' ? 'Profile saved ✅' : 'Profil saqlandi ✅'));
}


function initSettingsUI() {
  renderProfileUI();

  // Theme icon
  updateThemeIcon();

  // PIN status
  updatePinUI();

  // Biometrik qatori — toggle holati updateSettingsUI / BiometricManager.init da sinxronlanadi
  const canBio = tg?.BiometricManager?.isBiometricAvailable;
  const bioRow = $('stg-bio-row');
  if (bioRow) bioRow.style.display = canBio ? 'flex' : 'none';
}


function updatePinUI() {
  const status = $('stg-pin-status');
  const rmRow = $('stg-pin-rm-row');
  if (pin) {
    if (status) status.textContent = t('stg_pin_set');
    if (rmRow) rmRow.style.display = 'flex';
  } else {
    if (status) status.textContent = t('stg_pin_not_set');
    if (rmRow) rmRow.style.display = 'none';
  }
}

function updateThemeIcon() {
  const ico = $('stg-theme-ico');
  if (ico) ico.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
}

// ─── CATEGORIES IN SETTINGS ─────────────────────────────
let stgCatType = 'income';

function stgCatTab(type) {
  stgCatType = type;
  $('stg-cat-inc-tab')?.classList.toggle('active', type === 'income');
  $('stg-cat-exp-tab')?.classList.toggle('active', type === 'expense');
  renderStgCats();
}

function renderStgCats() {
  const list = $('stg-cat-list');
  if (!list) return;
  const items = cats[stgCatType] || [];
  if (items.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">${t('no_data')}</div>`;
    return;
  }
  list.innerHTML = items.map((c, i) => `
    <div class="stg-cat-item">
      <div class="sti-ico">${svgIcon(c.icon || 'star')}</div>
      <div class="sti-name">${esc(c.name)}</div>
      <button class="sti-del" onclick="delStgCat(${i})">✕</button>
    </div>
  `).join('');
}

async function delStgCat(idx) {
  const cat = cats[stgCatType]?.[idx];
  if (!cat || !confirm(`"${cat.name}" ni o'chirasizmi?`)) return;
  cats[stgCatType].splice(idx, 1);
  renderStgCats();
  if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
}

function openAddCatFromStg() {
  newCatType = stgCatType;
  openAddCat(stgCatType);
}

// ─── EXTERNAL LINKS ─────────────────────────────────────
function openTgGroup() {
  const url = 'https://t.me/meningkassam_community';
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

function openSupport() {
  const url = 'https://t.me/uyqur_nurali';
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}



// ─── GLOBAL ERROR HANDLER ────────────────────────────────
window.addEventListener('unhandledrejection', e => {
  console.error('[unhandled]', e.reason);
});
window.addEventListener('error', e => {
  console.error('[error]', e.message);
});
