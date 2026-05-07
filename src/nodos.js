function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function isNodosCommand(log) {
  if (!log || typeof log !== "object") return false;
  if (!String(log.action || "").startsWith("CHAT")) return false;

  const content = normalizeText(log.sub_content);
  return content === "!nodos" || content.startsWith("!nodos ");
}

function nodosCommandKey(log) {
  const playerRef = normalizeId(log?.player_id_1) || normalizeText(log?.player_name_1) || "unknown";
  const normalizedRaw = normalizeText(log?.raw);
  if (normalizedRaw) {
    return `nodos-command|${playerRef}|${normalizedRaw}`;
  }

  const ts = Number(log?.timestamp_ms || 0);
  const bucket = Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 1000) : "no-ts";
  return `nodos-command|${playerRef}|${normalizeText(log?.sub_content)}|${bucket}`;
}

function summarizeTeamView(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const teams = ["axis", "allies"];
  const players = [];

  for (const team of teams) {
    const commander = result?.[team]?.commander;
    if (commander && typeof commander === "object") {
      players.push({
        playerId: normalizeId(commander?.player_id),
        playerName: String(commander?.name || "").trim(),
        role: normalizeText(commander?.role || "commander"),
        team,
        squadName: "commander",
      });
    }

    const squads = result?.[team]?.squads || {};
    for (const [squadName, squad] of Object.entries(squads)) {
      const squadPlayers = Array.isArray(squad?.players) ? squad.players : [];
      for (const player of squadPlayers) {
        players.push({
          playerId: normalizeId(player?.player_id),
          playerName: String(player?.name || "").trim(),
          role: normalizeText(player?.role),
          team,
          squadName: String(squadName || "").trim(),
        });
      }
    }
  }

  return players;
}

function findRequester(players, requester) {
  const requesterId = normalizeId(requester?.playerId);
  const requesterName = normalizeText(requester?.playerName);
  if (!requesterId && !requesterName) return null;

  return (
    players.find((player) => requesterId && player.playerId === requesterId) ||
    players.find((player) => requesterName && normalizeText(player.playerName) === requesterName) ||
    null
  );
}

function uniqueByPlayerIdOrName(players) {
  const seen = new Set();
  const unique = [];

  for (const player of players) {
    const key = `${normalizeId(player?.playerId) || "no-id"}|${normalizeText(player?.playerName) || "no-name"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(player);
  }

  return unique;
}

function isCommanderRole(role) {
  const normalizedRole = normalizeText(role).replace(/[_\s-]+/g, "");
  return normalizedRole === "commander" || normalizedRole === "armycommander";
}

function summarizeRoles(players) {
  const roleCounts = {};
  for (const player of players) {
    const role = normalizeText(player?.role) || "unknown";
    roleCounts[role] = Number(roleCounts[role] || 0) + 1;
  }

  return Object.entries(roleCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([role, count]) => ({ role, count }));
}

function formatNodosOfficerMessage() {
  return [
    "COMANDO - NODOS",
    "",
    "Oficiais, cobrem seus engenheiros para construir nodos agora.",
    "Nodos vencem partidas: eles mantem recursos para bombing, reforco, tanques e habilidades do comandante.",
    "Orientem construir na base, atras da segunda linha, no quadrante do ultimo ponto.",
  ].join("\n");
}

function formatNodosEngineerMessage() {
  return [
    "COMANDO - NODOS",
    "",
    "Engenheiro, seu time precisa de nodos para vencer.",
    "Construa manpower, municao e combustivel o quanto antes.",
    "Preferencia: base/ultimo ponto, atras da segunda linha. Se o ponto da frente cair, nodos avancados somem.",
  ].join("\n");
}

async function sendPrivate(client, target, message, by) {
  if (!target?.playerId) return false;

  await client.post("message_player", {
    player_id: target.playerId,
    player_name: target.playerName || "",
    message,
    by,
    save_message: false,
  });
  return true;
}

async function handleNodosCommand(client, cfg, log, logInfo) {
  const requester = {
    playerId: normalizeId(log?.player_id_1),
    playerName: String(log?.player_name_1 || "").trim(),
  };

  let teamViewResponse;
  try {
    teamViewResponse = await client.get("get_team_view");
  } catch (err) {
    logInfo("[nodos] failed to load team_view", {
      requester,
      error: err.message,
    });
    return;
  }

  const players = summarizeTeamView(teamViewResponse);
  const requesterRow = findRequester(players, requester);
  if (!requesterRow) {
    logInfo("[nodos] requester not found in team_view", { requester });
    return;
  }

  const requesterIsCommander = isCommanderRole(requesterRow.role);
  const requesterIsAdmin = Boolean(cfg.adminId && requester.playerId === cfg.adminId);
  if (!requesterIsCommander && !requesterIsAdmin) {
    logInfo("[nodos] !nodos ignored: requester is not commander or admin", {
      requester,
      role: requesterRow.role,
      team: requesterRow.team,
      adminIdConfigured: Boolean(cfg.adminId),
    });
    return;
  }

  const sameTeamPlayers = players.filter((player) => player.team === requesterRow.team);
  const officers = uniqueByPlayerIdOrName(sameTeamPlayers.filter((player) => player.role === "officer"));
  const engineers = uniqueByPlayerIdOrName(sameTeamPlayers.filter((player) => player.role === "engineer"));
  const officerMessage = formatNodosOfficerMessage();
  const engineerMessage = formatNodosEngineerMessage();
  const classesSummary = summarizeRoles(sameTeamPlayers);

  logInfo("[nodos] !nodos validated", {
    requester: {
      playerId: requesterRow.playerId,
      playerName: requesterRow.playerName,
      team: requesterRow.team,
      role: requesterRow.role,
    },
    access: {
      requesterIsCommander,
      requesterIsAdmin,
    },
    recipients: {
      officers: officers.length,
      engineers: engineers.length,
    },
    classes: classesSummary,
  });

  if (cfg.dryRun) {
    logInfo("[nodos] dry-run active; reminders not sent", {
      team: requesterRow.team,
      officers: officers.length,
      engineers: engineers.length,
      officerMessage,
      engineerMessage,
    });
    return;
  }

  let officerSends = 0;
  let engineerSends = 0;

  for (const officer of officers) {
    const sent = await sendPrivate(client, officer, officerMessage, "hll-nodos-bot");
    if (sent) officerSends += 1;
  }

  for (const engineer of engineers) {
    const sent = await sendPrivate(client, engineer, engineerMessage, "hll-nodos-bot");
    if (sent) engineerSends += 1;
  }

  logInfo("[nodos] reminders sent", {
    team: requesterRow.team,
    officers: officerSends,
    engineers: engineerSends,
  });
}

module.exports = {
  handleNodosCommand,
  isNodosCommand,
  nodosCommandKey,
};
