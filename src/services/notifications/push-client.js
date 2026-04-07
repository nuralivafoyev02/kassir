const STORAGE_KEYS = {
  deviceId: "kassa.push.device_id",
  token: "kassa.push.token",
  lastSyncAt: "kassa.push.last_sync_at",
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // ignore storage errors
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore storage errors
  }
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `kassa-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

function getDeviceId() {
  const existing = readStorage(STORAGE_KEYS.deviceId)
  if (existing) return existing
  const next = randomId()
  writeStorage(STORAGE_KEYS.deviceId, next)
  return next
}

function currentPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return window.Notification.permission || "default"
}

const storedToken = readStorage(STORAGE_KEYS.token)

const pushState = {
  userId: null,
  provider: "telegram",
  embeddedTelegram: false,
  appKind: "web_app",
  publicEnabled: false,
  supported: false,
  supportReason: "pending",
  status: "idle",
  permission: currentPermission(),
  tokenRegistered: Boolean(storedToken),
  lastSyncAt: readStorage(STORAGE_KEYS.lastSyncAt) || null,
  lastError: null,
}

function snapshotState() {
  return { ...pushState }
}

function emitState() {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("kassa:push-state", {
      detail: snapshotState(),
    })
  )
}

function updateState(patch = {}) {
  Object.assign(pushState, patch)
  emitState()
  return snapshotState()
}

function publicConfig(appConfig = window.__APP_CONFIG__ || {}) {
  return {
    NOTIFICATION_PROVIDER: String(appConfig.NOTIFICATION_PROVIDER || "").trim() || "telegram",
    PUSH_NOTIFICATIONS_ENABLED: appConfig.PUSH_NOTIFICATIONS_ENABLED === true,
  }
}

function currentSupportReason(config) {
  return config.PUSH_NOTIFICATIONS_ENABLED ? "push_disabled" : "legacy_only"
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  let data = {}

  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = {}
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || raw || `HTTP ${response.status}`)
  }

  return data
}

function buildRegistrationPayload(token = "", overrides = {}) {
  return {
    user_id: pushState.userId,
    device_key: getDeviceId(),
    token: token || "",
    platform: "web",
    app_kind: pushState.appKind,
    permission_state: currentPermission(),
    locale: navigator.language || "",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    user_agent: navigator.userAgent || "",
    is_telegram_embedded: pushState.embeddedTelegram,
    metadata: {
      path: window.location.pathname,
      lang: document.documentElement.lang || "",
      telegram_version: window.Telegram?.WebApp?.version || "",
    },
    ...overrides,
  }
}

export async function configurePushManager({
  userId,
  appConfig = window.__APP_CONFIG__ || {},
} = {}) {
  const config = publicConfig(appConfig)
  const embeddedTelegram = Boolean(window.Telegram?.WebApp)

  updateState({
    userId: Number(userId || 0) || null,
    provider: config.NOTIFICATION_PROVIDER,
    publicEnabled: config.PUSH_NOTIFICATIONS_ENABLED,
    embeddedTelegram,
    appKind: embeddedTelegram ? "mini_app" : "web_app",
    permission: currentPermission(),
    lastError: null,
  })

  return updateState({
    supported: false,
    supportReason: currentSupportReason(config),
    status: "disabled",
    embeddedTelegram,
  })
}

export async function syncPushToken({
  requestPermission = false,
  force = false,
} = {}) {
  const config = publicConfig()

  if (!pushState.userId) {
    return updateState({
      status: "waiting_user",
      lastError: null,
    })
  }

  updateState({
    permission: currentPermission(),
    status: "disabled",
    supported: false,
    supportReason: currentSupportReason(config),
    lastError: null,
  })
  return snapshotState()
}

export async function disablePushNotifications(reason = "manual_disable") {
  const config = publicConfig()
  const token = readStorage(STORAGE_KEYS.token)

  await postJson(
    "/api/push/unregister",
    buildRegistrationPayload("", {
      reason,
      token,
    })
  ).catch(() => {})

  removeStorage(STORAGE_KEYS.token)
  const nowIso = new Date().toISOString()
  writeStorage(STORAGE_KEYS.lastSyncAt, nowIso)

  return updateState({
    status: "disabled",
    supported: false,
    supportReason: currentSupportReason(config),
    permission: currentPermission(),
    tokenRegistered: false,
    lastSyncAt: nowIso,
    lastError: null,
  })
}

export function installPushManagerBridge() {
  if (typeof window === "undefined") return
  if (window.__KASSA_PUSH__) return

  window.__KASSA_PUSH__ = {
    configure: configurePushManager,
    sync: syncPushToken,
    disable: disablePushNotifications,
    getState: snapshotState,
  }

  emitState()
}
