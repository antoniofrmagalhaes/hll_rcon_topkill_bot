require("dotenv").config();
const fs = require("node:fs/promises");
const path = require("node:path");
const { readEnv } = require("./config");
const { RconClient } = require("./rconClient");

async function run() {
  const cfg = readEnv();
  const client = new RconClient(cfg);

  const res = await client.get("get_api_documentation");
  const endpoints = Array.isArray(res?.result) ? res.result : [];

  const byMethod = { GET: [], POST: [] };
  for (const item of endpoints) {
    for (const method of item.allowed_http_methods || []) {
      if (!byMethod[method]) byMethod[method] = [];
      byMethod[method].push(item.endpoint);
    }
  }

  const keywords = ["live", "scoreboard", "log", "chat", "game", "player", "message", "match"];
  const buckets = Object.fromEntries(keywords.map((k) => [k, []]));
  for (const item of endpoints) {
    for (const key of keywords) {
      if (String(item.endpoint).includes(key)) {
        buckets[key].push(item.endpoint);
      }
    }
  }

  const outDir = path.resolve("artifacts");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "api-docs.json"), JSON.stringify(res, null, 2));

  console.log(`Total endpoints: ${endpoints.length}`);
  console.log(`GET: ${byMethod.GET.length} | POST: ${byMethod.POST.length}`);
  console.log("--- Keyword buckets ---");
  for (const key of keywords) {
    console.log(`${key}: ${buckets[key].length}`);
  }

  console.log("Saved: artifacts/api-docs.json");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
