"use strict";

const TELEGRAM_API_ROOT = "https://api.telegram.org";
const TELEGRAM_TEXT_LIMIT = 3600;
const TELEGRAM_PRE_BLOCK_LIMIT = 2600;
const TELEGRAM_MAX_RETRIES = 2;
const TELEGRAM_RETRY_BUFFER_MS = 150;
const LEVEL_ORDER = {
  ERROR: 0,
  SUCCESS: 1,
  INFO: 2,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLevel(value, fallback = "SUCCESS") {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "SUCCES") return "SUCCESS";
  return LEVEL_ORDER[raw] != null ? raw : fallback;
}

function parseLogSelection(value, fallback = "SUCCESS") {
  const raw = String(value || "").trim();
  if (!raw) {
    const threshold = normalizeLevel(fallback, "SUCCESS");
    return {
      mode: "threshold",
      value: threshold,
      allows: (level) => LEVEL_ORDER[level] <= LEVEL_ORDER[threshold],
    };
  }

  const parts = raw
    .split(",")
    .map((item) => normalizeLevel(item, ""))
    .filter(Boolean);

  if (parts.length > 1) {
    const allowed = new Set(parts);
    return {
      mode: "set",
      value: [...allowed],
      allows: (level) => allowed.has(level),
    };
  }

  const threshold = normalizeLevel(parts[0] || raw, fallback);
  return {
    mode: "threshold",
    value: threshold,
    allows: (level) => LEVEL_ORDER[level] <= LEVEL_ORDER[threshold],
  };
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSensitiveKey(key) {
  const normalized = String(key || "").toLowerCase();
  return /(token|secret|authorization|cookie|password|passwd|api[_-]?key|service[_-]?role|supabase.*key|bot[_-]?token|openai[_-]?key|session|set-cookie|initdata)/i.test(normalized);
}

function redactString(value, key = "") {
  if (isSensitiveKey(key)) return "[REDACTED]";
  let text = String(value ?? "");
  text = text.replace(/Bearer\s+[A-Za-z0-9._:-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/bot\d{6,12}:[A-Za-z0-9_-]{20,}/g, "bot[REDACTED]");
  text = text.replace(/([?&](?:token|secret|api_key|apikey|authorization|auth|signature|sig)=)[^&\s]+/gi, "$1[REDACTED]");
  return text;
}

function sanitizeValue(value, key = "", depth = 0, seen = new WeakSet()) {
  if (depth > 5) return "[Truncated]";
  if (isSensitiveKey(key)) return "[REDACTED]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value, key);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) {
    return sanitizeValue(
      {
        name: value.name,
        message: value.message,
        stack: value.stack ? String(value.stack).split("\n").slice(0, 8).join("\n") : undefined,
        cause: value.cause || undefined,
      },
      key,
      depth + 1,
      seen
    );
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeValue(item, key, depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 50)) {
      out[childKey] = sanitizeValue(childValue, childKey, depth + 1, seen);
    }
    seen.delete(value);
    return out;
  }
  return redactString(String(value), key);
}

function stringifyPretty(value) {
  if (value == null) return "";
  const sanitized = sanitizeValue(value);
  if (typeof sanitized === "string") return sanitized;
  try {
    return JSON.stringify(sanitized, null, 2);
  } catch {
    return String(sanitized);
  }
}

function splitPlainText(text, maxLength = TELEGRAM_PRE_BLOCK_LIMIT) {
  const raw = String(text || "");
  if (!raw) return [""];
  const lines = raw.split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let offset = 0; offset < line.length; offset += maxLength) {
      chunks.push(line.slice(offset, offset + maxLength));
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [raw.slice(0, maxLength)];
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToTelegramPlainText(text) {
  const normalized = String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/pre>/gi, "\n")
    .replace(/<pre>/gi, "\n")
    .replace(/<\/?(?:b|strong|i|em|code)>/gi, "")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(normalized)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTelegramParseModeError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("can't parse entities")
    || text.includes("unsupported start tag")
    || text.includes("unexpected end tag")
    || text.includes("entity beginning")
    || text.includes("wrong entity")
    || text.includes("message is not modified");
}

function shouldRetryTelegramRequest(status, message) {
  const text = String(message || "").toLowerCase();
  return status === 429
    || status >= 500
    || text.includes("too many requests")
    || text.includes("flood control")
    || text.includes("retry after")
    || text.includes("rate limit")
    || text.includes("temporarily unavailable")
    || text.includes("timeout");
}

function resolveRetryDelayMs(data, message, attempt) {
  const retryAfterSeconds = Number(
    data?.parameters?.retry_after
    || String(message || "").match(/retry after (\d+)/i)?.[1]
    || 0
  );

  if (retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000 + TELEGRAM_RETRY_BUFFER_MS;
  }

  return Math.min(3000, (attempt + 1) * 500);
}

function normalizeUsername(username) {
  const raw = String(username || "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function normalizeUserContext(input = {}) {
  const userId = input.user_id ?? input.userId ?? input.user?.id ?? input.id ?? null;
  const chatId = input.chat_id ?? input.chatId ?? input.chat?.id ?? null;
  const username = normalizeUsername(input.username || input.user_name || input.user?.username || "");
  const fullName = String(input.full_name || input.fullName || input.user?.full_name || input.name || "").trim();
  const phoneNumber = String(input.phone_number || input.phoneNumber || input.phone || "").trim();
  const displayName = username || fullName || phoneNumber || (chatId != null && chatId !== "" ? String(chatId) : "unknown");

  return {
    userId: userId != null && userId !== "" ? String(userId) : "unknown",
    chatId: chatId != null && chatId !== "" ? String(chatId) : "unknown",
    username: username || null,
    fullName: fullName || null,
    phoneNumber: phoneNumber || null,
    displayName,
  };
}

function buildHeaderLines({ level, source, scope, user, timestamp }) {
  const levelEmoji = {
    ERROR: "❌",
    SUCCESS: "✅",
    INFO: "ℹ️",
    WARNING: "⚠️"
  }[level] || "📋";

  const lines = [
    `${levelEmoji} <b>${htmlEscape(level)}</b> | <code>${htmlEscape(timestamp || new Date().toISOString())}</code>`,
    `<b>Manba:</b> ${htmlEscape(source || "APP")}`,
  ];
  if (scope) lines.push(`<b>Modul:</b> ${htmlEscape(scope)}`);
  lines.push(`<b>User ID:</b> <code>${htmlEscape(user.userId)}</code>`);
  if (user.username) lines.push(`<b>Username:</b> ${htmlEscape(user.username)}`);
  if (user.fullName) lines.push(`<b>Ism:</b> ${htmlEscape(user.fullName)}`);
  if (user.phoneNumber) lines.push(`<b>Telefon:</b> <code>${htmlEscape(user.phoneNumber)}</code>`);
  return lines;
}

function buildLogChunks({ level, source, scope, userContext, message, payload }) {
  const user = normalizeUserContext(userContext);
  const timestamp = new Date().toISOString();
  const header = buildHeaderLines({ level, source, scope, user, timestamp }).join("\n");

  let messageSection = "";
  if (message) {
    messageSection = `\n\n<b>📝 Xabar:</b>\n${htmlEscape(message)}`;
  }

  const bodyText = stringifyPretty(payload);
  if (!bodyText) {
    return [`${header}${messageSection}`];
  }

  const bodyChunks = splitPlainText(bodyText);
  return bodyChunks.map((chunk, index) => {
    const continuation = bodyChunks.length > 1 ? ` (${index + 1}/${bodyChunks.length})` : "";
    return `${header}${messageSection}\n\n<b>📊 Tafsilotlar${continuation}:</b>\n<pre>${htmlEscape(chunk)}</pre>`;
  });
}

function buildNewUserChunks({ source, userContext, payload }) {
  const user = normalizeUserContext(userContext);
  const timestamp = new Date().toISOString();
  const isNewUser = payload?.registered_at || payload?.is_new;

  const lines = [
    "🎉 <b>YANGI FOYDALANUVCHI QO'SHILDI</b>",
    "",
    `📅 <b>Vaqt:</b> <code>${htmlEscape(timestamp)}</code>`,
    `👤 <b>User ID:</b> <code>${htmlEscape(user.userId)}</code>`,
  ];

  if (user.username) lines.push(`🔹 <b>Username:</b> @${htmlEscape(user.username)}`);
  if (user.fullName) lines.push(`🔹 <b>To'liq ism:</b> ${htmlEscape(user.fullName)}`);
  if (user.phoneNumber) lines.push(`📱 <b>Telefon:</b> <code>${htmlEscape(user.phoneNumber)}</code>`);

  lines.push(`🔹 <b>Manba:</b> ${htmlEscape(source || "bot /start")}`);

  if (payload?.registered_at) {
    lines.push(`✅ <b>Ro'yxatdan o'tdi:</b> ${htmlEscape(payload.registered_at)}`);
  }

  const payloadText = stringifyPretty(payload);
  if (!payloadText) return [lines.join("\n")];

  return splitPlainText(payloadText).map((chunk, index, arr) => {
    const suffix = arr.length > 1 ? ` (${index + 1}/${arr.length})` : "";
    return `${lines.join("\n")}\n\n<b>📊 Qo'limcha ma'lumotlar${suffix}:</b>\n<pre>${htmlEscape(chunk)}</pre>`;
  });
}

function resolveChatId(value) {
  if (value == null || value === "") return "";
  return String(value).trim();
}

async function sendTelegramChunks({ fetchImpl, botToken, chatId, chunks }) {
  const targetChatId = resolveChatId(chatId);
  if (!fetchImpl || !botToken || !targetChatId || !Array.isArray(chunks) || !chunks.length) return false;

  for (const chunk of chunks) {
    let text = String(chunk || "").slice(0, TELEGRAM_TEXT_LIMIT);
    let parseMode = "HTML";
    if (!text) continue;
    for (let attempt = 0; attempt <= TELEGRAM_MAX_RETRIES; attempt += 1) {
      const body = {
        chat_id: /^-?\d+$/.test(targetChatId) ? Number(targetChatId) : targetChatId,
        text,
        disable_web_page_preview: true,
      };
      if (parseMode) body.parse_mode = parseMode;

      const resp = await fetchImpl(`${TELEGRAM_API_ROOT}/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await resp.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { ok: false, raw };
      }

      if (resp.ok && data?.ok !== false) {
        break;
      }

      const errorMessage = data?.description || data?.raw || `Telegram HTTP ${resp.status}`;

      if (parseMode === "HTML" && isTelegramParseModeError(errorMessage)) {
        parseMode = "";
        text = htmlToTelegramPlainText(text).slice(0, TELEGRAM_TEXT_LIMIT);
        if (!text) throw new Error(errorMessage);
        continue;
      }

      if (attempt < TELEGRAM_MAX_RETRIES && shouldRetryTelegramRequest(resp.status, errorMessage)) {
        await sleep(resolveRetryDelayMs(data, errorMessage, attempt));
        continue;
      }

      throw new Error(errorMessage);
    }
  }

  return true;
}

function createTelegramOps(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const botToken = String(options.botToken || "").trim();
  const source = String(options.source || "APP").trim() || "APP";
  const logChannelId = resolveChatId(options.logChannelId);
  const adminChatId = resolveChatId(options.adminChatId);
  const localLevel = normalizeLevel(options.localLevel, "ERROR");
  const logSelection = parseLogSelection(options.logLevel, "SUCCESS");
  const loggingEnabled = parseBoolean(options.loggingEnabled, Boolean(botToken && logChannelId));

  function shouldLocal(level) {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[localLevel];
  }

  function shouldSend(level) {
    if (!loggingEnabled || !botToken || !logChannelId) return false;
    return logSelection.allows(level);
  }

  function local(level, scope, payload) {
    if (!shouldLocal(level)) return;
    const writer = level === "ERROR" ? console.error : console.log;
    writer(`[${source}:${level}] ${scope}`, sanitizeValue(payload));
  }

  async function sendFallbackNotice(level, entry = {}, error) {
    if (!botToken || !adminChatId || adminChatId === logChannelId) return false;
    const user = normalizeUserContext(entry.user || entry);
    const lines = [
      "[LOG FALLBACK]",
      `level: ${level}`,
      `source: ${source}`,
      `scope: ${entry.scope || "log"}`,
      `user: ${user.displayName}`,
    ];
    if (entry.message) lines.push(`message: ${String(entry.message)}`);
    if (error?.message) lines.push(`delivery_error: ${String(error.message)}`);

    return sendTelegramChunks({
      fetchImpl,
      botToken,
      chatId: adminChatId,
      chunks: splitPlainText(lines.join("\n"), TELEGRAM_TEXT_LIMIT),
    });
  }

  async function emit(level, entry = {}) {
    local(level, entry.scope || "log", entry.payload || entry.message || {});
    if (!shouldSend(level)) return false;

    try {
      const chunks = buildLogChunks({
        level,
        source,
        scope: entry.scope || "",
        userContext: entry.user || entry,
        message: entry.message || "",
        payload: entry.payload,
      });
      return await sendTelegramChunks({ fetchImpl, botToken, chatId: logChannelId, chunks });
    } catch (error) {
      local("ERROR", "telegram-log-failed", { error });
      try {
        await sendFallbackNotice(level, entry, error);
      } catch (fallbackError) {
        local("ERROR", "telegram-log-fallback-failed", { error: fallbackError });
      }
      return false;
    }
  }

  async function notifyNewUser(entry = {}) {
    try {
      if (!botToken || !adminChatId) return false;
      const chunks = buildNewUserChunks({
        source: entry.source || "bot start/register",
        userContext: entry.user || entry,
        payload: entry.payload,
      });
      return await sendTelegramChunks({ fetchImpl, botToken, chatId: adminChatId, chunks });
    } catch (error) {
      local("ERROR", "admin-notify-failed", { error });
      return false;
    }
  }

  return {
    local,
    error: (entry) => emit("ERROR", entry),
    success: (entry) => emit("SUCCESS", entry),
    info: (entry) => emit("INFO", entry),
    notifyNewUser,
    sanitizeValue,
    normalizeUserContext,
  };
}

module.exports = {
  createTelegramOps,
  sanitizeValue,
  normalizeUserContext,
  normalizeLevel,
  parseLogSelection,
};
