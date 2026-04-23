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
  return [
    path.join(root, ".env"),
    path.join(root, "apps/backend/.dev.vars"),
  ].reduce((acc, filePath) => ({ ...acc, ...readDotEnv(filePath) }), {});
}

function getProjectRef(supabaseUrl) {
  try {
    return new URL(String(supabaseUrl || "")).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

async function main() {
  const root = process.cwd();
  const env = { ...loadEnv(root), ...process.env };

  const supabaseUrl = String(env.SUPABASE_URL || "").trim();
  const managementToken = String(env.SUPABASE_MANAGEMENT_TOKEN || "").trim();
  const projectRef = getProjectRef(supabaseUrl);

  if (!supabaseUrl || !managementToken || !projectRef) {
    throw new Error("SUPABASE_URL yoki SUPABASE_MANAGEMENT_TOKEN topilmadi.");
  }

  const query = fs.readFileSync(
    path.join(root, "db/migrations/20260423_add_transaction_currency_columns.sql"),
    "utf8"
  );

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managementToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        read_only: false,
      }),
    }
  );

  const raw = await response.text();
  console.log(raw);

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
