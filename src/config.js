const required = ["RCON_API_TOKEN", "RCON_BASE_URL"];

function readEnv() {
  for (const key of required) {
    if (!process.env[key] || !process.env[key].trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    baseUrl: process.env.RCON_BASE_URL.replace(/\/$/, ""),
    token: process.env.RCON_API_TOKEN,
    pollIntervalMs: Number(process.env.BOT_POLL_INTERVAL_MS || 5000),
    logWindow: Number(process.env.BOT_LOG_WINDOW || 120),
    lockFile: process.env.BOT_LOCK_FILE || "artifacts/bot.lock",
    botsConfigFile: process.env.BOTS_CONFIG_FILE || "bots.config.json",
    topCommandCooldownMs: Number(process.env.BOT_TOP_COMMAND_COOLDOWN_MS || 15000),
    matchEndedCooldownMs: Number(process.env.BOT_MATCH_ENDED_COOLDOWN_MS || 300000),
    topLimit: Number(process.env.TOP_LIMIT || 10),
    topStatsEndpoint: process.env.TOP_STATS_ENDPOINT || "get_live_game_stats",
    dryRun: String(process.env.BOT_DRY_RUN || "false").toLowerCase() === "true",
    includeHeaderForTop: String(process.env.TOP_INCLUDE_HEADER || "true").toLowerCase() === "true",
  };
}

module.exports = { readEnv };
