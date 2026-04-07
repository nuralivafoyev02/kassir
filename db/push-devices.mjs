import { DEFAULT_NOTIFICATION_PROVIDER } from "../types/notifications.mjs";
import { createSupabaseRestClient, sbMissingTable } from "./supabase-rest.mjs";

function toIsoNow() {
  return new Date().toISOString();
}

function sanitizeText(value, maxLength = 1024) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, maxLength);
}

function sanitizeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function toSafeUserId(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function normalizePermissionState(value) {
  const normalized = String(value || "default").trim().toLowerCase();
  if (normalized === "granted" || normalized === "denied") {
    return normalized;
  }

  if (normalized === "unsupported") {
    return normalized;
  }

  return "default";
}

function normalizeDeviceKey(value) {
  return sanitizeText(value, 200);
}

export function summarizePushDevice(row) {
  return {
    id: row?.id ?? null,
    user_id: row?.user_id ?? null,
    device_key: row?.device_key ?? null,
    provider: row?.provider ?? DEFAULT_NOTIFICATION_PROVIDER,
    app_kind: row?.app_kind ?? "web_app",
    permission_state: row?.permission_state ?? "default",
    is_active: row?.is_active === true,
    token_present: Boolean(row?.token),
    last_seen_at: row?.last_seen_at ?? null,
    last_registered_at: row?.last_registered_at ?? null,
    invalidated_at: row?.invalidated_at ?? null,
    deactivated_reason: row?.deactivated_reason ?? null,
  };
}

async function clearConflictingToken(client, token, deviceKey, nowIso) {
  if (!token) return;

  await client.fetchJson(
    `/user_push_tokens?token=eq.${encodeURIComponent(
      token
    )}&device_key=neq.${encodeURIComponent(deviceKey)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        token: null,
        is_active: false,
        invalidated_at: nowIso,
        deactivated_reason: "token_reassigned",
        last_seen_at: nowIso,
      }),
    }
  );
}

export async function listActivePushDevices(env, userId) {
  const safeUserId = toSafeUserId(userId);
  if (!safeUserId) return [];

  const client = createSupabaseRestClient(env);

  try {
    const rows = await client.fetchJson(
      `/user_push_tokens?select=id,user_id,device_key,token,provider,platform,app_kind,permission_state,is_active,last_seen_at,last_registered_at,invalidated_at,deactivated_reason,metadata` +
        `&user_id=eq.${encodeURIComponent(safeUserId)}` +
        `&is_active=eq.true` +
        `&token=not.is.null` +
        `&order=updated_at.desc`
    );

    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (sbMissingTable(error, "user_push_tokens")) {
      return [];
    }

    throw error;
  }
}

export async function upsertPushDevice(env, registration = {}) {
  const safeUserId = toSafeUserId(registration.user_id || registration.userId);
  const deviceKey = normalizeDeviceKey(
    registration.device_key || registration.deviceKey
  );

  if (!safeUserId) {
    throw new Error("user_id required");
  }

  if (!deviceKey) {
    throw new Error("device_key required");
  }

  const client = createSupabaseRestClient(env);
  const nowIso = toIsoNow();
  const token = sanitizeText(registration.token, 4096);
  const permissionState = normalizePermissionState(
    registration.permission_state || registration.permissionState
  );

  if (token) {
    await clearConflictingToken(client, token, deviceKey, nowIso);
  }

  const payload = {
    user_id: safeUserId,
    device_key: deviceKey,
    token: token || null,
    provider: DEFAULT_NOTIFICATION_PROVIDER,
    platform: sanitizeText(registration.platform, 40) || "web",
    app_kind:
      sanitizeText(registration.app_kind || registration.appKind, 40) ||
      "web_app",
    permission_state: permissionState,
    is_active: Boolean(token && permissionState === "granted"),
    user_agent:
      sanitizeText(registration.user_agent || registration.userAgent, 1024) ||
      null,
    locale: sanitizeText(registration.locale, 32) || null,
    timezone: sanitizeText(registration.timezone, 80) || null,
    is_telegram_embedded:
      registration.is_telegram_embedded === true ||
      registration.isTelegramEmbedded === true,
    last_seen_at: nowIso,
    last_registered_at: token ? nowIso : null,
    invalidated_at: null,
    deactivated_reason: null,
    metadata: sanitizeMetadata(registration.metadata),
  };

  const rows = await client.fetchJson(`/user_push_tokens?on_conflict=device_key`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function deactivatePushDeviceRegistration(env, payload = {}) {
  const userId = toSafeUserId(payload.user_id || payload.userId);
  const deviceKey = normalizeDeviceKey(payload.device_key || payload.deviceKey);
  const token = sanitizeText(payload.token, 4096);
  const permissionState = normalizePermissionState(
    payload.permission_state || payload.permissionState
  );

  if (!deviceKey && !token) {
    throw new Error("device_key or token required");
  }

  const filters = [];
  if (userId) {
    filters.push(`user_id=eq.${encodeURIComponent(userId)}`);
  }
  if (deviceKey) {
    filters.push(`device_key=eq.${encodeURIComponent(deviceKey)}`);
  }
  if (token) {
    filters.push(`token=eq.${encodeURIComponent(token)}`);
  }

  const updatePayload = {
    token: null,
    is_active: false,
    invalidated_at: toIsoNow(),
    deactivated_reason:
      sanitizeText(payload.reason, 120) || "client_disabled",
    last_seen_at: toIsoNow(),
  };

  if (permissionState) {
    updatePayload.permission_state = permissionState;
  }

  const client = createSupabaseRestClient(env);

  try {
    return await client.fetchJson(`/user_push_tokens?${filters.join("&")}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updatePayload),
    });
  } catch (error) {
    if (sbMissingTable(error, "user_push_tokens")) {
      return [];
    }

    throw error;
  }
}

export async function markInvalidPushTokens(env, invalidTokens = []) {
  for (const item of invalidTokens) {
    const token = sanitizeText(item?.token, 4096);
    if (!token) continue;

    await deactivatePushDeviceRegistration(env, {
      token,
      reason: sanitizeText(item?.code, 120) || "invalid_token",
    }).catch(() => {});
  }
}
