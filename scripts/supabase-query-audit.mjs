import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SEARCH_DIRS = ["api", "worker", "public", "db", "lib", "services"];
const FILE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx"]);

function walk(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".wrangler") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
  return out;
}

function addUsage(map, table, usage) {
  const key = String(table || "").trim();
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(usage);
}

function collectSupabaseJsUsages(filePath, source, map) {
  const regex =
    /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)([\s\S]{0,240}?)(?:\n\s*\.\w|\n\n|;)/g;
  let match;
  while ((match = regex.exec(source))) {
    const table = match[1];
    const fragment = match[0];
    const operations = [];
    for (const operation of [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "maybeSingle",
      "single",
      "order",
      "limit",
      "range",
      "eq",
      "gt",
      "gte",
      "lt",
      "lte",
      "or",
      "is",
      "in",
    ]) {
      if (fragment.includes(`.${operation}(`)) {
        operations.push(operation);
      }
    }
    addUsage(map, table, {
      file: path.relative(ROOT, filePath),
      kind: "supabase-js",
      operations,
      sample: fragment.replace(/\s+/g, " ").slice(0, 280),
    });
  }
}

function collectRestUsages(filePath, source, map) {
  const regex =
    /sbFetch(?:Json)?\([^)]*?['"`]\/([a-zA-Z0-9_]+)(?:\?[^'"`)]*)?['"`]([\s\S]{0,240}?)(?:\n\s*\)|\n\n|;)/g;
  let match;
  while ((match = regex.exec(source))) {
    const table = match[1];
    const fragment = match[0];
    const methodMatch = fragment.match(/method:\s*["'`](GET|POST|PATCH|DELETE|PUT)["'`]/i);
    addUsage(map, table, {
      file: path.relative(ROOT, filePath),
      kind: "rest",
      operations: [methodMatch ? methodMatch[1].toUpperCase() : "GET"],
      sample: fragment.replace(/\s+/g, " ").slice(0, 280),
    });
  }
}

function summarize(usages) {
  const operations = [...new Set(usages.flatMap((item) => item.operations || []))].sort();
  return {
    usage_count: usages.length,
    operations,
    files: [...new Set(usages.map((item) => item.file))].sort(),
    samples: usages.slice(0, 8),
  };
}

function main() {
  const usageMap = new Map();
  const files = SEARCH_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    collectSupabaseJsUsages(filePath, source, usageMap);
    collectRestUsages(filePath, source, usageMap);
  }

  const tables = [...usageMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([table, usages]) => [table, summarize(usages)]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned_files: files.length,
        tables: Object.fromEntries(tables),
      },
      null,
      2
    )
  );
}

main();
