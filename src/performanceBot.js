require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { RconClient } = require("./rconClient");
const {
  adminCommandKey,
  isAdminActor,
  isAdminCommand,
  readAdminCommandConfig,
  sendAdminPrivate,
} = require("./adminCommands");
const {
  applyVipIds,
  buildPerformanceResult,
  formatPerformanceMessage,
  formatPrivateWinnerMessages,
  summarizePerformanceResult,
} = require("./performance");

const required = ["RCON_API_TOKEN", "RCON_BASE_URL"];
const seenCommands = new Set();
const seenMatchEndEvents = new Set();
let logsWarmedUp = false;
let lockFilePath = null;
let lockFd = null;
let stateFilePath = null;
let state = {
  lastMatchEndKey: null,
  lastMatchEndedAtMs: 0,
};

function nowIso() {
  return new Date().toISOString();
}

function logInfo(message, data) {
  if (data !== undefined) {
    console.log(`[${nowIso()}] ${message}`, data);
    return;
  }
  console.log(`[${nowIso()}] ${message}`);
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function readEnv() {
  for (const key of required) {
    if (!process.env[key] || !process.env[key].trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  const adminCommandConfig = readAdminCommandConfig(process.env);

  return {
    baseUrl: process.env.RCON_BASE_URL.replace(/\/$/, ""),
    token: process.env.RCON_API_TOKEN,
    pollIntervalMs: Number(process.env.PERFORMANCE_POLL_INTERVAL_MS || process.env.BOT_POLL_INTERVAL_MS || 5000),
    logWindow: Number(process.env.PERFORMANCE_LOG_WINDOW || process.env.BOT_LOG_WINDOW || 120),
    lockFile: process.env.PERFORMANCE_LOCK_FILE || "artifacts/performance-bot.lock",
    stateFile: process.env.PERFORMANCE_STATE_FILE || "artifacts/performance-bot-state.json",
    matchEndedCooldownMs: Number(
      process.env.PERFORMANCE_MATCH_ENDED_COOLDOWN_MS || process.env.BOT_MATCH_ENDED_COOLDOWN_MS || 300000
    ),
    statsEndpoint: process.env.PERFORMANCE_STATS_ENDPOINT || process.env.TOP_STATS_ENDPOINT || "get_live_game_stats",
    sendPublic: String(process.env.PERFORMANCE_SEND_PUBLIC || "true").toLowerCase() !== "false",
    sendWinnerPrivate: String(process.env.PERFORMANCE_SEND_WINNER_PRIVATE || "true").toLowerCase() !== "false",
    grantVip: String(process.env.PERFORMANCE_GRANT_VIP || "true").toLowerCase() !== "false",
    vipExpiration: process.env.PERFORMANCE_VIP_EXPIRATION || "3 days",
    ...adminCommandConfig,
    logInfo,
  };
}

function remember(set, key, max = 1000) {
  set.add(key);
  if (set.size > max) {
    const first = set.values().next().value;
    set.delete(first);
  }
}

function readLockFile() {
  try {
    if (!lockFilePath || !fs.existsSync(lockFilePath)) return null;
    const raw = fs.readFileSync(lockFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    logInfo("[lock] failed to read existing lock file", {
      file: lockFilePath,
      error: err.message,
    });
    return null;
  }
}

function releaseLock() {
  if (lockFd === null) return;
  try {
    fs.closeSync(lockFd);
  } catch (_) {}
  try {
    fs.unlinkSync(lockFilePath);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      logInfo("[lock] failed to remove lock file", {
        file: lockFilePath,
        error: err.message,
      });
    }
  }
  lockFd = null;
}

function acquireLock(filePath) {
  lockFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, "..", filePath);
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });

  try {
    lockFd = fs.openSync(lockFilePath, "wx");
  } catch (err) {
    if (err?.code === "EEXIST") {
      const existingLock = readLockFile();
      const existingPid = Number(existingLock?.pid || 0);
      const startedAt = existingLock?.startedAt || null;
      throw new Error(
        `[lock] lock file already exists (${lockFilePath})${existingPid ? ` pid=${existingPid}` : ""}${startedAt ? ` startedAt=${startedAt}` : ""}`
      );
    }
    throw err;
  }

  fs.writeFileSync(
    lockFd,
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: nowIso(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function statePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, "..", filePath);
}

function loadState(cfg) {
  stateFilePath = statePath(cfg.stateFile);
  try {
    if (!fs.existsSync(stateFilePath)) return;
    const raw = fs.readFileSync(stateFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.lastMatchEndKey =
        typeof parsed.lastMatchEndKey === "string" && parsed.lastMatchEndKey.trim()
          ? parsed.lastMatchEndKey
          : null;
      state.lastMatchEndedAtMs = Number(parsed.lastMatchEndedAtMs || 0) || 0;
    }
  } catch (err) {
    logInfo("[state] failed to load state file, continuing with empty state", {
      file: stateFilePath,
      error: err.message,
    });
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify(
        {
          lastMatchEndKey: state.lastMatchEndKey,
          lastMatchEndedAtMs: state.lastMatchEndedAtMs,
          updatedAt: nowIso(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (err) {
    logInfo("[state] failed to persist state file", {
      file: stateFilePath,
      error: err.message,
    });
  }
}

function isPerformanceCommand(log, cfg) {
  return isAdminCommand(log, cfg, "!tp");
}

function commandKey(log) {
  return adminCommandKey(log, "performance");
}

function matchEndKey(log) {
  const summary = normalizeText(log?.sub_content || log?.message || log?.raw);
  if (summary) {
    return `match-ended|${summary}`;
  }
  const ts = Number(log?.timestamp_ms || 0);
  if (Number.isFinite(ts) && ts > 0) {
    return `match-ended|${Math.floor(ts / 1000)}`;
  }
  return "match-ended|unknown";
}

function summarizeScoreboardResponse(resp) {
  const result = resp?.result || {};
  const stats = Array.isArray(result?.stats)
    ? result.stats
    : Array.isArray(result?.players)
      ? result.players
      : [];
  const first = stats[0] || {};

  return {
    resultKeys: Object.keys(result || {}),
    statsCount: stats.length,
    samplePlayerKeys: first && typeof first === "object" ? Object.keys(first).slice(0, 30) : [],
  };
}

async function collectPerformance(client, cfg) {
  logInfo("[performance] collecting stats", { endpoint: cfg.statsEndpoint });
  let statsResponse = await client.get(cfg.statsEndpoint);
  logInfo("[performance] stats endpoint summary", {
    endpoint: cfg.statsEndpoint,
    summary: summarizeScoreboardResponse(statsResponse),
  });

  const initialStats =
    statsResponse?.result?.stats ||
    statsResponse?.result?.players ||
    statsResponse?.players ||
    [];
  if (!Array.isArray(initialStats) || !initialStats.length) {
    logInfo("[performance] primary stats returned no players, trying fallback", {
      fallbackEndpoint: "get_live_scoreboard",
    });
    statsResponse = await client.get("get_live_scoreboard");
    logInfo("[performance] fallback endpoint summary", {
      endpoint: "get_live_scoreboard",
      summary: summarizeScoreboardResponse(statsResponse),
    });
  }

  const teamViewResponse = await client.get("get_team_view");
  const result = buildPerformanceResult(statsResponse, teamViewResponse);
  const currentVipIds = await getCurrentVipIds(client);
  applyVipIds(result, currentVipIds);
  const summary = summarizePerformanceResult(result);
  const message = formatPerformanceMessage(result);
  const privateWinnerMessages = formatPrivateWinnerMessages(result, cfg.vipExpiration);

  logInfo("[performance] result summary", summary);
  logInfo("[performance] message preview", { message });
  logInfo("[performance] private winner message previews", {
    count: privateWinnerMessages.length,
    previews: privateWinnerMessages.map((preview) => ({
      category: preview.category,
      originalPlayerId: preview.player?.playerId || null,
      originalPlayerName: preview.player?.playerName || null,
      redirectedToAdminId: cfg.adminId,
      message: preview.message,
    })),
  });

  return { result, summary, message, privateWinnerMessages };
}

function normalizeVipIdEntry(entry) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  return String(entry.player_id || entry.playerId || entry.steam_id_64 || entry.steamId64 || entry.id || "");
}

async function getCurrentVipIds(client) {
  try {
    const response = await client.get("get_vip_ids");
    const raw = Array.isArray(response?.result) ? response.result : [];
    const ids = new Set(raw.map(normalizeVipIdEntry).filter(Boolean));
    logInfo("[vip] current VIP ids loaded", { count: ids.size });
    return ids;
  } catch (err) {
    logInfo("[vip] failed to load current VIP ids, using team_view VIP flags only", {
      error: err.message,
    });
    return new Set();
  }
}

function vipDescriptionFor(preview) {
  if (preview.category === "role") return `VIP performance: meta ${preview.player?.roleLabel || "classe"}`;
  if (preview.category === "commander") return "VIP performance: melhor comandante";
  if (preview.category === "tank") return "VIP performance: melhor squad tanque";
  return "VIP performance: top jogadores da partida";
}

function resolveVipExpiration(value, now = new Date()) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("PERFORMANCE_VIP_EXPIRATION is empty; refusing to create permanent VIP");
  }

  if (/^(none|null|never|permanent|forever)$/i.test(raw)) {
    throw new Error(`PERFORMANCE_VIP_EXPIRATION=${raw} would create permanent VIP; refusing`);
  }

  const relative = raw.match(/^(\d+(?:\.\d+)?)\s*(d|day|days|h|hour|hours|m|min|minute|minutes)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const unitMs = unit.startsWith("d")
      ? 24 * 60 * 60 * 1000
      : unit.startsWith("h")
        ? 60 * 60 * 1000
        : 60 * 1000;
    const expiresAtMs = now.getTime() + amount * unitMs;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      throw new Error(`Invalid PERFORMANCE_VIP_EXPIRATION relative duration: ${raw}`);
    }
    return new Date(expiresAtMs).toISOString();
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(
      `Invalid PERFORMANCE_VIP_EXPIRATION=${raw}; use a relative duration like "1 day" or an ISO date`
    );
  }
  if (parsed.getTime() <= now.getTime()) {
    throw new Error(`PERFORMANCE_VIP_EXPIRATION=${raw} is not in the future`);
  }
  return parsed.toISOString();
}

async function grantVipForWinner(client, cfg, preview) {
  const playerId = String(preview?.player?.playerId || "").trim();
  if (!playerId) {
    logInfo("[vip] skipped winner without player_id", {
      category: preview.category,
      playerName: preview?.player?.playerName || null,
    });
    return false;
  }

  if (!cfg.grantVip) {
    logInfo("[vip] grant disabled by config", {
      playerId,
      playerName: preview.player.playerName,
      category: preview.category,
    });
    return false;
  }

  const payload = {
    player_id: playerId,
    description: vipDescriptionFor(preview),
    expiration: resolveVipExpiration(cfg.vipExpiration),
  };
  logInfo("[vip] adding VIP", {
    ...payload,
    configuredExpiration: cfg.vipExpiration,
    playerName: preview.player.playerName,
    category: preview.category,
  });
  await client.post("add_vip", payload);
  return true;
}

async function sendPerformancePreviews(client, cfg, message, privateWinnerMessages) {
  await sendAdminPrivate(client, cfg, message, {
    by: "hll-performance-bot-test",
    previewType: "public-performance-message",
    originalPlayerId: "message_all_players",
    originalPlayerName: "Todos os jogadores",
  });

  for (const preview of privateWinnerMessages) {
    await sendAdminPrivate(client, cfg, preview.message, {
      by: "hll-performance-bot-test",
      previewType: `private-${preview.category}`,
      originalPlayerId: preview.player?.playerId || "",
      originalPlayerName: preview.player?.playerName || "",
    });
  }
}

async function sendWinnerPrivate(client, cfg, preview) {
  if (!cfg.sendWinnerPrivate) {
    logInfo("[performance] winner private send disabled", {
      playerId: preview.player?.playerId || null,
      playerName: preview.player?.playerName || null,
      category: preview.category,
    });
    return;
  }

  if (!preview.player?.playerId) {
    logInfo("[performance] winner private skipped without player_id", {
      playerName: preview.player?.playerName || null,
      category: preview.category,
      message: preview.message,
    });
    return;
  }

  logInfo("[performance] sending winner private message", {
    playerId: preview.player.playerId,
    playerName: preview.player.playerName || null,
    category: preview.category,
    message: preview.message,
  });
  await client.post("message_player", {
    player_id: preview.player.playerId,
    player_name: preview.player.playerName || "",
    message: preview.message,
    by: "hll-performance-bot",
    save_message: false,
  });
}

async function publishPerformanceProduction(client, cfg, message, privateWinnerMessages) {
  if (cfg.sendPublic) {
    logInfo("[performance] sending public performance message", { message });
    await client.post("message_all_players", { message });
  } else {
    logInfo("[performance] public send disabled by config", { message });
  }

  for (const preview of privateWinnerMessages) {
    try {
      await grantVipForWinner(client, cfg, preview);
      await sendWinnerPrivate(client, cfg, preview);
    } catch (err) {
      logInfo("[performance] failed to process winner", {
        playerId: preview.player?.playerId || null,
        playerName: preview.player?.playerName || null,
        category: preview.category,
        error: err.message,
      });
    }
  }
}

async function pollLogs(client, cfg) {
  logInfo("[poll] reading recent logs");
  const logsResp = await client.post("get_recent_logs", {
    start: 0,
    end: cfg.logWindow,
  });

  const logs = logsResp?.result?.logs;
  logInfo("[poll] get_recent_logs return summary", {
    resultKeys: Object.keys(logsResp?.result || {}),
    logsType: Array.isArray(logs) ? "array" : typeof logs,
    logsCount: Array.isArray(logs) ? logs.length : 0,
  });
  if (!Array.isArray(logs)) return;

  logs.sort((a, b) => Number(a.timestamp_ms || 0) - Number(b.timestamp_ms || 0));

  if (!logsWarmedUp) {
    for (const log of logs) {
      if (isPerformanceCommand(log, cfg)) {
        remember(seenCommands, commandKey(log));
      }
      if (String(log.action || "") === "MATCH ENDED") {
        remember(seenMatchEndEvents, matchEndKey(log));
      }
    }
    logsWarmedUp = true;
    logInfo("[poll] warm-up complete", { commandsSeen: seenCommands.size });
    return;
  }

  let latestMatchEndedLog = null;
  for (const log of logs) {
    if (String(log.action || "") === "MATCH ENDED") {
      const currentTs = Number(log.timestamp_ms || 0);
      const currentLatestTs = Number(latestMatchEndedLog?.timestamp_ms || 0);
      if (!latestMatchEndedLog || currentTs >= currentLatestTs) {
        latestMatchEndedLog = log;
      }
    }

    if (!isPerformanceCommand(log, cfg)) continue;

    const key = commandKey(log);
    if (seenCommands.has(key)) continue;
    remember(seenCommands, key);

    if (!isAdminActor(log, cfg)) {
      logInfo("[event] admin performance preview ignored because player is not allowed", {
        playerId: log.player_id_1 || null,
        playerName: log.player_name_1 || null,
        content: log.sub_content || null,
        adminId: cfg.adminId,
      });
      continue;
    }

    logInfo("[event] admin performance preview detected", {
      playerId: log.player_id_1 || null,
      playerName: log.player_name_1 || null,
      content: log.sub_content || null,
    });

    const { message, privateWinnerMessages } = await collectPerformance(client, cfg);
    await sendPerformancePreviews(client, cfg, message, privateWinnerMessages);
  }

  if (!latestMatchEndedLog) return;

  const currentMatchEndKey = matchEndKey(latestMatchEndedLog);
  const nowMs = Date.now();
  const elapsedMs = nowMs - Number(state.lastMatchEndedAtMs || 0);
  const withinCooldown =
    Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < cfg.matchEndedCooldownMs;

  if (state.lastMatchEndKey && state.lastMatchEndKey === currentMatchEndKey) return;
  if (seenMatchEndEvents.has(currentMatchEndKey)) return;
  if (withinCooldown) {
    logInfo("[event] MATCH ENDED skipped by cooldown", {
      matchEndKey: currentMatchEndKey,
      elapsedMs,
      cooldownMs: cfg.matchEndedCooldownMs,
    });
    return;
  }

  remember(seenMatchEndEvents, currentMatchEndKey);
  logInfo("[event] MATCH ENDED detected for performance", {
    raw: latestMatchEndedLog.raw || null,
    matchEndKey: currentMatchEndKey,
    cooldownMs: cfg.matchEndedCooldownMs,
  });
  state.lastMatchEndKey = currentMatchEndKey;
  state.lastMatchEndedAtMs = nowMs;
  saveState();
  const { message, privateWinnerMessages } = await collectPerformance(client, cfg);
  await publishPerformanceProduction(client, cfg, message, privateWinnerMessages);
}

async function main() {
  const cfg = readEnv();
  const client = new RconClient(cfg);
  acquireLock(cfg.lockFile);
  loadState(cfg);

  logInfo("[performance-bot] started", {
    baseUrl: cfg.baseUrl,
    pollIntervalMs: cfg.pollIntervalMs,
    logWindow: cfg.logWindow,
    lockFilePath,
    stateFilePath,
    matchEndedCooldownMs: cfg.matchEndedCooldownMs,
    statsEndpoint: cfg.statsEndpoint,
    sendPublic: cfg.sendPublic,
    sendWinnerPrivate: cfg.sendWinnerPrivate,
    grantVip: cfg.grantVip,
    vipExpiration: cfg.vipExpiration,
    enableTestCommands: cfg.enableTestCommands,
    adminId: cfg.adminId,
    lastMatchEndKey: state.lastMatchEndKey,
    lastMatchEndedAtMs: state.lastMatchEndedAtMs,
  });

  while (true) {
    try {
      await pollLogs(client, cfg);
    } catch (err) {
      console.error(`[${nowIso()}] [performance-bot] poll error:`, err.message);
    }

    await new Promise((resolve) => setTimeout(resolve, cfg.pollIntervalMs));
  }
}

process.on("exit", releaseLock);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main().catch((err) => {
  console.error(err);
  releaseLock();
  process.exit(1);
});
