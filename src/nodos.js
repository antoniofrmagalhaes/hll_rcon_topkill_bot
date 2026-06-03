const { renderMessageTemplate } = require("./messageTemplates");

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
  return content === "!n" || content.startsWith("!n ") || content === "!nodos" || content.startsWith("!nodos ");
}

function nodosCommandMode(log) {
  const content = normalizeText(log?.sub_content);
  if (content === "!n" || content.startsWith("!n ")) return "admin-preview";
  if (content === "!nodos" || content.startsWith("!nodos ")) return "operational";
  return null;
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
  const fallback = [
    "ORDEM DO COMANDO",
    "",
    "Oficiais, orientem seus squads agora: precisamos de nodos ativos o quanto antes.",
    "Cobrem seus engenheiros para construir manpower, municao e combustivel na base ou atras da segunda linha.",
    "Nodos garantem recursos para bombing, reforco, tanques e habilidades do comandante.",
  ].join("\n");
  return renderMessageTemplate("nodos.officer.txt", {}, fallback);
}

function formatNodosEngineerMessage() {
  const fallback = [
    "ORDEM DO COMANDO",
    "",
    "Engenheiro, seu time precisa de nodos agora.",
    "Construa manpower, municao e combustivel na base ou atras da segunda linha.",
    "Evite construir no ponto avancado: se a linha cair, os nodos somem.",
  ].join("\n");
  return renderMessageTemplate("nodos.engineer.txt", {}, fallback);
}

function formatNodosConfirmation({ preview, officers, engineers }) {
  if (preview) {
    return [
      "Preview de nodos enviado apenas para o administrador.",
      `Alvos simulados: ${officers} oficiais e ${engineers} engenheiros.`,
    ].join("\n");
  }

  return [
    "Nodos solicitados para oficiais e engenheiros do seu time.",
    `Enviados: ${officers} oficiais e ${engineers} engenheiros.`,
  ].join("\n");
}

function formatNodosPreviewMessage(targetType, target, message) {
  const label = targetType === "officer" ? "OFICIAL" : "ENGENHEIRO";
  const targetName = target?.playerName || "sem nome";
  const targetId = target?.playerId || "sem id";

  return [
    `PREVIEW NODOS - ${label}`,
    `Alvo original: ${targetName} (${targetId})`,
    "",
    message,
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

async function sendAdminPreview(client, cfg, targetType, target, message) {
  if (!cfg.adminId) return false;

  await client.post("message_player", {
    player_id: cfg.adminId,
    player_name: "",
    message: formatNodosPreviewMessage(targetType, target, message),
    by: "hll-nodos-bot-preview",
    save_message: false,
  });
  return true;
}

async function handleNodosCommand(client, cfg, log, logInfo) {
  const mode = nodosCommandMode(log);
  const isPreview = mode === "admin-preview";
  const requester = {
    playerId: normalizeId(log?.player_id_1),
    playerName: String(log?.player_name_1 || "").trim(),
  };

  if (!mode) {
    logInfo("[nodos] ignored: unknown nodos command mode", {
      requester,
      content: log?.sub_content || null,
    });
    return;
  }

  if (isPreview && (!cfg.enableTestCommands || requester.playerId !== cfg.adminId)) {
    logInfo("[nodos] !n preview ignored: requester is not admin or test commands disabled", {
      requester,
      enableTestCommands: Boolean(cfg.enableTestCommands),
      adminIdConfigured: Boolean(cfg.adminId),
    });
    return;
  }

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
  if (!isPreview && !requesterIsCommander) {
    logInfo("[nodos] !nodos ignored: requester is not commander", {
      requester,
      role: requesterRow.role,
      team: requesterRow.team,
    });
    return;
  }

  const sameTeamPlayers = players.filter((player) => player.team === requesterRow.team);
  const officers = cfg.nodosNotifyOfficers === false
    ? []
    : uniqueByPlayerIdOrName(sameTeamPlayers.filter((player) => player.role === "officer"));
  const engineers = cfg.nodosNotifyEngineers === false
    ? []
    : uniqueByPlayerIdOrName(sameTeamPlayers.filter((player) => player.role === "engineer"));
  const officerMessage = formatNodosOfficerMessage();
  const engineerMessage = formatNodosEngineerMessage();
  const classesSummary = summarizeRoles(sameTeamPlayers);

  logInfo("[nodos] command validated", {
    mode,
    requester: {
      playerId: requesterRow.playerId,
      playerName: requesterRow.playerName,
      team: requesterRow.team,
      role: requesterRow.role,
    },
    access: {
      requesterIsCommander,
      requesterIsAdmin: Boolean(cfg.adminId && requester.playerId === cfg.adminId),
    },
    recipients: {
      officers: officers.length,
      engineers: engineers.length,
    },
    notify: {
      officers: cfg.nodosNotifyOfficers !== false,
      engineers: cfg.nodosNotifyEngineers !== false,
    },
    classes: classesSummary,
  });

  if (cfg.dryRun) {
    logInfo("[nodos] dry-run active; reminders not sent", {
      mode,
      team: requesterRow.team,
      officers: officers.length,
      engineers: engineers.length,
      notifyOfficers: cfg.nodosNotifyOfficers !== false,
      notifyEngineers: cfg.nodosNotifyEngineers !== false,
      officerMessage,
      engineerMessage,
    });
    return;
  }

  let officerSends = 0;
  let engineerSends = 0;

  for (const officer of officers) {
    const sent = isPreview
      ? await sendAdminPreview(client, cfg, "officer", officer, officerMessage)
      : await sendPrivate(client, officer, officerMessage, "hll-nodos-bot");
    if (sent) officerSends += 1;
  }

  for (const engineer of engineers) {
    const sent = isPreview
      ? await sendAdminPreview(client, cfg, "engineer", engineer, engineerMessage)
      : await sendPrivate(client, engineer, engineerMessage, "hll-nodos-bot");
    if (sent) engineerSends += 1;
  }

  const confirmationTarget = isPreview
    ? { playerId: cfg.adminId, playerName: "" }
    : { playerId: requesterRow.playerId, playerName: requesterRow.playerName };
  await sendPrivate(
    client,
    confirmationTarget,
    formatNodosConfirmation({
      preview: isPreview,
      officers: officerSends,
      engineers: engineerSends,
    }),
    isPreview ? "hll-nodos-bot-preview" : "hll-nodos-bot"
  );

  logInfo("[nodos] reminders sent", {
    mode,
    team: requesterRow.team,
    officers: officerSends,
    engineers: engineerSends,
    notifyOfficers: cfg.nodosNotifyOfficers !== false,
    notifyEngineers: cfg.nodosNotifyEngineers !== false,
  });
}

module.exports = {
  handleNodosCommand,
  isNodosCommand,
  nodosCommandKey,
};
