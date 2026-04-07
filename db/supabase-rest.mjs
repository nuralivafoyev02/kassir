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
      throw new Error(`Supabase ${response.status}: ${raw}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }

  return {
    baseUrl,
    fetchJson,
  };
}
