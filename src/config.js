const { readAdminCommandConfig } = require("./adminCommands");

const required = ["RCON_API_TOKEN", "RCON_BASE_URL"];

function readEnv() {
  for (const key of required) {
    if (!process.env[key] || !process.env[key].trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  const topCommandAdminOnly = String(process.env.TOP_COMMAND_ADMIN_ONLY || "false").toLowerCase() === "true";
  if (topCommandAdminOnly && !String(process.env.ADMINISTRADOR_ID || "").trim()) {
    throw new Error("Missing required env var: ADMINISTRADOR_ID when TOP_COMMAND_ADMIN_ONLY=true");
  }

  return {
    baseUrl: process.env.RCON_BASE_URL.replace(/\/$/, ""),
    token: process.env.RCON_API_TOKEN,
    pollIntervalMs: Number(process.env.BOT_POLL_INTERVAL_MS || 5000),
    logWindow: Number(process.env.BOT_LOG_WINDOW || 120),
    lockFile: process.env.BOT_LOCK_FILE || "artifacts/bot.lock",
    topCommandCooldownMs: Number(process.env.BOT_TOP_COMMAND_COOLDOWN_MS || 15000),
    matchEndedCooldownMs: Number(process.env.BOT_MATCH_ENDED_COOLDOWN_MS || 300000),
    rankingSnapshotEndpoint: process.env.RANKING_SNAPSHOT_ENDPOINT || "",
    rankingIngestionToken: process.env.RANKING_INGESTION_TOKEN || "",
    rankingSnapshotEnabled:
      String(process.env.RANKING_SNAPSHOT_ENABLED || "true").toLowerCase() !== "false",
    topLimit: Number(process.env.TOP_LIMIT || 10),
    topCommandAdminOnly,
    topStatsEndpoint: process.env.TOP_STATS_ENDPOINT || "get_live_game_stats",
    dryRun: String(process.env.BOT_DRY_RUN || "false").toLowerCase() === "true",
    opBotEnabled: String(process.env.OP_BOT_ENABLED || "true").toLowerCase() !== "false",
    includeHeaderForTop: String(process.env.TOP_INCLUDE_HEADER || "true").toLowerCase() === "true",
    ...readAdminCommandConfig(process.env),
  };
}

module.exports = { readEnv };
