"use strict";

const TELEGRAM_API_ROOT = "https://api.telegram.org";
const TELEGRAM_TEXT_LIMIT = 3600;
const TELEGRAM_PRE_BLOCK_LIMIT = 2600;
const LEVEL_ORDER = {
  ERROR: 0,
  SUCCESS: 1,
  INFO: 2,
};

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

function buildHeaderLines({ level, source, scope, user }) {
  const lines = [
    `<b>[${htmlEscape(level)}]</b>`,
    `<b>source:</b> ${htmlEscape(source || "APP")}`,
  ];
  if (scope) lines.push(`<b>scope:</b> ${htmlEscape(scope)}`);
  lines.push(`<b>user_id:</b> <code>${htmlEscape(user.userId)}</code>`);
  lines.push(`<b>user_name:</b> ${htmlEscape(user.displayName)}`);
  return lines;
}

function buildLogChunks({ level, source, scope, userContext, message, payload }) {
  const user = normalizeUserContext(userContext);
  const label = level === "ERROR" ? "error sababi" : level === "SUCCESS" ? "success tafsilotlari" : "info tafsilotlari";
  const header = buildHeaderLines({ level, source, scope, user }).join("\n");
  const messageLine = message ? `\n\n<b>xabar:</b>\n${htmlEscape(message)}` : "";
  const bodyText = stringifyPretty(payload);

  if (!bodyText) {
    return [`${header}${messageLine}`];
  }

  const bodyChunks = splitPlainText(bodyText);
  return bodyChunks.map((chunk, index) => {
    const continuation = bodyChunks.length > 1 ? ` (${index + 1}/${bodyChunks.length})` : "";
    return `${header}${messageLine}\n\n<b>${htmlEscape(label)}${continuation}:</b>\n<pre>${htmlEscape(chunk)}</pre>`;
  });
}

function buildNewUserChunks({ source, userContext, payload }) {
  const user = normalizeUserContext(userContext);
  const lines = [
    "<b>Yangi foydalanuvchi qo'shildi</b>",
    `<b>source:</b> ${htmlEscape(source || "bot start/register")}`,
    `<b>user_id:</b> <code>${htmlEscape(user.userId)}</code>`,
    `<b>user_name:</b> ${htmlEscape(user.displayName)}`,
  ];

  if (user.phoneNumber) lines.push(`<b>phone_number:</b> ${htmlEscape(user.phoneNumber)}`);
  if (user.fullName) lines.push(`<b>full_name:</b> ${htmlEscape(user.fullName)}`);

  const payloadText = stringifyPretty(payload);
  if (!payloadText) return [lines.join("\n")];

  return splitPlainText(payloadText).map((chunk, index, arr) => {
    const suffix = arr.length > 1 ? ` (${index + 1}/${arr.length})` : "";
    return `${lines.join("\n")}\n\n<b>tafsilot${suffix}:</b>\n<pre>${htmlEscape(chunk)}</pre>`;
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
    const text = String(chunk || "").slice(0, TELEGRAM_TEXT_LIMIT);
    if (!text) continue;
    const resp = await fetchImpl(`${TELEGRAM_API_ROOT}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: /^-?\d+$/.test(targetChatId) ? Number(targetChatId) : targetChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
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

  async function emit(level, entry = {}) {
    try {
      local(level, entry.scope || "log", entry.payload || entry.message || {});
      if (!shouldSend(level)) return false;
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
