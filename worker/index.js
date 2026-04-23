import telegramOpsPkg from "../lib/telegram-ops.cjs";
import subscriptionHelpers from "../public/kassa.subscription.js";
import {
  buildPublicNotificationConfig,
} from "../types/notifications.mjs";
import {
  deactivatePushDeviceRegistration,
  summarizePushDevice,
  upsertPushDevice,
} from "../db/push-devices.mjs";
import { sendNotification } from "../services/notifications/send-notification.mjs";
import {
  buildDailyReportPdf,
  summarizeDailyReport,
} from "../services/reports/daily-report.mjs";

const { createTelegramOps } = telegramOpsPkg;
const SUBSCRIPTION_FIELDS = Array.isArray(subscriptionHelpers?.SUBSCRIPTION_FIELDS)
  ? subscriptionHelpers.SUBSCRIPTION_FIELDS.slice()
  : ["plan_code", "subscription_status", "subscription_start_at", "subscription_end_at", "trial_end_at", "canceled_at", "grace_until"];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function js(code, status = 200) {
  return new Response(code, {
    status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function numFmt(n) {
  return Number(n || 0).toLocaleString("ru-RU");
}

function isoNow() {
  return new Date().toISOString();
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function toSafeChatId(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function isAuthorizedCronRequest(request, env) {
  const headerSecret =
    request.headers.get("x-cron-secret") ||
    request.headers.get("x-internal-secret") ||
    getBearerToken(request);

  return !!env.CRON_SECRET && headerSecret === env.CRON_SECRET;
}

function buildAppConfig(env) {
  return {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || "",
    BOT_USERNAME: String(env.BOT_USERNAME || "").trim().replace(/^@+/, ""),
    ...buildPublicNotificationConfig(env),
  };
}

function buildTgApiUrl(env, method) {
  return `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function getWorkerLogger(env) {
  return createTelegramOps({
    botToken: env?.BOT_TOKEN,
    logChannelId: env?.LOG_CHANNEL_ID,
    adminChatId: firstNonEmpty(env?.ADMIN_NOTIFY_CHAT_ID, env?.OWNER_ID),
    loggingEnabled: env?.TELEGRAM_LOGGING_ENABLED,
    logLevel: env?.LOG_LEVEL || "INFO",
    localLevel: env?.LOCAL_LOG_LEVEL || "ERROR",
    source: "WORKER",
    fetchImpl: fetch,
  });
}

async function tgCall(env, method, payload) {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN yo'q");
  }

  const resp = await fetch(buildTgApiUrl(env, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await resp.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { ok: false, raw };
  }

  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.description || data?.raw || `Telegram HTTP ${resp.status}`);
  }

  return data;
}

async function tgSendMessage(env, chatId, htmlText, extra = {}) {
  const parsedChatId = toSafeChatId(chatId);
  if (!parsedChatId) {
    throw new Error(`Invalid Telegram chat_id: ${chatId}`);
  }

  return tgCall(env, "sendMessage", {
    chat_id: parsedChatId,
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function tgSendDocument(env, chatId, blob, fileName, caption = "", contentType = "application/octet-stream") {
  const parsedChatId = toSafeChatId(chatId);
  if (!parsedChatId) {
    throw new Error(`Invalid Telegram chat_id: ${chatId}`);
  }

  const form = new FormData();
  form.set("chat_id", String(parsedChatId));
  if (caption) form.set("caption", caption);
  if (caption) form.set("parse_mode", "HTML");
  form.set("document", new File([blob], fileName, { type: contentType }));

  const resp = await fetch(buildTgApiUrl(env, "sendDocument"), {
    method: "POST",
    body: form,
  });

  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { ok: false, raw };
  }

  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.description || data?.raw || `Telegram HTTP ${resp.status}`);
  }

  return data;
}

async function tgSendSticker(env, chatId, blob, fileName = "kassa-reminder.webp") {
  const parsedChatId = toSafeChatId(chatId);
  if (!parsedChatId) {
    throw new Error(`Invalid Telegram chat_id: ${chatId}`);
  }

  const form = new FormData();
  form.set("chat_id", String(parsedChatId));
  form.set("sticker", new File([blob], fileName, { type: "image/webp" }));

  const resp = await fetch(buildTgApiUrl(env, "sendSticker"), {
    method: "POST",
    body: form,
  });

  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { ok: false, raw };
  }

  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.description || data?.raw || `Telegram HTTP ${resp.status}`);
  }

  return data;
}

function sbBase(env) {
  if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL yo'q");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY yo'q");
  return `${env.SUPABASE_URL}/rest/v1`;
}

function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SUPABASE_OUTAGE_TTL_MS = 30 * 1000;
const SUPABASE_SCHEMA_CACHE_TTL_MS = 60 * 1000;
const supabaseInfraCircuit = { openUntil: 0, reason: "" };

function sbIsSchemaCacheUnavailable(error) {
  const msg = sbErrorText(error).toLowerCase();
  return (
    msg.includes("pgrst002") ||
    msg.includes("could not query the database for the schema cache") ||
    msg.includes("schema cache")
  );
}

function sbIsTransientInfraError(error) {
  const msg = sbErrorText(error).toLowerCase();
  return (
    sbIsPoolTimeout(error) ||
    sbIsSchemaCacheUnavailable(error) ||
    msg.includes("supabase 502") ||
    msg.includes("supabase 503") ||
    msg.includes("supabase 504") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  );
}

function sbRetryDelay(attempt) {
  return Math.min(1500, 250 * Math.max(1, attempt));
}

function clearSbInfraCircuit() {
  supabaseInfraCircuit.openUntil = 0;
  supabaseInfraCircuit.reason = "";
}

function buildSbCircuitError() {
  const error = new Error(
    `Supabase 503: temporary outage circuit open (${supabaseInfraCircuit.reason || "recent transient infra failure"})`
  );
  error.status = 503;
  error.code = "SUPABASE_CIRCUIT_OPEN";
  return error;
}

function getOpenSbCircuitError() {
  if (supabaseInfraCircuit.openUntil > Date.now()) {
    return buildSbCircuitError();
  }

  if (supabaseInfraCircuit.openUntil > 0) {
    clearSbInfraCircuit();
  }

  return null;
}

function openSbInfraCircuit(error) {
  if (!sbIsTransientInfraError(error)) return;
  const ttlMs = sbIsSchemaCacheUnavailable(error)
    ? SUPABASE_SCHEMA_CACHE_TTL_MS
    : SUPABASE_OUTAGE_TTL_MS;
  supabaseInfraCircuit.openUntil = Math.max(
    supabaseInfraCircuit.openUntil || 0,
    Date.now() + ttlMs
  );
  supabaseInfraCircuit.reason = sbErrorText(error).slice(0, 240);
}

async function sbFetch(env, path, init = {}) {
  const url = `${sbBase(env)}${path}`;
  const { __maxAttempts = 3, ...fetchInit } = init || {};
  let lastError = null;

  const circuitError = getOpenSbCircuitError();
  if (circuitError) throw circuitError;

  for (let attempt = 1; attempt <= __maxAttempts; attempt += 1) {
    try {
      const resp = await fetch(url, {
        ...fetchInit,
        headers: {
          ...sbHeaders(env, fetchInit.headers || {}),
        },
      });

      if (!resp.ok) {
        const raw = await resp.text();
        const error = new Error(`Supabase ${resp.status}: ${raw}`);
        lastError = error;
        const schemaCacheDown = sbIsSchemaCacheUnavailable(error);
        if (attempt < __maxAttempts && sbIsTransientInfraError(error) && !schemaCacheDown) {
          await sleep(sbRetryDelay(attempt));
          continue;
        }
        if (sbIsTransientInfraError(error)) {
          openSbInfraCircuit(error);
        }
        throw error;
      }

      clearSbInfraCircuit();
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) return resp.json();
      return resp.text();
    } catch (error) {
      lastError = error;
      const schemaCacheDown = sbIsSchemaCacheUnavailable(error);
      if (attempt < __maxAttempts && sbIsTransientInfraError(error) && !schemaCacheDown) {
        await sleep(sbRetryDelay(attempt));
        continue;
      }
      if (sbIsTransientInfraError(error)) {
        openSbInfraCircuit(error);
      }
      throw error;
    }
  }

  if (sbIsTransientInfraError(lastError)) {
    openSbInfraCircuit(lastError);
  }
  throw lastError || new Error("Supabase fetch failed");
}

function sbErrorText(error) {
  return String(error?.message || error || "");
}

function sbMissingTable(error, table) {
  const msg = sbErrorText(error).toLowerCase();
  const target = String(table || "").toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes("could not find the table") ||
    msg.includes("relation") ||
    msg.includes("does not exist")
  );
}

function sbMissingColumn(error, column) {
  const msg = sbErrorText(error).toLowerCase();
  const target = String(column || "").toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes("could not find the column") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("unknown column")
  );
}

function sbIsPoolTimeout(error) {
  const msg = sbErrorText(error).toLowerCase();
  return (
    msg.includes("pgrst003") ||
    msg.includes("timed out acquiring connection from connection pool") ||
    msg.includes("connection pool")
  );
}

function hasSubscriptionSchema(row) {
  if (typeof subscriptionHelpers?.hasSubscriptionSchema === "function") {
    return subscriptionHelpers.hasSubscriptionSchema(row || {});
  }
  return SUBSCRIPTION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(row || {}, field));
}

function canUseNotificationFeature(row, featureKey) {
  if (typeof subscriptionHelpers?.canUseNotificationFeature === "function") {
    return subscriptionHelpers.canUseNotificationFeature(row || {}, featureKey, {
      schemaReady: hasSubscriptionSchema(row),
    });
  }
  return { allowed: true, featureKey, degraded: true };
}

function getSubscriptionSnapshot(row) {
  if (typeof subscriptionHelpers?.getSubscriptionSnapshot === "function") {
    return subscriptionHelpers.getSubscriptionSnapshot(row || {}, {
      schemaReady: hasSubscriptionSchema(row),
    });
  }

  return {
    schemaReady: hasSubscriptionSchema(row),
    isPremium: false,
    planCode: "free",
    uiStatusLabel: "Obuna bo'lmagan",
  };
}

const TASHKENT_TIME_ZONE = "Asia/Tashkent";
const DEFAULT_CRON_INTERVAL_MINUTES = 30;
const DEBT_REMINDER_BATCH_SIZE = 300;
const DEBT_REMINDER_SCAN_LIMIT = 5000;
const UZBEK_WEEKDAY_BY_EN_SHORT = Object.freeze({
  sun: "yakshanba",
  mon: "dushanba",
  tue: "seshanba",
  wed: "chorshanba",
  thu: "payshanba",
  fri: "juma",
  sat: "shanba",
});
const EMPTY_REPORT_STICKER_WEBP_BASE64 = `
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
`;

const NOTIFICATION_DEFAULTS = {
  daily_reminder: {
    key: "daily_reminder",
    title: "Kunlik eslatma",
    enabled: true,
    send_time: "09:00",
    timezone: TASHKENT_TIME_ZONE,
    message_template: `🌤 <b>Assalamu aleykum{{name_block}}</b>

Bugungi xarajatlarni kiritib borishni unutmang.
💸 Kirim, chiqim, qarz va rejalaringizni yozsangiz — men ularni tartibli saqlab boraman.

📅 Bugun: {{today}}
🤝 <i>24/7 xizmatingizda man!</i>`,
    config: { window_minutes: 5, batch_size: 100, per_run_limit: 10000 },
  },
  free_daily_reminder: {
    key: "free_daily_reminder",
    title: "Premium taklifi",
    enabled: true,
    send_time: "10:00",
    timezone: TASHKENT_TIME_ZONE,
    message_template: `✨ <b>Assalomu aleykum{{name_block}}</b>

Bugun {{weekday}} va siz hali <b>Premium</b> tarifini faollashtirmagansiz.

Premium bilan:
• hisob-kitoblaringiz yanada tartibli bo'ladi
• qarz va limitlarni qulay nazorat qilasiz
• foydali kunlik eslatmalarni o'z vaqtida olasiz

💎 Moliyaviy tartibni kuchaytirish uchun Premium tarifini yoqib ko'ring.`,
    config: { window_minutes: 5, batch_size: 100, per_run_limit: 10000 },
  },
  daily_report: {
    key: "daily_report",
    title: "Kunlik hisobot",
    enabled: true,
    send_time: "22:00",
    timezone: TASHKENT_TIME_ZONE,
    message_template: `🌙 <b>Kunlik hisobotingiz{{name_block}}</b>

Bugungi kirim-chiqimlaringizni yakunlab, kunlik hisobotingizni tekshirib chiqing.
💸 Agar hali kiritmagan bo'lsangiz, bugungi yozuvlarni hozir qo'shib qo'ying.

📅 Bugun: {{today}}
✅ <i>Kunlik hisobotingizni yopishni unutmang.</i>`,
    config: { window_minutes: 5, batch_size: 100, per_run_limit: 10000 },
  },
  debt_reminder: {
    key: "debt_reminder",
    title: "Qarz eslatmasi",
    enabled: true,
    send_time: null,
    timezone: TASHKENT_TIME_ZONE,
    message_template: `⏰ <b>Qarz eslatmasi</b>

{{day_label}} <b>{{person_name}}</b> bilan bog'liq qarz vaqti yetdi.
💰 {{amount}} so'm
📌 {{direction}}
🕒 {{when}}{{note_block}}`,
    config: {},
  },
  scheduled_queue: {
    key: "scheduled_queue",
    title: "Scheduled queue",
    enabled: true,
    send_time: null,
    timezone: TASHKENT_TIME_ZONE,
    message_template: null,
    config: {},
  },
};

function mergeNotificationSetting(rowOrKey, patch = null) {
  const row = typeof rowOrKey === "string" ? { key: rowOrKey } : (rowOrKey || {});
  const base = NOTIFICATION_DEFAULTS[row.key] || null;
  if (!base) return null;
  return {
    ...base,
    ...row,
    ...(patch || {}),
    key: base.key,
    enabled: (patch && typeof patch.enabled === "boolean") ? patch.enabled : (typeof row.enabled === "boolean" ? row.enabled : base.enabled),
    send_time: (patch && Object.prototype.hasOwnProperty.call(patch, "send_time"))
      ? (patch.send_time ? normalizeNotifTime(patch.send_time, base.send_time || "09:00") : null)
      : (row.send_time ? normalizeNotifTime(row.send_time, base.send_time || "09:00") : base.send_time),
    timezone: String((patch && patch.timezone) ?? row.timezone ?? base.timezone),
    message_template: (patch && Object.prototype.hasOwnProperty.call(patch, "message_template"))
      ? patch.message_template
      : (row.message_template == null ? base.message_template : row.message_template),
    config: {
      ...(base.config || {}),
      ...(row.config || {}),
      ...((patch && patch.config) || {}),
    },
  };
}

function normalizeNotifTime(value, fallback = "09:00") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/) || raw.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = match[3] == null ? 0 : Number(match[3]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || !Number.isInteger(ss) || hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return fallback;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function renderTemplate(template, vars = {}) {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(vars[key] ?? ""));
}

async function sbGetNotificationSettings(env) {
  try {
    const rows = await sbFetch(env, `/notification_settings?select=key,title,enabled,send_time,timezone,message_template,config,last_sent_at,updated_at`);
    const list = Array.isArray(rows) ? rows : [];
    const latestByKey = new Map();
    list.forEach((row) => {
      const prev = latestByKey.get(row.key);
      const prevTs = new Date(prev?.updated_at || prev?.last_sent_at || 0).getTime() || 0;
      const nextTs = new Date(row?.updated_at || row?.last_sent_at || 0).getTime() || 0;
      if (!prev || nextTs >= prevTs) latestByKey.set(row.key, row);
    });
    return Object.fromEntries(
      Object.keys(NOTIFICATION_DEFAULTS).map((key) => [key, mergeNotificationSetting(latestByKey.get(key) || key)])
    );
  } catch (error) {
    if (sbMissingTable(error, "notification_settings")) {
      return Object.fromEntries(
        Object.keys(NOTIFICATION_DEFAULTS).map((key) => [key, mergeNotificationSetting(key)])
      );
    }
    throw error;
  }
}

async function sbTouchNotificationSetting(env, key, payload = {}) {
  try {
    await sbFetch(env, `/notification_settings?key=eq.${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!sbMissingTable(error, "notification_settings")) throw error;
  }
}

async function sbInsertNotificationLog(env, row) {
  try {
    await sbFetch(env, `/notification_logs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (error) {
    if (!sbMissingTable(error, "notification_logs")) throw error;
  }
}

function getTimeZoneParts(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const safeTimeZone = String(timeZone || TASHKENT_TIME_ZONE);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year || 0),
    month: Number(map.month || 0),
    day: Number(map.day || 0),
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    second: Number(map.second || 0),
  };
}

function getTimeZoneOffsetMillis(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const date = new Date(value);
  const zoned = new Date(date.toLocaleString("en-US", { timeZone: String(timeZone || TASHKENT_TIME_ZONE) }));
  return zoned.getTime() - date.getTime();
}

function dateKeyInZone(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function dayStartUtcIsoInZone(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  const approxUtc = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0));
  const offsetMs = getTimeZoneOffsetMillis(approxUtc, timeZone);
  return new Date(approxUtc.getTime() - offsetMs).toISOString();
}

function parseCronIntervalMinutes(expression) {
  const cron = String(expression || "").trim();
  if (!cron) return null;

  const [minuteField] = cron.split(/\s+/);
  if (!minuteField) return null;
  if (minuteField === "*") return 1;

  const stepMatch = minuteField.match(/^\*\/(\d{1,3})$/);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    return Number.isFinite(step) && step > 0 ? step : null;
  }

  if (/^\d{1,2}(,\d{1,2})+$/.test(minuteField)) {
    const values = minuteField
      .split(",")
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (values.length > 1) {
      let minDiff = 60;
      for (let i = 1; i < values.length; i += 1) {
        minDiff = Math.min(minDiff, values[i] - values[i - 1]);
      }
      minDiff = Math.min(minDiff, 60 - values[values.length - 1] + values[0]);
      return minDiff > 0 ? minDiff : null;
    }
  }

  if (/^\d{1,2}$/.test(minuteField)) return 60;
  return null;
}

function resolveDailyWindowMinutes(setting, meta = {}) {
  const baseWindow = Math.max(1, Number(setting?.config?.window_minutes || 5));
  const configuredInterval = Math.max(0, Number(setting?.config?.cron_interval_minutes || 0));
  const inferredInterval = Math.max(
    0,
    Number(
      parseCronIntervalMinutes(
        meta?.cron || meta?.cronExpression || meta?.schedule || meta?.cronSchedule || ""
      ) || 0
    )
  );
  const effectiveInterval = inferredInterval || configuredInterval || DEFAULT_CRON_INTERVAL_MINUTES;
  return Math.max(baseWindow, effectiveInterval || baseWindow);
}

function isDailyReminderWindow(value = new Date(), sendTime = "09:00", windowMinutes = 5, timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  const [hh, mm] = normalizeNotifTime(sendTime, "09:00").split(":").map(Number);
  const currentMinutes = p.hour * 60 + p.minute;
  const targetMinutes = hh * 60 + mm;
  return currentMinutes >= targetMinutes && currentMinutes < targetMinutes + Math.max(1, Number(windowMinutes || 5));
}

function timeInZoneLabel(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function toUzDateTime(value, timeZone = TASHKENT_TIME_ZONE) {
  if (!value) return "belgilangan vaqt";
  try {
    return new Date(value).toLocaleString("uz-UZ", { timeZone: String(timeZone || TASHKENT_TIME_ZONE) });
  } catch {
    return new Date(value).toLocaleString("uz-UZ");
  }
}

function uzDateKey(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  return dateKeyInZone(value, timeZone);
}

function uzDayStartUtcIso(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  return dayStartUtcIsoInZone(value, timeZone);
}

function uzNextDayStartUtcIso(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  const approxUtc = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0, 0));
  const offsetMs = getTimeZoneOffsetMillis(approxUtc, timeZone);
  return new Date(approxUtc.getTime() - offsetMs).toISOString();
}

function getUzbekWeekdayLabel(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const safeTimeZone = String(timeZone || TASHKENT_TIME_ZONE);

  try {
    const weekdayKey = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTimeZone,
      weekday: "short",
    })
      .format(new Date(value))
      .slice(0, 3)
      .toLowerCase();
    if (UZBEK_WEEKDAY_BY_EN_SHORT[weekdayKey]) {
      return UZBEK_WEEKDAY_BY_EN_SHORT[weekdayKey];
    }
  } catch {}

  try {
    const localized = new Intl.DateTimeFormat("uz-UZ", {
      timeZone: safeTimeZone,
      weekday: "long",
    }).format(new Date(value));
    return String(localized || "").trim().toLowerCase() || "bugun";
  } catch {
    return "bugun";
  }
}

function buildDailyReminderText(setting, fullName = "", now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.daily_reminder.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;

  return renderTemplate(template, {
    name_block: String(fullName || "").trim() ? `, <b>${esc(fullName)}</b>` : "",
    today: esc(new Date(now).toLocaleDateString("uz-UZ", { timeZone })),
  });
}

function buildDailyReportText(setting, fullName = "", now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.daily_report.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;

  return renderTemplate(template, {
    name_block: String(fullName || "").trim() ? `, <b>${esc(fullName)}</b>` : "",
    today: esc(new Date(now).toLocaleDateString("uz-UZ", { timeZone })),
  });
}

function buildFreeDailyReminderText(setting, fullName = "", now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.free_daily_reminder.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;
  const weekday = getUzbekWeekdayLabel(now, timeZone);

  return renderTemplate(template, {
    name_block: String(fullName || "").trim() ? `, <b>${esc(fullName)}</b>` : "",
    today: esc(new Date(now).toLocaleDateString("uz-UZ", { timeZone })),
    weekday: esc(weekday || "bugun"),
  });
}

function buildDailyReportCaption(fullName = "", summary = {}, now = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const nameBlock = String(fullName || "").trim() ? `, <b>${esc(fullName)}</b>` : "";
  return `🌙 <b>Kunlik hisobotingiz${nameBlock}</b>

📅 Bugun: ${esc(new Date(now).toLocaleDateString("uz-UZ", { timeZone }))}
📥 Kirim: <b>+${numFmt(summary.income || 0)} so'm</b>
📤 Chiqim: <b>-${numFmt(summary.expense || 0)} so'm</b>
🧾 Tranzaksiyalar: <b>${Number(summary.transactionsCount || 0)} ta</b>
🤝 Qarzlar: <b>${Number(summary.debtsCount || 0)} ta</b>
🎯 Rejalar: <b>${Number(summary.plansCount || 0)} ta</b>`;
}

function buildEmptyDailyReportText(fullName = "", now = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const nameBlock = String(fullName || "").trim() ? `, <b>${esc(fullName)}</b>` : "";
  return `🌙 <b>Bugungi kunda faoliyat ko'rinmadi${nameBlock}</b>

📅 Sana: ${esc(new Date(now).toLocaleDateString("uz-UZ", { timeZone }))}

Kun davomida kirim-chiqimlar, qarzlar yoki rejalar kiritilmadi.
Moliyaviy hisobotingizni to'g'ri shakllantirib borish uchun hozir barchasini kiritishning ayni vaqti.

✨ Har bir yozuv ertangi qarorlaringizni aniqroq qiladi.`;
}

function buildDebtReminderText(setting, debt, targetDate, now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.debt_reminder.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;
  const vars = {
    day_label: targetDate && uzDateKey(targetDate, timeZone) === uzDateKey(now, timeZone) ? "Bugun" : "Eslatma",
    person_name: esc(debt.person_name || "Noma'lum"),
    amount: numFmt(debt.amount || 0),
    direction: debt.direction === "payable" ? "Siz qaytarishingiz kerak" : "Sizga qaytishi kerak",
    when: esc(targetDate ? toUzDateTime(targetDate, timeZone) : "belgilangan vaqt"),
    note_block: debt.note ? `
📝 ${esc(debt.note)}` : "",
  };
  return renderTemplate(template, vars);
}

async function sbInsertNotificationJob(env, row) {
  return sbFetch(env, `/notification_jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
}

async function sbGetDueJobs(env, limit = 50) {
  const now = encodeURIComponent(isoNow());
  return sbFetch(
    env,
    `/notification_jobs?select=id,user_id,type,title,body,payload,scheduled_for,status,attempts,created_at` +
    `&status=eq.pending` +
    `&scheduled_for=lte.${now}` +
    `&order=scheduled_for.asc` +
    `&limit=${limit}`
  );
}

async function sbClaimJob(env, job) {
  const nextAttempts = Number(job.attempts || 0) + 1;
  const claimed = await sbFetch(
    env,
    `/notification_jobs?id=eq.${job.id}&status=eq.pending&select=id,status,attempts`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: "processing",
        attempts: nextAttempts,
        last_attempt_at: isoNow(),
      }),
    }
  );

  return Array.isArray(claimed) ? claimed[0] || null : null;
}

async function sbMarkJobSent(env, jobId) {
  return sbFetch(env, `/notification_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "sent",
      sent_at: isoNow(),
      fail_reason: null,
    }),
  });
}

async function sbMarkJobFailed(env, jobId, reason) {
  return sbFetch(env, `/notification_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "failed",
      fail_reason: String(reason || "Unknown error").slice(0, 2000),
    }),
  });
}

function renderNotificationText(job) {
  const title = isNonEmptyString(job.title) ? `<b>${esc(job.title)}</b>\n\n` : "";
  const body = esc(job.body || "");
  const payload = job.payload && typeof job.payload === "object" ? job.payload : {};
  const footer =
    payload?.footer && isNonEmptyString(payload.footer)
      ? `\n\n${esc(payload.footer)}`
      : "";

  return `${title}${body}${footer}`.trim();
}

function buildDeliveryMeta(delivery, extra = {}) {
  return {
    ...extra,
    provider: delivery?.provider || null,
    fallback_provider: delivery?.fallbackProvider || null,
    fallback_used: delivery?.fallbackUsed === true,
    delivered_count: Number(delivery?.deliveredCount || 0),
    target_count: Number(delivery?.targetCount || 0),
    invalid_token_count: Number(delivery?.invalidTokenCount || 0),
    primary_provider: delivery?.primaryProvider || null,
  };
}

async function processDueNotifications(env, meta = {}) {
  const settings = meta.settings || await sbGetNotificationSettings(env);
  const queueSetting = settings.scheduled_queue || mergeNotificationSetting("scheduled_queue");

  if (queueSetting.enabled === false) {
    return {
      ok: true,
      source: meta.source || "manual",
      total_due: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      note: "scheduled queue disabled",
    };
  }

  let dueJobs;
  try {
    dueJobs = await sbGetDueJobs(env, 50);
  } catch (error) {
    if (sbMissingTable(error, "notification_jobs")) {
      return {
        ok: true,
        source: meta.source || "manual",
        total_due: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        note: "notification_jobs table missing",
      };
    }
    throw error;
  }

  const result = {
    ok: true,
    source: meta.source || "manual",
    total_due: Array.isArray(dueJobs) ? dueJobs.length : 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (!Array.isArray(dueJobs) || dueJobs.length === 0) {
    return result;
  }

  for (const job of dueJobs) {
    try {
      const claimed = await sbClaimJob(env, job);

      if (!claimed) {
        result.skipped += 1;
        continue;
      }

      const textToSend = renderNotificationText(job);
      const delivery = await sendNotification(env, {
        userId: job.user_id,
        title: job.title || "Kassa",
        body: job.body || "",
        html: textToSend,
        type: job.type || "custom",
        clickUrl: String(job?.payload?.url || job?.payload?.link || "/").trim() || "/",
        tag: `notification-job-${job.id}`,
        data: {
          ...(job.payload && typeof job.payload === "object" ? job.payload : {}),
          url: String(job?.payload?.url || job?.payload?.link || "/").trim() || "/",
          job_id: String(job.id),
          scheduled_for: job.scheduled_for || "",
        },
      });
      if (!delivery.ok) {
        throw new Error(delivery.error || delivery.reason || "Notification delivery failed");
      }

      await sbMarkJobSent(env, job.id);
      await sbInsertNotificationLog(env, {
        setting_key: "scheduled_queue",
        user_id: job.user_id,
        job_id: job.id,
        status: "sent",
        message_text: textToSend,
        sent_at: isoNow(),
        meta: buildDeliveryMeta(delivery, {
          type: job.type || "custom",
          scheduled_for: job.scheduled_for || null,
        }),
      });
      await sbTouchNotificationSetting(env, "scheduled_queue", { last_sent_at: isoNow() });
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        id: job.id,
        error: error?.message || String(error),
      });

      try {
        await sbMarkJobFailed(env, job.id, error?.message || String(error));
        await sbInsertNotificationLog(env, {
          setting_key: "scheduled_queue",
          user_id: job.user_id,
          job_id: job.id,
          status: "failed",
          message_text: renderNotificationText(job),
          error_text: error?.message || String(error),
          sent_at: isoNow(),
          meta: buildDeliveryMeta(null, {
            type: job.type || "custom",
            scheduled_for: job.scheduled_for || null,
          }),
        });
      } catch (patchError) {
        result.errors.push({
          id: job.id,
          error: `Mark failed error: ${patchError?.message || String(patchError)}`,
        });
      }
    }
  }

  return result;
}

async function fetchUsersForDailyReminderPage(env, dayStartIso, { afterUserId = null, limit = 100 } = {}) {
  const encodedOr = encodeURIComponent(`(last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${dayStartIso})`);
  const cursor = afterUserId != null ? `&user_id=gt.${encodeURIComponent(afterUserId)}` : "";
  const subscriptionSelect = SUBSCRIPTION_FIELDS.join(",");
  const enabledFilter = `&daily_reminder_enabled=eq.true`;

  try {
    const rows = await sbFetch(
      env,
      `/users?select=user_id,full_name,daily_reminder_enabled,last_daily_reminder_at,${subscriptionSelect}&or=${encodedOr}${enabledFilter}${cursor}&order=user_id.asc&limit=${limit}`
    );
    return { rows, migrationRequired: null };
  } catch (error) {
    if (sbMissingColumn(error, "daily_reminder_enabled") || SUBSCRIPTION_FIELDS.some((field) => sbMissingColumn(error, field))) {
      const safeEnabledFilter = sbMissingColumn(error, "daily_reminder_enabled") ? "" : enabledFilter;
      const rows = await sbFetch(
        env,
        `/users?select=user_id,full_name,last_daily_reminder_at&or=${encodedOr}${safeEnabledFilter}${cursor}&order=user_id.asc&limit=${limit}`
      );
      return { rows, migrationRequired: null };
    }

    if (sbMissingColumn(error, "last_daily_reminder_at")) {
      return { rows: [], migrationRequired: "users.last_daily_reminder_at missing" };
    }

    throw error;
  }
}

async function markDailyReminderSent(env, userId, nowIso) {
  try {
    await sbFetch(env, `/users?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_daily_reminder_at: nowIso }),
    });
  } catch (error) {
    if (sbMissingColumn(error, "last_daily_reminder_at")) return;
    throw error;
  }
}

async function fetchUsersForDailyReportPage(env, dayStartIso, { afterUserId = null, limit = 100 } = {}) {
  const encodedOr = encodeURIComponent(`(last_daily_report_at.is.null,last_daily_report_at.lt.${dayStartIso})`);
  const cursor = afterUserId != null ? `&user_id=gt.${encodeURIComponent(afterUserId)}` : "";
  const subscriptionSelect = SUBSCRIPTION_FIELDS.join(",");
  const enabledFilter = `&daily_reminder_enabled=eq.true`;

  try {
    const rows = await sbFetch(
      env,
      `/users?select=user_id,full_name,daily_reminder_enabled,last_daily_report_at,${subscriptionSelect}&or=${encodedOr}${enabledFilter}${cursor}&order=user_id.asc&limit=${limit}`
    );
    return { rows, migrationRequired: null };
  } catch (error) {
    if (sbMissingColumn(error, "daily_reminder_enabled") || SUBSCRIPTION_FIELDS.some((field) => sbMissingColumn(error, field))) {
      const safeEnabledFilter = sbMissingColumn(error, "daily_reminder_enabled") ? "" : enabledFilter;
      const rows = await sbFetch(
        env,
        `/users?select=user_id,full_name,last_daily_report_at&or=${encodedOr}${safeEnabledFilter}${cursor}&order=user_id.asc&limit=${limit}`
      );
      return { rows, migrationRequired: null };
    }

    if (sbMissingColumn(error, "last_daily_report_at")) {
      return { rows: [], migrationRequired: "users.last_daily_report_at missing" };
    }

    throw error;
  }
}

async function markDailyReportSent(env, userId, nowIso) {
  try {
    await sbFetch(env, `/users?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_daily_report_at: nowIso }),
    });
  } catch (error) {
    if (sbMissingColumn(error, "last_daily_report_at")) return;
    throw error;
  }
}

function buildTelegramDeliveryMeta(messageId, extra = {}) {
  return buildDeliveryMeta(
    {
      provider: "telegram",
      deliveredCount: 1,
      targetCount: 1,
    },
    {
      telegram_message_id: messageId || null,
      ...extra,
    }
  );
}

async function fetchDailyReportTransactions(env, userId, dayStartIso, dayEndIso) {
  try {
    const rows = await sbFetch(
      env,
      `/transactions?select=*&user_id=eq.${encodeURIComponent(userId)}` +
      `&date=gte.${encodeURIComponent(dayStartIso)}` +
      `&date=lt.${encodeURIComponent(dayEndIso)}` +
      `&order=date.asc&limit=1000`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (sbMissingTable(error, "transactions") || sbMissingColumn(error, "date")) return [];
    throw error;
  }
}

async function fetchDailyReportDebts(env, userId, dayStartIso, dayEndIso) {
  try {
    const rows = await sbFetch(
      env,
      `/debts?select=*&user_id=eq.${encodeURIComponent(userId)}` +
      `&created_at=gte.${encodeURIComponent(dayStartIso)}` +
      `&created_at=lt.${encodeURIComponent(dayEndIso)}` +
      `&order=created_at.asc&limit=200`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (sbMissingTable(error, "debts") || sbMissingColumn(error, "created_at")) return [];
    throw error;
  }
}

async function fetchDailyReportPlans(env, userId, dayStartIso, dayEndIso) {
  try {
    const rows = await sbFetch(
      env,
      `/category_limits?select=*&user_id=eq.${encodeURIComponent(userId)}` +
      `&created_at=gte.${encodeURIComponent(dayStartIso)}` +
      `&created_at=lt.${encodeURIComponent(dayEndIso)}` +
      `&order=created_at.asc&limit=200`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (sbMissingTable(error, "category_limits") || sbMissingColumn(error, "created_at")) return [];
    throw error;
  }
}

async function buildDailyReportDataset(env, userId, dayStartIso, dayEndIso) {
  const [transactions, debts, plans] = await Promise.all([
    fetchDailyReportTransactions(env, userId, dayStartIso, dayEndIso),
    fetchDailyReportDebts(env, userId, dayStartIso, dayEndIso),
    fetchDailyReportPlans(env, userId, dayStartIso, dayEndIso),
  ]);

  return {
    transactions,
    debts,
    plans,
  };
}

function decodeBase64ToBytes(value = "") {
  const safe = String(value || "").replace(/\s+/g, "").trim();
  if (!safe) return new Uint8Array(0);
  return Uint8Array.from(atob(safe), (char) => char.charCodeAt(0));
}

function buildEmptyReportStickerBlob() {
  const bytes = decodeBase64ToBytes(EMPTY_REPORT_STICKER_WEBP_BASE64);
  if (!bytes.length) return null;
  return new Blob([bytes], { type: "image/webp" });
}

async function runDailyReminderSegment(env, result, options = {}) {
  const {
    key,
    setting,
    now = new Date(),
    meta = {},
    buildHtml,
    isEligible,
  } = options;

  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;
  const defaultSendTime = key === "free_daily_reminder" ? "10:00" : "09:00";
  const sendTime = setting?.send_time || defaultSendTime;
  const windowMinutes = resolveDailyWindowMinutes(setting, meta);
  const batchSize = Math.max(1, Math.min(1000, Number(setting?.config?.batch_size || 100)));
  const perRunLimit = Math.max(batchSize, Math.min(50000, Number(setting?.config?.per_run_limit || 10000)));

  const segment = {
    key,
    checked: 0,
    sent: 0,
    failed: [],
    enabled: setting?.enabled !== false,
    todayKey: uzDateKey(now, timeZone),
    local_now: timeInZoneLabel(now, timeZone),
    time_zone: timeZone,
    scheduled_for: `${sendTime} ${timeZone}`,
    window_open: isDailyReminderWindow(now, sendTime, windowMinutes, timeZone),
    batch_size: batchSize,
    per_run_limit: perRunLimit,
    effective_window_minutes: windowMinutes,
  };
  result.segments[key] = segment;

  if (setting?.enabled === false) {
    segment.note = `${key} disabled`;
    return;
  }

  if (!segment.window_open) {
    segment.note = `outside ${key} window`;
    return;
  }

  const nowIso = new Date(now).toISOString();
  const dayStartIso = uzDayStartUtcIso(now, timeZone);
  segment.day_start_utc = dayStartIso;

  let lastUserId = null;
  let totalScanned = 0;

  while (totalScanned < perRunLimit) {
    const pageLimit = Math.min(batchSize, perRunLimit - totalScanned);

    let page;
    try {
      page = await fetchUsersForDailyReminderPage(env, dayStartIso, {
        afterUserId: lastUserId,
        limit: pageLimit,
      });
    } catch (error) {
      if (sbMissingTable(error, "users")) {
        segment.note = "users table missing";
        return;
      }
      throw error;
    }

    if (page?.migrationRequired) {
      segment.note = page.migrationRequired;
      return;
    }

    const rawRows = Array.isArray(page?.rows) ? page.rows : [];
    if (!rawRows.length) break;

    totalScanned += rawRows.length;
    lastUserId = rawRows[rawRows.length - 1]?.user_id ?? lastUserId;

    const candidates = rawRows.filter((row) => {
      if (!row || !toSafeChatId(row.user_id) || row.daily_reminder_enabled === false) return false;
      const snapshot = getSubscriptionSnapshot(row);
      return isEligible({ row, snapshot });
    });

    segment.checked += candidates.length;
    result.checked += candidates.length;

    for (const row of candidates) {
      const snapshot = getSubscriptionSnapshot(row);
      const html = buildHtml(setting, row.full_name, now, snapshot);

      try {
        const delivery = await sendNotification(env, {
          userId: row.user_id,
          html,
          title: setting.title || (key === "free_daily_reminder" ? "Premium taklifi" : "Kunlik eslatma"),
          type: key,
          clickUrl: "/",
          tag: `${key.replace(/_/g, "-")}-${row.user_id}`,
          data: {
            url: "/",
            setting_key: key,
          },
        });
        if (!delivery.ok) {
          throw new Error(delivery.error || delivery.reason || "Notification delivery failed");
        }

        await markDailyReminderSent(env, row.user_id, nowIso);
        await sbInsertNotificationLog(env, {
          setting_key: key,
          user_id: row.user_id,
          status: "sent",
          message_text: html,
          sent_at: nowIso,
          meta: buildDeliveryMeta(delivery, {
            send_time: sendTime,
            source: meta.source || "scheduled",
            batch_size: batchSize,
            segment: key,
            plan_code: snapshot?.planCode || null,
          }),
        });

        segment.sent += 1;
        result.sent += 1;
      } catch (error) {
        const failure = {
          user_id: row.user_id,
          error: error?.message || String(error),
          setting_key: key,
        };
        segment.failed.push(failure);
        result.failed.push(failure);

        await sbInsertNotificationLog(env, {
          setting_key: key,
          user_id: row.user_id,
          status: "failed",
          message_text: html,
          error_text: error?.message || String(error),
          sent_at: nowIso,
          meta: buildDeliveryMeta(null, {
            send_time: sendTime,
            source: meta.source || "scheduled",
            batch_size: batchSize,
            segment: key,
            plan_code: snapshot?.planCode || null,
          }),
        });
      }
    }

    if (rawRows.length < pageLimit) break;
  }

  if (segment.sent > 0) {
    await sbTouchNotificationSetting(env, key, { last_sent_at: nowIso });
  }

  if (totalScanned >= perRunLimit) {
    segment.note = `per_run_limit reached (${perRunLimit})`;
  }
}

function summarizeDailyReminderSegment(segment = {}) {
  return {
    enabled: segment?.enabled !== false,
    window_open: segment?.window_open === true,
    checked: Number(segment?.checked || 0),
    sent: Number(segment?.sent || 0),
    failed: Array.isArray(segment?.failed) ? segment.failed.length : 0,
    today_key: segment?.todayKey || null,
    local_now: segment?.local_now || null,
    time_zone: segment?.time_zone || null,
    scheduled_for: segment?.scheduled_for || null,
    batch_size: Number(segment?.batch_size || 0) || null,
    per_run_limit: Number(segment?.per_run_limit || 0) || null,
    effective_window_minutes: Number(segment?.effective_window_minutes || 0) || null,
    note: segment?.note || null,
  };
}

async function logDailyReminderSegment(env, key, segment, meta = {}) {
  if (!segment) return;

  const logger = getWorkerLogger(env);
  const payload = {
    ...summarizeDailyReminderSegment(segment),
    source: meta.source || "scheduled",
    cron: meta.cron || null,
    scheduledTime: meta.scheduledTime || null,
    setting_key: key,
  };

  if (Array.isArray(segment.failed) && segment.failed.length > 0) {
    await logger.error({
      scope: `notifications.${key}`,
      message: `${key} xatolar bilan yakunlandi`,
      payload: {
        ...payload,
        failures: segment.failed.slice(0, 10),
      },
    }).catch(() => {});
    return;
  }

  if (Number(segment.sent || 0) > 0) {
    await logger.success({
      scope: `notifications.${key}`,
      message: `${key} muvaffaqiyatli yuborildi`,
      payload,
    }).catch(() => {});
    return;
  }

  if (segment.window_open === true) {
    await logger.info({
      scope: `notifications.${key}`,
      message: `${key} uchun yuboriladigan foydalanuvchi topilmadi`,
      payload,
    }).catch(() => {});
  }
}

async function processDailyReminders(env, now = new Date(), meta = {}) {
  const settings = meta.settings || await sbGetNotificationSettings(env);
  const premiumSetting = settings.daily_reminder || mergeNotificationSetting("daily_reminder");
  const freeSetting = settings.free_daily_reminder || mergeNotificationSetting("free_daily_reminder");

  const result = {
    checked: 0,
    sent: 0,
    failed: [],
    todayKey: uzDateKey(now, TASHKENT_TIME_ZONE),
    local_now: timeInZoneLabel(now, TASHKENT_TIME_ZONE),
    time_zone: TASHKENT_TIME_ZONE,
    segments: {},
  };

  await runDailyReminderSegment(env, result, {
    key: "daily_reminder",
    setting: premiumSetting,
    now,
    meta,
    buildHtml: buildDailyReminderText,
    isEligible: ({ row, snapshot }) => (
      snapshot?.schemaReady === true &&
      snapshot?.isPremium === true &&
      canUseNotificationFeature(row, "daily_reminder").allowed
    ),
  });

  await runDailyReminderSegment(env, result, {
    key: "free_daily_reminder",
    setting: freeSetting,
    now,
    meta,
    buildHtml: buildFreeDailyReminderText,
    isEligible: ({ snapshot }) => snapshot?.schemaReady === true && snapshot?.isPremium !== true,
  });

  await logDailyReminderSegment(env, "free_daily_reminder", result.segments.free_daily_reminder, meta);

  result.window_open = Object.values(result.segments).some((segment) => segment.window_open === true);
  if (!result.window_open) {
    result.note = "outside daily reminder windows";
  }

  return result;
}

async function processDailyReports(env, now = new Date(), meta = {}) {
  const settings = meta.settings || await sbGetNotificationSettings(env);
  const reportSetting = settings.daily_report || mergeNotificationSetting("daily_report");

  const timeZone = reportSetting?.timezone || TASHKENT_TIME_ZONE;
  const sendTime = reportSetting?.send_time || "22:00";
  const windowMinutes = resolveDailyWindowMinutes(reportSetting, meta);

  const batchSize = Math.max(1, Math.min(1000, Number(reportSetting?.config?.batch_size || 100)));
  const perRunLimit = Math.max(batchSize, Math.min(50000, Number(reportSetting?.config?.per_run_limit || 10000)));

  const result = {
    checked: 0,
    sent: 0,
    empty_state_sent: 0,
    failed: [],
    todayKey: uzDateKey(now, timeZone),
    local_now: timeInZoneLabel(now, timeZone),
    time_zone: timeZone,
    scheduled_for: `${sendTime} ${timeZone}`,
    window_open: isDailyReminderWindow(now, sendTime, windowMinutes, timeZone),
    batch_size: batchSize,
    per_run_limit: perRunLimit,
    effective_window_minutes: windowMinutes,
  };

  if (reportSetting.enabled === false) {
    result.note = "daily report disabled";
    return result;
  }

  if (!result.window_open) {
    result.note = "outside daily report window";
    return result;
  }

  const nowIso = new Date(now).toISOString();
  const dayStartIso = uzDayStartUtcIso(now, timeZone);
  const dayEndIso = uzNextDayStartUtcIso(now, timeZone);
  result.day_start_utc = dayStartIso;
  result.day_end_utc = dayEndIso;

  let lastUserId = null;
  let totalScanned = 0;

  while (totalScanned < perRunLimit) {
    const pageLimit = Math.min(batchSize, perRunLimit - totalScanned);

    let page;
    try {
      page = await fetchUsersForDailyReportPage(env, dayStartIso, {
        afterUserId: lastUserId,
        limit: pageLimit,
      });
    } catch (error) {
      if (sbMissingTable(error, "users")) {
        result.note = "users table missing";
        return result;
      }
      throw error;
    }

    if (page?.migrationRequired) {
      result.note = page.migrationRequired;
      return result;
    }

    const rawRows = Array.isArray(page?.rows) ? page.rows : [];
    if (!rawRows.length) break;

    totalScanned += rawRows.length;
    lastUserId = rawRows[rawRows.length - 1]?.user_id ?? lastUserId;

    const candidates = rawRows.filter((row) => {
      if (!row || !toSafeChatId(row.user_id) || row.daily_reminder_enabled === false) return false;
      const snapshot = getSubscriptionSnapshot(row);
      return (
        snapshot?.schemaReady === true &&
        snapshot?.isPremium === true &&
        canUseNotificationFeature(row, "daily_report").allowed
      );
    });

    result.checked += candidates.length;

    for (const row of candidates) {
      try {
        const dataset = await buildDailyReportDataset(env, row.user_id, dayStartIso, dayEndIso);
        const summary = summarizeDailyReport(dataset);
        const hasActivity = Number(summary.totalActivities || 0) > 0;

        let messageText = "";
        let deliveryMeta = null;

        if (hasActivity) {
          const pdfBytes = buildDailyReportPdf(dataset, {
            generatedAt: now,
            timeZone,
            fullName: row.full_name || "",
          });
          const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
          const caption = buildDailyReportCaption(row.full_name, summary, now, timeZone);
          const fileName = `Kassa_daily_${result.todayKey}.pdf`;
          const tgResult = await tgSendDocument(env, row.user_id, pdfBlob, fileName, caption, "application/pdf");

          messageText = caption;
          deliveryMeta = buildTelegramDeliveryMeta(tgResult?.result?.message_id || null, {
            send_time: sendTime,
            source: meta.source || "scheduled",
            batch_size: batchSize,
            report_kind: "pdf",
            transactions_count: summary.transactionsCount,
            debts_count: summary.debtsCount,
            plans_count: summary.plansCount,
            total_activities: summary.totalActivities,
          });
        } else {
          const warningText = buildEmptyDailyReportText(row.full_name, now, timeZone);
          const stickerBlob = buildEmptyReportStickerBlob();
          let stickerResult = null;
          let stickerError = null;

          if (stickerBlob) {
            try {
              stickerResult = await tgSendSticker(env, row.user_id, stickerBlob);
            } catch (error) {
              stickerError = error?.message || String(error);
            }
          }

          const tgResult = await tgSendMessage(env, row.user_id, warningText);
          messageText = warningText;
          deliveryMeta = buildTelegramDeliveryMeta(tgResult?.result?.message_id || null, {
            send_time: sendTime,
            source: meta.source || "scheduled",
            batch_size: batchSize,
            report_kind: "empty_state",
            transactions_count: 0,
            debts_count: 0,
            plans_count: 0,
            total_activities: 0,
            sticker_sent: !!stickerResult,
            sticker_message_id: stickerResult?.result?.message_id || null,
            sticker_error: stickerError,
          });
          result.empty_state_sent += 1;
        }

        await markDailyReportSent(env, row.user_id, nowIso);

        await sbInsertNotificationLog(env, {
          setting_key: "daily_report",
          user_id: row.user_id,
          status: "sent",
          message_text: messageText,
          sent_at: nowIso,
          meta: deliveryMeta,
        });

        result.sent += 1;
      } catch (error) {
        const failure = {
          user_id: row.user_id,
          error: error?.message || String(error),
        };
        result.failed.push(failure);

        await sbInsertNotificationLog(env, {
          setting_key: "daily_report",
          user_id: row.user_id,
          status: "failed",
          message_text: buildDailyReportText(reportSetting, row.full_name, now),
          error_text: error?.message || String(error),
          sent_at: nowIso,
          meta: buildDeliveryMeta(null, {
            send_time: sendTime,
            source: meta.source || "scheduled",
            batch_size: batchSize,
            report_kind: "failed",
          }),
        });
      }
    }

    if (rawRows.length < pageLimit) break;
  }

  if (result.sent > 0) {
    await sbTouchNotificationSetting(env, "daily_report", { last_sent_at: nowIso });
  }

  if (totalScanned >= perRunLimit) {
    result.note = `per_run_limit reached (${perRunLimit})`;
  }

  return result;
}

async function sbFetchDebtReminderPage(env, nowIso, { limit = DEBT_REMINDER_BATCH_SIZE, offset = 0 } = {}) {
  const encodedOr = encodeURIComponent(
    `(and(remind_at.not.is.null,remind_at.lte.${nowIso}),and(remind_at.is.null,due_at.not.is.null,due_at.lte.${nowIso}))`
  );
  return sbFetch(
    env,
    `/debts?select=id,user_id,person_name,amount,direction,due_at,remind_at,note,reminder_sent_at,status,created_at` +
    `&status=eq.open` +
    `&reminder_sent_at=is.null` +
    `&or=${encodedOr}` +
    `&order=remind_at.asc.nullslast,due_at.asc.nullslast,id.asc` +
    `&limit=${limit}` +
    `&offset=${offset}`
  );
}

async function sbClaimDebtReminder(env, debt, claimIso) {
  const claimed = await sbFetch(
    env,
    `/debts?id=eq.${encodeURIComponent(debt.id)}&user_id=eq.${encodeURIComponent(debt.user_id)}&reminder_sent_at=is.null&select=id`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ reminder_sent_at: claimIso }),
    }
  );

  return Array.isArray(claimed) ? claimed[0] || null : null;
}

async function sbReleaseDebtReminder(env, debt, claimIso) {
  return sbFetch(
    env,
    `/debts?id=eq.${encodeURIComponent(debt.id)}&user_id=eq.${encodeURIComponent(debt.user_id)}&reminder_sent_at=eq.${encodeURIComponent(claimIso)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ reminder_sent_at: null }),
    }
  );
}

async function processDebtReminders(env, now = new Date(), meta = {}) {
  const settings = meta.settings || await sbGetNotificationSettings(env);
  const debtSetting = settings.debt_reminder || mergeNotificationSetting("debt_reminder");

  const result = {
    checked: 0,
    due: 0,
    sent: 0,
    skipped: 0,
    failed: [],
  };

  if (debtSetting.enabled === false) {
    result.note = "debt reminder disabled";
    return result;
  }

  const nowIso = new Date(now).toISOString();
  let offset = 0;
  let scanned = 0;

  while (scanned < DEBT_REMINDER_SCAN_LIMIT) {
    let debts;
    try {
      debts = await sbFetchDebtReminderPage(env, nowIso, {
        limit: DEBT_REMINDER_BATCH_SIZE,
        offset,
      });
    } catch (error) {
      if (sbMissingTable(error, "debts")) {
        result.note = "debts table missing";
        return result;
      }
      throw error;
    }

    const items = Array.isArray(debts) ? debts : [];
    if (!items.length) break;

    scanned += items.length;
    result.checked += items.length;
    result.due += items.length;

    for (const debt of items) {
      const target = debt.remind_at || debt.due_at || null;
      const targetDate = target ? new Date(target) : null;
      const text = buildDebtReminderText(debtSetting, debt, targetDate, now);

      try {
        const claimed = await sbClaimDebtReminder(env, debt, nowIso);
        if (!claimed) {
          result.skipped += 1;
          continue;
        }

        const delivery = await sendNotification(env, {
          userId: debt.user_id,
          html: text,
          title: debtSetting.title || "Qarz eslatmasi",
          type: "debt_reminder",
          clickUrl: "/debts",
          tag: `debt-reminder-${debt.id}`,
          data: {
            url: "/debts",
            debt_id: String(debt.id),
            setting_key: "debt_reminder",
          },
        });
        if (!delivery.ok) {
          throw new Error(delivery.error || delivery.reason || "Notification delivery failed");
        }
        await sbInsertNotificationLog(env, {
          setting_key: "debt_reminder",
          user_id: debt.user_id,
          status: "sent",
          message_text: text,
          sent_at: nowIso,
          meta: buildDeliveryMeta(delivery, {
            debt_id: debt.id,
            due_at: debt.due_at || null,
            remind_at: debt.remind_at || null,
          }),
        });
        result.sent += 1;
      } catch (error) {
        result.failed.push({
          id: debt.id,
          user_id: debt.user_id,
          error: error?.message || String(error),
        });
        try {
          await sbReleaseDebtReminder(env, debt, nowIso);
        } catch (_) { }
        await sbInsertNotificationLog(env, {
          setting_key: "debt_reminder",
          user_id: debt.user_id,
          status: "failed",
          message_text: text,
          error_text: error?.message || String(error),
          sent_at: nowIso,
          meta: buildDeliveryMeta(null, {
            debt_id: debt.id,
            due_at: debt.due_at || null,
            remind_at: debt.remind_at || null,
          }),
        });
      }
    }

    if (items.length < DEBT_REMINDER_BATCH_SIZE) break;
    offset += DEBT_REMINDER_BATCH_SIZE;
  }

  if (result.sent > 0) {
    await sbTouchNotificationSetting(env, "debt_reminder", { last_sent_at: nowIso });
  }
  if (scanned >= DEBT_REMINDER_SCAN_LIMIT) {
    result.note = `scan limit reached (${DEBT_REMINDER_SCAN_LIMIT})`;
  }

  return result;
}

function buildCronTaskFailureResult(taskName, error) {
  const message = error?.message || String(error);
  if (taskName === "notifications") {
    return {
      ok: false,
      total_due: 0,
      sent: 0,
      failed: 1,
      skipped: 0,
      errors: [{ task: taskName, error: message }],
      note: `${taskName} failed`,
    };
  }

  return {
    ok: false,
    checked: 0,
    sent: 0,
    failed: [{ task: taskName, error: message }],
    note: `${taskName} failed`,
  };
}

function buildCronTaskSkippedResult(taskName, note, error = null) {
  if (taskName === "notifications") {
    return {
      ok: true,
      total_due: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: error ? [{ task: taskName, error: error?.message || String(error) }] : [],
      note,
    };
  }

  return {
    ok: true,
    checked: 0,
    sent: 0,
    failed: [],
    note,
  };
}

async function runCronTask(taskName, handler) {
  try {
    return await handler();
  } catch (error) {
    return buildCronTaskFailureResult(taskName, error);
  }
}

async function runAllCronJobs(env, meta = {}) {
  const now = new Date();
  const sharedMeta = { ...meta };

  try {
    sharedMeta.settings = await sbGetNotificationSettings(env);
  } catch (error) {
    if (sbIsTransientInfraError(error)) {
      const degradedNote = sbIsSchemaCacheUnavailable(error)
        ? "skipped after Supabase schema cache outage"
        : "skipped after Supabase connection or pool outage";
      return {
        ok: false,
        at: now.toISOString(),
        source: meta.source || "manual",
        cron: meta.cron || null,
        scheduledTime: meta.scheduledTime || null,
        degraded: true,
        notifications: buildCronTaskFailureResult("notifications", error),
        daily: buildCronTaskSkippedResult("daily", degradedNote, error),
        report: buildCronTaskSkippedResult("report", degradedNote, error),
        debts: buildCronTaskSkippedResult("debts", degradedNote, error),
      };
    }
    throw error;
  }

  const notifications = await runCronTask("notifications", () => processDueNotifications(env, sharedMeta));

  if (sbIsTransientInfraError(notifications?.errors?.[0]?.error || notifications?.failed?.[0]?.error || null)) {
    const poolError = new Error(notifications?.errors?.[0]?.error || notifications?.failed?.[0]?.error || "Supabase transient infra error");
    const degradedNote = "skipped after Supabase transient infra error in earlier cron task";
    return {
      ok: false,
      at: now.toISOString(),
      source: meta.source || "manual",
      cron: meta.cron || null,
      scheduledTime: meta.scheduledTime || null,
      degraded: true,
      notifications,
      daily: buildCronTaskSkippedResult("daily", degradedNote, poolError),
      report: buildCronTaskSkippedResult("report", degradedNote, poolError),
      debts: buildCronTaskSkippedResult("debts", degradedNote, poolError),
    };
  }

  const daily = await runCronTask("daily", () => processDailyReminders(env, now, sharedMeta));
  if (sbIsTransientInfraError(daily?.failed?.[0]?.error || null)) {
    const poolError = new Error(daily?.failed?.[0]?.error || "Supabase transient infra error");
    const degradedNote = "skipped after Supabase transient infra error in earlier cron task";
    return {
      ok: false,
      at: now.toISOString(),
      source: meta.source || "manual",
      cron: meta.cron || null,
      scheduledTime: meta.scheduledTime || null,
      degraded: true,
      notifications,
      daily,
      report: buildCronTaskSkippedResult("report", degradedNote, poolError),
      debts: buildCronTaskSkippedResult("debts", degradedNote, poolError),
    };
  }

  const report = await runCronTask("report", () => processDailyReports(env, now, sharedMeta));
  if (sbIsTransientInfraError(report?.failed?.[0]?.error || null)) {
    const poolError = new Error(report?.failed?.[0]?.error || "Supabase transient infra error");
    const degradedNote = "skipped after Supabase transient infra error in earlier cron task";
    return {
      ok: false,
      at: now.toISOString(),
      source: meta.source || "manual",
      cron: meta.cron || null,
      scheduledTime: meta.scheduledTime || null,
      degraded: true,
      notifications,
      daily,
      report,
      debts: buildCronTaskSkippedResult("debts", degradedNote, poolError),
    };
  }

  const debts = await runCronTask("debts", () => processDebtReminders(env, now, sharedMeta));

  return {
    ok:
      notifications?.ok !== false &&
      daily?.ok !== false &&
      report?.ok !== false &&
      debts?.ok !== false,
    at: now.toISOString(),
    source: meta.source || "manual",
    cron: meta.cron || null,
    scheduledTime: meta.scheduledTime || null,
    notifications,
    daily,
    report,
    debts,
  };
}

/* =========================
   Legacy /api/bot adapter
========================= */

const HANDLER_LOADERS = {
  bot: () => import("../api/bot.js"),
  "send-report-files": () => import("../api/send-report-files.js"),
  "send-report-pdf": () => import("../api/send-report-pdf.js"),
};
const LEGACY_HANDLER_CACHE = new Map();

function seedLegacyProcessEnv(env) {
  if (!env || typeof process === "undefined" || !process?.env) return;
  const keys = [
    "BOT_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_KEY",
    "OPENAI_API_KEY",
    "NGROK_API_KEY",
    "ADMIN_IDS",
    "OWNER_ID",
    "CRON_SECRET",
    "CRON_SCHEDULE",
    "CRON_INTERVAL_MINUTES",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_WEBHOOK_SECRET_TOKEN",
    "BOT_WEBHOOK_SECRET",
    "WEBHOOK_SECRET",
    "WEBAPP_URL",
    "VOICE_TRANSCRIBE_URL",
    "VOICE_TRANSCRIBE_PATH",
    "VOICE_TRANSCRIBE_BEARER_TOKEN",
    "VOICE_TRANSCRIBE_MODEL",
    "NGROK_VOICE_ENDPOINT_MATCH",
    "LOG_CHANNEL_ID",
    "TELEGRAM_LOGGING_ENABLED",
    "LOG_LEVEL",
    "LOCAL_LOG_LEVEL",
    "ADMIN_NOTIFY_CHAT_ID",
    "CLIENT_CONSOLE_LOGS_ENABLED",
    "NOTIFICATION_PROVIDER",
];

  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === "string" && value.length && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function resolveLegacyHandler(mod) {
  const candidates = [
    mod,
    mod?.default,
    mod?.handler,
    mod?.default?.default,
    mod?.default?.handler,
  ];
  return candidates.find((item) => typeof item === "function") || null;
}

async function getLegacyHandler(name, env) {
  if (LEGACY_HANDLER_CACHE.has(name)) {
    return LEGACY_HANDLER_CACHE.get(name);
  }

  const loader = HANDLER_LOADERS[name];
  if (!loader) throw new Error(`Unknown legacy handler: ${name}`);

  const handlerPromise = (async () => {
    seedLegacyProcessEnv(env);
    const mod = await loader();
    const handler = resolveLegacyHandler(mod);

    if (typeof handler !== "function") {
      throw new Error(`Legacy handler is not a function: ${name}`);
    }

    return handler;
  })();

  LEGACY_HANDLER_CACHE.set(name, handlerPromise);
  try {
    return await handlerPromise;
  } catch (error) {
    LEGACY_HANDLER_CACHE.delete(name);
    throw error;
  }
}

async function buildLegacyReq(request, env, ctx = null) {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  const rawBody = ["GET", "HEAD"].includes(request.method) ? "" : await request.text();

  let body = undefined;
  if (rawBody) {
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = {};
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(rawBody).entries());
    } else {
      body = rawBody;
    }
  }

  const headersObject = Object.fromEntries(request.headers.entries());

  return {
    method: request.method,
    url: request.url,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: headersObject,
    body,
    rawBody,
    env,
    cf: request.cf || null,
    waitUntil: typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : null,
  };
}

function createLegacyRes(resolve) {
  let statusCode = 200;
  const headers = new Headers();
  let finished = false;

  function finish(payload = "") {
    if (finished) return;
    finished = true;
    resolve(
      new Response(payload, {
        status: statusCode,
        headers,
      })
    );
  }

  return {
    get finished() {
      return finished;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, value);
      return this;
    },
    getHeader(name) {
      return headers.get(name);
    },
    removeHeader(name) {
      headers.delete(name);
      return this;
    },
    json(payload) {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json; charset=utf-8");
      }
      finish(JSON.stringify(payload));
    },
    send(payload = "") {
      if (
        payload &&
        typeof payload === "object" &&
        !(payload instanceof ArrayBuffer) &&
        !(payload instanceof Uint8Array) &&
        !(payload instanceof ReadableStream)
      ) {
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json; charset=utf-8");
        }
        finish(JSON.stringify(payload));
        return;
      }

      finish(payload ?? "");
    },
    end(payload = "") {
      finish(payload);
    },
    redirect(location, code = 302) {
      statusCode = code;
      headers.set("location", location);
      finish("");
    },
  };
}

async function invokeLegacyHandler(name, request, env, ctx = null) {
  const handler = await getLegacyHandler(name, env);
  const req = await buildLegacyReq(request, env, ctx);

  return await new Promise(async (resolve, reject) => {
    const res = createLegacyRes(resolve);

    try {
      const maybeResult = await handler(req, res, env);

      if (res.finished) return;

      if (maybeResult instanceof Response) {
        resolve(maybeResult);
        return;
      }

      if (typeof maybeResult !== "undefined") {
        if (typeof maybeResult === "object") {
          resolve(json(maybeResult));
        } else {
          resolve(new Response(String(maybeResult)));
        }
        return;
      }

      resolve(new Response(null, { status: 204 }));
    } catch (error) {
      reject(error);
    }
  });
}

/* =========================
   Current routes
========================= */

async function handleHealth(env) {
  return json({
    ok: true,
    has_bot_token: !!env.BOT_TOKEN,
    has_supabase_url: !!env.SUPABASE_URL,
    has_supabase_anon_key: !!env.SUPABASE_ANON_KEY,
    has_supabase_service_key: !!env.SUPABASE_SERVICE_ROLE_KEY,
    has_cron_secret: !!env.CRON_SECRET,
    notification_provider: buildPublicNotificationConfig(env).NOTIFICATION_PROVIDER,
    push_notifications_enabled: false,
    compatibility: "cloudflare-worker",
    version: "2.0.0-telegram-only",
  });
}

async function handleDebugTelegram(env) {
  try {
    const data = await tgCall(env, "getMe", {});
    return json({
      ok: true,
      status: 200,
      data,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handleClientLog(request, env) {
  const body = await safeJson(request);
  if (parseBoolean(env?.CLIENT_CONSOLE_LOGS_ENABLED, false)) {
    getWorkerLogger(env).local("INFO", "client-log", body);
  }
  return json({ ok: true });
}

async function handlePushRegister(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await safeJson(request);
    const row = await upsertPushDevice(env, body);
    return json({
      ok: true,
      device: summarizePushDevice(row),
    });
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "push.register",
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => {});
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handlePushUnregister(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await safeJson(request);
    const rows = await deactivatePushDeviceRegistration(env, body);
    const firstRow = Array.isArray(rows) ? rows[0] || null : rows;
    return json({
      ok: true,
      device: firstRow ? summarizePushDevice(firstRow) : null,
    });
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "push.unregister",
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => {});
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handleNotifyMiniAppTx(request, env) {
  if (request.method !== "POST") {
    return json({ ok: true, message: "notify-miniapp-tx ready" });
  }

  try {
    const body = await safeJson(request);

    const userId = body.user_id || body.userId;
    const amount = Number(body.amount || 0);
    const currency = String(body.currency || "UZS").trim().toUpperCase() === "USD" ? "USD" : "UZS";
    const originalAmount = Number(body.original_amount || body.originalAmount || 0);
    const exchangeRateUsed = Number(body.exchange_rate_used || body.exchangeRateUsed || 0);
    const type = String(body.type || "expense") === "income" ? "income" : "expense";
    const category = String(body.category || "Xarajat").trim() || "Xarajat";
    const source = String(body.source || "mini_app").trim() || "mini_app";
    const note = String(body.note || "").trim();
    const receiptUrl = String(body.receipt_url || body.receiptUrl || "").trim();

    const chatId = toSafeChatId(userId);
    if (!chatId) return json({ ok: false, error: "user_id required" }, 400);
    if (!amount) return json({ ok: false, error: "amount required" }, 400);

    const icon = type === "income" ? "🟢" : "🔴";
    const label = type === "income" ? "Kirim" : "Chiqim";
    const amountHtml = currency === "USD" && originalAmount > 0
      ? `${`$${numFmt(originalAmount)}`}\n<i>${numFmt(amount)} so'm${exchangeRateUsed > 0 ? ` · kurs ${numFmt(exchangeRateUsed)}` : ""}</i>`
      : `${numFmt(amount)} so'm`;
    const amountBody = currency === "USD" && originalAmount > 0
      ? `${numFmt(originalAmount)} USD · ${numFmt(amount)} so'm`
      : `${numFmt(amount)} so'm`;

    const lines = [
      `${icon} <b>Mini App orqali yangi operatsiya kiritildi</b>`,
      ``,
      `<b>Turi:</b> ${label}`,
      `<b>Summa:</b> ${amountHtml}`,
      `<b>Kategoriya:</b> ${esc(category)}`,
      `<b>Manba:</b> ${esc(source)}`,
    ];

    if (isNonEmptyString(note)) {
      lines.push(`<b>Izoh:</b> ${esc(note)}`);
    }

    if (isNonEmptyString(receiptUrl)) {
      lines.push(`<b>Chek:</b> mavjud`);
    }

    const delivery = await sendNotification(env, {
      userId: chatId,
      title: "Yangi operatsiya",
      body: `${label}: ${amountBody} · ${category}`,
      html: lines.join("\n"),
      type: "miniapp_tx",
      clickUrl: "/history",
      tag: `miniapp-tx-${chatId}`,
      data: {
        url: "/history",
        tx_type: type,
        source,
        category,
        amount: String(amount),
        currency,
        original_amount: originalAmount > 0 ? String(originalAmount) : "",
      },
    });
    if (!delivery.ok) {
      throw new Error(delivery.error || delivery.reason || "Notification delivery failed");
    }

    return json({
      ok: true,
      provider: delivery.provider,
      fallback_used: delivery.fallbackUsed === true,
      delivered_count: Number(delivery.deliveredCount || 0),
      telegram_message_id: delivery.legacyMessageId || null,
    });
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "notify-miniapp-tx",
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => { });
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handleScheduleNotification(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isAuthorizedCronRequest(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await safeJson(request);

    const userId = toSafeChatId(body.user_id || body.userId);
    const type = String(body.type || "custom").trim() || "custom";
    const title = String(body.title || "").trim();
    const messageBody = String(body.body || body.message || "").trim();
    const scheduledFor = String(body.scheduled_for || body.scheduledFor || "").trim();
    const payload =
      body.payload && typeof body.payload === "object" ? body.payload : {};

    if (!userId) return json({ ok: false, error: "user_id required" }, 400);
    if (!isNonEmptyString(messageBody)) {
      return json({ ok: false, error: "body required" }, 400);
    }
    if (!isNonEmptyString(scheduledFor)) {
      return json({ ok: false, error: "scheduled_for required" }, 400);
    }

    const inserted = await sbInsertNotificationJob(env, {
      user_id: userId,
      type,
      title: title || null,
      body: messageBody,
      payload,
      scheduled_for: scheduledFor,
      status: "pending",
      attempts: 0,
    });

    return json({
      ok: true,
      inserted,
    });
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "notifications.schedule",
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => { });
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handleListDueNotifications(request, env) {
  if (!isAuthorizedCronRequest(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 20)));
    const rows = await sbGetDueJobs(env, limit);
    return json({ ok: true, rows });
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "notifications.due",
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => { });
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handleTestNotification(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isAuthorizedCronRequest(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const body = await safeJson(request);
  try {
    const chatId = toSafeChatId(body.user_id || body.userId);
    if (!chatId) return json({ ok: false, error: "user_id required" }, 400);

    const html = `<b>Test notification</b>\n\nCloudflare cron tizimi ishlayapti ✅`;
    const delivery = await sendNotification(env, {
      userId: chatId,
      title: "Test notification",
      body: "Cloudflare cron tizimi ishlayapti ✅",
      html,
      type: "test_notification",
      clickUrl: "/",
      tag: `test-notification-${chatId}`,
      data: {
        url: "/",
        scope: "notifications.test",
      },
    });
    if (!delivery.ok) {
      throw new Error(delivery.error || delivery.reason || "Notification delivery failed");
    }

    return json({
      ok: true,
      provider: delivery.provider,
      fallback_used: delivery.fallbackUsed === true,
      delivered_count: Number(delivery.deliveredCount || 0),
      telegram_message_id: delivery.legacyMessageId || null,
    });
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "notifications.test",
      user_id: body.user_id || body.userId || null,
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => { });
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

async function handleLoggingTest(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isAuthorizedCronRequest(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const body = await safeJson(request);
  const logger = getWorkerLogger(env);
  const channelId = String(env?.LOG_CHANNEL_ID || "").trim();
  const payload = {
    requested_at: isoNow(),
    log_level: String(env?.LOG_LEVEL || ""),
    logging_enabled: String(env?.TELEGRAM_LOGGING_ENABLED || ""),
    channel_id: channelId || null,
    source: body.source || "manual-logging-test",
  };

  try {
    const sent = await tgSendMessage(
      env,
      channelId,
      `<b>[INFO]</b>\n<b>source:</b> WORKER\n<b>scope:</b> logging-test\n<b>user_id:</b> <code>unknown</code>\n<b>user_name:</b> manual-test\n\n<b>info tafsilotlari:</b>\n<pre>${esc(JSON.stringify(payload, null, 2))}</pre>`
    );

    await logger.info({
      scope: "logging-test",
      message: "Worker logging test muvaffaqiyatli yuborildi",
      payload,
    }).catch(() => {});

    return json({
      ok: true,
      direct_message_id: sent?.result?.message_id || null,
      config: {
        has_bot_token: !!env?.BOT_TOKEN,
        has_log_channel_id: !!channelId,
        logging_enabled: String(env?.TELEGRAM_LOGGING_ENABLED || ""),
        log_level: String(env?.LOG_LEVEL || ""),
      },
    });
  } catch (error) {
    await logger.error({
      scope: "logging-test",
      message: error?.message || String(error),
      payload: { error, ...payload },
    }).catch(() => {});

    return json(
      {
        ok: false,
        error: error?.message || String(error),
        config: {
          has_bot_token: !!env?.BOT_TOKEN,
          has_log_channel_id: !!channelId,
          logging_enabled: String(env?.TELEGRAM_LOGGING_ENABLED || ""),
          log_level: String(env?.LOG_LEVEL || ""),
        },
      },
      500
    );
  }
}

async function handleManualCronRun(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isAuthorizedCronRequest(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const result = await runAllCronJobs(env, { source: "manual" });
    const totalFailures =
      Number(result?.notifications?.failed || 0) +
      Number((result?.daily?.failed || []).length || 0) +
      Number((result?.report?.failed || []).length || 0) +
      Number((result?.debts?.failed || []).length || 0);
    const totalSent =
      Number(result?.notifications?.sent || 0) +
      Number(result?.daily?.sent || 0) +
      Number(result?.report?.sent || 0) +
      Number(result?.debts?.sent || 0);

    if (totalFailures > 0) {
      await getWorkerLogger(env).error({
        scope: "cron.manual",
        message: "Manual cron xatolar bilan yakunlandi",
        payload: result,
      }).catch(() => { });
    } else if (totalSent > 0) {
      await getWorkerLogger(env).success({
        scope: "cron.manual",
        message: "Manual cron muvaffaqiyatli yakunlandi",
        payload: result,
      }).catch(() => { });
    }
    return json(result);
  } catch (error) {
    await getWorkerLogger(env).error({
      scope: "cron.manual",
      message: error?.message || String(error),
      payload: { error },
    }).catch(() => { });
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
}

function requestWantsHtml(request) {
  const accept = request.headers.get("accept") || "";
  return request.method === "GET" && accept.includes("text/html");
}

async function serveAppAsset(request, env) {
  const assetHandler = env?.ASSETS;
  const wantsHtml = requestWantsHtml(request);

  if (assetHandler?.fetch) {
    const assetResponse = await assetHandler.fetch(request);
    if (!wantsHtml || assetResponse.status !== 404) {
      return assetResponse;
    }

    const indexUrl = new URL("/index.html", request.url);
    return assetHandler.fetch(new Request(indexUrl.toString(), request));
  }

  if (wantsHtml) {
    const url = new URL(request.url);
    if (url.pathname !== "/index.html") {
      const redirectUrl = new URL("/index.html", request.url);
      const route = `${url.pathname}${url.search || ""}`;
      redirectUrl.searchParams.set("__kassa_route", route);
      return Response.redirect(redirectUrl.toString(), 302);
    }
  }

  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/config.js") {
        return js(`window.__APP_CONFIG__ = ${JSON.stringify(buildAppConfig(env))};`);
      }

      if (url.pathname === "/api/health") {
        return handleHealth(env);
      }

      if (url.pathname === "/api/debug-telegram") {
        return handleDebugTelegram(env);
      }

      if (url.pathname === "/api/client-log") {
        return handleClientLog(request, env);
      }

      if (url.pathname === "/api/push/register") {
        return handlePushRegister(request, env);
      }

      if (url.pathname === "/api/push/unregister") {
        return handlePushUnregister(request, env);
      }

      // Telegram webhook
      if (url.pathname === "/api/bot") {
        return invokeLegacyHandler("bot", request, env, ctx);
      }

      // Mini app notification
      if (url.pathname === "/api/notify-miniapp-tx") {
        return handleNotifyMiniAppTx(request, env);
      }

      // Report delivery to Telegram bot
      if (url.pathname === "/api/send-report-files") {
        return invokeLegacyHandler("send-report-files", request, env, ctx);
      }

      if (url.pathname === "/api/send-report-pdf") {
        return invokeLegacyHandler("send-report-pdf", request, env, ctx);
      }

      // Notification APIs
      if (url.pathname === "/api/notifications/schedule") {
        return handleScheduleNotification(request, env);
      }

      if (url.pathname === "/api/notifications/due") {
        return handleListDueNotifications(request, env);
      }

      if (url.pathname === "/api/notifications/test") {
        return handleTestNotification(request, env);
      }

      if (url.pathname === "/api/logging/test") {
        return handleLoggingTest(request, env);
      }

      // Manual cron trigger
      if (url.pathname === "/api/cron-reminders") {
        return handleManualCronRun(request, env);
      }

      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 204 });
      }

      return serveAppAsset(request, env);
    } catch (error) {
      ctx.waitUntil(getWorkerLogger(env).error({
        scope: "worker.fetch",
        message: error?.message || String(error),
        payload: { error, pathname: url.pathname, method: request.method },
      }));
      return json(
        {
          ok: false,
          error: error?.message || String(error),
        },
        500
      );
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          const result = await runAllCronJobs(env, {
            source: "scheduled",
            cron: controller?.cron || null,
            scheduledTime: controller?.scheduledTime || null,
          });
          const totalFailures =
            Number(result?.notifications?.failed || 0) +
            Number((result?.daily?.failed || []).length || 0) +
            Number((result?.report?.failed || []).length || 0) +
            Number((result?.debts?.failed || []).length || 0);
          const totalSent =
            Number(result?.notifications?.sent || 0) +
            Number(result?.daily?.sent || 0) +
            Number(result?.report?.sent || 0) +
            Number(result?.debts?.sent || 0);

          if (totalFailures > 0) {
            await getWorkerLogger(env).error({
              scope: "cron.scheduled",
              message: "Scheduled cron xatolar bilan tugadi",
              payload: result,
            });
          } else if (totalSent > 0) {
            await getWorkerLogger(env).success({
              scope: "cron.scheduled",
              message: "Scheduled cron muvaffaqiyatli ishladi",
              payload: result,
            });
          } else {
            getWorkerLogger(env).local("SUCCESS", "cron.scheduled.noop", {
              note: "sent=0 failed=0",
              scheduledTime: controller?.scheduledTime || null,
            });
          }
        } catch (error) {
          await getWorkerLogger(env).error({
            scope: "cron.scheduled",
            message: error?.message || String(error),
            payload: { error, cron: controller?.cron || null },
          });
        }
      })()
    );
  },
};
