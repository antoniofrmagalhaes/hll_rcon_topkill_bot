require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { RconClient } = require("./rconClient");

const required = ["RCON_API_TOKEN", "RCON_BASE_URL"];
const seenCommands = new Set();
const commandCooldownByActor = new Map();
let logsWarmedUp = false;
let lockFilePath = null;
let lockFd = null;

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

  return {
    baseUrl: process.env.RCON_BASE_URL.replace(/\/$/, ""),
    token: process.env.RCON_API_TOKEN,
    pollIntervalMs: Number(process.env.PERFORMANCE_INFO_POLL_INTERVAL_MS || process.env.BOT_POLL_INTERVAL_MS || 5000),
    logWindow: Number(process.env.PERFORMANCE_INFO_LOG_WINDOW || process.env.BOT_LOG_WINDOW || 120),
    lockFile: process.env.PERFORMANCE_INFO_LOCK_FILE || "artifacts/performance-info-bot.lock",
    commandCooldownMs: Number(
      process.env.PERFORMANCE_INFO_COMMAND_COOLDOWN_MS || process.env.BOT_TOP_COMMAND_COOLDOWN_MS || 15000
    ),
    dryRun: String(process.env.PERFORMANCE_INFO_DRY_RUN || "false").toLowerCase() === "true",
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

function isPerformanceInfoCommand(log) {
  if (!log || typeof log !== "object") return false;
  if (!String(log.action || "").startsWith("CHAT")) return false;

  const content = normalizeText(log.sub_content);
  return content === "!perf" || content.startsWith("!perf ") || content === "!performance" || content.startsWith("!performance ");
}

function commandKey(log) {
  const playerRef = String(log?.player_id_1 || "").trim() || normalizeText(log?.player_name_1) || "unknown";
  const normalizedRaw = normalizeText(log?.raw);
  if (normalizedRaw) {
    return `performance-info-command|${playerRef}|${normalizedRaw}`;
  }

  const ts = Number(log?.timestamp_ms || 0);
  const bucket = Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 1000) : "no-ts";
  return `performance-info-command|${playerRef}|${normalizeText(log?.sub_content)}|${bucket}`;
}

function commandActorKey(log) {
  const playerId = String(log?.player_id_1 || "").trim();
  const playerName = normalizeText(log?.player_name_1);
  return playerId || playerName || "unknown";
}

function shouldSkipByCooldown(log, cfg) {
  const actorKey = commandActorKey(log);
  const nowMs = Date.now();
  const lastMs = Number(commandCooldownByActor.get(actorKey) || 0);
  const elapsedMs = nowMs - lastMs;
  if (lastMs > 0 && elapsedMs >= 0 && elapsedMs < cfg.commandCooldownMs) {
    return true;
  }

  commandCooldownByActor.set(actorKey, nowMs);
  if (commandCooldownByActor.size > 2000) {
    const firstKey = commandCooldownByActor.keys().next().value;
    commandCooldownByActor.delete(firstKey);
  }
  return false;
}

function formatPerformanceInfoMessage() {
  return [
    "VIP Por Performance",
    "",
    "Melhor comandante",
    "Top 3 jogadores da partida",
    "Melhor squad de tanque",
    "",
    "Comandante:",
    "suporte x1, combate x1, abates x10, ataque/defesa x0.5",
    "",
    "Jogadores:",
    "kills x20, KPM x100, combate x1, ataque x1, defesa x1, suporte x1.2",
    "",
    "Tanque:",
    "kills x10, combate x1, ataque x1, defesa x1, suporte x1",
    "",
    "Premiacao: 1 dia de VIP nao acumulativo.",
  ].join("\n");
}

async function sendPerformanceInfo(client, cfg, targetPlayer) {
  const message = formatPerformanceInfoMessage();

  if (!targetPlayer?.playerId) {
    logInfo("[performance-info] command ignored because player_id is missing", {
      playerName: targetPlayer?.playerName || null,
      message,
    });
    return;
  }

  if (cfg.dryRun) {
    logInfo("[dry-run] would send performance info private message", {
      playerId: targetPlayer.playerId,
      playerName: targetPlayer.playerName || null,
      message,
    });
    console.log(message);
    return;
  }

  logInfo("[performance-info] sending private message", {
    playerId: targetPlayer.playerId,
    playerName: targetPlayer.playerName || null,
    message,
  });

  await client.post("message_player", {
    player_id: targetPlayer.playerId,
    player_name: targetPlayer.playerName || "",
    message,
    by: "hll-performance-info-bot",
    save_message: false,
  });
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
      if (isPerformanceInfoCommand(log)) {
        remember(seenCommands, commandKey(log));
      }
    }
    logsWarmedUp = true;
    logInfo("[poll] warm-up complete", { commandsSeen: seenCommands.size });
    return;
  }

  for (const log of logs) {
    if (!isPerformanceInfoCommand(log)) continue;

    const key = commandKey(log);
    if (seenCommands.has(key)) continue;
    remember(seenCommands, key);

    if (shouldSkipByCooldown(log, cfg)) {
      logInfo("[event] performance info command skipped by cooldown", {
        playerId: log.player_id_1 || null,
        playerName: log.player_name_1 || null,
        content: log.sub_content || null,
        cooldownMs: cfg.commandCooldownMs,
      });
      continue;
    }

    logInfo("[event] performance info command detected", {
      playerId: log.player_id_1 || null,
      playerName: log.player_name_1 || null,
      content: log.sub_content || null,
    });

    await sendPerformanceInfo(client, cfg, {
      playerId: log.player_id_1 || "",
      playerName: log.player_name_1 || "",
    });
  }
}

async function main() {
  const cfg = readEnv();
  const client = new RconClient(cfg);
  acquireLock(cfg.lockFile);

  logInfo("[performance-info-bot] started", {
    baseUrl: cfg.baseUrl,
    pollIntervalMs: cfg.pollIntervalMs,
    logWindow: cfg.logWindow,
    lockFilePath,
    commandCooldownMs: cfg.commandCooldownMs,
    dryRun: cfg.dryRun,
  });

  while (true) {
    try {
      await pollLogs(client, cfg);
    } catch (err) {
      console.error(`[${nowIso()}] [performance-info-bot] poll error:`, err.message);
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
