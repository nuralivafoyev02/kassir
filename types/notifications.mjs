// Cloudflare Worker uchun soddalashtirilgan notification tizimi
// Faqat Telegram orqali notification

export const NOTIFICATION_PROVIDER_LEGACY_WORKER = "telegram";
export const DEFAULT_NOTIFICATION_PROVIDER = NOTIFICATION_PROVIDER_LEGACY_WORKER;

const KNOWN_PROVIDERS = new Set([NOTIFICATION_PROVIDER_LEGACY_WORKER]);

function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNotificationProvider(
  value,
  fallback = DEFAULT_NOTIFICATION_PROVIDER
) {
  const normalized = toTrimmedString(value).toLowerCase();
  return KNOWN_PROVIDERS.has(normalized) ? normalized : fallback;
}

export function buildPublicNotificationConfig(env = {}) {
  const provider = normalizeNotificationProvider(env.NOTIFICATION_PROVIDER);
  return {
    NOTIFICATION_PROVIDER: provider,
    NOTIFICATION_FALLBACK_PROVIDER: null,
    PUSH_NOTIFICATIONS_ENABLED: false,
  };
}
