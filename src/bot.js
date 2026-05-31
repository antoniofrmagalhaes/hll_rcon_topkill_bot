require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { readEnv } = require("./config");
const { RconClient } = require("./rconClient");
const { normalizePlayers, computeTopKillers, formatTopMessage } = require("./top");
const { translateRolePtBr } = require("./roles");
const { adminCommandKey, isAdminActor, isAdminCommand } = require("./adminCommands");
const { handleNodosCommand, isNodosCommand, nodosCommandKey } = require("./nodos");
const { handleOpCommand, isOpCommand, opCommandKey } = require("./op");

const seenChatEvents = new Set();
const seenTopCommands = new Set();
const seenTopPreviewCommands = new Set();
const seenNodosCommands = new Set();
const seenOpCommands = new Set();
const topCommandCooldownByActor = new Map();
const seenMatchEndEvents = new Set();
let logsWarmedUp = false;
const MATCH_END_TOLERANCE_SECONDS = 15 * 60;
const LOG_PADDING_SECONDS = 120;
const LOG_LIMIT = 500;
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
  const ts = Number(log?.timestamp_ms || 0);
  const tsBucket = Number.isFinite(ts) && ts > 0 ? `|${Math.floor(ts / 300000)}` : "";
  const summary = normalizeText(log?.sub_content || log?.message || log?.raw);
  if (summary) {
    return `match-ended|${summary}${tsBucket}`;
  }
  if (tsBucket) {
    return `match-ended${tsBucket}`;
  }
  return "match-ended|unknown";
}

function logTimestampMs(log) {
  const timestampMs = Number(log?.timestamp_ms || 0);
  if (Number.isFinite(timestampMs) && timestampMs > 0) return timestampMs;
  return Date.now();
}

function pickBestMatch(matches, endedAtSeconds) {
  const candidates = (Array.isArray(matches) ? matches : [])
    .filter((entry) => Number.isFinite(Number(entry?.end)) && Number.isFinite(Number(entry?.start)))
    .map((entry) => ({
      entry,
      diff: Math.abs(Number(entry.end) - endedAtSeconds),
    }))
    .sort((a, b) => a.diff - b.diff);

  const best = candidates[0];
  if (!best || best.diff > MATCH_END_TOLERANCE_SECONDS) {
    throw new Error(
      `Nenhuma partida encontrada em get_map_history para MATCH ENDED; nearestSecondsDiff=${best?.diff ?? "none"}`
    );
  }

  return best.entry;
}

function capturePlayerName(namesById, playerId, playerName) {
  if (!playerId || !playerName || namesById.has(playerId)) return;
  namesById.set(playerId, playerName);
}

function captureTeamsFromRaw(raw, teamsById, namesById) {
  const regex = /([^()[\]]+?)\((Allies|Axis|None)\/([a-zA-Z0-9]+)\)/g;

  for (const match of raw.matchAll(regex)) {
    const [, rawName, team, playerId] = match;
    const name = rawName.trim();

    if (!teamsById.has(playerId)) {
      teamsById.set(playerId, new Set());
    }

    teamsById.get(playerId)?.add(team);

    if (name && !namesById.has(playerId)) {
      namesById.set(playerId, name);
    }
  }
}

function captureSwitchFromRaw(raw, switchNames) {
  const match = raw.match(/TEAMSWITCH\s+(.+?)\s+\((None|Allies|Axis)\s+>\s+(None|Allies|Axis)\)/);
  if (!match) return;
  switchNames.add(match[1].trim());
}

function captureKillsAndDeaths(log, killsById, deathsById) {
  if (!log.type || (log.type !== "KILL" && log.type !== "TEAM KILL")) return;

  if (log.player1_id) {
    killsById.set(log.player1_id, (killsById.get(log.player1_id) || 0) + 1);
  }

  if (log.player2_id) {
    deathsById.set(log.player2_id, (deathsById.get(log.player2_id) || 0) + 1);
  }
}

function buildSnapshotPlayers(match, logs) {
  const playerStats = match.player_stats || {};
  const namesById = new Map();
  const teamsById = new Map();
  const switchNames = new Set();
  const killsById = new Map();
  const deathsById = new Map();

  for (const log of logs) {
    capturePlayerName(namesById, log.player1_id, log.player1_name);
    capturePlayerName(namesById, log.player2_id, log.player2_name);
    captureKillsAndDeaths(log, killsById, deathsById);

    if (log.raw) {
      captureTeamsFromRaw(log.raw, teamsById, namesById);
      captureSwitchFromRaw(log.raw, switchNames);
    }
  }

  return Object.entries(playerStats).map(([playerId, stats]) => {
    const detectedTeams = Array.from(teamsById.get(playerId) || []);
    const name = namesById.get(playerId) || null;

    return {
      externalPlayerId: playerId,
      name,
      stats: {
        ...stats,
        kills: killsById.get(playerId) || 0,
        deaths: deathsById.get(playerId) || 0,
      },
      detectedTeams,
      teamSwitched: detectedTeams.length > 1 || (name ? switchNames.has(name) : false),
    };
  });
}

function buildSnapshotMatchKey(log, match) {
  const normalizedMap = String(match.name || "unknown-map")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const serverId = String(log?.server || log?.server_id || "unknown-server").trim() || "unknown-server";

  return [serverId, normalizedMap || "unknown-map", String(match.end || "unknown-end")].join(":");
}

async function collectMatchSnapshot(client, log) {
  const endedAtSeconds = Math.floor(logTimestampMs(log) / 1000);
  const mapHistoryResponse = await client.get("get_map_history");
  const match = pickBestMatch(mapHistoryResponse?.result || [], endedAtSeconds);
  const fromSeconds = Number(match.start) - LOG_PADDING_SECONDS;
  const tillSeconds = Number(match.end) + LOG_PADDING_SECONDS;
  const logsResponse = await client.get("get_historical_logs", {
    from_: new Date(fromSeconds * 1000).toISOString(),
    till: new Date(tillSeconds * 1000).toISOString(),
    limit: LOG_LIMIT,
  });
  const logs = Array.isArray(logsResponse?.result) ? logsResponse.result : [];

  return {
    matchKey: buildSnapshotMatchKey(log, match),
    sourceEventId: matchEndKey(log),
    endedAt: new Date(Number(match.end) * 1000).toISOString(),
    startedAt: new Date(Number(match.start) * 1000).toISOString(),
    map: match.name || null,
    serverId: String(log?.server || log?.server_id || "").trim() || null,
    collectionWindow: {
      start: new Date(fromSeconds * 1000).toISOString(),
      end: new Date(tillSeconds * 1000).toISOString(),
    },
    resolver: {
      strategy: "bot:get_map_history+get_historical_logs",
      matchedBy: "match-ended-log",
      matchedBySecondsDiff: Math.abs(Number(match.end) - endedAtSeconds),
      toleranceSeconds: MATCH_END_TOLERANCE_SECONDS,
    },
    raw: {
      match,
      logs,
    },
    players: buildSnapshotPlayers(match, logs),
  };
}

async function sendRankingSnapshot(client, cfg, log) {
  if (!cfg.rankingSnapshotEnabled) return;

  if (!cfg.rankingSnapshotEndpoint || !cfg.rankingIngestionToken) {
    logInfo("[ranking] snapshot not sent: endpoint/token not configured");
    return;
  }

  const snapshot = await collectMatchSnapshot(client, log);
  const body = {
    eventId: matchEndKey(log),
    sourceKey: `bot:${snapshot.matchKey}`,
    receivedFrom: "hll-bot",
    snapshot,
  };

  const response = await fetch(cfg.rankingSnapshotEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.rankingIngestionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[ranking] snapshot POST failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  logInfo("[ranking] snapshot queued", result);
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

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
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
      if (existingPid && !isProcessRunning(existingPid)) {
        logInfo("[lock] removing stale lock file", {
          file: lockFilePath,
          pid: existingPid,
          startedAt,
        });
        fs.unlinkSync(lockFilePath);
        lockFd = fs.openSync(lockFilePath, "wx");
      } else {
        throw new Error(
          `[lock] lock file already exists (${lockFilePath})${existingPid ? ` pid=${existingPid}` : ""}${startedAt ? ` startedAt=${startedAt}` : ""}`
        );
      }
    }
    if (err?.code !== "EEXIST") throw err;
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

function isTopPreviewCommand(log, cfg) {
  return isAdminCommand(log, cfg, "!t");
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

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
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
                role: translateRolePtBr(player?.role),
                points:
                  numberValue(player?.combat) +
                  numberValue(player?.offense) +
                  numberValue(player?.defense) +
                  numberValue(player?.support),
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

async function broadcastTop(client, cfg, reason, targetPlayer) {
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
        if (isTopPreviewCommand(log, cfg)) {
          remember(seenTopPreviewCommands, adminCommandKey(log, "top"));
        }
        if (isNodosCommand(log)) {
          remember(seenNodosCommands, nodosCommandKey(log));
        }
        if (isOpCommand(log)) {
          remember(seenOpCommands, opCommandKey(log));
        }
      }
    }
    logsWarmedUp = true;
    logInfo("[poll] warm-up complete; match-end events remain eligible", {
      topCommandsSeen: seenTopCommands.size,
      topPreviewCommandsSeen: seenTopPreviewCommands.size,
      nodosCommandsSeen: seenNodosCommands.size,
      opCommandsSeen: seenOpCommands.size,
    });
  }

  let latestMatchEndedLog = null;
  for (const log of logs) {
    const key = eventKey(log);

    if (isTopPreviewCommand(log, cfg)) {
      const commandKey = adminCommandKey(log, "top");
      if (seenTopPreviewCommands.has(commandKey)) continue;
      remember(seenTopPreviewCommands, commandKey);
      remember(seenChatEvents, key);

      if (!isAdminActor(log, cfg)) {
        logInfo("[event] admin !t ignored because player is not allowed", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
          adminId: cfg.adminId,
        });
        continue;
      }

      logInfo("[event] admin !t detected", {
        byPlayer: log.player_name_1 || null,
        playerId: log.player_id_1 || null,
        content: log.sub_content || null,
      });
      await broadcastTop(client, cfg, "preview administrativo !t", {
        playerId: cfg.adminId,
        playerName: "",
      });
      continue;
    }

    if (isTopCommand(log)) {
      const commandKey = topCommandKey(log);
      if (seenTopCommands.has(commandKey)) continue;
      if (cfg.topCommandAdminOnly && !isAdminActor(log, cfg)) {
        remember(seenTopCommands, commandKey);
        remember(seenChatEvents, key);
        logInfo("[event] !top ignored because TOP_COMMAND_ADMIN_ONLY is enabled", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
          adminId: cfg.adminId,
        });
        continue;
      }
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
      });
      continue;
    }

    if (isNodosCommand(log)) {
      const commandKey = nodosCommandKey(log);
      if (seenNodosCommands.has(commandKey)) continue;
      if (!cfg.nodosBotEnabled) {
        remember(seenNodosCommands, commandKey);
        remember(seenChatEvents, key);
        logInfo("[event] !nodos ignored: nodos bot disabled in config", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
        });
        continue;
      }
      if (shouldSkipTopCommandByCooldown(log, cfg)) {
        logInfo("[event] !nodos skipped by cooldown", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
          cooldownMs: cfg.topCommandCooldownMs,
        });
        continue;
      }
      remember(seenNodosCommands, commandKey);
      remember(seenChatEvents, key);

      logInfo("[event] !nodos detected", {
        byPlayer: log.player_name_1 || null,
        playerId: log.player_id_1 || null,
        content: log.sub_content || null,
      });
      await handleNodosCommand(client, cfg, log, logInfo);
      continue;
    }

    if (isOpCommand(log)) {
      const commandKey = opCommandKey(log);
      if (seenOpCommands.has(commandKey)) continue;
      if (!cfg.opBotEnabled) {
        remember(seenOpCommands, commandKey);
        remember(seenChatEvents, key);
        logInfo("[event] !op ignored: op bot disabled in config", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
        });
        continue;
      }
      remember(seenOpCommands, commandKey);
      remember(seenChatEvents, key);
      if (shouldSkipTopCommandByCooldown(log, cfg)) {
        logInfo("[event] !op skipped by cooldown", {
          playerId: log.player_id_1 || null,
          playerName: log.player_name_1 || null,
          content: log.sub_content || null,
          cooldownMs: cfg.topCommandCooldownMs,
        });
        continue;
      }

      logInfo("[event] !op detected", {
        byPlayer: log.player_name_1 || null,
        playerId: log.player_id_1 || null,
        content: log.sub_content || null,
      });
      await handleOpCommand(client, cfg, log, logInfo);
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
  if (!cfg.topProcessMatchEnd) {
    logInfo("[event] MATCH ENDED ignored because TOP_PROCESS_MATCH_END=false", {
      raw: latestMatchEndedLog.raw || null,
    });
    return;
  }

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

  logInfo("[event] MATCH ENDED detected", {
    raw: latestMatchEndedLog.raw || null,
    matchEndKey: currentMatchEndKey,
    cooldownMs: cfg.matchEndedCooldownMs,
  });
  try {
    await sendRankingSnapshot(client, cfg, latestMatchEndedLog);
  } catch (err) {
    logInfo("[ranking] snapshot failed, continuing with broadcast", { error: err.message });
  }
  await broadcastTop(client, cfg, "fim da partida");
  remember(seenMatchEndEvents, currentMatchEndKey);
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
    topCommandAdminOnly: cfg.topCommandAdminOnly,
    topProcessMatchEnd: cfg.topProcessMatchEnd,
    topStatsEndpoint: cfg.topStatsEndpoint,
    dryRun: cfg.dryRun,
    opBotEnabled: cfg.opBotEnabled,
    nodosBotEnabled: cfg.nodosBotEnabled,
    rankingSnapshotEnabled: cfg.rankingSnapshotEnabled,
    rankingSnapshotEndpointConfigured: Boolean(cfg.rankingSnapshotEndpoint),
    enableTestCommands: cfg.enableTestCommands,
    adminId: cfg.adminId,
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
