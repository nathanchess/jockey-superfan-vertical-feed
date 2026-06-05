// Run: node scripts/check_ks_items.mjs
// Lists every item in the knowledge store with _id, asset_id, and status.
// Reads TL_API_KEY and TL_KS_ID from repo-root .env or environment.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env");

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env optional if vars are already exported
  }
}

loadEnvFile(ENV_PATH);

const API_KEY = process.env.TL_API_KEY?.trim();
const KS_ID = process.env.TL_KS_ID?.trim();
const BASE = (process.env.TWELVELABS_API_BASE ?? "https://api.twelvelabs.io/v1.3").replace(
  /\/$/,
  "",
);

if (!API_KEY || !KS_ID) {
  console.error("Set TL_API_KEY and TL_KS_ID in repo-root .env or environment.");
  process.exit(1);
}

async function main() {
  let page = 1;
  let totalItems = 0;

  console.log(`\nKnowledge store: ${KS_ID}\n${"─".repeat(70)}`);

  while (true) {
    const url = `${BASE}/knowledge-stores/${KS_ID}/items?page=${page}&page_limit=50&sort_by=created_at`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`\nAPI error ${res.status}: ${text}`);
      process.exit(1);
    }

    const body = await res.json();
    const items = body.data ?? [];

    for (const item of items) {
      totalItems++;
      console.log(`${String(totalItems).padStart(3, " ")}. _id      : ${item._id ?? "—"}`);
      console.log(`     asset_id : ${item.asset_id ?? "—"}`);
      console.log(`     status   : ${item.status ?? "—"}`);
      console.log(`     created  : ${item.created_at ?? "—"}`);
      console.log();
    }

    const info = body.page_info ?? {};
    console.log(
      `Page ${info.page ?? page}/${info.total_page ?? "?"} — ` +
        `${items.length} items on this page, ${info.total_results ?? "?"} total\n`,
    );

    const hasNext =
      info.page != null && info.total_page != null
        ? info.page < info.total_page
        : items.length === 50;

    if (!hasNext) break;
    page++;
  }

  console.log(`${"─".repeat(70)}\nDone. ${totalItems} item(s) found.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
