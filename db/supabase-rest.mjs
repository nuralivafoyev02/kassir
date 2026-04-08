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
          if (attempt < maxAttempts && sbIsTransientInfraError(error)) {
            await sleep(sbRetryDelay(attempt));
            continue;
          }
          throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return response.json();
        }

        return response.text();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && sbIsTransientInfraError(error)) {
          await sleep(sbRetryDelay(attempt));
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("Supabase fetch failed");
  }

  return {
    baseUrl,
    fetchJson,
  };
}
