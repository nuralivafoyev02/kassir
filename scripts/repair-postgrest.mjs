import fs from "fs";
import path from "path";

function readDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key) out[key] = value;
  }
  return out;
}

function loadEnv(root) {
  const envFiles = [
    path.join(root, ".env"),
    path.join(root, "apps/backend/.dev.vars"),
  ];

  return envFiles.reduce((acc, filePath) => {
    return { ...acc, ...readDotEnv(filePath) };
  }, {});
}

function getProjectRef(supabaseUrl) {
  try {
    const url = new URL(String(supabaseUrl || ""));
    return url.hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return {
      body: text ? JSON.parse(text) : null,
      raw: text,
    };
  } catch {
    return {
      body: text,
      raw: text,
    };
  }
}

async function runManagementQuery({ token, projectRef, query, readOnly = false }) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        read_only: readOnly,
      }),
    }
  );

  const payload = await readResponse(response);

  if (!response.ok) {
    const error = new Error(
      `Management API ${response.status}: ${
        typeof payload.body === "string"
          ? payload.body
          : JSON.stringify(payload.body)
      }`
    );
    error.status = response.status;
    error.body = payload.body;
    throw error;
  }

  return payload.body;
}

async function checkEndpoint(supabaseUrl, serviceRoleKey, endpointPath, extraHeaders = {}) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/g, "")}${endpointPath}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...extraHeaders,
      },
    }
  );

  const payload = await readResponse(response);

  return {
    path: endpointPath,
    status: response.status,
    contentType: response.headers.get("content-type") || null,
    proxyStatus: response.headers.get("proxy-status") || null,
    requestId: response.headers.get("sb-request-id") || null,
    body: payload.body,
  };
}

function buildDiagnosticQuery() {
  return `
select now() as checked_at_utc, current_database() as database_name, version() as postgres_version;
select pg_notification_queue_usage() as queue_usage_before;
select pid,
       usename,
       application_name,
       client_addr::text as client_addr,
       state,
       wait_event_type,
       wait_event,
       coalesce(date_trunc('second', now() - query_start)::text, '00:00:00') as running_for,
       left(regexp_replace(query, '\\s+', ' ', 'g'), 500) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
order by query_start asc
limit 50;
select locktype,
       coalesce(relation::regclass::text, '') as relation_name,
       mode,
       granted,
       pid
from pg_locks
where pid in (
  select pid
  from pg_stat_activity
  where datname = current_database()
)
order by granted asc, relation_name asc, pid asc
limit 50;
select pg_notify('pgrst', 'reload schema') as reloaded;
select pg_notification_queue_usage() as queue_usage_after;
`.trim();
}

async function main() {
  const root = process.cwd();
  const fileEnv = loadEnv(root);
  const env = { ...fileEnv, ...process.env };

  const supabaseUrl = String(env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || ""
  ).trim();
  const managementToken = String(
    env.SUPABASE_MANAGEMENT_TOKEN ||
      env.SUPABASE_ACCESS_TOKEN ||
      env.SUPABASE_PAT ||
      ""
  ).trim();
  const projectRef = getProjectRef(supabaseUrl);

  if (!supabaseUrl || !serviceRoleKey || !projectRef) {
    throw new Error("SUPABASE_URL yoki service role key topilmadi.");
  }

  const before = await Promise.all([
    checkEndpoint(supabaseUrl, serviceRoleKey, "/rest-admin/v1/live"),
    checkEndpoint(supabaseUrl, serviceRoleKey, "/rest-admin/v1/ready"),
    checkEndpoint(supabaseUrl, serviceRoleKey, "/rest/v1/", {
      Accept: "application/openapi+json",
    }),
    checkEndpoint(
      supabaseUrl,
      serviceRoleKey,
      "/rest/v1/users?select=user_id&limit=1"
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        step: "before_health",
        endpoints: before,
      },
      null,
      2
    )
  );

  if (!managementToken) {
    throw new Error(
      "SUPABASE_MANAGEMENT_TOKEN topilmadi. To'liq repair uchun PAT kerak."
    );
  }

  const repairResult = await runManagementQuery({
    token: managementToken,
    projectRef,
    query: buildDiagnosticQuery(),
    readOnly: false,
  });

  console.log(
    JSON.stringify(
      {
        step: "repair_result",
        body: repairResult,
      },
      null,
      2
    )
  );

  const after = await Promise.all([
    checkEndpoint(supabaseUrl, serviceRoleKey, "/rest-admin/v1/live"),
    checkEndpoint(supabaseUrl, serviceRoleKey, "/rest-admin/v1/ready"),
    checkEndpoint(supabaseUrl, serviceRoleKey, "/rest/v1/", {
      Accept: "application/openapi+json",
    }),
    checkEndpoint(
      supabaseUrl,
      serviceRoleKey,
      "/rest/v1/users?select=user_id&limit=1"
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        step: "after_health",
        endpoints: after,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error?.message || String(error),
        status: error?.status || null,
        body: error?.body || null,
      },
      null,
      2
    )
  );
  process.exit(1);
});
