// Cloudflare Worker uchun soddalashtirilgan notification tizimi
// Faqat Telegram orqali notification

import {
  DEFAULT_NOTIFICATION_PROVIDER,
  NOTIFICATION_PROVIDER_LEGACY_WORKER,
  normalizeNotificationProvider,
} from "../../types/notifications.mjs";
import { sendLegacyWorkerNotification } from "../../providers/legacy/worker-telegram.mjs";
import { escapeHtml, toPlainNotificationContent } from "../../utils/html-text.mjs";

function toSafeUserId(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function buildLegacyHtml(input = {}) {
  if (String(input.html || "").trim()) {
    return String(input.html).trim();
  }

  const plain = toPlainNotificationContent(input);
  const sections = [];
  if (plain.title) {
    sections.push(`<b>${escapeHtml(plain.title)}</b>`);
  }
  if (plain.body) {
    sections.push(escapeHtml(plain.body));
  }
  return sections.join("\n\n").trim();
}

export async function sendNotification(env, input = {}) {
  const userId = toSafeUserId(input.userId || input.user_id);
  const provider = normalizeNotificationProvider(
    env?.NOTIFICATION_PROVIDER,
    DEFAULT_NOTIFICATION_PROVIDER
  );

  if (!userId) {
    return {
      ok: false,
      provider,
      primaryProvider: provider,
      fallbackProvider: null,
      fallbackUsed: false,
      reason: "invalid_user_id",
      deliveredCount: 0,
      targetCount: 0,
    };
  }

  try {
    const delivery = await sendLegacyWorkerNotification(env, {
      userId: input.userId,
      html: buildLegacyHtml(input),
      title: input.title,
      body: input.body,
      extra: input.legacyExtra || {},
    });

    return {
      ok: true,
      provider: NOTIFICATION_PROVIDER_LEGACY_WORKER,
      primaryProvider: provider,
      fallbackProvider: null,
      fallbackUsed: false,
      deliveredCount: 1,
      targetCount: 1,
      legacyMessageId: delivery.messageId || null,
    };
  } catch (error) {
    return {
      ok: false,
      provider: NOTIFICATION_PROVIDER_LEGACY_WORKER,
      primaryProvider: provider,
      fallbackProvider: null,
      fallbackUsed: false,
      reason: "telegram_send_failed",
      error: error?.message || String(error),
      deliveredCount: 0,
      targetCount: 1,
    };
  }
}
