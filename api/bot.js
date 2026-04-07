'use strict';
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createTelegramOps } = require('../lib/telegram-ops.cjs');
const subscriptionHelpers = require('../public/kassa.subscription.js');

// ─── ENV CHECKS ──────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const OAI_KEY = process.env.OPENAI_API_KEY;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN yo\'q');
if (!SUPA_URL) throw new Error('SUPABASE_URL yo\'q');
if (!SUPA_KEY) throw new Error('SUPABASE_KEY (SERVICE_ROLE yoki anon) yo\'q');

// ─── CLIENTS ─────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);

// OpenAI — faqat ovozli xabar uchun (ixtiyoriy)
let openai = null;
let openaiDisabledUntil = 0;
if (OAI_KEY && !OAI_KEY.startsWith('your-')) {
  try {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: OAI_KEY });
  } catch (e) {
    console.warn('[BOT:openai] OpenAI moduli topilmadi:', e.message);
  }
}

// ─── CONSTANTS ───────────────────────────────────────────
const KB = {
  keyboard: [
    ['📊 Bugungi Hisobot', '📅 Oylik Hisobot'],
    ['↩️ Oxirgisini O\'chirish', '❓ Qo\'llanma'],
  ],
  resize_keyboard: true,
};

const GUIDE = `<b>📖 Qo'llanma</b>

Menga oddiy matn yozing — men gap mazmuniga qarab kirim, chiqim, qarz va rejangizni tushunishga harakat qilaman 🤖

<b>💸 Chiqim misollari:</b>
  • <i>50 ming tushlik</i>
  • <i>Taksiga 20 ming berdim</i>
  • <i>Akamga 100 ming o'tkazdim</i>
  • <i>Doston uchun 180 ming kiyim oldim</i>

<b>💰 Kirim misollari:</b>
  • <i>200 ming dadam berdilar</i>
  • <i>Mijozdan 500 ming oldim</i>
  • <i>Oylik tushdi 4 mln</i>

<b>🤝 Qarz berish / olish:</b>
  • <i>Suxrobga qarz 100 ming</i>
  • <i>Suxrobga 100 ming qarz berdim</i>
  • <i>Suxrobdan qarz oldim 250 ming</i>

<b>🔁 Qarz qaytishini yozish:</b>
  • <i>Suxrob 100 ming qaytardi</i>
  • <i>100 ming Suxrobdan qaytdi</i>
  • <i>Suxrobga 80 ming qaytardim</i>

<b>🎯 Reja / limit tuzish:</b>
  • <i>5 mln farzandlarim uchun plan</i>
  • <i>1 mln ovqat uchun reja</i>
  • <i>Transport 800 ming limit</i>
  • <i>500 ming qolganda ogohlantir</i>

<b>🧾 Kimga / nima uchun bo'lgan chiqim:</b>
  • <i>Ozodbek uchun 120 ming benzin</i>
  • <i>Shuhratga 90 ming taksi berdim</i>

<b>🧾 Chek qo'shish:</b>
Chek rasmini izoh bilan birga yuboring. Masalan: <i>78 ming market</i>

<b>ℹ️ Eslatma:</b>
Qarz berilganda balans darhol o'zgarmaydi. Qarz qaytganda yoki qaytarganingizda qarz yozuvi yangilanadi va mos ravishda hisobga olinadi. Mini App ichidan kiritilgan operatsiyalar ham botga ko'rinadi.`;

const DEFAULT_RATE = 12200;
const ADMIN_IDS = new Set((process.env.ADMIN_IDS || '').split(',').map(v => v.trim()).filter(Boolean));
const ADMIN_USERS_PAGE_SIZE = 10;

// ─── LOGGING ─────────────────────────────────────────────
function getAdminNotifyChatId() {
  return String(process.env.ADMIN_NOTIFY_CHAT_ID || process.env.OWNER_ID || [...ADMIN_IDS][0] || '').trim();
}

function getAppLogger() {
  return createTelegramOps({
    botToken: process.env.BOT_TOKEN || BOT_TOKEN,
    logChannelId: process.env.LOG_CHANNEL_ID,
    adminChatId: getAdminNotifyChatId(),
    loggingEnabled: process.env.TELEGRAM_LOGGING_ENABLED,
    logLevel: process.env.LOG_LEVEL || 'INFO',
    localLevel: process.env.LOCAL_LOG_LEVEL || 'ERROR',
    source: 'BOT',
  });
}

const log = (scope, data) => getAppLogger().local('INFO', scope, data);
const warn = (scope, data) => getAppLogger().local('SUCCESS', scope, data);
const logErr = async (scope, e, extra = {}) => {
  const payload = { error: e, ...extra };
  const logger = getAppLogger();
  logger.local('ERROR', scope, payload);
  return logger.error({
    scope,
    user_id: extra.userId || extra.user_id || null,
    chat_id: extra.chatId || extra.chat_id || null,
    username: extra.username || null,
    full_name: extra.full_name || null,
    phone_number: extra.phone_number || null,
    message: e?.message || String(e),
    payload,
  });
};

function buildUserLogContext(msg = {}, user = null, extra = {}) {
  const fallbackFullName = `${msg?.from?.first_name || ''} ${msg?.from?.last_name || ''}`.trim() || null;
  return {
    user_id: extra.user_id ?? msg?.from?.id ?? user?.user_id ?? null,
    chat_id: extra.chat_id ?? msg?.chat?.id ?? null,
    username: extra.username ?? msg?.from?.username ?? null,
    full_name: extra.full_name ?? user?.full_name ?? fallbackFullName,
    phone_number: extra.phone_number ?? user?.phone_number ?? null,
  };
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/[^\d+]/g, '').trim();
}

function hasRegisteredPhone(user) {
  return normalizePhoneNumber(user?.phone_number || '').length > 0;
}

// ─── UTILS ───────────────────────────────────────────────
const iso = (ms = Date.now()) => new Date(ms).toISOString();

// HTML entity escape
const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Markdown-ish to HTML (simple bold/italic)
const md2html = (t) => String(t ?? '')
  .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
  .replace(/__(.*?)__/g, '<i>$1</i>')
  .replace(/\*(.*?)\*/g, '<b>$1</b>')
  .replace(/_(.*?)_/g, '<i>$1</i>');

// Raqamni lokal formatda ko'rsatish
const numFmt = n => Number(n || 0).toLocaleString('ru-RU');
const isAdmin = userId => ADMIN_IDS.has(String(userId));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BOT_USERNAME = String(process.env.BOT_USERNAME || '').trim().replace(/^@+/, '').toLowerCase();
let txSourceColumnSupported = null;
let txSourceRefColumnSupported = null;
let debtSettlementColumnSupported = null;
let categoryLimitNameColumnSupported = null;
const SUBSCRIPTION_FIELDS = Array.isArray(subscriptionHelpers.SUBSCRIPTION_FIELDS)
  ? subscriptionHelpers.SUBSCRIPTION_FIELDS.slice()
  : ['plan_code', 'subscription_status', 'subscription_start_at', 'subscription_end_at', 'trial_end_at', 'canceled_at', 'grace_until', 'created_at', 'updated_at'];

async function downloadTelegramFileBuffer(fileId) {
  const fileLink = await bot.getFileLink(fileId);
  const resp = await fetch(fileLink);
  if (!resp.ok) throw new Error(`Telegram file download failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function transcribeVoiceBuffer(buffer) {
  if (!openai) throw new Error('OPENAI unavailable');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'whisper-1');
  form.append('language', 'uz');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OAI_KEY}` },
    body: form,
  });

  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!resp.ok) {
    const error = new Error(data?.error?.message || data?.raw || `Whisper HTTP ${resp.status}`);
    error.status = resp.status;
    error.response = { data };
    if (resp.status === 401) {
      disableOpenAI('auth_error', { permanent: true, minutes: 12 * 60 });
    }
    throw error;
  }
  return String(data?.text || '').trim();
}

function fmtDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('uz-UZ');
  } catch {
    return String(v);
  }
}

function shortId(v, len = 8) {
  return String(v || '').slice(0, len);
}

function tgErr(e) {
  return e?.response?.body?.description || e?.message || "Noma'lum xatolik";
}

function parseTelegramCommand(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/')) return null;
  const match = raw.match(/^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const command = `/${String(match[1] || '').toLowerCase()}`;
  const mention = String(match[2] || '').trim().toLowerCase();
  const argsText = String(match[3] || '').trim();

  if (mention && BOT_USERNAME && mention !== BOT_USERNAME) {
    return null;
  }

  return {
    command,
    mention: mention || null,
    argsText,
    args: argsText ? argsText.split(/\s+/).filter(Boolean) : [],
    raw,
  };
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(target) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('could not find the column'));
}

function isNullConstraintOnColumn(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(`null value in column "${target}"`) && msg.includes('not-null constraint');
}

function isQuotaOrRateLimitError(error) {
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  const msg = String(error?.message || error?.response?.data?.error?.message || '').toLowerCase();
  return status === 429 || msg.includes('insufficient_quota') || msg.includes('current quota') || msg.includes('rate limit') || msg.includes('too many requests');
}

function isOpenAIAuthError(error) {
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  const msg = String(error?.message || error?.response?.data?.error?.message || '').toLowerCase();
  return status === 401
    || msg.includes('incorrect api key provided')
    || msg.includes('invalid api key')
    || msg.includes('authentication')
    || msg.includes('unauthorized');
}

function disableOpenAI(reason = 'disabled', { permanent = false, minutes = 30 } = {}) {
  openaiDisabledUntil = Date.now() + (Math.max(1, Number(minutes) || 30) * 60 * 1000);
  if (permanent) openai = null;
  warn('openai-disabled', {
    reason,
    permanent,
    disabledUntil: new Date(openaiDisabledUntil).toISOString(),
  });
}

function isDuplicateKeyError(error) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('already exists');
}

function hasSubscriptionSchema(user) {
  if (typeof subscriptionHelpers.hasSubscriptionSchema === 'function') {
    return subscriptionHelpers.hasSubscriptionSchema(user || {});
  }
  return SUBSCRIPTION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(user || {}, field));
}

function getSubscriptionSnapshotForUser(user, options = {}) {
  if (typeof subscriptionHelpers.getSubscriptionSnapshot === 'function') {
    return subscriptionHelpers.getSubscriptionSnapshot(user || {}, {
      ...options,
      schemaReady: options.schemaReady ?? hasSubscriptionSchema(user),
    });
  }
  return {
    schemaReady: options.schemaReady ?? hasSubscriptionSchema(user),
    planCode: 'free',
    effectiveStatus: 'free',
    planTitle: 'Bepul',
    uiStatusLabel: 'Obuna bo\'lmagan',
    isPremium: false,
  };
}

function evaluateFeatureAccess(featureKey, user, context = {}) {
  if (typeof subscriptionHelpers.evaluateFeatureGate === 'function') {
    return subscriptionHelpers.evaluateFeatureGate(featureKey, user || {}, {
      ...context,
      schemaReady: context.schemaReady ?? hasSubscriptionSchema(user),
    });
  }
  return { allowed: true, featureKey, snapshot: getSubscriptionSnapshotForUser(user, context), degraded: true };
}

function getPremiumSupportUrl() {
  return String(process.env.PREMIUM_SUPPORT_URL || process.env.WEBAPP_URL || 'https://t.me/uyqur_nurali').trim();
}

function buildUpgradeReplyMarkup() {
  const url = getPremiumSupportUrl();
  if (!url) return undefined;
  return {
    inline_keyboard: [[{ text: '💎 Premium ga o\'tish', url }]],
  };
}

function getFeatureBlockedMessage(featureKey) {
  if (featureKey === 'plan_create' || featureKey === 'limit_create') {
    return `💎 <b>Siz bepul tarif limitiga yetdingiz.</b>

Bepul tarifda faqat 1 ta faol reja va limit ishlatiladi.
Premium orqali cheksiz reja, limit, qarz va kengaytirilgan hisobotlardan foydalanishingiz mumkin.`;
  }
  if (featureKey === 'debt_create') {
    return `💎 <b>Siz bepul tarif limitiga yetdingiz.</b>

Bepul tarifda faqat 1 ta faol qarz saqlanadi.
Premium orqali cheksiz qarz, reja, limit va qulay eslatmalardan foydalanishingiz mumkin.`;
  }
  if (featureKey === 'advanced_reports') {
    return `💎 <b>PDF va kengaytirilgan hisobotlar Premium tarifida.</b>

Premium orqali PDF, Excel va keyingi kengaytirilgan hisobot funksiyalarini ochishingiz mumkin.`;
  }
  return `💎 <b>Bu imkoniyat Premium tarifida mavjud.</b>

Premium orqali ko'proq funksiyalar va yuqori limitlardan foydalanishingiz mumkin.`;
}

async function sendFeatureBlockedMessage(chatId, featureKey) {
  await bot.sendMessage(chatId, getFeatureBlockedMessage(featureKey), {
    parse_mode: 'HTML',
    reply_markup: buildUpgradeReplyMarkup(),
  }).catch(() => null);
}

function buildSubscriptionUpdatePayload({
  planCode = 'premium_monthly',
  status = 'active',
  durationDays = 30,
  now = new Date(),
} = {}) {
  const startedAt = new Date(now);
  const endAt = new Date(startedAt.getTime() + Math.max(1, Number(durationDays || 30)) * 86400000);
  if (planCode === 'free') {
    return {
      plan_code: 'free',
      subscription_status: 'free',
      subscription_start_at: null,
      subscription_end_at: null,
      trial_end_at: null,
      canceled_at: null,
      grace_until: null,
    };
  }
  return {
    plan_code: planCode,
    subscription_status: status,
    subscription_start_at: startedAt.toISOString(),
    subscription_end_at: endAt.toISOString(),
    trial_end_at: null,
    canceled_at: null,
    grace_until: null,
  };
}

async function updateUserSubscription(userId, payload) {
  return db.from('users').update(payload).eq('user_id', userId);
}

function buildAdminSubscriptionText(targetUserId, row) {
  const snapshot = getSubscriptionSnapshotForUser(row);
  return `💎 <b>OBUNA HOLATI</b>

👤 User: <b>${esc(row?.full_name || `User ${targetUserId}`)}</b>
🆔 ID: <code>${targetUserId}</code>
📦 Tarif: <b>${esc(snapshot.planTitle)}</b>
📍 Holat: <b>${esc(snapshot.uiStatusLabel)}</b>
💰 Narx: <b>${esc(snapshot.priceLabel || '0 so\'m')}</b>
${snapshot.subscriptionStartAt ? `🗓 Boshlangan: <b>${esc(fmtDateTime(snapshot.subscriptionStartAt))}</b>\n` : ''}${snapshot.accessUntil ? `⌛️ Tugashi: <b>${esc(fmtDateTime(snapshot.accessUntil))}</b>\n` : ''}`;
}

function categoryLimitNameColumn() {
  return categoryLimitNameColumnSupported === 'name' ? 'name' : 'category_name';
}

function alternateCategoryLimitNameColumn(col) {
  return col === 'name' ? 'category_name' : 'name';
}

async function runCategoryLimitQuery(executor) {
  let nameCol = categoryLimitNameColumn();
  let result = await executor(nameCol);

  if (result?.error && isMissingColumnError(result.error, nameCol)) {
    const alternate = alternateCategoryLimitNameColumn(nameCol);
    categoryLimitNameColumnSupported = alternate === 'name' ? 'name' : null;
    nameCol = alternate;
    result = await executor(nameCol);
  }

  if (!result?.error) {
    categoryLimitNameColumnSupported = nameCol === 'name' ? 'name' : null;
  }

  return { nameCol, result };
}

function normalizeCategoryLimitRow(row) {
  if (!row) return row;
  return {
    ...row,
    category_name: row.category_name || row.name || row.category || '',
    month_key: row.month_key || row.month || '',
    type: row.type || 'expense',
  };
}

async function fetchCategoryLimitCandidates(userId) {
  let response = await db.from('category_limits').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (response.error && isMissingColumnError(response.error, 'created_at')) {
    response = await db.from('category_limits').select('*').eq('user_id', userId);
  }
  if (response.error) {
    if (isMissingTableError(response.error, 'category_limits')) return [];
    throw response.error;
  }
  const rows = (response.data || []).map(normalizeCategoryLimitRow);
  if (rows.some(row => row && typeof row === 'object' && 'name' in row && !('category_name' in row))) {
    categoryLimitNameColumnSupported = 'name';
  }
  return rows.sort((a, b) => {
    const aTs = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bTs = new Date(b.updated_at || b.created_at || 0).getTime() || 0;
    if (bTs !== aTs) return bTs - aTs;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function sameCategoryLimitName(row, categoryName) {
  return normalizeTextForMatch(row?.category_name || row?.name || row?.category || '') === normalizeTextForMatch(categoryName);
}

function findExistingCategoryLimit(rows, categoryName, monthKey = '') {
  const exact = (rows || []).find((row) => sameCategoryLimitName(row, categoryName) && (!row.month_key || !monthKey || row.month_key === monthKey));
  if (exact) return exact;
  return (rows || []).find((row) => sameCategoryLimitName(row, categoryName)) || null;
}

function isMissingTableError(error, table) {
  const msg = String(error?.message || error?.details || '');
  return msg.includes(`relation "${table}" does not exist`) || msg.includes(`Could not find the table '${table}'`) || msg.includes(`relation '${table}' does not exist`);
}

function monthKeyOf(value = Date.now()) {
  const d = new Date(value);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthStartIso(value = Date.now()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function startOfTodayIso(value = Date.now()) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

async function sendCategoryLimitAlert(userId, chatId, category, latestAmount, txType = 'expense') {
  if (txType !== 'expense') return;
  if (!userId || !chatId || !category) return;

  try {
    const now = Date.now();
    const currentMonth = monthKeyOf(now);
    const rows = await fetchCategoryLimitCandidates(userId);
    const limit = findExistingCategoryLimit(
      rows.filter((row) => row.is_active !== false && row.notify_bot !== false && (!row.month_key || row.month_key === currentMonth)),
      category,
      currentMonth,
    ) || findExistingCategoryLimit(rows.filter((row) => row.is_active !== false && row.notify_bot !== false), category, currentMonth);

    if (!limit || !limit.notify_bot || !limit.is_active) return;

    const spentRes = await db
      .from('transactions')
      .select('amount, date')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .eq('category', category)
      .gte('date', monthStartIso(now));

    if (spentRes.error) {
      await logErr('limit-spent', spentRes.error, { userId, category });
      return;
    }

    const spent = (spentRes.data || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const limitAmount = Number(limit.amount || 0);
    const alertBefore = Math.max(0, Number(limit.alert_before || 0));
    const remaining = limitAmount - spent;
    const exceeded = spent > limitAmount;
    const inWarningZone = !exceeded && alertBefore > 0 && remaining <= alertBefore;

    if (!exceeded && !inWarningZone) return;

    const lastAlertTs = limit.last_alert_sent_at ? new Date(limit.last_alert_sent_at).getTime() : 0;
    const cooldownMs = 6 * 60 * 60 * 1000;
    if (lastAlertTs && now - lastAlertTs < cooldownMs) return;

    const latestTxt = Number(latestAmount || 0) > 0 ? `
🧾 Oxirgi yozuv: <b>${numFmt(latestAmount)} so'm</b>` : '';
    const text = exceeded
      ? `🚨 <b>Limit oshdi</b>

📂 Kategoriya: <b>${esc(category)}</b>
🎯 Limit: <b>${numFmt(limitAmount)} so'm</b>
📤 Sarflangan: <b>${numFmt(spent)} so'm</b>
📉 Oshgan summa: <b>${numFmt(Math.abs(remaining))} so'm</b>${latestTxt}`
      : `⚠️ <b>Limitga yaqinlashdingiz</b>

📂 Kategoriya: <b>${esc(category)}</b>
🎯 Limit: <b>${numFmt(limitAmount)} so'm</b>
📤 Sarflangan: <b>${numFmt(spent)} so'm</b>
💡 Qolgan: <b>${numFmt(Math.max(0, remaining))} so'm</b>${latestTxt}`;

    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => null);

    const updRes = await db
      .from('category_limits')
      .update({ last_alert_sent_at: new Date(now).toISOString() })
      .eq('id', limit.id);

    if (updRes.error && !isMissingColumnError(updRes.error, 'last_alert_sent_at')) {
      await logErr('limit-update', updRes.error, { userId, category, limitId: limit.id });
    }
  } catch (error) {
    await logErr('limit-alert', error, { userId, category });
  }
}

async function insertTransactions(rows, source = 'bot') {
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


const NOTIFICATION_SETTING_DEFAULTS = {
  daily_reminder: {
    key: 'daily_reminder',
    title: '🌤 Kunlik eslatma',
    enabled: true,
    send_time: '09:00',
    timezone: 'Asia/Tashkent',
    message_template: `🌤 <b>Assalamu aleykum{{name_block}}</b>

Bugungi xarajatlarni kiritib borishni unutmang.
💸 Kirim, chiqim, qarz va rejalaringizni yozsangiz — men ularni tartibli saqlab boraman.

📅 Bugun: {{today}}
🤝 <i>24/7 xizmatingizda man!</i>`,
    config: { window_minutes: 5 }
  },
  daily_report: {
    key: 'daily_report',
    title: '🌙 Kunlik hisobot',
    enabled: true,
    send_time: '22:00',
    timezone: 'Asia/Tashkent',
    message_template: `🌙 <b>Kunlik hisobotingiz{{name_block}}</b>

Bugungi kirim-chiqimlaringizni yakunlab, kunlik hisobotingizni tekshirib chiqing.
💸 Agar hali kiritmagan bo'lsangiz, bugungi yozuvlarni hozir qo'shib qo'ying.

📅 Bugun: {{today}}
✅ <i>Kunlik hisobotingizni yopishni unutmang.</i>`,
    config: { window_minutes: 5 }
  },
  debt_reminder: {
    key: 'debt_reminder',
    title: '⏰ Qarz eslatmasi',
    enabled: true,
    send_time: null,
    timezone: 'Asia/Tashkent',
    message_template: `⏰ <b>Qarz eslatmasi</b>

{{day_label}} <b>{{person_name}}</b> bilan bog'liq qarz vaqti yetdi.
💰 {{amount}} so'm
📌 {{direction}}
🕒 {{when}}{{note_block}}`,
    config: {}
  },
  scheduled_queue: {
    key: 'scheduled_queue',
    title: '📨 Scheduled notification queue',
    enabled: true,
    send_time: null,
    timezone: 'Asia/Tashkent',
    message_template: null,
    config: {}
  }
};

const NOTIFICATION_SETTING_ORDER = ['daily_reminder', 'daily_report', 'debt_reminder', 'scheduled_queue'];

function normalizeNotifTime(value, fallback = '09:00') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/) || raw.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = match[3] == null ? 0 : Number(match[3]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || !Number.isInteger(ss) || hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return fallback;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function shiftNotifTime(value, deltaMinutes) {
  const base = normalizeNotifTime(value, '09:00');
  const [hh, mm] = base.split(':').map(Number);
  let total = hh * 60 + mm + Number(deltaMinutes || 0);
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function clipText(value, max = 900) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderNotifTemplate(template, vars = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(vars[key] ?? ''));
}

function escapeTemplateVars(vars = {}) {
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
}

function getNotificationDefault(key) {
  return NOTIFICATION_SETTING_DEFAULTS[key] ? JSON.parse(JSON.stringify(NOTIFICATION_SETTING_DEFAULTS[key])) : null;
}

function mergeNotificationSetting(rowOrKey, patch = null) {
  const row = typeof rowOrKey === 'string' ? { key: rowOrKey } : (rowOrKey || {});
  const base = getNotificationDefault(row.key);
  if (!base) return null;
  return {
    ...base,
    ...row,
    ...(patch || {}),
    key: base.key,
    title: String((patch && patch.title) ?? row.title ?? base.title),
    enabled: (patch && typeof patch.enabled === 'boolean') ? patch.enabled : (typeof row.enabled === 'boolean' ? row.enabled : base.enabled),
    send_time: (patch && Object.prototype.hasOwnProperty.call(patch, 'send_time'))
      ? (patch.send_time ? normalizeNotifTime(patch.send_time, base.send_time || '09:00') : null)
      : (row.send_time ? normalizeNotifTime(row.send_time, base.send_time || '09:00') : base.send_time),
    timezone: String((patch && patch.timezone) ?? row.timezone ?? base.timezone),
    message_template: (patch && Object.prototype.hasOwnProperty.call(patch, 'message_template'))
      ? (patch.message_template == null ? null : String(patch.message_template))
      : (row.message_template == null ? base.message_template : String(row.message_template)),
    config: {
      ...(base.config || {}),
      ...(row.config || {}),
      ...((patch && patch.config) || {})
    }
  };
}

async function seedNotificationSettings() {
  const payload = NOTIFICATION_SETTING_ORDER.map((key) => mergeNotificationSetting(key));
  const { error } = await db.from('notification_settings').upsert(payload, { onConflict: 'key', ignoreDuplicates: true });
  if (error) throw error;
}

async function listNotificationSettings() {
  try {
    await seedNotificationSettings();
    const { data, error } = await db.from('notification_settings')
      .select('key, title, enabled, send_time, timezone, message_template, config, last_sent_at, updated_at')
      .in('key', NOTIFICATION_SETTING_ORDER)
      .order('key', { ascending: true });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const latestByKey = new Map();
    rows.forEach((row) => {
      const prev = latestByKey.get(row.key);
      const prevTs = new Date(prev?.updated_at || prev?.last_sent_at || 0).getTime() || 0;
      const nextTs = new Date(row?.updated_at || row?.last_sent_at || 0).getTime() || 0;
      if (!prev || nextTs >= prevTs) latestByKey.set(row.key, row);
    });
    return NOTIFICATION_SETTING_ORDER.map((key) => mergeNotificationSetting(latestByKey.get(key) || key));
  } catch (error) {
    if (isMissingTableError(error, 'notification_settings')) {
      const e = new Error('notification_settings jadvali topilmadi. Supabase SQL migratsiyasini ishga tushiring.');
      e.code = 'NOTIF_TABLE_MISSING';
      throw e;
    }
    throw error;
  }
}

async function getNotificationSetting(key) {
  const settings = await listNotificationSettings();
  return settings.find((row) => row.key === key) || null;
}

async function saveNotificationSetting(key, patch = {}) {
  const merged = mergeNotificationSetting(key, patch);
  if (!merged) throw new Error('Noma\'lum notification turi');
  try {
    await seedNotificationSettings();
    const payload = {
      key: merged.key,
      title: merged.title,
      enabled: merged.enabled,
      send_time: merged.send_time,
      timezone: merged.timezone,
      message_template: merged.message_template,
      config: merged.config || {}
    };
    const { data, error } = await db.from('notification_settings').upsert(payload, { onConflict: 'key' }).select().single();
    if (error) throw error;
    return await getNotificationSetting(merged.key) || mergeNotificationSetting(data || key);
  } catch (error) {
    if (isMissingTableError(error, 'notification_settings')) {
      const e = new Error('notification_settings jadvali topilmadi. Avval yangi SQL migratsiyani ishlating.');
      e.code = 'NOTIF_TABLE_MISSING';
      throw e;
    }
    throw error;
  }
}

function buildNotificationPanelText(settings) {
  const rows = (settings || []).map((item) => {
    const status = item.enabled ? '✅ Yoniq' : '⛔️ O\'chiq';
    const timePart = item.send_time ? ` · 🕒 ${item.send_time}` : '';
    const lastSent = item.last_sent_at ? `\n   Oxirgi yuborish: ${esc(fmtDateTime(item.last_sent_at))}` : '';
    return `• <b>${esc(item.title)}</b>\n   ${status}${timePart}${lastSent}`;
  }).join('\n\n');

  return `🔔 <b>NOTIFICATION BOSHQARUVI</b>\n\n${rows}\n\n<i>Daily reminder, daily report va debt notificationlarni shu yerdan boshqarasiz. Matn yoki custom vaqtni o'zgartirish uchun <b>/notif</b> buyruqlaridan foydalaning.</i>`;
}

function buildNotificationPanelMarkup(settings = []) {
  const rows = settings.map((item) => [{ text: `${item.enabled ? '✅' : '⛔️'} ${item.title}`, callback_data: `notif_open:${item.key}` }]);
  rows.push([{ text: '🔄 Yangilash', callback_data: 'admin_notifications' }, { text: '🛠 Admin panel', callback_data: 'admin_panel' }]);
  return { inline_keyboard: rows };
}

function buildNotificationHelpText(key) {
  const sample = key || 'daily_reminder';
  return `🧭 <b>Notification buyruqlari</b>

<b>/notif</b> — notification panel
<b>/notif list</b> — barcha sozlamalar
<b>/notif on ${sample}</b> — yoqish
<b>/notif off ${sample}</b> — o'chirish
<b>/notif time daily_reminder 08:30</b> — ertalabgi eslatma vaqtini o'zgartirish
<b>/notif time daily_report 22:00</b> — kunlik hisobot vaqtini o'zgartirish
<b>/notif text daily_reminder Assalomu aleykum...</b> — matnni yangilash
<b>/notif text daily_report Kunlik hisobotingiz...</b> — matnni yangilash
<b>/notif reset daily_report</b> — default matnni qaytarish
<b>/notif test daily_report</b> — test yuborish

Mavjud keylar: <code>daily_reminder</code>, <code>daily_report</code>, <code>debt_reminder</code>, <code>scheduled_queue</code>`;
}

function buildNotificationDetailText(setting) {
  const status = setting.enabled ? '✅ Yoniq' : '⛔️ O\'chiq';
  const timeLine = setting.send_time ? `🕒 Vaqt: <b>${setting.send_time}</b> (${esc(setting.timezone || 'Asia/Tashkent')})\n` : '';
  const templateLine = setting.message_template
    ? `📝 Matn shabloni:\n<pre>${esc(clipText(setting.message_template, 1200))}</pre>`
    : `📝 Matn shabloni: <i>Bu notification tizim matniga tayangan.</i>`;
  const lastSent = setting.last_sent_at ? `\nOxirgi yuborish: <b>${esc(fmtDateTime(setting.last_sent_at))}</b>` : '';
  return `🔔 <b>${esc(setting.title)}</b>\n\nHolat: <b>${status}</b>\n${timeLine}${templateLine}${lastSent}\n\n${buildNotificationHelpText(setting.key)}`;
}

function buildNotificationDetailMarkup(setting) {
  const rows = [
    [
      { text: setting.enabled ? '⛔️ O\'chirish' : '✅ Yoqish', callback_data: `notif_toggle:${setting.key}` },
      { text: '🧪 Test', callback_data: `notif_test:${setting.key}` }
    ]
  ];

  if (setting.key === 'daily_reminder' || setting.key === 'daily_report') {
    rows.push([
      { text: '➖ 30m', callback_data: `notif_shift:${setting.key}:-30` },
      { text: `🕒 ${setting.send_time || (setting.key === 'daily_report' ? '22:00' : '09:00')}`, callback_data: `notif_noop:${setting.key}` },
      { text: '➕ 30m', callback_data: `notif_shift:${setting.key}:30` }
    ]);
    rows.push([
      { text: setting.key === 'daily_report' ? '21:00' : '08:00', callback_data: `notif_preset:${setting.key}:${setting.key === 'daily_report' ? '21-00' : '08-00'}` },
      { text: setting.key === 'daily_report' ? '22:00' : '09:00', callback_data: `notif_preset:${setting.key}:${setting.key === 'daily_report' ? '22-00' : '09-00'}` },
      { text: setting.key === 'daily_report' ? '23:00' : '10:00', callback_data: `notif_preset:${setting.key}:${setting.key === 'daily_report' ? '23-00' : '10-00'}` }
    ]);
  }

  rows.push([
    { text: '🧭 Buyruqlar', callback_data: `notif_help:${setting.key}` },
    { text: '🔙 Orqaga', callback_data: 'admin_notifications' }
  ]);
  return { inline_keyboard: rows };
}

function buildNotificationPreviewVars(settingKey) {
  if (settingKey === 'debt_reminder') {
    return {
      day_label: 'Bugun',
      person_name: 'Suxrob',
      amount: numFmt(250000),
      direction: 'Siz qaytarishingiz kerak',
      when: fmtDateTime(new Date()),
      note_block: `\n📝 ${esc('Sinov izohi')}`
    };
  }

  return {
    name_block: `, <b>${esc('Nurali')}</b>`,
    today: esc(new Date().toLocaleDateString('uz-UZ'))
  };
}

function renderNotificationPreviewText(setting) {
  if (!setting?.message_template) {
    if (setting?.key === 'scheduled_queue') {
      return `<b>Scheduled queue test</b>\n\nQueue orqali yuboriladigan notificationlar Worker cron ichida ishlaydi ✅`;
    }
    return `<b>Notification test</b>\n\nMatn shabloni mavjud emas.`;
  }
  return renderNotifTemplate(setting.message_template, buildNotificationPreviewVars(setting.key));
}

async function sendNotificationPreview(chatId, settingKey) {
  const setting = await getNotificationSetting(settingKey);
  if (!setting) throw new Error('Notification topilmadi');
  const text = renderNotificationPreviewText(setting);
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
  return setting;
}


function adminPanelMarkup() {
  return {
    inline_keyboard: [
      [{ text: '📊 Statistika', callback_data: 'admin_stats' }, { text: '👥 Yangi userlar', callback_data: 'admin_users' }],
      [{ text: '📣 Broadcastlar', callback_data: 'admin_broadcasts' }, { text: '⚠️ Xatolar', callback_data: 'admin_failed' }],
      [{ text: '🔔 Notificationlar', callback_data: 'admin_notifications' }, { text: "🧭 Qo'llanma", callback_data: 'admin_help' }],
      [{ text: '🔄 Yangilash', callback_data: 'admin_panel' }]
    ]
  };
}

async function safeEditOrSend(chatId, messageId, text, extra = {}) {
  if (messageId) {
    try {
      return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...extra });
    } catch { }
  }
  return bot.sendMessage(chatId, text, extra).catch(() => null);
}

async function getExactCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function getAdminSnapshot() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [totalUsers, activeToday, txToday, txMonth, failedTargets, drafts, lastBroadcastRes] = await Promise.all([
    getExactCount(db.from('users').select('*', { count: 'exact', head: true })),
    getExactCount(db.from('users').select('*', { count: 'exact', head: true }).gte('last_start_date', todayStart)),
    getExactCount(db.from('transactions').select('*', { count: 'exact', head: true }).gte('date', todayStart)),
    getExactCount(db.from('transactions').select('*', { count: 'exact', head: true }).gte('date', monthStart)),
    getExactCount(db.from('broadcast_failures').select('*', { count: 'exact', head: true })),
    getExactCount(db.from('broadcasts').select('*', { count: 'exact', head: true }).eq('status', 'draft')),
    db.from('broadcasts').select('id, created_at, status, total_users, sent_count, failed_count').order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    totalUsers,
    activeToday,
    txToday,
    txMonth,
    failedTargets,
    drafts,
    lastBroadcast: lastBroadcastRes.data || null
  };
}

function buildAdminPanelText(snapshot) {
  const last = snapshot.lastBroadcast;
  const lastLine = last
    ? `🕘 Oxirgi broadcast: <b>${shortId(last.id)}</b> · ${esc(last.status || 'unknown')}
   Yetkazildi: <b>${last.sent_count || 0}</b> / ${last.total_users || 0} · Xato: <b>${last.failed_count || 0}</b>
   Sana: ${esc(fmtDateTime(last.created_at))}`
    : `🕘 Oxirgi broadcast: <b>hali yo'q</b>`;

  return `🛠 <b>ADMIN PANEL</b>

👥 Userlar: <b>${snapshot.totalUsers}</b>
🔥 Bugun faol: <b>${snapshot.activeToday}</b>
💸 Bugungi tranzaksiyalar: <b>${snapshot.txToday}</b>
📅 Oylik tranzaksiyalar: <b>${snapshot.txMonth}</b>
📝 Draft broadcastlar: <b>${snapshot.drafts}</b>
⚠️ Yetkazilmagan targetlar: <b>${snapshot.failedTargets}</b>

${lastLine}`;
}

function buildRecentUsersText(rows, totalUsers, { offset = 0, pageSize = ADMIN_USERS_PAGE_SIZE } = {}) {
  const body = rows?.length
    ? rows.map((u, i) => {
      const snapshot = getSubscriptionSnapshotForUser(u);
      const subscriptionLine = snapshot?.schemaReady !== false
        ? `\n   Tarif: <b>${esc(snapshot.planTitle)}</b> · ${esc(snapshot.uiStatusLabel)}`
        : '';
      return `${offset + i + 1}. <b>${esc(u.full_name || `User ${u.user_id}`)}</b>\n   ID: <code>${u.user_id}</code>${u.phone_number ? `\n   Tel: ${esc(u.phone_number)}` : ''}${subscriptionLine}${u.created_at ? `\n   Qo\'shilgan: ${esc(fmtDateTime(u.created_at))}` : ''}`;
    }).join('\n\n')
    : 'Hozircha userlar topilmadi.';

  const page = totalUsers > 0 ? Math.floor(offset / pageSize) + 1 : 1;
  const totalPages = Math.max(1, Math.ceil(Number(totalUsers || 0) / pageSize));
  const from = totalUsers > 0 ? offset + 1 : 0;
  const to = offset + (rows?.length || 0);

  return `👥 <b>USERLAR RO'YXATI</b>\nJami userlar: <b>${totalUsers}</b>\nSahifa: <b>${page}/${totalPages}</b>${to ? `\nKo'rsatilmoqda: <b>${from}-${to}</b>` : ''}\n\n${body}`;
}

function buildRecentUsersMarkup(totalUsers, offset = 0, pageSize = ADMIN_USERS_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(Number(totalUsers || 0) / pageSize));
  const currentPage = totalUsers > 0 ? Math.floor(offset / pageSize) + 1 : 1;
  const prevOffset = Math.max(0, offset - pageSize);
  const nextOffset = offset + pageSize;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < Number(totalUsers || 0);
  const rows = [];

  if (totalPages > 1) {
    rows.push([
      { text: hasPrev ? '⬅️ Oldingi' : '•', callback_data: hasPrev ? `admin_users:${prevOffset}` : `admin_users:${offset}` },
      { text: `${currentPage}/${totalPages}`, callback_data: `admin_users:${offset}` },
      { text: hasNext ? 'Keyingi ➡️' : '•', callback_data: hasNext ? `admin_users:${nextOffset}` : `admin_users:${offset}` },
    ]);
  }

  rows.push([{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]);
  return { inline_keyboard: rows };
}

async function fetchAdminUsersPage(offset = 0, pageSize = ADMIN_USERS_PAGE_SIZE) {
  const safeOffset = Math.max(0, Number(offset || 0));
  const safePageSize = Math.max(1, Math.min(25, Number(pageSize || ADMIN_USERS_PAGE_SIZE)));
  const to = safeOffset + safePageSize - 1;
  const baseFields = 'user_id, full_name, phone_number, created_at';
  const extendedFields = `${baseFields}, ${SUBSCRIPTION_FIELDS.join(', ')}`;
  const [userResponse, totalUsers] = await Promise.all([
    (async () => {
      let response = await db.from('users')
        .select(extendedFields)
        .order('created_at', { ascending: false })
        .order('user_id', { ascending: false })
        .range(safeOffset, to);
      if (response.error && SUBSCRIPTION_FIELDS.some((field) => isMissingColumnError(response.error, field))) {
        response = await db.from('users')
          .select(baseFields)
          .order('created_at', { ascending: false })
          .order('user_id', { ascending: false })
          .range(safeOffset, to);
      }
      return response;
    })(),
    getExactCount(db.from('users').select('*', { count: 'exact', head: true })),
  ]);

  const { data: rows, error } = userResponse;

  return {
    rows: rows || [],
    error,
    totalUsers,
    offset: safeOffset,
    pageSize: safePageSize,
  };
}

function buildBroadcastsText(rows) {
  if (!rows?.length) return `📣 <b>BROADCASTLAR</b>\n\nHozircha yozuvlar yo\'q.`;

  return `📣 <b>SO\'NGGI BROADCASTLAR</b>\n\n` + rows.map((b, i) => (
    `${i + 1}. <b>${shortId(b.id)}</b> · ${esc(b.status || 'unknown')}\n` +
    `   Yetkazildi: <b>${b.sent_count || 0}</b> / ${b.total_users || 0}\n` +
    `   Xato: <b>${b.failed_count || 0}</b>\n` +
    `   Sana: ${esc(fmtDateTime(b.created_at))}`
  )).join('\n\n');
}

function buildFailedBroadcastsText(rows) {
  if (!rows?.length) return `⚠️ <b>XATO BO\'LGAN BROADCASTLAR</b>\n\nHozircha muammo yo\'q.`;

  return `⚠️ <b>XATO BO\'LGAN BROADCASTLAR</b>\n\n` + rows.map((b, i) => (
    `${i + 1}. <b>${shortId(b.id)}</b>\n` +
    `   Xato: <b>${b.failed_count || 0}</b> ta\n` +
    `   Holat: ${esc(b.status || 'unknown')}\n` +
    `   Sana: ${esc(fmtDateTime(b.created_at))}`
  )).join('\n\n');
}

function buildFailedTargetsText(bc, rows) {
  const header = `⚠️ <b>YETKAZILMAGAN USERLAR</b>\nBroadcast: <b>${shortId(bc.id)}</b>\nHolat: <b>${esc(bc.status || 'unknown')}</b>\n\n`;
  if (!rows?.length) return header + 'Ayni paytda xato qolmagan ✅';

  return header + rows.map((row, i) => (
    `${i + 1}. <code>${row.user_id}</code>\n` +
    `   Sabab: ${esc(row.error_message || "Noma\'lum")}\n` +
    `   Retry: <b>${row.retry_count || 0}</b>\n` +
    `   Vaqt: ${esc(fmtDateTime(row.updated_at || row.last_retry_at || row.created_at))}`
  )).join('\n\n');
}

function buildBroadcastGuideText() {
  return `🧭 <b>ADMIN BUYRUQLARI</b>

<b>/admin</b> — admin panelni ochadi
<b>/message Matn</b> — broadcast draft yaratadi
<b>/notif</b> — notification sozlamalar paneli
<b>/premium user_id 30</b> — 30 kunlik premium beradi
<b>/freeplan user_id</b> — userni bepul tarifga qaytaradi
<b>/subinfo user_id</b> — user obunasini ko'rsatadi

<b>Premium berish tartibi:</b>
1. <code>/subinfo user_id</code>
2. <code>/premium user_id 30</code>
3. <code>/subinfo user_id</code>

<b>Muhim:</b> hozirgi <code>/premium</code> buyrug'i muddatni <b>hozirgi vaqtdan</b> boshlab beradi.

<b>Tugmali broadcast:</b>
<code>/message Assalomu alaykum
--
Kanal | https://t.me/username</code>

<b>Notification boshqaruvi:</b>
<code>/notif time daily_reminder 08:30</code>
<code>/notif text daily_reminder Assalomu aleykum...</code>
<code>/notif test debt_reminder</code>

Rasm/video/document bilan ham <b>/message</b> yuborsangiz, preview chiqadi.
Xato bo'lsa, natija oynasida yetkazilmagan userlar uchun alohida <b>qayta yuborish</b> tugmasi chiqadi.`;
}

async function sendAdminPanel(chatId, messageId = null) {
  const snapshot = await getAdminSnapshot();
  return safeEditOrSend(chatId, messageId, buildAdminPanelText(snapshot), {
    parse_mode: 'HTML',
    reply_markup: adminPanelMarkup()
  });
}


async function sendNotificationPanel(chatId, messageId = null) {
  const settings = await listNotificationSettings();
  return safeEditOrSend(chatId, messageId, buildNotificationPanelText(settings), {
    parse_mode: 'HTML',
    reply_markup: buildNotificationPanelMarkup(settings)
  });
}

async function sendNotificationDetail(chatId, messageId, key) {
  const setting = await getNotificationSetting(key);
  if (!setting) throw new Error('Notification topilmadi');
  return safeEditOrSend(chatId, messageId, buildNotificationDetailText(setting), {
    parse_mode: 'HTML',
    reply_markup: buildNotificationDetailMarkup(setting)
  });
}

async function sendBroadcastPayload(uid, bc) {
  const opts = {
    caption: bc.content,
    entities: bc.entities,
    caption_entities: bc.entities,
    reply_markup: bc.reply_markup
  };

  if (bc.msg_type === 'photo') return bot.sendPhoto(uid, bc.media_id, opts);
  if (bc.msg_type === 'video') return bot.sendVideo(uid, bc.media_id, opts);
  if (bc.msg_type === 'animation') return bot.sendAnimation(uid, bc.media_id, opts);
  if (bc.msg_type === 'document') return bot.sendDocument(uid, bc.media_id, opts);
  return bot.sendMessage(uid, bc.content || '', { entities: bc.entities, reply_markup: bc.reply_markup });
}

async function storeBroadcastFailures(broadcastId, rows) {
  if (!rows.length) return;
  const { error } = await db.from('broadcast_failures').upsert(rows, { onConflict: 'broadcast_id,user_id' });
  if (error) throw error;
}

async function sendBroadcastBatch(bc, { targetUserIds = null, retryOnly = false } = {}) {
  let userIds = targetUserIds;
  if (!userIds) {
    const { data: allUsers, error: fErr } = await db.from('users').select('user_id');
    if (fErr) throw fErr;
    userIds = (allUsers || []).map(u => u.user_id);
  }

  userIds = [...new Set((userIds || []).map(Number).filter(Boolean))];
  const total = userIds.length;
  let success = 0;
  let failed = 0;
  const deliveredIds = [];
  const failedRows = [];
  const failureSamples = [];

  if (!retryOnly) {
    await db.from('broadcast_failures').delete().eq('broadcast_id', bc.id);
  }

  const batchSize = 25;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async (uid) => {
      try {
        await sendBroadcastPayload(uid, bc);
        success++;
        deliveredIds.push(uid);
      } catch (e) {
        failed++;
        const reason = tgErr(e);
        failedRows.push({
          broadcast_id: bc.id,
          user_id: uid,
          error_message: reason.slice(0, 400),
          retry_count: retryOnly ? 1 : 0,
          last_retry_at: retryOnly ? iso() : null
        });
        if (failureSamples.length < 8) failureSamples.push({ uid, reason });
      }
    }));

    if (i + batchSize < userIds.length) await sleep(900);
  }

  if (deliveredIds.length) {
    await db.from('broadcast_failures').delete().eq('broadcast_id', bc.id).in('user_id', deliveredIds);
  }

  if (failedRows.length) {
    await storeBroadcastFailures(bc.id, failedRows);
  }

  const { count: remainingFailed, error: rcErr } = await db.from('broadcast_failures').select('*', { count: 'exact', head: true }).eq('broadcast_id', bc.id);
  if (rcErr) throw rcErr;

  const totalUsers = retryOnly ? (bc.total_users || total) : total;
  const sentCount = Math.max(0, totalUsers - (remainingFailed || 0));
  const status = (remainingFailed || 0) > 0 ? 'partial_fail' : 'sent';

  const { error: updErr } = await db.from('broadcasts').update({
    status,
    total_users: totalUsers,
    sent_count: sentCount,
    failed_count: remainingFailed || 0,
    completed_at: iso()
  }).eq('id', bc.id);
  if (updErr) throw updErr;

  return {
    total,
    success,
    failed,
    remainingFailed: remainingFailed || 0,
    status,
    failureSamples
  };
}

function buildBroadcastResultText(bc, result, retryOnly = false) {
  const title = retryOnly ? '🔁 <b>QAYTA YUBORISH YAKUNLANDI</b>' : '📣 <b>BROADCAST YAKUNLANDI</b>';
  const sampleText = result.failureSamples?.length
    ? '\n\n<b>Namuna xatolar:</b>\n' + result.failureSamples.map(item => `• <code>${item.uid}</code> — ${esc(item.reason)}`).join('\n')
    : '';

  return `${title}\n\nBroadcast ID: <b>${shortId(bc.id)}</b>\nJoriy urinish targetlari: <b>${result.total}</b>\nUshbu urinishda yetkazildi: <b>${result.success}</b>\nUshbu urinishda xato: <b>${result.failed}</b>\nHozir qolgan xatolar: <b>${result.remainingFailed}</b>\nHolat: <b>${esc(result.status)}</b>${sampleText}`;
}

function buildBroadcastResultMarkup(bc, result) {
  const rows = [];
  if (result.remainingFailed > 0) {
    rows.push([
      { text: "🔁 Xato bo'lganlarga qayta yuborish", callback_data: `bc_retry:${bc.id}` },
      { text: "👀 Xatolar ro'yxati", callback_data: `bc_failed:${bc.id}` }
    ]);
  }
  rows.push([{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]);
  return { inline_keyboard: rows };
}

async function fetchUserCategories(userId) {
  let res = await db.from('categories').select('id, name, type, keywords').eq('user_id', userId);
  if (res.error && isMissingColumnError(res.error, 'keywords')) {
    res = await db.from('categories').select('id, name, type').eq('user_id', userId);
  }
  if (res.error) throw res.error;
  return res.data || [];
}

const CATEGORY_ALIASES = {
  expense: {
    Transport: ['taksi', 'taxi', 'yandex', 'metro', 'bus', 'benzin', 'zapravka', "yo'l", 'transport'],
    Ovqat: ['ovqat', 'osh', 'tushlik', 'kechki ovqat', 'non', 'market', 'korzinka', 'taom', 'kafe', 'fastfood', 'choyxona'],
    Kvartira: ['ijara', 'kvartira', 'uy', 'kommunal', 'svet', 'gaz', 'suv', 'internet', 'wifi', 'arenda'],
    Kredit: ['kredit', 'bank', 'tolov', "to'lov", 'uzum'],
    Qarz: ['qarz', 'nasiya', 'loan', 'qarzdorlik'],
    "Sog'liq": ['dori', 'apteka', 'klinika', 'shifoxona', 'stomatolog', "sog'liq"],
    Aloqa: ['telefon', 'nomer', 'aloqa', 'sim', 'megabayt', 'internet paket'],
    "Ko'ngilochar": ['kino', 'oyin', "o'yin", 'game', 'subscription', 'netflix', 'spotify'],
    Kiyim: ['kiyim', 'shim', 'oyoq kiyim', 'krossovka', 'futbolka', 'kurtka']
  },
  income: {
    Oylik: ['oylik', 'salary', 'maosh'],
    Avans: ['avans'],
    Bonus: ['bonus', 'cashback', 'mukofot'],
    "Sovg'a": ["sovg'a", 'gift'],
    Sotuv: ['sotuv', 'savdo', 'mijoz', 'zakaz'],
    Astatka: ['astatka', 'qaytim', 'qoldiq']
  }
};

function normalizeTextForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\sЀ-ӿ؀-ۿ']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function genericCategoryName(value) {
  const v = normalizeTextForMatch(value);
  return !v || ['xarajat', 'expense', 'chiqim', 'kirim', 'income', 'daromad'].includes(v);
}

function scoreCategoryFromAliases(type, haystack) {
  const aliasPool = CATEGORY_ALIASES[type] || {};
  let best = null;
  let bestScore = 0;

  for (const [name, aliases] of Object.entries(aliasPool)) {
    let score = 0;
    for (const alias of aliases) {
      const token = normalizeTextForMatch(alias);
      if (!token) continue;
      if (haystack === token) score += 12;
      else if (haystack.includes(token)) score += Math.max(3, token.length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return { best, bestScore };
}

function resolveCategoryForUser(parsed, categories, rawText = '') {
  if (!parsed) return null;

  const type = parsed.type === 'income' ? 'income' : 'expense';
  const pool = (categories || []).filter(cat => cat.type === type);
  const haystack = `${normalizeTextForMatch(rawText)} ${normalizeTextForMatch(parsed.category)}`.trim();

  const direct = pool.find(cat => normalizeTextForMatch(cat.name) === normalizeTextForMatch(parsed.category));
  if (direct) return direct.name;

  let best = null;
  let bestScore = 0;
  for (const cat of pool) {
    const words = [cat.name]
      .concat(Array.isArray(cat.keywords) ? cat.keywords : [])
      .map(normalizeTextForMatch)
      .filter(Boolean);

    let score = 0;
    for (const word of words) {
      if (haystack === word) score += 14;
      else if (haystack.includes(word)) score += Math.max(3, word.length);
    }

    if (score > bestScore) {
      bestScore = score;
      best = cat.name;
    }
  }

  if (best && bestScore >= 4) return best;

  const aliasHit = scoreCategoryFromAliases(type, haystack);
  if (aliasHit.best) {
    const matchedUserCategory = pool.find(cat => normalizeTextForMatch(cat.name) === normalizeTextForMatch(aliasHit.best));
    if (matchedUserCategory) return matchedUserCategory.name;
    return aliasHit.best;
  }

  if (genericCategoryName(parsed.category)) return type === 'income' ? 'Kirim' : 'Xarajat';
  return parsed.category;
}

// GPT orkali matndan (ovozli xabardan) ma'lumotlarni olish
async function gptParse(text) {
  if (!openai || !text) return null;
  if (openaiDisabledUntil && Date.now() < openaiDisabledUntil) return null;

  try {
    const prompt = `Ushbu o'zbek tilidagi moliyaviy xabardan summa (amount), tur (type: income yoki expense) va kategoriyani (category) JSON formatida aniqlab ber.
Xabar: "${text}"

Qoidalar:
1. "yuz ming", "bir yarim mln" kabi so'zlarni raqamga aylantir.
2. "berdim", "to'ladim", "sarfladim", "sotib oldim" odatda chiqim (expense).
3. "dadam berdilar", "mijoz yubordi", "oylik tushdi", "bonus keldi" odatda kirim (income).
4. Faqat "oldim" so'ziga qarab income demang: "kitob oldim" bu expense, "mijozdan oldim" bu income.
5. Agar valyuta dollar ($) bo'lsa, isUSD: true qilib belgilang.
6. Faqat JSON qaytaring: {"amount": number, "type": "income"|"expense", "category": "string", "isUSD": boolean}
Agar tushunarsiz bo'lsa, null qaytaring.`;

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const data = JSON.parse(res.choices[0].message.content);
    if (!data || !data.amount) return null;

    return {
      amount: Math.round(data.amount),
      type: data.type || 'expense',
      category: data.category || (data.type === 'income' ? 'Kirim' : 'Xarajat'),
      isUSD: !!data.isUSD
    };
  } catch (e) {
    if (isOpenAIAuthError(e)) {
      disableOpenAI('auth_error', { permanent: true, minutes: 12 * 60 });
      return null;
    }
    if (isQuotaOrRateLimitError(e)) {
      disableOpenAI(e?.message || 'quota/rate-limit', { minutes: 30 });
      warn('gpt-parse-fallback', { reason: e?.message || 'quota/rate-limit', disabledUntil: new Date(openaiDisabledUntil).toISOString() });
      return null;
    }
    await logErr('gpt-parse', e);
    return null;
  }
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function extractAmountMeta(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const lower = text.toLowerCase();
  const isUSD = /\$|\busd\b|dollar/i.test(lower);

  let clean = lower
    .replace(/so'?m|sum|uzs|\$|€|\busd\b|dollar/gi, ' ')
    .replace(/[^\d\s.,a-zа-яёӣқғҳў\-']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const m = clean.match(/(\d[\d\s,.]*)(\s*(?:k|ming|mln|mlrd|million|milliard|m|b)\b)?/i);
  if (!m) return null;

  let numStr = m[1].trim();
  numStr = numStr
    .replace(/[. ](?=\d{3}(?:\D|$))/g, '')
    .replace(/,/g, '.')
    .replace(/\s/g, '');

  const amount = parseFloat(numStr);
  if (!amount || Number.isNaN(amount) || !Number.isFinite(amount)) return null;

  const suffix = (m[2] || '').replace(/\s/g, '').toLowerCase();
  let finalAmount = amount;

  const isAlreadyBig = (suffix === 'k' || suffix === 'ming') && amount >= 1000;
  const isAlreadyMln = (suffix === 'mln' || suffix === 'm' || suffix === 'million') && amount >= 1000000;

  if (suffix === 'k' || suffix === 'ming') {
    if (!isAlreadyBig) finalAmount = amount * 1_000;
  } else if (suffix === 'mln' || suffix === 'million' || suffix === 'm') {
    if (!isAlreadyMln) finalAmount = amount * 1_000_000;
  } else if (suffix === 'mlrd' || suffix === 'milliard' || suffix === 'b') {
    finalAmount = amount * 1_000_000_000;
  }

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) return null;

  return {
    amount: Math.round(finalAmount),
    isUSD,
    clean,
    rawMatch: m[0]
  };
}

function inferTransactionType(lower) {
  let incomeScore = 0;
  let expenseScore = 0;

  if (/^\+/.test(lower)) incomeScore += 5;
  if (/^-/.test(lower)) expenseScore += 5;

  if (/\b(?:oylik|maosh|avans|bonus|cashback|daromad|foyda|grant|stipendiya)\b/i.test(lower)) incomeScore += 7;
  if (/\b(?:dadam|onam|akam|ukam|opam|singlim|do'?stim|mijoz|klient|boshliq|ishxona|kompaniya|ustoz)\b.*\b(?:berdi|berdilar|yubordi|jo'?natdi|o'?tkazdi|tashladi|to'?ladi)\b/i.test(lower)) incomeScore += 8;
  if (/\b(?:menga|hisobimga|kartamga)\b.*\b(?:tushdi|keldi|o'?tdi|kelib tushdi)\b/i.test(lower)) incomeScore += 8;
  if (/\b(?:mijozdan|klientdan|dadamdan|onamdan|akamdan|ukamdan|opamdan|singlimdan|do'?stimdan|boshliqdan)\b.*\b(?:oldim|oldik|qabul qildim)\b/i.test(lower)) incomeScore += 7;
  if (/\b(?:qaytdi|qaytarib berdi|qaytarildi)\b/i.test(lower)) incomeScore += 4;
  if (/\b(?:sovg'a|sovga|hadya)\b/i.test(lower)) incomeScore += 4;

  if (/\b(?:berdim|to'?ladim|sarfladim|jo'?natdim|o'?tkazdim|uzatdim|chiqim|xarajat)\b/i.test(lower)) expenseScore += 8;
  if (/\b(?:sotib oldim|xarid qildim)\b/i.test(lower)) expenseScore += 8;
  if (/\boldim\b/i.test(lower) && !/\b(?:mijozdan|klientdan|dadamdan|onamdan|akamdan|ukamdan|opamdan|singlimdan|do'?stimdan|boshliqdan)\b/i.test(lower) && !/\b(?:oylik|maosh|avans|bonus|cashback|daromad|foyda|qaytim|astatka)\b/i.test(lower)) expenseScore += 4;
  if (/\b\S+ga\b.*\b(?:berdim|to'?ladim|o'?tkazdim)\b/i.test(lower)) expenseScore += 5;
  if (/\b(?:taksi|yandex|ovqat|tushlik|kechki ovqat|non|market|korzinka|bozor|ijara|kommunal|kredit|dori|apteka|internet|wifi|benzin|zapravka|subscription|obuna|kiyim|krossovka)\b/i.test(lower)) expenseScore += 5;

  return {
    incomeScore,
    expenseScore,
    type: incomeScore > expenseScore ? 'income' : 'expense'
  };
}

function inferSemanticCategory(lower, type, rawCategory) {
  if (type === 'income') {
    if (/\b(?:oylik|maosh)\b/i.test(lower)) return 'Oylik';
    if (/\bavans\b/i.test(lower)) return 'Avans';
    if (/\b(?:bonus|cashback|mukofot)\b/i.test(lower)) return 'Bonus';
    if (/\b(?:mijoz|klient|sotuv|zakaz|savdo)\b/i.test(lower)) return 'Sotuv';
    if (/\b(?:dadam|onam|akam|ukam|opam|singlim|do'?stim|sovg'a|sovga|hadya)\b/i.test(lower)) return "Sovg'a";
    if (/\b(?:qaytdi|qaytarib berdi|qaytarildi)\b/i.test(lower)) return 'Astatka';
  }

  const aliasHit = scoreCategoryFromAliases(type, normalizeTextForMatch(`${lower} ${rawCategory}`));
  if (aliasHit.best) return aliasHit.best;

  return rawCategory;
}

function cleanupCategoryText(value) {
  const cleaned = String(value || '')
    .replace(/\b(so'?m|sum|uzs|usd|dollar|kirim|chiqim|berdim|berdi|berdilar|oldim|oldik|tushdi|ketdi|keldi|oylik|bonus|avans|maosh|menga|hisobimga|kartamga|to'?ladim|sarfladim|sotib|xarid|qildim|plan|reja|limit|byudjet)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function stripAmountFragment(text, amountMeta) {
  return String(text || '').replace(amountMeta?.rawMatch || '', ' ');
}

function cleanupIntentName(value) {
  return titleCaseWords(String(value || '')
    .replace(/\b(?:uchun|ga|ka|qa|dan|ni|pul|summa|bo'?yicha|oylik|oyiga|joriy|shu|oy|plan|reja|limit|byudjet|budjet)\b/gi, ' ')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function cleanupPersonName(value) {
  return titleCaseWords(String(value || '')
    .replace(/\b(?:men|menga|meni|mendan|biz|bizga|bizni|u|unga|undan|undanam|pul|summa|uchun|bilan|qilgan|qilib|qaytarib|berib|oldim|berdim|oldi|berdi|qaytardi|qaytdi|qaytardim|qaytarildi|to'?ladim|uzdim|qarz|nasiya|qarzni|kerak|bo'?lgan|boyicha)\b/gi, ' ')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractNameBySuffix(text, suffix) {
  const safe = String(text || '').trim();
  if (!safe) return '';
  const re = new RegExp(`([\\p{L}0-9'’\\s-]{2,}?)(?:${suffix})\\b`, 'iu');
  const match = safe.match(re);
  if (!match?.[1]) return '';
  return cleanupPersonName(match[1]);
}

function extractLooseName(text) {
  return cleanupPersonName(String(text || '')
    .replace(/\b(?:qaytdi|qaytardi|qaytardim|qaytarildi|qaytarib berdi|qaytarib berdim|to'?ladim|uzdim|berdim|oldim|qarz|nasiya)\b/gi, ' '));
}

function parsePlanIntent(raw) {
  const text = String(raw || '').trim();
  if (!text || !/\b(?:reja|plan|limit|byudjet|budjet)\b/i.test(text)) return null;

  const amountMeta = extractAmountMeta(text);
  if (!amountMeta) return null;

  const noPrimaryAmount = stripAmountFragment(text, amountMeta);
  const alertMeta = /\b(?:qolganda|ogohlantir|ogohlantirgin|ogohlantirish)\b/i.test(text) ? extractAmountMeta(noPrimaryAmount) : null;
  const cleaned = cleanupCategoryText(String(noPrimaryAmount)
    .replace(alertMeta?.rawMatch || '', ' ')
    .replace(/\b(?:reja|plan|limit|byudjet|budjet|oylik|oyiga|kerak|qilib qo'y|qilib qoy|qilib ber|tuzib ber|tuzib qo'y|tuzib qoy|tuz|tuzing|ogohlantir|ogohlantirgin|ogohlantirish|qolganda)\b/gi, ' '));

  let categoryName = '';
  const beforeUchun = cleaned.match(/(.+?)\s+uchun\b/i);
  if (beforeUchun?.[1]) categoryName = beforeUchun[1];
  if (!categoryName) {
    const afterIntent = cleaned.match(/\b(?:reja|plan|limit|byudjet|budjet)\b\s+(.+)$/i);
    if (afterIntent?.[1]) categoryName = afterIntent[1];
  }
  if (!categoryName) categoryName = cleaned;

  categoryName = cleanupIntentName(categoryName);
  if (!categoryName) return null;

  return {
    amount: amountMeta.amount,
    categoryName,
    alertBefore: Math.max(0, alertMeta?.amount || Math.round(amountMeta.amount * 0.1)),
    monthKey: monthKeyOf(),
  };
}

function parseDebtIntent(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  if (!text || !/\b(?:qarz|nasiya)\b/i.test(lower)) return null;

  const amountMeta = extractAmountMeta(text);
  if (!amountMeta) return null;

  const noAmount = stripAmountFragment(text, amountMeta);
  const hasGiveVerb = /\b(?:berdim|berib turdim|yozib berdim|beraman)\b/i.test(lower);
  const hasTakeVerb = /\b(?:oldim|olib turdim|olaman)\b/i.test(lower);
  const hasGa = /[\p{L}0-9'’`\-]+ga\b/iu.test(noAmount);
  const hasDan = /[\p{L}0-9'’`\-]+dan\b/iu.test(noAmount);

  let direction = null;
  if (hasGa || hasGiveVerb) direction = 'receivable';
  if (!direction && (hasDan || hasTakeVerb)) direction = 'payable';
  if (!direction) return null;

  let personName = direction === 'receivable'
    ? extractNameBySuffix(noAmount, 'ga')
    : extractNameBySuffix(noAmount, 'dan');

  if (!personName) personName = extractLooseName(noAmount);
  if (!personName) return null;

  return {
    amount: amountMeta.amount,
    personName,
    direction,
    note: text,
  };
}

function parseDebtSettlementIntent(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  if (!text) return null;

  const amountMeta = extractAmountMeta(text);
  const noAmount = stripAmountFragment(text, amountMeta);
  const hasReturnVerb = /\b(?:qaytdi|qaytardi|qaytardim|qaytarildi|qaytarib berdi|qaytarib berdim|uzdim|uzildi|to'?ladim)\b/i.test(lower);
  const hasDebtHint = /\b(?:qarz|nasiya)\b/i.test(lower);
  if (hasDebtHint && !hasReturnVerb) return null;
  const hasGa = /[\p{L}0-9'’`\-]+ga\b/iu.test(noAmount);
  const hasDan = /[\p{L}0-9'’`\-]+dan\b/iu.test(noAmount);

  let direction = null;
  if (/\b(?:qaytardi|qaytdi|qaytarildi|qaytarib berdi)\b/i.test(lower)) direction = 'receivable';
  if (!direction && /\b(?:qaytardim|qaytarib berdim|uzdim|to'?ladim)\b/i.test(lower)) direction = 'payable';
  if (!direction && hasDan) direction = 'receivable';
  if (!direction && hasGa) direction = 'payable';
  if (!direction) return null;

  let personName = direction === 'receivable'
    ? extractNameBySuffix(noAmount, 'dan')
    : extractNameBySuffix(noAmount, 'ga');

  if (!personName) personName = extractLooseName(noAmount);
  if (!personName) return null;

  const explicit = hasReturnVerb || hasDebtHint;
  if (!explicit && !amountMeta) return null;

  return {
    amount: amountMeta?.amount || null,
    personName,
    direction,
    explicit,
    note: text,
  };
}

async function ensureExpenseCategory(userId, categoryName) {
  const cats = await fetchUserCategories(userId);
  const normalized = normalizeTextForMatch(categoryName);
  const existing = (cats || []).find(cat => cat.type === 'expense' && normalizeTextForMatch(cat.name) === normalized);
  if (existing) return existing;

  const { data, error } = await db
    .from('categories')
    .insert([{ user_id: userId, name: categoryName, type: 'expense', icon: 'target' }])
    .select('id, name, type, keywords')
    .maybeSingle();

  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) throw error;
  if (data) return data;

  const fresh = await fetchUserCategories(userId);
  return fresh.find(cat => cat.type === 'expense' && normalizeTextForMatch(cat.name) === normalized) || null;
}

async function savePlanIntent(userId, chatId, intent, user = null) {
  const category = await ensureExpenseCategory(userId, intent.categoryName);
  const categoryName = category?.name || intent.categoryName;
  const existingRows = await fetchCategoryLimitCandidates(userId);
  const current = findExistingCategoryLimit(existingRows, categoryName, intent.monthKey);

  if (!current) {
    const activePlansCount = (existingRows || []).filter((row) => row?.is_active !== false).length;
    const gate = evaluateFeatureAccess('plan_create', user, {
      activePlansCount,
      activeLimitsCount: activePlansCount,
    });
    if (!gate.allowed) {
      await sendFeatureBlockedMessage(chatId, gate.featureKey);
      return true;
    }
  }

  async function writeCategoryLimit(mode, rowId = null) {
    let activeNameCol = categoryLimitNameColumn();
    let activeMode = mode;
    let activeRowId = rowId;
    let writePayload = {
      category_id: category?.id || null,
      [activeNameCol]: categoryName,
      category: categoryName,
      type: 'expense',
      amount: intent.amount,
      alert_before: intent.alertBefore,
      notify_bot: true,
      notify_app: true,
      is_active: true,
      month_key: intent.monthKey,
    };

    for (let i = 0; i < 8; i += 1) {
      const res = activeMode === 'update'
        ? await db.from('category_limits').update(writePayload).eq('id', activeRowId).eq('user_id', userId)
        : await db.from('category_limits').insert([{ user_id: userId, ...writePayload }]);

      if (!res.error) {
        categoryLimitNameColumnSupported = activeNameCol === 'name' ? 'name' : null;
        return res;
      }

      if (isMissingColumnError(res.error, activeNameCol)) {
        activeNameCol = alternateCategoryLimitNameColumn(activeNameCol);
        categoryLimitNameColumnSupported = activeNameCol === 'name' ? 'name' : null;
        writePayload = { ...writePayload, [activeNameCol]: categoryName };
        delete writePayload.category_name;
        delete writePayload.name;
        continue;
      }

      if (isMissingColumnError(res.error, 'month_key')) {
        const { month_key, ...rest } = writePayload;
        writePayload = rest;
        continue;
      }

      if (isNullConstraintOnColumn(res.error, 'category')) {
        writePayload = { ...writePayload, category: categoryName };
        continue;
      }

      if (isMissingColumnError(res.error, 'category')) {
        const { category, ...rest } = writePayload;
        writePayload = rest;
        continue;
      }

      if (isNullConstraintOnColumn(res.error, 'type')) {
        writePayload = { ...writePayload, type: 'expense' };
        continue;
      }

      if (isMissingColumnError(res.error, 'type')) {
        const { type, ...rest } = writePayload;
        writePayload = rest;
        continue;
      }

      if (isMissingColumnError(res.error, 'category_id')) {
        const { category_id, ...rest } = writePayload;
        writePayload = rest;
        continue;
      }

      if (activeMode === 'insert' && isDuplicateKeyError(res.error)) {
        const refreshedRows = await fetchCategoryLimitCandidates(userId);
        const existing = findExistingCategoryLimit(refreshedRows, categoryName, intent.monthKey);
        if (existing?.id) {
          activeMode = 'update';
          activeRowId = existing.id;
          continue;
        }
      }

      return res;
    }

    return { error: new Error('category_limits write fallback exhausted') };
  }

  if (current?.id) {
    const updateRes = await writeCategoryLimit('update', current.id);
    if (updateRes.error) throw updateRes.error;
    await bot.sendMessage(chatId,
      `🎯 <b>Reja yangilandi</b>

📂 Kategoriya: <b>${esc(categoryName)}</b>
💰 Limit: <b>${numFmt(intent.amount)} so'm</b>
⚠️ Ogohlantirish: <b>${numFmt(intent.alertBefore)} so'm</b>
📅 Oy: <b>${esc(intent.monthKey)}</b>

Mini App > Reja bo'limida ko'rinadi.`,
      { parse_mode: 'HTML' }
    ).catch(() => null);
    return true;
  }

  const insertRes = await writeCategoryLimit('insert');
  if (insertRes.error) throw insertRes.error;

  await bot.sendMessage(chatId,
    `🎯 <b>Reja yaratildi</b>

📂 Kategoriya: <b>${esc(categoryName)}</b>
💰 Limit: <b>${numFmt(intent.amount)} so'm</b>
⚠️ Ogohlantirish: <b>${numFmt(intent.alertBefore)} so'm</b>
📅 Oy: <b>${esc(intent.monthKey)}</b>

Mini App > Reja bo'limida ko'rinadi.`,
    { parse_mode: 'HTML' }
  ).catch(() => null);
  return true;
}

function pickBestDebtMatch(rows, personName) {
  const target = normalizeTextForMatch(personName);
  let best = null;
  let bestScore = 0;

  for (const row of rows || []) {
    const candidate = normalizeTextForMatch(row.person_name);
    if (!candidate) continue;
    let score = 0;
    if (candidate === target) score = 100;
    else if (candidate.includes(target) || target.includes(candidate)) score = 70;
    else {
      const targetWords = new Set(target.split(' ').filter(Boolean));
      const candidateWords = candidate.split(' ').filter(Boolean);
      score = candidateWords.reduce((sum, word) => sum + (targetWords.has(word) ? 25 : 0), 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return bestScore >= 25 ? best : null;
}

async function findOpenDebtByPerson(userId, personName, direction) {
  const { data, error } = await db
    .from('debts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('direction', direction)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return pickBestDebtMatch(data || [], personName);
}

async function updateDebtSettlementMeta(debtId, userId, values) {
  if (debtSettlementColumnSupported === false) {
    const { settlement_tx_id, ...plain } = values || {};
    return db.from('debts').update(plain).eq('id', debtId).eq('user_id', userId);
  }

  const res = await db.from('debts').update(values).eq('id', debtId).eq('user_id', userId);
  if (!res.error) {
    debtSettlementColumnSupported = true;
    return res;
  }

  if (isMissingColumnError(res.error, 'settlement_tx_id')) {
    debtSettlementColumnSupported = false;
    const { settlement_tx_id, ...plain } = values || {};
    return db.from('debts').update(plain).eq('id', debtId).eq('user_id', userId);
  }

  return res;
}

async function createDebtSettlementTx(userId, debt, amount) {
  const category = debt.direction === 'receivable'
    ? `Qarz qaytdi · ${debt.person_name}`
    : `Qarz qaytarildi · ${debt.person_name}`;
  const sourceRef = `debt:${debt.id}:${Date.now()}`;
  const row = {
    user_id: userId,
    amount,
    category,
    type: debt.direction === 'receivable' ? 'income' : 'expense',
    date: iso(),
    source_ref: sourceRef,
  };

  const { data, error } = await insertTransactions([row], 'debt_settlement');
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  return saved || null;
}

async function saveDebtIntent(userId, chatId, intent, user = null) {
  const { count, error: countError } = await db
    .from('debts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'open');
  if (countError) throw countError;

  const gate = evaluateFeatureAccess('debt_create', user, {
    activeDebtsCount: Number(count || 0),
  });
  if (!gate.allowed) {
    await sendFeatureBlockedMessage(chatId, gate.featureKey);
    return true;
  }

  const payload = {
    user_id: userId,
    person_name: intent.personName,
    amount: intent.amount,
    direction: intent.direction,
    due_at: null,
    remind_at: null,
    note: intent.note,
    status: 'open'
  };

  const { error } = await db.from('debts').insert([payload]);
  if (error) throw error;

  const directionText = intent.direction === 'receivable' ? 'Sizga qaytadi' : 'Siz qaytarasiz';
  await bot.sendMessage(chatId,
    `🤝 <b>Qarz saqlandi</b>

📂 <b>Turi:</b> Qarz
👤 <b>Kim bilan:</b> <b>${esc(intent.personName)}</b>
💰 <b>Summa:</b> <b>${numFmt(intent.amount)} so'm</b>
📌 <b>Yo'nalish:</b> <b>${esc(directionText)}</b>

<i>Eslatma: qarz berilganda balans darhol o'zgarmaydi. Qarz qaytganda yoki qaytarganingizda bot avtomatik hisobga oladi.</i>`,
    { parse_mode: 'HTML' }
  ).catch(() => null);
  return true;
}

async function saveDebtSettlementIntent(userId, chatId, intent) {
  const debt = await findOpenDebtByPerson(userId, intent.personName, intent.direction);
  if (!debt) {
    if (intent.explicit) {
      await bot.sendMessage(chatId,
        `⚠️ <b>Ochiq qarz topilmadi</b>

👤 <b>${esc(intent.personName)}</b> uchun ochiq qarz yozuvi topilmadi. Avval qarzni yozing yoki Mini App > Qarzlar bo'limidan tekshiring.`,
        { parse_mode: 'HTML' }
      ).catch(() => null);
      return { handled: true, found: false };
    }
    return { handled: false, found: false };
  }

  const currentAmount = Number(debt.amount || 0);
  const paidAmount = Math.max(0, Number(intent.amount || currentAmount));
  if (!paidAmount) return { handled: false, found: true };

  const usedAmount = Math.min(currentAmount, paidAmount);
  const remaining = Math.max(0, currentAmount - usedAmount);
  const tx = await createDebtSettlementTx(userId, debt, usedAmount);

  if (remaining > 0) {
    const { error } = await updateDebtSettlementMeta(debt.id, userId, {
      amount: remaining,
      updated_at: iso(),
    });
    if (error) throw error;

    await bot.sendMessage(chatId,
      `🔁 <b>Qarz qisman yopildi</b>

👤 <b>${esc(debt.person_name)}</b>
💸 <b>${numFmt(usedAmount)} so'm</b> ${debt.direction === 'receivable' ? 'qaytdi' : 'qaytarildi'}
💼 <b>Qoldiq qarz:</b> <b>${numFmt(remaining)} so'm</b>`,
      { parse_mode: 'HTML' }
    ).catch(() => null);

    return { handled: true, found: true, debtId: debt.id, txId: tx?.id || null, partial: true };
  }

  const { error } = await updateDebtSettlementMeta(debt.id, userId, {
    status: 'paid',
    paid_at: iso(),
    settlement_tx_id: tx?.id || null,
    updated_at: iso(),
  });
  if (error) throw error;

  await bot.sendMessage(chatId,
    `✅ <b>Qarz yopildi</b>

👤 <b>${esc(debt.person_name)}</b>
💰 <b>${numFmt(usedAmount)} so'm</b> ${debt.direction === 'receivable' ? "qaytdi va balansga qo'shildi" : "qaytarildi va balansdan chiqarildi"}.`,
    { parse_mode: 'HTML' }
  ).catch(() => null);

  return { handled: true, found: true, debtId: debt.id, txId: tx?.id || null, partial: false };
}


// ─── TEXT PARSER ──────────────────────────────────────────
// Matndan summa, tur va kategoriyani ajratib olish (Regex asosslangan fallback)
function parseText(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const amountMeta = extractAmountMeta(text);
  if (!amountMeta) return null;

  const typeMeta = inferTransactionType(lower);
  const type = typeMeta.type;

  let catPart = amountMeta.clean.replace(amountMeta.rawMatch, ' ').replace(/^\s*[+\-]\s*/, '').trim();
  catPart = cleanupCategoryText(catPart);
  if (!catPart || catPart.length < 2) catPart = type === 'income' ? 'kirim' : 'xarajat';

  const inferredCategory = inferSemanticCategory(lower, type, titleCaseWords(catPart));
  const category = titleCaseWords(inferredCategory || catPart || (type === 'income' ? 'Kirim' : 'Xarajat'));

  return {
    amount: amountMeta.amount,
    type,
    category,
    isUSD: amountMeta.isUSD
  };
}

// ─── SAVE TRANSACTION ────────────────────────────────────
async function saveTx(userId, chatId, parsed, receiptUrl = null, exRate = DEFAULT_RATE, replyId = null, rawText = '') {
  const safeRate = Number(exRate) > 0 ? Number(exRate) : DEFAULT_RATE;

  let amount = parsed.amount;
  let category = parsed.category;

  try {
    const userCats = await fetchUserCategories(userId);
    category = resolveCategoryForUser(parsed, userCats, rawText) || category;
  } catch (error) {
    await logErr('category-resolve', error, { userId });
  }
  let amtTxt = `${numFmt(amount)} so'm`;

  if (parsed.isUSD) {
    amount = Math.round(parsed.amount * safeRate);
    category = `${parsed.category} ($${parsed.amount})`;
    amtTxt = `${numFmt(amount)} so'm\n<i>($${numFmt(parsed.amount)} × ${numFmt(safeRate)})</i>`;
  }

  const row = {
    user_id: userId,
    amount,
    category,
    type: parsed.type,
    date: iso(),
    receipt_url: receiptUrl || null,
  };

  const { data, error } = await insertTransactions([row], 'bot');
  if (error) {
    await logErr('save-tx', error, { userId, chatId, amount, category });
    await bot.sendMessage(chatId, '⚠️ Bazaga yozishda xatolik. Keyinroq urinib ko\'ring.').catch(() => { });
    return null;
  }

  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) {
    await bot.sendMessage(chatId, '⚠️ Tranzaksiya saqlanganini tasdiqlab bo\'lmadi.').catch(() => { });
    return null;
  }

  const ico = parsed.type === 'income' ? '🟢' : '🔴';
  const typ = parsed.type === 'income' ? 'Kirim' : 'Chiqim';
  const chk = receiptUrl ? '📸 Bor' : 'Yo\'q';

  const opts = { parse_mode: 'HTML' };
  if (replyId) opts.reply_to_message_id = replyId;

  await bot.sendMessage(chatId,
    `✅ <b>Saqlandi!</b>\n\n` +
    `${ico} <b>Turi:</b> ${typ}\n` +
    `💰 <b>Summa:</b> ${amtTxt}\n` +
    `📂 <b>Kategoriya:</b> ${esc(category)}\n` +
    `🧾 <b>Chek:</b> ${chk}`,
    opts
  ).catch(() => { });

  await sendCategoryLimitAlert(userId, chatId, category, amount, parsed.type);
  log('tx-saved', { userId, id: saved.id, type: saved.type, amount: saved.amount, category });
  return saved;
}

// ─── REPORT BUILDER ──────────────────────────────────────
function buildReport(rows, title) {
  const inc = rows.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const exp = rows.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const bal = inc - exp;

  // Top 5 chiqim kategoriyalar
  const catMap = {};
  rows.filter(r => r.type === 'expense').forEach(r => {
    catMap[r.category] = (catMap[r.category] || 0) + (Number(r.amount) || 0);
  });
  const top = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, v]) => `  · ${esc(c)}: <b>${numFmt(v)}</b>`)
    .join('\n');

  return `📊 <b>${esc(title)}</b>\n\n` +
    `📥 Kirim:  <b>+${numFmt(inc)} so'm</b>\n` +
    `📤 Chiqim: <b>-${numFmt(exp)} so'm</b>\n` +
    `━━━━━━━━━━━━\n` +
    `${bal >= 0 ? '🤑' : '💸'} Qoldiq: <b>${numFmt(bal)} so'm</b>` +
    (top ? `\n\n<b>Top kategoriyalar:</b>\n${top}` : '');
}

// ─── MAIN HANDLER ────────────────────────────────────────
module.exports = async (req, res) => {
  // Webhook sog'liqi tekshiruvi
  if (req.method !== 'POST') {
    return res.status(200).send('Kassa Bot ishlayapti 🚀');
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
    || process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN
    || process.env.BOT_WEBHOOK_SECRET
    || process.env.WEBHOOK_SECRET
    || '';
  if (webhookSecret) {
    const headerSecret = req.headers?.['x-telegram-bot-api-secret-token']
      || req.headers?.['X-Telegram-Bot-Api-Secret-Token']
      || '';
    if (headerSecret !== webhookSecret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const update = req.body || {};

    // ── Callback Query Handlers ──
    if (update.callback_query) {
      const q = update.callback_query;
      const userId = q.from.id;
      const data = q.data || '';
      const chatId = q.message.chat.id;
      const msgId = q.message.message_id;

      if (data.startsWith('bc_')) {
        const [action, bcId] = data.split(':');

        if (action === 'bc_cancel') {
          await bot.deleteMessage(chatId, msgId).catch(() => { });
          await bot.answerCallbackQuery(q.id, { text: 'Draft bekor qilindi' }).catch(() => { });
          await db.from('broadcasts').update({ status: 'cancelled' }).eq('id', bcId).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        const { data: bc, error: bErr } = await db.from('broadcasts').select('*').eq('id', bcId).maybeSingle();
        if (bErr || !bc) {
          await bot.answerCallbackQuery(q.id, { text: 'Broadcast topilmadi', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_send') {
          await bot.answerCallbackQuery(q.id, { text: 'Yuborish boshlandi...' }).catch(() => { });
          const progress = await bot.sendMessage(chatId, '⏳ Broadcast userlarga yuborilmoqda...').catch(() => null);
          try {
            const result = await sendBroadcastBatch(bc, { retryOnly: false });
            await safeEditOrSend(chatId, progress?.message_id, buildBroadcastResultText(bc, result, false), {
              parse_mode: 'HTML',
              reply_markup: buildBroadcastResultMarkup(bc, result)
            });
          } catch (e) {
            await safeEditOrSend(chatId, progress?.message_id, `⚠️ Broadcast yuborishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_retry') {
          const { data: failedRows, error: frErr } = await db.from('broadcast_failures').select('user_id').eq('broadcast_id', bcId);
          if (frErr) {
            await bot.answerCallbackQuery(q.id, { text: "Xatolarni o'qishda muammo", show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          const ids = (failedRows || []).map(r => r.user_id);
          if (!ids.length) {
            await bot.answerCallbackQuery(q.id, { text: 'Qayta yuborish uchun user qolmagan', show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          await bot.answerCallbackQuery(q.id, { text: 'Qayta yuborish boshlandi...' }).catch(() => { });
          const progress = await bot.sendMessage(chatId, `🔁 ${ids.length} ta userga qayta yuborilyapti...`).catch(() => null);
          try {
            const result = await sendBroadcastBatch(bc, { targetUserIds: ids, retryOnly: true });
            await safeEditOrSend(chatId, progress?.message_id, buildBroadcastResultText(bc, result, true), {
              parse_mode: 'HTML',
              reply_markup: buildBroadcastResultMarkup(bc, result)
            });
          } catch (e) {
            await safeEditOrSend(chatId, progress?.message_id, `⚠️ Qayta yuborishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'bc_failed') {
          const { data: rows, error: frErr } = await db.from('broadcast_failures')
            .select('user_id, error_message, retry_count, created_at, last_retry_at')
            .eq('broadcast_id', bcId)
            .order('last_retry_at', { ascending: false })
            .limit(25);
          if (frErr) {
            await bot.answerCallbackQuery(q.id, { text: "Xatolar ro'yxatini olishda xatolik", show_alert: true }).catch(() => { });
            return res.status(200).json({ ok: true });
          }

          await safeEditOrSend(chatId, msgId, buildFailedTargetsText(bc, rows || []), {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔁 Qayta yuborish', callback_data: `bc_retry:${bc.id}` }],
                [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]
              ]
            }
          });
          return res.status(200).json({ ok: true });
        }
      }


      if (data.startsWith('notif_')) {
        if (!isAdmin(userId)) {
          await bot.answerCallbackQuery(q.id, { text: 'Admin emas', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        const [action, key, rawValue] = data.split(':');

        if (action === 'notif_noop') {
          await bot.answerCallbackQuery(q.id, { text: `Custom vaqt uchun /notif time ${key} ${key === 'daily_report' ? '22:00' : '08:30'} deb yozing` }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (action === 'notif_help') {
          await bot.answerCallbackQuery(q.id).catch(() => { });
          await safeEditOrSend(chatId, msgId, buildNotificationHelpText(key), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Orqaga', callback_data: `notif_open:${key}` }], [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]] }
          });
          return res.status(200).json({ ok: true });
        }

        if (action === 'notif_open') {
          await bot.answerCallbackQuery(q.id).catch(() => { });
          try {
            await sendNotificationDetail(chatId, msgId, key);
          } catch (e) {
            await safeEditOrSend(chatId, msgId, `⚠️ Notificationni ochishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'notif_toggle') {
          try {
            const current = await getNotificationSetting(key);
            const next = await saveNotificationSetting(key, { enabled: !current.enabled });
            await bot.answerCallbackQuery(q.id, { text: next.enabled ? 'Yoqildi ✅' : "O'chirildi ⛔️" }).catch(() => { });
            await sendNotificationDetail(chatId, msgId, key);
          } catch (e) {
            await bot.answerCallbackQuery(q.id, { text: tgErr(e), show_alert: true }).catch(() => { });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'notif_shift') {
          try {
            const current = await getNotificationSetting(key);
            const nextTime = shiftNotifTime(current.send_time || (current.key === 'daily_report' ? '22:00' : '09:00'), Number(rawValue || 0));
            await saveNotificationSetting(key, { send_time: nextTime });
            await bot.answerCallbackQuery(q.id, { text: `Yangi vaqt: ${nextTime}` }).catch(() => { });
            await sendNotificationDetail(chatId, msgId, key);
          } catch (e) {
            await bot.answerCallbackQuery(q.id, { text: tgErr(e), show_alert: true }).catch(() => { });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'notif_preset') {
          try {
            const nextTime = String(rawValue || '').replace('-', ':');
            await saveNotificationSetting(key, { send_time: nextTime });
            await bot.answerCallbackQuery(q.id, { text: `Vaqt saqlandi: ${nextTime}` }).catch(() => { });
            await sendNotificationDetail(chatId, msgId, key);
          } catch (e) {
            await bot.answerCallbackQuery(q.id, { text: tgErr(e), show_alert: true }).catch(() => { });
          }
          return res.status(200).json({ ok: true });
        }

        if (action === 'notif_test') {
          try {
            await sendNotificationPreview(chatId, key);
            await bot.answerCallbackQuery(q.id, { text: 'Test yuborildi ✅' }).catch(() => { });
          } catch (e) {
            await bot.answerCallbackQuery(q.id, { text: tgErr(e), show_alert: true }).catch(() => { });
          }
          return res.status(200).json({ ok: true });
        }
      }


      if (data.startsWith('admin_')) {
        if (!isAdmin(userId)) {
          await bot.answerCallbackQuery(q.id, { text: 'Admin emas', show_alert: true }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        await bot.answerCallbackQuery(q.id).catch(() => { });

        if (data === 'admin_panel' || data === 'admin_stats') {
          await sendAdminPanel(chatId, msgId);
          return res.status(200).json({ ok: true });
        }

        const adminUsersMatch = data.match(/^admin_users(?::(\d+))?$/);
        if (adminUsersMatch) {
          const offset = Number(adminUsersMatch[1] || 0);
          const { rows, error: uErr, totalUsers, pageSize } = await fetchAdminUsersPage(offset);
          if (uErr) {
            await safeEditOrSend(chatId, msgId, `⚠️ Userlarni olishda xatolik: ${esc(uErr.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          await safeEditOrSend(chatId, msgId, buildRecentUsersText(rows, totalUsers, { offset, pageSize }), {
            parse_mode: 'HTML',
            reply_markup: buildRecentUsersMarkup(totalUsers, offset, pageSize)
          });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_broadcasts') {
          const { data: rows, error } = await db.from('broadcasts')
            .select('id, status, total_users, sent_count, failed_count, created_at')
            .order('created_at', { ascending: false })
            .limit(8);
          if (error) {
            await safeEditOrSend(chatId, msgId, `⚠️ Broadcastlarni olishda xatolik: ${esc(error.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          await safeEditOrSend(chatId, msgId, buildBroadcastsText(rows || []), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_failed') {
          const { data: rows, error } = await db.from('broadcasts')
            .select('id, status, failed_count, created_at')
            .gt('failed_count', 0)
            .order('created_at', { ascending: false })
            .limit(8);
          if (error) {
            await safeEditOrSend(chatId, msgId, `⚠️ Xatoli broadcastlarni olishda xatolik: ${esc(error.message)}`, { parse_mode: 'HTML' });
            return res.status(200).json({ ok: true });
          }
          const rowsKb = (rows || []).slice(0, 5).map(b => [{ text: `👀 ${shortId(b.id)} · ${b.failed_count} ta`, callback_data: `bc_failed:${b.id}` }]);
          await safeEditOrSend(chatId, msgId, buildFailedBroadcastsText(rows || []), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [...rowsKb, [{ text: '🛠 Admin panel', callback_data: 'admin_panel' }]] }
          });
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_notifications') {
          try {
            await sendNotificationPanel(chatId, msgId);
          } catch (e) {
            await safeEditOrSend(chatId, msgId, `⚠️ Notification panelni ochishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          }
          return res.status(200).json({ ok: true });
        }

        if (data === 'admin_help') {
          await safeEditOrSend(chatId, msgId, buildBroadcastGuideText(), { parse_mode: 'HTML', reply_markup: adminPanelMarkup() });
          return res.status(200).json({ ok: true });
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ── Inline Query Handlers ──
    if (update.inline_query) {
      const q = update.inline_query;
      const text = q.query.trim();
      if (!text) return res.status(200).json({ ok: true });

      const parsed = parseText(text);
      if (!parsed) return res.status(200).json({ ok: true });

      const title = parsed.type === 'income' ? '🟢 Kirim' : '🔴 Chiqim';
      const amount = numFmt(parsed.amount);
      const cat = esc(parsed.category);

      const result = {
        type: 'article',
        id: 'tx_' + Date.now(),
        title: `${title}: ${amount} so'm`,
        description: `📂 Kategoriya: ${cat}${parsed.isUSD ? ' ($)' : ''}\n✨ Saqlash uchun bosing`,
        input_message_content: {
          message_text: `✅ <b>Kassa:</b> ${title}\n💰 <b>Summa:</b> ${amount} so'm\n📂 <b>Kategoriya:</b> ${cat}`,
          parse_mode: 'HTML'
        }
      };

      await bot.answerInlineQuery(q.id, [result], { cache_time: 0 }).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    if (update.chosen_inline_result) {
      const cir = update.chosen_inline_result;
      const userId = cir.from.id;
      const query = cir.query;
      const parsed = parseText(query);
      if (parsed) {
        let { data: user } = await db.from('users').select('exchange_rate').eq('user_id', userId).maybeSingle();
        await saveTx(userId, userId, parsed, null, user?.exchange_rate || DEFAULT_RATE);
      }
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;

    // Callback query va boshqa turdagi update'lar — e'tiborsiz
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat?.id;
    const userId = msg.from?.id;

    if (!chatId || !userId) return res.status(200).json({ ok: true });

    const text = (msg.text || msg.caption || '').trim();
    const commandInfo = parseTelegramCommand(text);

    log('msg', {
      userId,
      chatId,
      type: msg.voice ? 'voice' : msg.photo ? 'photo' : msg.contact ? 'contact' : 'text',
    });

    // ── Foydalanuvchi ma'lumotlarini olish ──
    let { data: user, error: uErr } = await db
      .from('users').select('*').eq('user_id', userId).maybeSingle();
    if (uErr) warn('user-fetch', { userId, msg: uErr.message });

    // ── Telefon raqami ro'yxatdan o'tkazish ──
    if (msg.contact) {
      // Faqat o'z kontaktini yuborishga ruxsat
      if (msg.contact.user_id !== userId) return res.status(200).json({ ok: true });
      const shouldNotifyNewRegistration = !hasRegisteredPhone(user) && !!normalizePhoneNumber(msg.contact.phone_number);
      const userContext = buildUserLogContext(msg, user, { phone_number: msg.contact.phone_number });

      const { error: regErr } = await db.from('users').upsert({
        user_id: userId,
        phone_number: msg.contact.phone_number,
        full_name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || `User ${userId}`,
        last_start_date: iso(),
        exchange_rate: Number(user?.exchange_rate) > 0 ? Number(user.exchange_rate) : DEFAULT_RATE,
      }, { onConflict: 'user_id' });

      if (regErr) {
        await logErr('reg', regErr, userContext);
        return res.status(200).json({ ok: false });
      }

      await bot.sendMessage(chatId,
        `🎉 <b>Ro'yxatdan o'tdingiz!</b>\n\nEndi kirim-chiqimlarni yozishingiz mumkin.\n\n${GUIDE}`,
        { reply_markup: KB, parse_mode: 'HTML' }
      ).catch(() => { });

      if (shouldNotifyNewRegistration) {
        const timestamp = new Date().toISOString();
        const userContext = buildUserLogContext(msg, null, { phone_number: msg.contact.phone_number });

        // SUCCESS log to channel
        await getAppLogger().success({
          scope: 'user-registered',
          ...userContext,
          message: "✅ Yangi foydalanuvchi muvaffaqiyatli ro'yxatdan o'tdi",
          payload: {
            event: 'new_user_registered',
            timestamp,
            phone_number: msg.contact.phone_number,
            chat_id: chatId,
            registered: true,
          },
        }).catch(() => { });

        // Admin notification - new user
        await getAppLogger().notifyNewUser({
          source: 'bot /start + contact',
          ...userContext,
          payload: {
            registered_at: timestamp,
            phone_number: msg.contact.phone_number,
            chat_id: chatId,
            is_new_user: true,
          },
        }).catch(() => { });
      }

      return res.status(200).json({ ok: true });
    }

    // ── Admin panel / broadcast buyruqlari ──
    if (commandInfo?.command === '/admin') {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      try {
        await sendAdminPanel(chatId);
        await getAppLogger().info({
          scope: 'admin-open',
          ...buildUserLogContext(msg, user),
          message: 'Admin panel ochildi',
          payload: { source: '/admin' },
        }).catch(() => { });
      } catch (e) {
        await bot.sendMessage(chatId, `⚠️ Admin panelni ochishda xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' }).catch(() => { });
      }
      return res.status(200).json({ ok: true });
    }

    if (commandInfo && ['/premium', '/freeplan', '/subinfo'].includes(commandInfo.command)) {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const command = commandInfo.command;
      const targetUserId = Number(commandInfo.args[0] || 0);
      if (!targetUserId) {
        await bot.sendMessage(chatId, '⚠️ Format: /premium <user_id> [kun], /freeplan <user_id>, /subinfo <user_id>').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      if (command === '/premium') {
        const durationDays = Math.max(1, Number(commandInfo.args[1] || 30));
        const payload = buildSubscriptionUpdatePayload({ planCode: 'premium_monthly', status: 'active', durationDays });
        const { error } = await updateUserSubscription(targetUserId, payload);
        if (error) {
          await bot.sendMessage(chatId, `⚠️ Premium berishda xatolik: ${esc(error.message || 'noma\'lum')}`, { parse_mode: 'HTML' }).catch(() => { });
          return res.status(200).json({ ok: true });
        }
      }

      if (command === '/freeplan') {
        const payload = buildSubscriptionUpdatePayload({ planCode: 'free' });
        const { error } = await updateUserSubscription(targetUserId, payload);
        if (error) {
          await bot.sendMessage(chatId, `⚠️ Tarifni free holatiga qaytarishda xatolik: ${esc(error.message || 'noma\'lum')}`, { parse_mode: 'HTML' }).catch(() => { });
          return res.status(200).json({ ok: true });
        }
      }

      let fetchResponse = await db.from('users')
        .select(`user_id, full_name, ${SUBSCRIPTION_FIELDS.join(', ')}`)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (fetchResponse.error && SUBSCRIPTION_FIELDS.some((field) => isMissingColumnError(fetchResponse.error, field))) {
        fetchResponse = await db.from('users')
          .select('user_id, full_name')
          .eq('user_id', targetUserId)
          .maybeSingle();
      }
      const { data: updatedUser, error: fetchError } = fetchResponse;
      if (fetchError) {
        await bot.sendMessage(chatId, `⚠️ User obunasini o'qishda xatolik: ${esc(fetchError.message || 'noma\'lum')}`, { parse_mode: 'HTML' }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      await bot.sendMessage(chatId, buildAdminSubscriptionText(targetUserId, updatedUser || {}), {
        parse_mode: 'HTML',
      }).catch(() => { });
      return res.status(200).json({ ok: true });
    }


    if (commandInfo?.command === '/notif') {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const full = `${commandInfo.command}${commandInfo.argsText ? ` ${commandInfo.argsText}` : ''}`;
      const parts = [commandInfo.command, ...commandInfo.args];
      const sub = String(commandInfo.args[0] || '').toLowerCase();

      try {
        if (!sub || sub === 'list') {
          await sendNotificationPanel(chatId);
          await getAppLogger().info({
            scope: 'notif-panel',
            ...buildUserLogContext(msg, user),
            message: 'Notification panel ochildi',
            payload: { source: '/notif' },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (sub === 'help') {
          await bot.sendMessage(chatId, buildNotificationHelpText(), { parse_mode: 'HTML' }).catch(() => { });
          await getAppLogger().info({
            scope: 'notif-help',
            ...buildUserLogContext(msg, user),
            message: "Notification qo'llanmasi ochildi",
            payload: { source: '/notif help' },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (sub === 'on' || sub === 'off') {
          const key = parts[2];
          if (!NOTIFICATION_SETTING_DEFAULTS[key]) {
            await bot.sendMessage(chatId, '⚠️ Noto\'g\'ri key. Mavjudlari: daily_reminder, daily_report, debt_reminder, scheduled_queue').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          const saved = await saveNotificationSetting(key, { enabled: sub === 'on' });
          await bot.sendMessage(chatId, `✅ ${saved.title} holati: <b>${saved.enabled ? 'yoqildi' : "o'chirildi"}</b>`, { parse_mode: 'HTML' }).catch(() => { });
          await getAppLogger().info({
            scope: 'notif-toggle',
            ...buildUserLogContext(msg, user),
            message: 'Notification holati yangilandi',
            payload: { key, enabled: saved.enabled },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (sub === 'time') {
          const key = parts[2];
          const timeValue = parts[3];
          if (key !== 'daily_reminder' && key !== 'daily_report') {
            await bot.sendMessage(chatId, '⚠️ Vaqt sozlamasi hozircha faqat daily_reminder va daily_report uchun mavjud.').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          const normalized = normalizeNotifTime(timeValue, '');
          if (!normalized) {
            await bot.sendMessage(chatId, '⚠️ Vaqt formati noto\'g\'ri. Misol: /notif time daily_report 22:00').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          const saved = await saveNotificationSetting(key, { send_time: normalized });
          await bot.sendMessage(chatId, `✅ ${saved.title} vaqti <b>${saved.send_time}</b> qilib saqlandi.`, { parse_mode: 'HTML' }).catch(() => { });
          await getAppLogger().info({
            scope: 'notif-time',
            ...buildUserLogContext(msg, user),
            message: 'Notification vaqti yangilandi',
            payload: { key, send_time: saved.send_time, timezone: saved.timezone },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (sub === 'reset') {
          const key = parts[2];
          const base = getNotificationDefault(key);
          if (!base) {
            await bot.sendMessage(chatId, '⚠️ Noto\'g\'ri key.').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          const saved = await saveNotificationSetting(key, {
            enabled: base.enabled,
            send_time: base.send_time,
            timezone: base.timezone,
            message_template: base.message_template,
            config: base.config || {}
          });
          await bot.sendMessage(chatId, `♻️ ${saved.title} default holatiga qaytarildi.`, { parse_mode: 'HTML' }).catch(() => { });
          await getAppLogger().info({
            scope: 'notif-reset',
            ...buildUserLogContext(msg, user),
            message: 'Notification default holatiga qaytarildi',
            payload: { key, enabled: saved.enabled, send_time: saved.send_time },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (sub === 'test') {
          const key = parts[2];
          if (!NOTIFICATION_SETTING_DEFAULTS[key]) {
            await bot.sendMessage(chatId, '⚠️ Noto\'g\'ri key.').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          await sendNotificationPreview(chatId, key);
          await getAppLogger().info({
            scope: 'notif-test',
            ...buildUserLogContext(msg, user),
            message: 'Notification preview yuborildi',
            payload: { key },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (sub === 'text') {
          const m = full.match(/^\/notif\s+text\s+(daily_reminder|daily_report|debt_reminder)\s+([\s\S]+)$/i);
          if (!m) {
            await bot.sendMessage(chatId, '⚠️ Format: /notif text daily_report Kunlik hisobotingiz...').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          const key = m[1];
          const template = String(m[2] || '').trim();
          if (!template) {
            await bot.sendMessage(chatId, '⚠️ Matn bo\'sh bo\'lmasin.').catch(() => { });
            return res.status(200).json({ ok: true });
          }
          const saved = await saveNotificationSetting(key, { message_template: template });
          await bot.sendMessage(chatId, `✅ ${saved.title} matni yangilandi.\n\n<i>Test uchun /notif test ${key}</i>`, { parse_mode: 'HTML' }).catch(() => { });
          await getAppLogger().info({
            scope: 'notif-text',
            ...buildUserLogContext(msg, user),
            message: 'Notification matni yangilandi',
            payload: { key, template_preview: clipText(template, 160) },
          }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        await bot.sendMessage(chatId, buildNotificationHelpText(), { parse_mode: 'HTML' }).catch(() => { });
      } catch (e) {
        await bot.sendMessage(chatId, `⚠️ Notification sozlamasida xatolik: ${esc(tgErr(e))}`, { parse_mode: 'HTML' }).catch(() => { });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Admin Broadcast (/message ...) ──
    if (commandInfo?.command === '/message') {
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '⛔️ Bu buyruq faqat adminlar uchun.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const rawText = msg.text || msg.caption || '';
      const entities = msg.entities || msg.caption_entities || [];
      const parts = rawText.split(/\s*\n--\n\s*/);
      let broadcastText = parts[0].replace(/^\/message(?:@[a-z0-9_]+)?\s*/i, '').trim();
      const prefixLen = rawText.indexOf(broadcastText);

      let reply_markup = null;
      if (parts[1]) {
        const lines = parts[1].split('\n').filter(l => l.includes('|'));
        if (lines.length > 0) {
          reply_markup = {
            inline_keyboard: lines.map(line => {
              const [btnText, btnUrl] = line.split('|').map(s => s.trim());
              return [{ text: btnText, url: btnUrl }];
            })
          };
        }
      }

      let shiftedEntities = null;
      if (entities && entities.length > 0) {
        shiftedEntities = entities
          .map(e => ({ ...e, offset: e.offset - prefixLen }))
          .filter(e => e.offset >= 0 && e.offset + e.length <= broadcastText.length);
      }

      let msgType = 'text';
      let mediaId = null;
      if (msg.photo) { msgType = 'photo'; mediaId = msg.photo[msg.photo.length - 1].file_id; }
      else if (msg.video) { msgType = 'video'; mediaId = msg.video.file_id; }
      else if (msg.animation) { msgType = 'animation'; mediaId = msg.animation.file_id; }
      else if (msg.document) { msgType = 'document'; mediaId = msg.document.file_id; }

      if (!broadcastText && !mediaId) {
        await bot.sendMessage(chatId, `⚠️ Broadcast bo'sh.\n\nMisol:\n<code>/message Assalomu alaykum\n--\nKanal | https://t.me/username</code>`, { parse_mode: 'HTML' }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { data: draft, error: drErr } = await db.from('broadcasts').insert({
        admin_id: userId,
        status: 'draft',
        msg_type: msgType,
        content: broadcastText,
        media_id: mediaId,
        reply_markup,
        entities: shiftedEntities
      }).select().single();

      if (drErr) {
        await logErr('draft-save', drErr);
        await bot.sendMessage(chatId, '⚠️ Draft saqlashda xatolik.').catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const previewMarkup = {
        inline_keyboard: [
          ...(reply_markup?.inline_keyboard || []),
          [{ text: '✅ Tasdiqlash', callback_data: `bc_send:${draft.id}` }, { text: '❌ Bekor qilish', callback_data: `bc_cancel:${draft.id}` }]
        ]
      };

      await bot.sendMessage(chatId, `📣 <b>BROADCAST PREVIEW</b>\nID: <code>${draft.id}</code>\n\nQuyidagi ko'rinish userlarga yuboriladi:`, { parse_mode: 'HTML' });

      if (msgType === 'photo') await bot.sendPhoto(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'video') await bot.sendVideo(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'animation') await bot.sendAnimation(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else if (msgType === 'document') await bot.sendDocument(chatId, mediaId, { caption: broadcastText, caption_entities: shiftedEntities, reply_markup: previewMarkup });
      else await bot.sendMessage(chatId, broadcastText, { entities: shiftedEntities, reply_markup: previewMarkup });

      return res.status(200).json({ ok: true });
    }

    // ── Yangi foydalanuvchi — telefon so'rash ──
    if (!user) {
      if (text === '/start') {
        const userContext = buildUserLogContext(msg, null);
        const timestamp = new Date().toISOString();

        // INFO log to channel - yangi user /start bosdi
        await getAppLogger().info({
          scope: 'start-new-user',
          ...userContext,
          message: "🆕 Yangi foydalanuvchi /start bosdi (ro'yxatdan o'tmagan)",
          payload: {
            event: 'new_user_start',
            timestamp,
            chat_id: chatId,
            has_username: !!msg.from?.username,
            full_name: `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim(),
            contact_requested: true,
          },
        }).catch(() => { });
      }

      await bot.sendMessage(chatId, `👋 Assalomu alaykum!\nBotdan foydalanish uchun telefon raqamingizni tasdiqlang.`, {
        reply_markup: {
          keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
      ).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── /start ──
    if (text === '/start') {
      const now = new Date();
      const todayStr = now.toDateString();
      const lastStr = user.last_start_date ? new Date(user.last_start_date).toDateString() : null;
      const isNew = lastStr !== todayStr;
      const isFirstTime = !user.last_start_date;

      const firstName = (user.full_name || 'Boshliq').split(' ')[0];
      const greeting = `Xush kelibsiz, <b>${esc(firstName)}</b>☺️!\nBemalol kirim yoki chiqim qilishingiz mumkin💸`;

      await bot.sendMessage(chatId, greeting, { reply_markup: KB, parse_mode: 'HTML' }).catch(() => { });

      if (isNew) {
        await db.from('users').update({ last_start_date: iso() }).eq('user_id', userId);
      }

      // INFO log to channel
      const userContext = buildUserLogContext(msg, user);
      await getAppLogger().info({
        scope: 'start-existing-user',
        ...userContext,
        message: isFirstTime
          ? "🔄 Mavjud foydalanuvchi /start bosdi (birinchi marta)"
          : isNew
            ? "📅 Foydalanuvchi bugun birinchi marta /start bosdi"
            : "👋 Foydalanuvchi /start bosdi (qayta)",
        payload: {
          event: 'existing_user_start',
          timestamp: now.toISOString(),
          is_first_time: isFirstTime,
          is_first_today: isNew,
          chat_id: chatId,
          has_phone: hasRegisteredPhone(user),
        },
      }).catch(() => { });

      return res.status(200).json({ ok: true });
    }

    // ── Qo'llanma ──
    if (text === '❓ Qo\'llanma') {
      await bot.sendMessage(chatId, GUIDE, { parse_mode: 'HTML', reply_markup: KB }).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Hisobotlar ──
    if (text === '📊 Bugungi Hisobot' || text === '📅 Oylik Hisobot') {
      const wait = await bot.sendMessage(chatId, '⏳ Hisobot tayyorlanmoqda...').catch(() => null);
      const now = new Date();
      let since, title;

      if (text.includes('Bugungi')) {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        title = 'BUGUNGI HISOBOT';
      } else {
        since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        title = `${now.toLocaleString('uz-UZ', { month: 'long' }).toUpperCase()} OYI`;
      }

      const { data: rows, error: re } = await db
        .from('transactions')
        .select('type, amount, category')
        .eq('user_id', userId)
        .gte('date', since);

      if (re) {
        await logErr('report', re, { userId });
        if (wait) await bot.editMessageText('⚠️ Hisobot chiqarishda xatolik.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const txt = rows?.length
        ? buildReport(rows, title)
        : `📊 <b>${esc(title)}</b>\n\nBu davr uchun ma'lumot topilmadi.`;

      if (wait) {
        await bot.editMessageText(txt, { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' }).catch(() => { });
      } else {
        await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' }).catch(() => { });
      }

      log('report', { userId, title, count: rows?.length });
      return res.status(200).json({ ok: true });
    }

    // ── Oxirgisini o'chirish ──
    if (text === '↩️ Oxirgisini O\'chirish') {
      const wait = await bot.sendMessage(chatId, '⏳ Qidirilmoqda...').catch(() => null);

      const { data: last } = await db
        .from('transactions')
        .select('id, category, amount, type')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!last) {
        if (wait) await bot.editMessageText('⚠️ O\'chirish uchun operatsiya topilmadi.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const { error: de } = await db
        .from('transactions')
        .delete()
        .eq('id', last.id)
        .eq('user_id', userId);

      if (de) {
        await logErr('del-last', de, { userId });
        if (wait) await bot.editMessageText('⚠️ O\'chirishda xatolik.',
          { chat_id: chatId, message_id: wait.message_id }).catch(() => { });
        return res.status(200).json({ ok: true });
      }

      const ico = last.type === 'income' ? '🟢' : '🔴';
      if (wait) {
        await bot.editMessageText(
          `🗑 <b>O'chirildi!</b>\n\n${ico} ${esc(last.category)}\n💰 ${numFmt(last.amount)} so'm`,
          { chat_id: chatId, message_id: wait.message_id, parse_mode: 'HTML' }
        ).catch(() => { });
      }

      log('del-last', { userId, id: last.id, category: last.category });
      return res.status(200).json({ ok: true });
    }

    // ── Aqlli intentlar: qarz qaytishi, qarz yaratish va reja ──
    if (text) {
      const debtSettlementIntent = parseDebtSettlementIntent(text);
      if (debtSettlementIntent) {
        try {
          const result = await saveDebtSettlementIntent(userId, chatId, debtSettlementIntent);
          if (result?.handled) return res.status(200).json({ ok: true });
        } catch (error) {
          await logErr('debt-settlement-intent', error, { userId, text });
          await bot.sendMessage(chatId, `⚠️ Qarz qaytishini qayta ishlashda xatolik: ${esc(error.message || "noma'lum")}`, { parse_mode: 'HTML' }).catch(() => null);
          return res.status(200).json({ ok: true });
        }
      }

      const debtIntent = parseDebtIntent(text);
      if (debtIntent) {
        try {
          await saveDebtIntent(userId, chatId, debtIntent, user);
          return res.status(200).json({ ok: true });
        } catch (error) {
          await logErr('debt-intent', error, { userId, text });
          await bot.sendMessage(chatId, `⚠️ Qarzni saqlashda xatolik: ${esc(error.message || "noma'lum")}`, { parse_mode: 'HTML' }).catch(() => null);
          return res.status(200).json({ ok: true });
        }
      }

      const planIntent = parsePlanIntent(text);
      if (planIntent) {
        try {
          await savePlanIntent(userId, chatId, planIntent, user);
          return res.status(200).json({ ok: true });
        } catch (error) {
          await logErr('plan-intent', error, { userId, text });
          await bot.sendMessage(chatId, `⚠️ Rejani saqlashda xatolik: ${esc(error.message || "noma'lum")}`, { parse_mode: 'HTML' }).catch(() => null);
          return res.status(200).json({ ok: true });
        }
      }
    }

    // ── Ovozli xabar ──
    if (msg.voice) {
      const proc = await bot.sendMessage(chatId, '🎙 Ovozli xabar qabul qilindi...').catch(() => null);

      try {
        if (!openai || (openaiDisabledUntil && Date.now() < openaiDisabledUntil)) {
          const voiceDisabledText = OAI_KEY
            ? '🤖 Ovozli tahlil hozircha vaqtincha ishlamayapti. Matn orqali yozib yuboring.'
            : '🤖 Ovozli tahlil yoqilmagan. Matn orqali yozib yuboring.';
          if (proc) await bot.editMessageText(voiceDisabledText, { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (proc) await bot.editMessageText('⏳ Ovoz tahlil qilinmoqda (Whisper)...', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });

        const voiceBuffer = await downloadTelegramFileBuffer(msg.voice.file_id);
        const spoken = await transcribeVoiceBuffer(voiceBuffer);
        if (!spoken) {
          if (proc) await bot.editMessageText('❌ Ovoz matnga aylanmadi. Qaytadan aniqroq gapirib ko\'ring.', { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        log('voice-text', { userId, spoken });

        if (proc) await bot.editMessageText(`📝 <b>Eshitdim:</b> "${esc(spoken)}"\n⏳ Tahlil qilinmoqda...`, { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }).catch(() => { });

        // Intent parsing (GPT first, then regex)
        let parsed = await gptParse(spoken);
        if (!parsed) parsed = parseText(spoken);

        if (!parsed) {
          if (proc) await bot.editMessageText(`🤷 <b>Tushundim:</b> "${esc(spoken)}"\n\nLekin moliyaviy ma'lumot topa olmadim.\n<i>Masalan: "Taksiga 20 ming berdim" deb ayting.</i>`, { chat_id: chatId, message_id: proc.message_id, parse_mode: 'HTML' }).catch(() => { });
          return res.status(200).json({ ok: true });
        }

        if (proc) await bot.deleteMessage(chatId, proc.message_id).catch(() => { });

        await saveTx(userId, chatId, parsed, null, user.exchange_rate, msg.message_id, spoken);

      } catch (e) {
        await logErr('voice', e, { userId });
        const voiceErrorText = isOpenAIAuthError(e)
          ? '🔐 OpenAI kaliti noto‘g‘ri yoki bekor qilingan. Hozircha matn orqali yozib yuboring.'
          : '😕 Ovozli xabarni qayta ishlashda xatolik yuz berdi. Matn orqali yozib yuboring.';
        if (proc) await bot.editMessageText(voiceErrorText, { chat_id: chatId, message_id: proc.message_id }).catch(() => { });
      } finally {
      }
      return res.status(200).json({ ok: true });
    }

    // ── Matn (rasm bilan yoki yolg'iz) ──
    let parsed = parseText(text);

    // Agar regex matnni taniy olmasa va OpenAI bo'lsa, GPT dan so'rab ko'ramiz
    if (!parsed && text.length > 5 && openai) {
      parsed = await gptParse(text);
    }

    if (parsed) {
      let receiptUrl = null;

      if (msg.photo) {
        const procMsg = await bot.sendMessage(chatId, '📸 Chek rasmini yuklanmoqda...').catch(() => null);
        try {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          const photoBuffer = await downloadTelegramFileBuffer(photoId);
          const fileName = `${userId}/${Date.now()}.jpg`;

          const { error: upErr } = await db.storage
            .from('receipts')
            .upload(fileName, photoBuffer, { contentType: 'image/jpeg' });

          if (upErr) throw upErr;

          const { data: ud } = db.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = ud.publicUrl;

          if (procMsg) await bot.deleteMessage(chatId, procMsg.message_id).catch(() => { });
          log('photo-uploaded', { userId, fileName });
        } catch (e) {
          await logErr('photo', e, { userId });
          if (procMsg) {
            await bot.editMessageText(
              '⚠️ Rasmni saqlashda xatolik.\nTranzaksiya yoziladi, chekni ilovadan qo\'shishingiz mumkin.',
              { chat_id: chatId, message_id: procMsg.message_id }
            ).catch(() => { });
          }
        }
      }

      await saveTx(userId, chatId, parsed, receiptUrl, user.exchange_rate, msg.message_id, text);
      return res.status(200).json({ ok: true });
    }

    // ── Rasm matnsiz yuborilgan ──
    if (msg.photo && !parsed) {
      await bot.sendMessage(chatId,
        '⚠️ Rasm tagiga summa va izoh yozishni unutdingiz.\n\n<i>Masalan: 50 ming tushlik</i>',
        { parse_mode: 'HTML' }
      ).catch(() => { });
      return res.status(200).json({ ok: true });
    }

    // ── Tushunilmagan matn ──
    if (text && text !== '/start') {
      await bot.sendMessage(chatId,
        `Tushunmadim 🤔\n\n${GUIDE}`,
        { parse_mode: 'HTML', reply_markup: KB }
      ).catch(() => { });
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    await logErr('handler', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
