const { renderMessageTemplate } = require("./messageTemplates");

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function isOpCommand(log) {
  if (!log || typeof log !== "object") return false;
  if (!String(log.action || "").startsWith("CHAT")) return false;

  const content = normalizeText(log.sub_content);
  return content === "!op" || content.startsWith("!op ");
}

function opCommandKey(log) {
  const playerRef = normalizeId(log?.player_id_1) || normalizeText(log?.player_name_1) || "unknown";
  const normalizedRaw = normalizeText(log?.raw);
  if (normalizedRaw) {
    return `op-command|${playerRef}|${normalizedRaw}`;
  }

  const ts = Number(log?.timestamp_ms || 0);
  const bucket = Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 1000) : "no-ts";
  return `op-command|${playerRef}|${normalizeText(log?.sub_content)}|${bucket}`;
}

function getClanPrefixTag(playerName) {
  const normalizedName = String(playerName || "");
  const clanPrefixes = ["≫ ", "»BAIN« "];
  return clanPrefixes.find((prefix) => normalizedName.startsWith(prefix)) || null;
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
        unitId: 0,
        unitName: "commander",
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
          unitId: Number(player?.unit_id || 0) || 0,
          unitName: normalizeText(player?.unit_name || squadName),
          team,
          squadName: String(squadName || "").trim(),
        });
      }
    }
  }

  return players;
}

function findSquadOfficerForRequester(players, requester) {
  const requesterId = normalizeId(requester?.playerId);
  const requesterName = normalizeText(requester?.playerName);
  if (!requesterId && !requesterName) return { requesterRow: null, officerRow: null };

  const requesterRow =
    players.find((player) => requesterId && player.playerId === requesterId) ||
    players.find((player) => requesterName && normalizeText(player.playerName) === requesterName) ||
    null;

  if (!requesterRow) return { requesterRow: null, officerRow: null };

  const sameSquadPlayers = players.filter((player) => {
    if (player.team !== requesterRow.team) return false;
    if (player.unitId > 0 && requesterRow.unitId > 0) {
      return player.unitId === requesterRow.unitId;
    }
    return player.unitName && requesterRow.unitName && player.unitName === requesterRow.unitName;
  });

  const officerRow = sameSquadPlayers.find((player) => player.role === "officer") || null;
  return { requesterRow, officerRow };
}

async function handleOpCommand(client, cfg, log, logInfo) {
  const requester = {
    playerId: normalizeId(log?.player_id_1),
    playerName: String(log?.player_name_1 || "").trim(),
  };
  const requesterPrefix = getClanPrefixTag(requester.playerName);

  if (!requesterPrefix) {
    logInfo("[op] !op ignored: requester without clan tag", {
      requester,
      requiredPrefixes: ["≫ ", "»BAIN« "],
    });
    return;
  }

  let teamViewResponse;
  try {
    teamViewResponse = await client.get("get_team_view");
  } catch (err) {
    logInfo("[op] failed to load team_view", {
      requester,
      error: err.message,
    });
    return;
  }

  const players = summarizeTeamView(teamViewResponse);
  const { requesterRow, officerRow } = findSquadOfficerForRequester(players, requester);

  if (!requesterRow) {
    logInfo("[op] requester not found in team_view squads", { requester });
    return;
  }

  if (!officerRow) {
    logInfo("[op] no officer found for requester squad", {
      requester,
      squadName: requesterRow.squadName,
      unitId: requesterRow.unitId || null,
      team: requesterRow.team,
    });
    return;
  }

  const officerPrefix = getClanPrefixTag(officerRow.playerName);
  if (!officerPrefix) {
    logInfo("[op] !op ignored: squad officer without clan tag", {
      requester,
      officer: {
        playerId: officerRow.playerId,
        playerName: officerRow.playerName,
      },
      requiredPrefixes: ["≫ ", "»BAIN« "],
    });
    return;
  }

  const message = renderMessageTemplate(
    "op.reminder.txt",
    {},
    "MENSAGEM DO PELOTÃO\n\nCADE O OP PORRA?!",
    { logInfo }
  );

  if (cfg.dryRun) {
    logInfo("[op] clan flow validated (dry-run)", {
      requester: {
        playerId: requesterRow.playerId,
        playerName: requesterRow.playerName,
        squadName: requesterRow.squadName,
        team: requesterRow.team,
      },
      officer: {
        playerId: officerRow.playerId,
        playerName: officerRow.playerName,
        squadName: officerRow.squadName,
        team: officerRow.team,
      },
      outpostStatus: "indisponivel via endpoint/log atual",
      action: "dry-run ativo; nao envia message_player",
      clanPrefix: requesterPrefix,
      message,
    });
    return;
  }

  await client.post("message_player", {
    player_id: officerRow.playerId,
    player_name: officerRow.playerName,
    message,
    by: "hll-op-bot",
    save_message: false,
  });

  logInfo("[op] clan flow validated and reminder sent", {
    requester: {
      playerId: requesterRow.playerId,
      playerName: requesterRow.playerName,
      squadName: requesterRow.squadName,
      team: requesterRow.team,
    },
    officer: {
      playerId: officerRow.playerId,
      playerName: officerRow.playerName,
      squadName: officerRow.squadName,
      team: officerRow.team,
    },
    outpostStatus: "indisponivel via endpoint/log atual",
    action: "message_player enviado para oficial",
    clanPrefix: requesterPrefix,
    message,
  });
}

module.exports = {
  handleOpCommand,
  isOpCommand,
  opCommandKey,
};
