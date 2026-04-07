import { escapeHtml } from "../../utils/html-text.mjs";

function toSafeChatId(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTgApiUrl(env, method) {
  return `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
}

function buildLegacyHtml({ html = "", title = "", body = "" } = {}) {
  if (String(html || "").trim()) {
    return String(html).trim();
  }

  const sections = [];
  if (String(title || "").trim()) {
    sections.push(`<b>${escapeHtml(title)}</b>`);
  }
  if (String(body || "").trim()) {
    sections.push(escapeHtml(body).replace(/\n/g, "\n"));
  }
  return sections.join("\n\n").trim();
}

export async function sendLegacyWorkerNotification(
  env,
  { userId, html = "", title = "", body = "", extra = {} } = {}
) {
  if (!env?.BOT_TOKEN) {
    throw new Error("BOT_TOKEN yo'q");
  }

  const chatId = toSafeChatId(userId);
  if (!chatId) {
    throw new Error(`Invalid Telegram chat_id: ${userId}`);
  }

  const response = await fetch(buildTgApiUrl(env, "sendMessage"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildLegacyHtml({ html, title, body }),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }),
  });

  const raw = await response.text();
  let payload;

  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { ok: false, raw };
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.description || payload?.raw || `Telegram HTTP ${response.status}`
    );
  }

  return {
    ok: true,
    messageId: payload?.result?.message_id ?? null,
  };
}
