'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const { createTelegramOps } = require('../lib/telegram-ops.cjs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const TASHKENT_TIME_ZONE = 'Asia/Tashkent';
const DEFAULT_CRON_INTERVAL_MINUTES = 30;
const DEBT_REMINDER_BATCH_SIZE = 300;
const DEBT_REMINDER_SCAN_LIMIT = 5000;

const NOTIFICATION_DEFAULTS = {
  daily_reminder: {
    key: 'daily_reminder',
    title: 'Kunlik eslatma',
    enabled: true,
    send_time: '09:00',
    timezone: TASHKENT_TIME_ZONE,
    message_template: `🌤 <b>Assalamu aleykum{{name_block}}</b>

Bugungi xarajatlarni kiritib borishni unutmang.
💸 Kirim, chiqim, qarz va rejalaringizni yozsangiz — men ularni tartibli saqlab boraman.

📅 Bugun: {{today}}
🤝 <i>24/7 xizmatingizda man!</i>`,
    config: { window_minutes: 5, batch_size: 100, per_run_limit: 10000 },
  },
  daily_report: {
    key: 'daily_report',
    title: 'Kunlik hisobot',
    enabled: true,
    send_time: '22:00',
    timezone: TASHKENT_TIME_ZONE,
    message_template: `🌙 <b>Kunlik hisobotingiz{{name_block}}</b>

Bugungi kirim-chiqimlaringizni yakunlab, kunlik hisobotingizni tekshirib chiqing.
💸 Agar hali kiritmagan bo'lsangiz, bugungi yozuvlarni hozir qo'shib qo'ying.

📅 Bugun: {{today}}
✅ <i>Kunlik hisobotingizni yopishni unutmang.</i>`,
    config: { window_minutes: 5, batch_size: 100, per_run_limit: 10000 },
  },
  debt_reminder: {
    key: 'debt_reminder',
    title: 'Qarz eslatmasi',
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
};

if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");
if (!SUPA_URL) throw new Error("SUPABASE_URL yo'q");
if (!SUPA_KEY) throw new Error("SUPABASE_KEY yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const db = createClient(SUPA_URL, SUPA_KEY);
const cronLogger = createTelegramOps({
  botToken: BOT_TOKEN,
  logChannelId: process.env.LOG_CHANNEL_ID,
  adminChatId: process.env.ADMIN_NOTIFY_CHAT_ID || process.env.OWNER_ID || '',
  loggingEnabled: process.env.TELEGRAM_LOGGING_ENABLED,
  logLevel: process.env.LOG_LEVEL || 'INFO',
  localLevel: process.env.LOCAL_LOG_LEVEL || 'ERROR',
  source: 'CRON',
});

function summarizeCronResult(result = {}) {
  return {
    checked: Number(result.checked || 0),
    sent: Number(result.sent || 0),
    skipped: Number(result.skipped || 0),
    failed: Array.isArray(result.failed) ? result.failed.length : 0,
    scheduled_for: result.scheduled_for || null,
    time_zone: result.time_zone || null,
    local_now: result.local_now || null,
    note: result.note || null,
  };
}

function relationMissing(error, table) {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  const target = String(table || '').toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes('could not find the table') ||
    msg.includes('relation "public.') ||
    msg.includes('relation "') ||
    msg.includes('does not exist')
  );
}

function missingColumn(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column') ||
    msg.includes('could not find the column')
  );
}

function getCronRequestSecret(req) {
  return req.headers?.['x-cron-secret']
    || req.headers?.['x-internal-secret']
    || req.headers?.authorization
    || req.headers?.Authorization
    || '';
}


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

function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(vars[key] ?? ''));
}

function mergeNotificationSetting(rowOrKey, patch = null) {
  const row = typeof rowOrKey === 'string' ? { key: rowOrKey } : (rowOrKey || {});
  const base = NOTIFICATION_DEFAULTS[row.key] || null;
  if (!base) return null;
  return {
    ...base,
    ...row,
    ...(patch || {}),
    key: base.key,
    enabled: (patch && typeof patch.enabled === 'boolean') ? patch.enabled : (typeof row.enabled === 'boolean' ? row.enabled : base.enabled),
    send_time: (patch && Object.prototype.hasOwnProperty.call(patch, 'send_time'))
      ? (patch.send_time ? normalizeNotifTime(patch.send_time, base.send_time || '09:00') : null)
      : (row.send_time ? normalizeNotifTime(row.send_time, base.send_time || '09:00') : base.send_time),
    timezone: String((patch && patch.timezone) ?? row.timezone ?? base.timezone),
    message_template: (patch && Object.prototype.hasOwnProperty.call(patch, 'message_template'))
      ? patch.message_template
      : (row.message_template == null ? base.message_template : row.message_template),
    config: {
      ...(base.config || {}),
      ...(row.config || {}),
      ...((patch && patch.config) || {}),
    },
  };
}

async function getNotificationSettings() {
  const { data, error } = await db.from('notification_settings').select('key,title,enabled,send_time,timezone,message_template,config,last_sent_at,updated_at');
  if (error) {
    if (relationMissing(error, 'notification_settings')) {
      return Object.fromEntries(Object.keys(NOTIFICATION_DEFAULTS).map((key) => [key, mergeNotificationSetting(key)]));
    }
    throw error;
  }
  const latestByKey = new Map();
  (data || []).forEach((row) => {
    const prev = latestByKey.get(row.key);
    const prevTs = new Date(prev?.updated_at || prev?.last_sent_at || 0).getTime() || 0;
    const nextTs = new Date(row?.updated_at || row?.last_sent_at || 0).getTime() || 0;
    if (!prev || nextTs >= prevTs) latestByKey.set(row.key, row);
  });
  return Object.fromEntries(Object.keys(NOTIFICATION_DEFAULTS).map((key) => [key, mergeNotificationSetting(latestByKey.get(key) || key)]));
}

async function touchNotificationSetting(key, payload = {}) {
  const { error } = await db.from('notification_settings').update(payload).eq('key', key);
  if (error && !relationMissing(error, 'notification_settings')) throw error;
}

async function insertNotificationLog(row) {
  const { error } = await db.from('notification_logs').insert(row);
  if (error && !relationMissing(error, 'notification_logs')) throw error;
}

function buildDailyReminderText(setting, fullName = '', now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.daily_reminder.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;
  return renderTemplate(template, {
    name_block: String(fullName || '').trim() ? `, <b>${String(fullName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>` : '',
    today: new Date(now).toLocaleDateString('uz-UZ', { timeZone }),
  });
}

function buildDailyReportText(setting, fullName = '', now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.daily_report.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;
  return renderTemplate(template, {
    name_block: String(fullName || '').trim() ? `, <b>${String(fullName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>` : '',
    today: new Date(now).toLocaleDateString('uz-UZ', { timeZone }),
  });
}

function buildDebtReminderText(setting, debt, targetDate, now = new Date()) {
  const template = setting?.message_template || NOTIFICATION_DEFAULTS.debt_reminder.message_template;
  const timeZone = setting?.timezone || TASHKENT_TIME_ZONE;
  return renderTemplate(template, {
    day_label: targetDate && uzDateKey(targetDate, timeZone) === uzDateKey(now, timeZone) ? 'Bugun' : 'Eslatma',
    person_name: String(debt.person_name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    amount: Number(debt.amount || 0).toLocaleString('ru-RU'),
    direction: debt.direction === 'payable' ? 'Siz qaytarishingiz kerak' : 'Sizga qaytishi kerak',
    when: targetDate ? toUzDateTime(targetDate, timeZone) : 'belgilangan vaqt',
    note_block: debt.note ? `
📝 ${String(debt.note).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : '',
  });
}

function getTimeZoneParts(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const safeTimeZone = String(timeZone || TASHKENT_TIME_ZONE);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  const zoned = new Date(date.toLocaleString('en-US', { timeZone: String(timeZone || TASHKENT_TIME_ZONE) }));
  return zoned.getTime() - date.getTime();
}

function dateKeyInZone(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function dayStartUtcIsoInZone(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  const approxUtc = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0));
  const offsetMs = getTimeZoneOffsetMillis(approxUtc, timeZone);
  return new Date(approxUtc.getTime() - offsetMs).toISOString();
}

function parseCronIntervalMinutes(expression) {
  const cron = String(expression || '').trim();
  if (!cron) return null;

  const [minuteField] = cron.split(/\s+/);
  if (!minuteField) return null;
  if (minuteField === '*') return 1;

  const stepMatch = minuteField.match(/^\*\/(\d{1,3})$/);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    return Number.isFinite(step) && step > 0 ? step : null;
  }

  if (/^\d{1,2}(,\d{1,2})+$/.test(minuteField)) {
    const values = minuteField
      .split(',')
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
        meta?.cron || meta?.cronExpression || process.env.CRON_SCHEDULE || ''
      ) || 0
    )
  );
  const effectiveInterval = inferredInterval || configuredInterval || Number(process.env.CRON_INTERVAL_MINUTES || DEFAULT_CRON_INTERVAL_MINUTES);
  return Math.max(baseWindow, effectiveInterval || baseWindow);
}

function uzDateKey(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  return dateKeyInZone(value, timeZone);
}

function uzDayStartUtcIso(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  return dayStartUtcIsoInZone(value, timeZone);
}

function timeInZoneLabel(value = new Date(), timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function isDailyReminderWindow(value = new Date(), sendTime = '09:00', windowMinutes = 5, timeZone = TASHKENT_TIME_ZONE) {
  const p = getTimeZoneParts(value, timeZone);
  const [hh, mm] = normalizeNotifTime(sendTime, '09:00').split(':').map(Number);
  const currentMinutes = p.hour * 60 + p.minute;
  const targetMinutes = hh * 60 + mm;
  return currentMinutes >= targetMinutes && currentMinutes < targetMinutes + Math.max(1, Number(windowMinutes || 5));
}

function dueTarget(debt) {
  return debt.remind_at || debt.due_at || null;
}

function toUzDateTime(value, timeZone = TASHKENT_TIME_ZONE) {
  if (!value) return 'belgilangan vaqt';
  try {
    return new Date(value).toLocaleString('uz-UZ', { timeZone: String(timeZone || TASHKENT_TIME_ZONE) });
  } catch {
    return new Date(value).toLocaleString('uz-UZ');
  }
}

async function fetchUsersForDailyReminderPage(dayStartIso, { afterUserId = null, limit = 100 } = {}) {
  let query = db
    .from('users')
    .select('user_id, full_name, daily_reminder_enabled, last_daily_reminder_at')
    .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${dayStartIso}`)
    .order('user_id', { ascending: true })
    .limit(limit);

  if (afterUserId != null) {
    query = query.gt('user_id', afterUserId);
  }

  let res = await query;

  if (res.error && missingColumn(res.error, 'daily_reminder_enabled')) {
    let fallback = db
      .from('users')
      .select('user_id, full_name, last_daily_reminder_at')
      .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${dayStartIso}`)
      .order('user_id', { ascending: true })
      .limit(limit);

    if (afterUserId != null) {
      fallback = fallback.gt('user_id', afterUserId);
    }

    res = await fallback;
  }

  if (res.error && missingColumn(res.error, 'last_daily_reminder_at')) {
    return { data: [], error: null, skipped: 'users.last_daily_reminder_at missing' };
  }

  return res;
}

async function fetchUsersForDailyReportPage(dayStartIso, { afterUserId = null, limit = 100 } = {}) {
  let query = db
    .from('users')
    .select('user_id, full_name, daily_reminder_enabled, last_daily_report_at')
    .or(`last_daily_report_at.is.null,last_daily_report_at.lt.${dayStartIso}`)
    .order('user_id', { ascending: true })
    .limit(limit);

  if (afterUserId != null) {
    query = query.gt('user_id', afterUserId);
  }

  let res = await query;

  if (res.error && missingColumn(res.error, 'daily_reminder_enabled')) {
    let fallback = db
      .from('users')
      .select('user_id, full_name, last_daily_report_at')
      .or(`last_daily_report_at.is.null,last_daily_report_at.lt.${dayStartIso}`)
      .order('user_id', { ascending: true })
      .limit(limit);

    if (afterUserId != null) {
      fallback = fallback.gt('user_id', afterUserId);
    }

    res = await fallback;
  }

  if (res.error && missingColumn(res.error, 'last_daily_report_at')) {
    return { data: [], error: null, skipped: 'users.last_daily_report_at missing' };
  }

  return res;
}

async function claimDailyReminderSend(userId, dayStartIso, claimIso) {
  let result = await db.from('users')
    .update({ last_daily_reminder_at: claimIso })
    .eq('user_id', userId)
    .or(`last_daily_reminder_at.is.null,last_daily_reminder_at.lt.${dayStartIso}`)
    .select('user_id')
    .maybeSingle();
  if (result.error && missingColumn(result.error, 'last_daily_reminder_at')) {
    return { data: null, error: null };
  }
  return result;
}

async function releaseDailyReminderClaim(userId, claimIso) {
  let result = await db.from('users')
    .update({ last_daily_reminder_at: null })
    .eq('user_id', userId)
    .eq('last_daily_reminder_at', claimIso);
  if (result.error && missingColumn(result.error, 'last_daily_reminder_at')) {
    return { error: null };
  }
  return result;
}

async function claimDailyReportSend(userId, dayStartIso, claimIso) {
  let result = await db.from('users')
    .update({ last_daily_report_at: claimIso })
    .eq('user_id', userId)
    .or(`last_daily_report_at.is.null,last_daily_report_at.lt.${dayStartIso}`)
    .select('user_id')
    .maybeSingle();
  if (result.error && missingColumn(result.error, 'last_daily_report_at')) {
    return { data: null, error: null };
  }
  return result;
}

async function releaseDailyReportClaim(userId, claimIso) {
  let result = await db.from('users')
    .update({ last_daily_report_at: null })
    .eq('user_id', userId)
    .eq('last_daily_report_at', claimIso);
  if (result.error && missingColumn(result.error, 'last_daily_report_at')) {
    return { error: null };
  }
  return result;
}

async function fetchOpenDebtsPage({ from = 0, to = DEBT_REMINDER_BATCH_SIZE - 1 } = {}) {
  return db
    .from('debts')
    .select('id, user_id, person_name, amount, direction, due_at, remind_at, note, reminder_sent_at, status, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to);
}

async function claimDebtReminder(debt, claimIso) {
  const result = await db
    .from('debts')
    .update({ reminder_sent_at: claimIso })
    .eq('id', debt.id)
    .eq('user_id', debt.user_id)
    .is('reminder_sent_at', null)
    .select('id')
    .maybeSingle();

  if (result.error) throw result.error;
  return !!result.data;
}

async function releaseDebtReminderClaim(debt, claimIso) {
  let result = await db
    .from('debts')
    .update({ reminder_sent_at: null })
    .eq('id', debt.id)
    .eq('user_id', debt.user_id)
    .eq('reminder_sent_at', claimIso);

  if (result.error && missingColumn(result.error, 'reminder_sent_at')) {
    return { error: null };
  }
  return result;
}

async function processDailyReminders(now, meta = {}) {
  const settings = await getNotificationSettings();
  const dailySetting = settings.daily_reminder || mergeNotificationSetting('daily_reminder');

  const timeZone = dailySetting.timezone || TASHKENT_TIME_ZONE;
  const sendTime = dailySetting.send_time || '09:00';
  const windowMinutes = resolveDailyWindowMinutes(dailySetting, meta);

  const batchSize = Math.max(1, Math.min(1000, Number(dailySetting?.config?.batch_size || 100)));
  const perRunLimit = Math.max(batchSize, Math.min(50000, Number(dailySetting?.config?.per_run_limit || 10000)));

  const result = {
    checked: 0,
    sent: 0,
    failed: [],
    skipped: 0,
    todayKey: uzDateKey(now, timeZone),
    local_now: timeInZoneLabel(now, timeZone),
    time_zone: timeZone,
    scheduled_for: `${sendTime} ${timeZone}`,
    window_open: isDailyReminderWindow(now, sendTime, windowMinutes, timeZone),
    batch_size: batchSize,
    per_run_limit: perRunLimit,
    effective_window_minutes: windowMinutes,
  };

  if (dailySetting.enabled === false) {
    result.note = 'daily reminder disabled';
    return result;
  }

  if (!result.window_open) {
    result.note = 'outside daily reminder window';
    return result;
  }

  const nowIso = now.toISOString();
  const dayStartIso = uzDayStartUtcIso(now, timeZone);
  result.day_start_utc = dayStartIso;

  let lastUserId = null;
  let totalScanned = 0;

  while (totalScanned < perRunLimit) {
    const pageLimit = Math.min(batchSize, perRunLimit - totalScanned);
    const { data, error, skipped } = await fetchUsersForDailyReminderPage(dayStartIso, {
      afterUserId: lastUserId,
      limit: pageLimit,
    });

    if (skipped) {
      result.note = skipped;
      return result;
    }

    if (error) {
      if (relationMissing(error, 'users')) {
        result.note = 'users table missing';
        return result;
      }
      throw error;
    }

    const rawRows = data || [];
    if (!rawRows.length) break;

    totalScanned += rawRows.length;
    lastUserId = rawRows[rawRows.length - 1]?.user_id ?? lastUserId;

    const rows = rawRows.filter((row) => row && row.user_id && row.daily_reminder_enabled !== false);
    result.checked += rows.length;

    for (const row of rows) {
      const html = buildDailyReminderText(dailySetting, row.full_name, now);
      let claimed = null;

      try {
        const claimRes = await claimDailyReminderSend(row.user_id, dayStartIso, nowIso);
        if (claimRes.error) throw claimRes.error;
        claimed = claimRes.data || null;
        if (!claimed) {
          result.skipped += 1;
          continue;
        }

        await bot.sendMessage(row.user_id, html, { parse_mode: 'HTML' });

        await insertNotificationLog({
          setting_key: 'daily_reminder',
          user_id: row.user_id,
          status: 'sent',
          message_text: html,
          sent_at: nowIso,
          meta: {
            send_time: sendTime,
            batch_size: batchSize,
          }
        });

        result.sent += 1;
      } catch (err) {
        result.failed.push({ user_id: row.user_id, error: err?.message || 'send failed' });
        if (claimed) {
          try {
            await releaseDailyReminderClaim(row.user_id, nowIso);
          } catch (_) { }
        }

        await insertNotificationLog({
          setting_key: 'daily_reminder',
          user_id: row.user_id,
          status: 'failed',
          message_text: html,
          error_text: err?.message || 'send failed',
          sent_at: nowIso,
          meta: {
            send_time: sendTime,
            batch_size: batchSize,
          }
        });
      }
    }

    if (rawRows.length < pageLimit) break;
  }

  if (result.sent > 0) {
    await touchNotificationSetting('daily_reminder', { last_sent_at: nowIso });
  }

  if (totalScanned >= perRunLimit) {
    result.note = `per_run_limit reached (${perRunLimit})`;
  }

  return result;
}


async function processDailyReports(now, meta = {}) {
  const settings = await getNotificationSettings();
  const reportSetting = settings.daily_report || mergeNotificationSetting('daily_report');

  const timeZone = reportSetting.timezone || TASHKENT_TIME_ZONE;
  const sendTime = reportSetting.send_time || '22:00';
  const windowMinutes = resolveDailyWindowMinutes(reportSetting, meta);

  const batchSize = Math.max(1, Math.min(1000, Number(reportSetting?.config?.batch_size || 100)));
  const perRunLimit = Math.max(batchSize, Math.min(50000, Number(reportSetting?.config?.per_run_limit || 10000)));

  const result = {
    checked: 0,
    sent: 0,
    failed: [],
    skipped: 0,
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
    result.note = 'daily report disabled';
    return result;
  }

  if (!result.window_open) {
    result.note = 'outside daily report window';
    return result;
  }

  const nowIso = now.toISOString();
  const dayStartIso = uzDayStartUtcIso(now, timeZone);
  result.day_start_utc = dayStartIso;

  let lastUserId = null;
  let totalScanned = 0;

  while (totalScanned < perRunLimit) {
    const pageLimit = Math.min(batchSize, perRunLimit - totalScanned);
    const { data, error, skipped } = await fetchUsersForDailyReportPage(dayStartIso, {
      afterUserId: lastUserId,
      limit: pageLimit,
    });

    if (skipped) {
      result.note = skipped;
      return result;
    }

    if (error) {
      if (relationMissing(error, 'users')) {
        result.note = 'users table missing';
        return result;
      }
      throw error;
    }

    const rawRows = data || [];
    if (!rawRows.length) break;

    totalScanned += rawRows.length;
    lastUserId = rawRows[rawRows.length - 1]?.user_id ?? lastUserId;

    const rows = rawRows.filter((row) => row && row.user_id && row.daily_reminder_enabled !== false);
    result.checked += rows.length;

    for (const row of rows) {
      const html = buildDailyReportText(reportSetting, row.full_name, now);
      let claimed = null;

      try {
        const claimRes = await claimDailyReportSend(row.user_id, dayStartIso, nowIso);
        if (claimRes.error) throw claimRes.error;
        claimed = claimRes.data || null;
        if (!claimed) {
          result.skipped += 1;
          continue;
        }

        await bot.sendMessage(row.user_id, html, { parse_mode: 'HTML' });

        await insertNotificationLog({
          setting_key: 'daily_report',
          user_id: row.user_id,
          status: 'sent',
          message_text: html,
          sent_at: nowIso,
          meta: {
            send_time: sendTime,
            batch_size: batchSize,
          }
        });

        result.sent += 1;
      } catch (err) {
        result.failed.push({ user_id: row.user_id, error: err?.message || 'send failed' });
        if (claimed) {
          try {
            await releaseDailyReportClaim(row.user_id, nowIso);
          } catch (_) { }
        }

        await insertNotificationLog({
          setting_key: 'daily_report',
          user_id: row.user_id,
          status: 'failed',
          message_text: html,
          error_text: err?.message || 'send failed',
          sent_at: nowIso,
          meta: {
            send_time: sendTime,
            batch_size: batchSize,
          }
        });
      }
    }

    if (rawRows.length < pageLimit) break;
  }

  if (result.sent > 0) {
    await touchNotificationSetting('daily_report', { last_sent_at: nowIso });
  }

  if (totalScanned >= perRunLimit) {
    result.note = `per_run_limit reached (${perRunLimit})`;
  }

  return result;
}

async function processDebtReminders(now) {
  const settings = await getNotificationSettings();
  const debtSetting = settings.debt_reminder || mergeNotificationSetting('debt_reminder');

  if (debtSetting.enabled === false) {
    return { checked: 0, due: 0, sent: 0, skipped: 0, failed: [], note: 'debt reminder disabled' };
  }

  const result = { checked: 0, due: 0, sent: 0, skipped: 0, failed: [] };
  const nowIso = now.toISOString();
  let from = 0;
  let scanned = 0;

  while (scanned < DEBT_REMINDER_SCAN_LIMIT) {
    const to = from + DEBT_REMINDER_BATCH_SIZE - 1;
    const { data, error } = await fetchOpenDebtsPage({ from, to });

    if (error) {
      if (relationMissing(error, 'debts')) {
        return { checked: 0, due: 0, sent: 0, skipped: 0, failed: [], note: 'debts table missing' };
      }
      throw error;
    }

    const page = data || [];
    if (!page.length) break;

    scanned += page.length;
    result.checked += page.length;

    const dueItems = page.filter((debt) => {
      if (debt.status !== 'open') return false;
      if (debt.reminder_sent_at) return false;
      const target = dueTarget(debt);
      if (!target) return false;
      const ts = new Date(target).getTime();
      return Number.isFinite(ts) && ts <= now.getTime();
    });

    result.due += dueItems.length;

    for (const debt of dueItems) {
      const target = dueTarget(debt);
      const targetDate = target ? new Date(target) : null;
      const text = buildDebtReminderText(debtSetting, debt, targetDate, now);

      try {
        const claimed = await claimDebtReminder(debt, nowIso);
        if (!claimed) {
          result.skipped += 1;
          continue;
        }

        await bot.sendMessage(debt.user_id, text, { parse_mode: 'HTML' });
        await insertNotificationLog({
          setting_key: 'debt_reminder',
          user_id: debt.user_id,
          status: 'sent',
          message_text: text,
          sent_at: nowIso,
          meta: { debt_id: debt.id, due_at: debt.due_at || null, remind_at: debt.remind_at || null }
        });
        result.sent += 1;
      } catch (err) {
        result.failed.push({ id: debt.id, user_id: debt.user_id, error: err?.message || 'send failed' });
        try {
          await releaseDebtReminderClaim(debt, nowIso);
        } catch (_) { }
        await insertNotificationLog({
          setting_key: 'debt_reminder',
          user_id: debt.user_id,
          status: 'failed',
          message_text: text,
          error_text: err?.message || 'send failed',
          sent_at: nowIso,
          meta: { debt_id: debt.id, due_at: debt.due_at || null, remind_at: debt.remind_at || null }
        });
      }
    }

    if (page.length < DEBT_REMINDER_BATCH_SIZE) break;
    from += DEBT_REMINDER_BATCH_SIZE;
  }

  if (result.sent > 0) await touchNotificationSetting('debt_reminder', { last_sent_at: nowIso });
  if (scanned >= DEBT_REMINDER_SCAN_LIMIT) result.note = `scan limit reached (${DEBT_REMINDER_SCAN_LIMIT})`;
  return result;
}

function buildCronTaskFailureResult(taskName, error) {
  const message = error?.message || String(error);
  return {
    ok: false,
    checked: 0,
    sent: 0,
    failed: [{ task: taskName, error: message }],
    note: `${taskName} failed`,
  };
}

async function runCronTask(taskName, handler) {
  try {
    return await handler();
  } catch (error) {
    return buildCronTaskFailureResult(taskName, error);
  }
}

module.exports = async (req, res) => {
  try {
    const auth = getCronRequestSecret(req);
    if (CRON_SECRET && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const now = new Date();
    const [daily, report, debts] = await Promise.all([
      runCronTask('daily', () => processDailyReminders(now, { cron: process.env.CRON_SCHEDULE || null })),
      runCronTask('report', () => processDailyReports(now, { cron: process.env.CRON_SCHEDULE || null })),
      runCronTask('debts', () => processDebtReminders(now)),
    ]);

    const payload = {
      daily: summarizeCronResult(daily),
      report: summarizeCronResult(report),
      debts: summarizeCronResult(debts),
      source: 'api-manual',
      at: now.toISOString(),
    };
    const totalFailures = payload.daily.failed + payload.report.failed + payload.debts.failed;
    const totalSent = payload.daily.sent + payload.report.sent + payload.debts.sent;

    if (totalFailures > 0) {
      await cronLogger.error({
        scope: 'cron-run',
        message: 'Cron run xatolar bilan yakunlandi',
        payload: {
          ...payload,
          samples: {
            daily: (daily.failed || []).slice(0, 3),
            report: (report.failed || []).slice(0, 3),
            debts: (debts.failed || []).slice(0, 3),
          },
        },
      }).catch(() => { });
    } else if (totalSent > 0) {
      await cronLogger.success({
        scope: 'cron-run',
        message: 'Cron run muvaffaqiyatli yakunlandi',
        payload,
      }).catch(() => { });
    }

    return res.status(200).json({
      ok: true,
      at: now.toISOString(),
      daily,
      report,
      debts,
    });
  } catch (error) {
    await cronLogger.error({
      scope: 'cron-handler',
      message: error.message || String(error),
      payload: { error },
    }).catch(() => { });
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
