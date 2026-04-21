require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { readEnv } = require("./config");
const { RconClient } = require("./rconClient");
const { normalizePlayers, computeTopKillers, formatTopMessage } = require("./top");

const seenChatEvents = new Set();
const seenTopCommands = new Set();
const topCommandCooldownByActor = new Map();
const seenMatchEndEvents = new Set();
let logsWarmedUp = false;
const stateFilePath = process.env.BOT_STATE_FILE || path.resolve(__dirname, "..", "artifacts", "bot-state.json");
let lockFilePath = null;
let lockFd = null;
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

function logFormattedMessagePreview(message, title = "message preview") {
  console.log(`[${nowIso()}] [top] ${title}`);
  console.log(message);
}

function remember(set, key, max = 1000) {
  set.add(key);
  if (set.size > max) {
    const first = set.values().next().value;
    set.delete(first);
  }
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function eventKey(log) {
  return `${log.timestamp_ms || ""}|${log.action || ""}|${log.raw || ""}`;
}

function topCommandKey(log) {
  const playerRef = String(log?.player_id_1 || "").trim() || normalizeText(log?.player_name_1) || "unknown";
  const normalizedRaw = normalizeText(log?.raw);
  if (normalizedRaw) {
    return `top-command|${playerRef}|${normalizedRaw}`;
  }
  const ts = Number(log?.timestamp_ms || 0);
  const bucket = Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 1000) : "no-ts";
  return `top-command|${playerRef}|${normalizeText(log?.sub_content)}|${bucket}`;
}

function topCommandActorKey(log) {
  const playerId = String(log?.player_id_1 || "").trim();
  const playerName = normalizeText(log?.player_name_1);
  const content = normalizeText(log?.sub_content);
  return `${playerId || playerName || "unknown"}|${content}`;
}

function shouldSkipTopCommandByCooldown(log, cfg) {
  const actorKey = topCommandActorKey(log);
  const nowMs = Date.now();
  const lastMs = Number(topCommandCooldownByActor.get(actorKey) || 0);
  const elapsedMs = nowMs - lastMs;
  if (lastMs > 0 && elapsedMs >= 0 && elapsedMs < cfg.topCommandCooldownMs) {
    return true;
  }
  topCommandCooldownByActor.set(actorKey, nowMs);
  if (topCommandCooldownByActor.size > 2000) {
    const firstKey = topCommandCooldownByActor.keys().next().value;
    topCommandCooldownByActor.delete(firstKey);
  }
  return false;
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

function loadState() {
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

function isTopCommand(log) {
  if (!log || typeof log !== "object") return false;
  if (!String(log.action || "").startsWith("CHAT")) return false;

  const content = String(log.sub_content || "").trim().toLowerCase();
  return content === "!top" || content.startsWith("!top ");
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
    samplePlayerKeys: first && typeof first === "object" ? Object.keys(first).slice(0, 20) : [],
  };
}

function summarizePlayers(players) {
  return {
    totalPlayers: players.length,
    sampleTop3: players
      .slice()
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 3)
      .map((p) => ({ player: p.playerName, kills: p.kills, deaths: p.deaths })),
  };
}

function summarizeCommanders(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const teams = ["allies", "axis"];
  const commanders = {};

  for (const team of teams) {
    const commander = result?.[team]?.commander || null;
    if (!commander || typeof commander !== "object") {
      commanders[team] = null;
      continue;
    }

    const combat = Number(commander.combat || 0);
    const support = Number(commander.support || 0);
    const offense = Number(commander.offense || 0);
    const defense = Number(commander.defense || 0);
    const kills = Number(commander.kills || 0);
    const deaths = Number(commander.deaths || 0);

    commanders[team] = {
      name: commander.name || null,
      playerId: commander.player_id || null,
      role: commander.role || null,
      kills,
      deaths,
      combat,
      support,
      offense,
      defense,
      teamplayScore: combat + support,
      totalScore: combat + support + offense + defense,
    };
  }

  return commanders;
}

function pickBestCommander(commandersByTeam) {
  return Object.values(commandersByTeam || {})
    .filter(Boolean)
    .sort((a, b) => {
      if (b.support !== a.support) return b.support - a.support;
      if (b.combat !== a.combat) return b.combat - a.combat;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })[0] || null;
}

function summarizeBestSquads(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const teams = ["allies", "axis"];
  const bestSquadsByTeam = {};

  for (const team of teams) {
    const squads = result?.[team]?.squads || {};
    const normalizedSquads = Object.entries(squads)
      .map(([name, squad]) => {
        const combat = Number(squad?.combat || 0);
        const offense = Number(squad?.offense || 0);
        const defense = Number(squad?.defense || 0);
        const support = Number(squad?.support || 0);
        const kills = Number(squad?.kills || 0);
        const deaths = Number(squad?.deaths || 0);

        return {
          name,
          team,
          type: squad?.type || null,
          hasLeader: Boolean(squad?.has_leader),
          combat,
          offense,
          defense,
          support,
          kills,
          deaths,
          totalScore: combat + offense + defense + support,
          members: Array.isArray(squad?.players)
            ? squad.players.map((player) => ({
                name: player?.name || null,
                role: player?.role || null,
              }))
            : [],
        };
      })
      .filter((squad) => squad.totalScore > 0);

    bestSquadsByTeam[team] = normalizedSquads.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.support !== a.support) return b.support - a.support;
      if (b.combat !== a.combat) return b.combat - a.combat;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })[0] || null;
  }

  return bestSquadsByTeam;
}

async function broadcastTop(client, cfg, reason, targetPlayer, options = {}) {
  const { logFormattedPreview = false } = options;
  logInfo("[top] collecting live match stats", {
    reason,
    targetPlayer: targetPlayer || null,
    endpoint: cfg.topStatsEndpoint,
  });

  let statsResponse = await client.get(cfg.topStatsEndpoint);
  logInfo("[top] endpoint return summary", {
    endpoint: cfg.topStatsEndpoint,
    summary: summarizeScoreboardResponse(statsResponse),
  });
  let players = normalizePlayers(statsResponse);
  logInfo("[top] normalized players summary", summarizePlayers(players));

  if (!players.length && cfg.topStatsEndpoint !== "get_live_scoreboard") {
    logInfo("[top] primary stats endpoint returned no players, trying fallback", {
      fallbackEndpoint: "get_live_scoreboard",
    });
    statsResponse = await client.get("get_live_scoreboard");
    logInfo("[top] fallback endpoint return summary", {
      endpoint: "get_live_scoreboard",
      summary: summarizeScoreboardResponse(statsResponse),
    });
    players = normalizePlayers(statsResponse);
    logInfo("[top] normalized fallback players summary", summarizePlayers(players));
  }

  let bestCommander = null;
  let bestSquadsByTeam = null;
  try {
    const teamViewResponse = await client.get("get_team_view");
    const commandersByTeam = summarizeCommanders(teamViewResponse);
    bestCommander = pickBestCommander(commandersByTeam);
    bestSquadsByTeam = summarizeBestSquads(teamViewResponse);
    logInfo("[top] team_view commanders summary", {
      commandersByTeam,
      bestCommander,
    });
    logInfo("[top] team_view best squads summary", bestSquadsByTeam);
  } catch (err) {
    logInfo("[top] failed to inspect commanders from team_view", {
      error: err.message,
    });
  }

  const top = computeTopKillers(players, cfg.topLimit);
  logInfo("[top] ranking summary", {
    topCount: top.length,
    topPreview: top.slice(0, 5).map((p) => ({
      player: p.playerName,
      kills: p.kills,
      deaths: p.deaths,
    })),
  });

  if (!top.length) {
    logInfo("[top] no players returned by scoreboard");
    return;
  }

  const message = formatTopMessage(top, {
    includeHeader: cfg.includeHeaderForTop,
    bestCommander,
    bestSquadsByTeam,
  });
  logInfo("[top] message preview with commander", {
    bestCommander,
    message,
  });
  logInfo("[top] message preview with commander and squads", {
    bestCommander,
    bestSquadsByTeam,
    message,
  });
  if (logFormattedPreview) {
    logFormattedMessagePreview(message, "formatted !top message preview");
  }

  if (cfg.dryRun) {
    logInfo("[dry-run] would send message");
    console.log(message);
    return;
  }

  if (targetPlayer?.playerId) {
    logInfo("[top] sending private message", {
      playerId: targetPlayer.playerId,
      playerName: targetPlayer.playerName || null,
      message,
    });
    await client.post("message_player", {
      player_id: targetPlayer.playerId,
      player_name: targetPlayer.playerName || "",
      message,
      by: "hll-top-bot",
      save_message: false,
    });
  } else {
    logInfo("[top] sending chat message", { message });
    await client.post("message_all_players", { message });
  }

  logInfo("[top] broadcast sent (1 message)");
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
  logInfo("[poll] logs received", { count: logs.length, warmedUp: logsWarmedUp });

  logs.sort((a, b) => Number(a.timestamp_ms || 0) - Number(b.timestamp_ms || 0));

  if (!logsWarmedUp) {
    for (const log of logs) {
      const key = eventKey(log);
      if (String(log.action || "").startsWith("CHAT")) {
        remember(seenChatEvents, key);
        if (isTopCommand(log)) {
          remember(seenTopCommands, topCommandKey(log));
        }
      }
      if (String(log.action || "") === "MATCH ENDED") {
        remember(seenMatchEndEvents, matchEndKey(log));
      }
    }
    logsWarmedUp = true;
    return;
  }

  let latestMatchEndedLog = null;
  for (const log of logs) {
    const key = eventKey(log);

    if (isTopCommand(log)) {
      const commandKey = topCommandKey(log);
      if (seenTopCommands.has(commandKey)) continue;
      if (shouldSkipTopCommandByCooldown(log, cfg)) {
        logInfo("[event] !top skipped by cooldown", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
          cooldownMs: cfg.topCommandCooldownMs,
        });
        continue;
      }
      remember(seenTopCommands, commandKey);
      remember(seenChatEvents, key);

      const by = log.player_name_1 ? `comando de ${log.player_name_1}` : "comando !top";
      logInfo("[event] !top detected", {
        byPlayer: log.player_name_1 || null,
        playerId: log.player_id_1 || null,
        content: log.sub_content || null,
      });
      await broadcastTop(client, cfg, by, {
        playerId: log.player_id_1 || "",
        playerName: log.player_name_1 || "",
      }, { logFormattedPreview: true });
      continue;
    }

    if (String(log.action || "") === "MATCH ENDED") {
      const currentTs = Number(log.timestamp_ms || 0);
      const currentLatestTs = Number(latestMatchEndedLog?.timestamp_ms || 0);
      if (!latestMatchEndedLog || currentTs >= currentLatestTs) {
        latestMatchEndedLog = log;
      }
    }
  }

  if (!latestMatchEndedLog) return;

  loadState();
  const currentMatchEndKey = matchEndKey(latestMatchEndedLog);
  const nowMs = Date.now();
  const elapsedMs = nowMs - Number(state.lastMatchEndedAtMs || 0);
  const withinCooldown =
    Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < cfg.matchEndedCooldownMs;

  if (state.lastMatchEndKey && state.lastMatchEndKey === currentMatchEndKey) {
    return;
  }
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
  logInfo("[event] MATCH ENDED detected", {
    raw: latestMatchEndedLog.raw || null,
    matchEndKey: currentMatchEndKey,
    cooldownMs: cfg.matchEndedCooldownMs,
  });
  await broadcastTop(client, cfg, "fim da partida");
  state.lastMatchEndKey = currentMatchEndKey;
  state.lastMatchEndedAtMs = nowMs;
  saveState();
}

async function main() {
  const cfg = readEnv();
  const client = new RconClient(cfg);
  acquireLock(cfg.lockFile);
  loadState();

  logInfo("[bot] started", {
    baseUrl: cfg.baseUrl,
    pollIntervalMs: cfg.pollIntervalMs,
    logWindow: cfg.logWindow,
    lockFilePath,
    topLimit: cfg.topLimit,
    topStatsEndpoint: cfg.topStatsEndpoint,
    dryRun: cfg.dryRun,
    topCommandCooldownMs: cfg.topCommandCooldownMs,
    matchEndedCooldownMs: cfg.matchEndedCooldownMs,
    stateFilePath,
    lastMatchEndKey: state.lastMatchEndKey,
    lastMatchEndedAtMs: state.lastMatchEndedAtMs,
  });

  while (true) {
    try {
      await pollLogs(client, cfg);
    } catch (err) {
      console.error(`[${nowIso()}] [bot] poll error:`, err.message);
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
