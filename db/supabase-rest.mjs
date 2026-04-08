function toTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function sbErrorText(error) {
  return String(error?.message || error || "");
}

export function sbMissingTable(error, table) {
  const message = sbErrorText(error).toLowerCase();
  const target = String(table || "").toLowerCase();
  return (
    !!target &&
    message.includes(target) &&
    (message.includes("could not find the table") ||
      message.includes("relation") ||
      message.includes("does not exist"))
  );
}

export function sbMissingColumn(error, column) {
  const message = sbErrorText(error).toLowerCase();
  const target = String(column || "").toLowerCase();
  return (
    !!target &&
    message.includes(target) &&
    (message.includes("could not find the column") ||
      message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("unknown column"))
  );
}

export function sbIsSchemaCacheUnavailable(error) {
  const message = sbErrorText(error).toLowerCase();
  return (
    message.includes("pgrst002") ||
    message.includes("could not query the database for the schema cache") ||
    message.includes("schema cache")
  );
}

export function sbIsPoolTimeout(error) {
  const message = sbErrorText(error).toLowerCase();
  return (
    message.includes("pgrst003") ||
    message.includes("timed out acquiring connection from connection pool") ||
    message.includes("connection pool")
  );
}

export function sbIsTransientInfraError(error) {
  const message = sbErrorText(error).toLowerCase();
  return (
    sbIsSchemaCacheUnavailable(error) ||
    sbIsPoolTimeout(error) ||
    message.includes("supabase 502") ||
    message.includes("supabase 503") ||
    message.includes("supabase 504") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sbRetryDelay(attempt) {
  return Math.min(1500, 250 * Math.max(1, attempt));
}

const SUPABASE_OUTAGE_TTL_MS = 30 * 1000;
const SUPABASE_SCHEMA_CACHE_TTL_MS = 60 * 1000;
const supabaseInfraCircuit = { openUntil: 0, reason: "" };

function clearCircuit() {
  supabaseInfraCircuit.openUntil = 0;
  supabaseInfraCircuit.reason = "";
}

function buildCircuitError() {
  const error = new Error(
    `Supabase 503: temporary outage circuit open (${supabaseInfraCircuit.reason || "recent transient infra failure"})`
  );
  error.status = 503;
  error.code = "SUPABASE_CIRCUIT_OPEN";
  return error;
}

function getOpenCircuitError() {
  if (supabaseInfraCircuit.openUntil > Date.now()) {
    return buildCircuitError();
  }

  if (supabaseInfraCircuit.openUntil > 0) {
    clearCircuit();
  }

  return null;
}

function openCircuit(error) {
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

export function createSupabaseRestClient(env = {}) {
  const supabaseUrl = toTrimmedString(env.SUPABASE_URL);
  const serviceRoleKey = toTrimmedString(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY
  );

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL yo'q");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY yo'q");
  }

  const baseUrl = `${supabaseUrl.replace(/\/+$/g, "")}/rest/v1`;

  async function fetchJson(path, init = {}) {
    const maxAttempts = 3;
    let lastError = null;

    const circuitError = getOpenCircuitError();
    if (circuitError) throw circuitError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(
          `${baseUrl}${String(path || "").startsWith("/") ? "" : "/"}${path}`,
          {
            ...init,
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              ...(init.headers || {}),
            },
          }
        );

        if (!response.ok) {
          const raw = await response.text();
          const error = new Error(`Supabase ${response.status}: ${raw}`);
          lastError = error;
          const schemaCacheDown = sbIsSchemaCacheUnavailable(error);
          if (attempt < maxAttempts && sbIsTransientInfraError(error) && !schemaCacheDown) {
            await sleep(sbRetryDelay(attempt));
            continue;
          }
          if (sbIsTransientInfraError(error)) {
            openCircuit(error);
          }
          throw error;
        }

        clearCircuit();
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return response.json();
        }

        return response.text();
      } catch (error) {
        lastError = error;
        const schemaCacheDown = sbIsSchemaCacheUnavailable(error);
        if (attempt < maxAttempts && sbIsTransientInfraError(error) && !schemaCacheDown) {
          await sleep(sbRetryDelay(attempt));
          continue;
        }
        if (sbIsTransientInfraError(error)) {
          openCircuit(error);
        }
        throw error;
      }
    }

    if (sbIsTransientInfraError(lastError)) {
      openCircuit(lastError);
    }
    throw lastError || new Error("Supabase fetch failed");
  }

  return {
    baseUrl,
    fetchJson,
  };
}
