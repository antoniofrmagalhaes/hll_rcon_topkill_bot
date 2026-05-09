function numberValue(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

const ROLE_RULES = {
  commander: {
    label: "Comandante",
    threshold: 3000,
    minimums: { support: 1200 },
    parts: [
      ["support", "Suporte", 1.2],
      ["combat", "Combate", 0.7],
      ["offense", "Ataque", 0.7],
      ["defense", "Defesa", 0.7],
      ["kills", "Abates", 8],
    ],
  },
  officer: {
    label: "Oficial",
    threshold: 2500,
    minimums: { support: 600 },
    parts: [
      ["support", "Suporte", 1.3],
      ["offense", "Ataque", 1],
      ["defense", "Defesa", 1],
      ["combat", "Combate", 0.6],
      ["kills", "Abates", 8],
    ],
  },
  support: {
    label: "Suporte",
    threshold: 2200,
    parts: [
      ["support", "Suporte", 1.6],
      ["offense", "Ataque", 0.8],
      ["defense", "Defesa", 0.8],
      ["combat", "Combate", 0.4],
      ["kills", "Abates", 5],
    ],
  },
  engineer: {
    label: "Engenheiro",
    threshold: 2400,
    parts: [
      ["support", "Suporte", 1.4],
      ["defense", "Defesa", 1],
      ["offense", "Ataque", 0.8],
      ["combat", "Combate", 0.5],
      ["kills", "Abates", 6],
    ],
  },
  medic: {
    label: "Medico",
    threshold: 1800,
    parts: [
      ["support", "Suporte", 1.8],
      ["defense", "Defesa", 0.7],
      ["offense", "Ataque", 0.5],
      ["combat", "Combate", 0.3],
      ["kills", "Abates", 3],
    ],
  },
  antitank: {
    label: "Anti-Tank",
    threshold: 2300,
    parts: [
      ["combat", "Combate", 1.2],
      ["kills", "Abates", 18],
      ["offense", "Ataque", 0.7],
      ["defense", "Defesa", 0.7],
      ["support", "Suporte", 0.3],
    ],
  },
  machinegunner: {
    label: "Machine Gunner",
    threshold: 2300,
    parts: [
      ["combat", "Combate", 1.2],
      ["defense", "Defesa", 1],
      ["kills", "Abates", 18],
      ["offense", "Ataque", 0.5],
      ["support", "Suporte", 0.2],
    ],
  },
  assault: {
    label: "Assault",
    threshold: 2600,
    parts: [
      ["combat", "Combate", 1.1],
      ["kills", "Abates", 22],
      ["offense", "Ataque", 1],
      ["defense", "Defesa", 0.5],
      ["support", "Suporte", 0.2],
    ],
  },
  automaticrifleman: {
    label: "Automatic Rifleman",
    threshold: 2400,
    parts: [
      ["combat", "Combate", 1.1],
      ["kills", "Abates", 20],
      ["offense", "Ataque", 0.8],
      ["defense", "Defesa", 0.8],
      ["support", "Suporte", 0.2],
    ],
  },
  rifleman: {
    label: "Rifleman",
    threshold: 2300,
    parts: [
      ["combat", "Combate", 1],
      ["kills", "Abates", 18],
      ["offense", "Ataque", 1],
      ["defense", "Defesa", 1],
      ["support", "Suporte", 0.5],
    ],
  },
  tankcommander: {
    label: "Tank Commander",
    threshold: 3200,
    parts: [
      ["combat", "Combate", 1.2],
      ["kills", "Abates", 15],
      ["offense", "Ataque", 1],
      ["defense", "Defesa", 1],
      ["support", "Suporte", 0.5],
    ],
  },
  crewman: {
    label: "Crewman",
    threshold: 2800,
    parts: [
      ["combat", "Combate", 1.2],
      ["kills", "Abates", 15],
      ["offense", "Ataque", 1],
      ["defense", "Defesa", 1],
      ["support", "Suporte", 0.5],
    ],
  },
  spotter: {
    label: "Spotter",
    threshold: 2400,
    parts: [
      ["support", "Suporte", 1.3],
      ["combat", "Combate", 0.8],
      ["offense", "Ataque", 1],
      ["defense", "Defesa", 1],
      ["kills", "Abates", 8],
    ],
  },
  sniper: {
    label: "Sniper",
    threshold: 2600,
    minimums: { kills: 25 },
    parts: [
      ["combat", "Combate", 1.2],
      ["kills", "Abates", 24],
      ["offense", "Ataque", 0.6],
      ["defense", "Defesa", 0.6],
      ["support", "Suporte", 0.2],
    ],
  },
};

const ROLE_ALIASES = {
  armycommander: "commander",
  heavymachinegunner: "machinegunner",
  heavygunner: "machinegunner",
  mg: "machinegunner",
  tankcrewman: "crewman",
};

function collectTeamViewPlayers(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const players = [];

  for (const team of ["allies", "axis", "unassigned"]) {
    const commander = result?.[team]?.commander;
    if (commander && typeof commander === "object") {
      players.push(normalizeTeamViewPlayer(commander, team, "commander"));
    }

    const squads = result?.[team]?.squads || {};
    for (const [squadName, squad] of Object.entries(squads)) {
      if (!squad || typeof squad !== "object" || !Array.isArray(squad.players)) continue;
      for (const player of squad.players) {
        players.push(normalizeTeamViewPlayer(player, team, squadName));
      }
    }
  }

  return players;
}

function normalizeRole(value) {
  const compact = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ROLE_ALIASES[compact] || compact;
}

function normalizeTeamViewPlayer(player, team, squadName) {
  const playerName = String(player?.name || player?.player || "Unknown");
  const rawRole = player?.role || "";

  return {
    playerName,
    playerId: String(player?.player_id || ""),
    team,
    squadName: String(squadName || ""),
    role: normalizeRole(rawRole),
    roleLabel: roleLabel(normalizeRole(rawRole), rawRole),
    kills: numberValue(player?.kills),
    combat: numberValue(player?.combat),
    offense: numberValue(player?.offense),
    defense: numberValue(player?.defense),
    support: numberValue(player?.support),
    isVip: Boolean(player?.is_vip || player?.profile?.is_vip),
  };
}

function buildVipLookup(teamViewResponse) {
  const byId = new Map();
  const byName = new Map();

  for (const player of collectTeamViewPlayers(teamViewResponse)) {
    if (player.playerId) byId.set(player.playerId, player.isVip);
    if (player.playerName) byName.set(player.playerName.toLowerCase(), player.isVip);
  }

  return { byId, byName };
}

function isKnownVip(player, vipLookup) {
  const id = String(player?.playerId || "");
  const name = String(player?.playerName || "").toLowerCase();
  return Boolean(vipLookup.byId.get(id) || vipLookup.byName.get(name));
}

function vipStatus(player) {
  return player?.isVip ? "ja tem VIP" : "VIP 3 dias";
}

function formatVipExpiration(date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: process.env.TZ || "America/Campo_Grande",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.day}/${byType.month} ${byType.hour}:${byType.minute}`;
}

function estimateVipExpirationDate(value, now = new Date()) {
  const raw = String(value || "").trim();
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
    if (Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime()) {
      return new Date(expiresAtMs);
    }
  }

  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime()) {
    return parsed;
  }

  return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
}

function formatScoreFormulaLines(parts) {
  return parts
    .filter((part) => part && part.value !== undefined && part.multiplier !== undefined)
    .map((part) => `${part.label}: ${part.value} x ${part.multiplier}`);
}

function performanceInfoHint() {
  return "Digite !perf ou !performance para saber mais!";
}

function buildStatsLookup(statsResponse) {
  const stats =
    statsResponse?.result?.stats ||
    statsResponse?.result?.players ||
    statsResponse?.players ||
    [];
  const byId = new Map();
  const byName = new Map();
  if (!Array.isArray(stats)) return { byId, byName };

  for (const player of stats) {
    const normalized = {
      playerName: String(player?.player || player?.name || "Unknown"),
      playerId: String(player?.player_id || ""),
      kills: numberValue(player?.kills),
      combat: numberValue(player?.combat),
      offense: numberValue(player?.offense),
      defense: numberValue(player?.defense),
      support: numberValue(player?.support),
    };
    if (normalized.playerId) byId.set(normalized.playerId, normalized);
    if (normalized.playerName) byName.set(normalized.playerName.toLowerCase(), normalized);
  }

  return { byId, byName };
}

function mergeStats(teamViewPlayer, statsLookup) {
  const stats =
    statsLookup.byId.get(String(teamViewPlayer.playerId || "")) ||
    statsLookup.byName.get(String(teamViewPlayer.playerName || "").toLowerCase()) ||
    null;
  if (!stats) return teamViewPlayer;

  return {
    ...teamViewPlayer,
    kills: stats.kills,
    combat: stats.combat,
    offense: stats.offense,
    defense: stats.defense,
    support: stats.support,
  };
}

function roleLabel(role, fallback) {
  return ROLE_RULES[role]?.label || String(fallback || role || "Classe desconhecida");
}

function minimumFailures(player, rule) {
  const minimums = rule?.minimums || {};
  return Object.entries(minimums)
    .filter(([field, minimum]) => numberValue(player[field]) < Number(minimum))
    .map(([field, minimum]) => `${field} >= ${minimum}`);
}

function calculateRolePerformance(player) {
  const rule = ROLE_RULES[player.role] || null;
  if (!rule) {
    return {
      ...player,
      performanceScore: 0,
      threshold: 0,
      qualifies: false,
      qualificationReason: "classe sem metrica configurada",
      formulaParts: [],
    };
  }

  const formulaParts = rule.parts.map(([field, label, multiplier]) => ({
    field,
    label,
    value: numberValue(player[field]),
    multiplier,
  }));
  const performanceScore = Math.round(
    formulaParts.reduce((total, part) => total + part.value * part.multiplier, 0)
  );
  const failures = minimumFailures(player, rule);
  const qualifies = performanceScore >= rule.threshold && failures.length === 0;

  return {
    ...player,
    roleLabel: rule.label,
    performanceScore,
    threshold: rule.threshold,
    qualifies,
    qualificationReason: qualifies
      ? "bateu a meta da classe"
      : failures.length
        ? `minimo nao atingido: ${failures.join(", ")}`
        : `abaixo da meta ${rule.threshold}`,
    formulaParts,
  };
}

function buildPerformanceResult(statsResponse, teamViewResponse) {
  const vipLookup = buildVipLookup(teamViewResponse);
  const statsLookup = buildStatsLookup(statsResponse);
  const players = collectTeamViewPlayers(teamViewResponse)
    .filter((player) => player.playerId || player.playerName !== "Unknown")
    .map((player) => mergeStats(player, statsLookup))
    .map((player) => ({
      ...calculateRolePerformance(player),
      isVip: Boolean(player.isVip) || isKnownVip(player, vipLookup),
    }));
  const qualifiedPlayers = players
    .filter((player) => player.qualifies)
    .sort((a, b) => {
      if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return a.playerName.localeCompare(b.playerName);
    });

  return {
    players,
    qualifiedPlayers,
  };
}

function applyVipIds(result, vipIds) {
  const ids = new Set(Array.from(vipIds || []).map(String));
  if (!ids.size) return result;

  function mark(player) {
    if (player?.playerId && ids.has(String(player.playerId))) {
      player.isVip = true;
    }
  }

  result.players.forEach(mark);
  result.qualifiedPlayers.forEach(mark);
  return result;
}

function formatPerformanceMessage(result) {
  const lines = [];

  lines.push("VIP PERFORMANCE POR CLASSE");
  lines.push("");
  lines.push("Ganha VIP quem bate a meta da classe final.");
  lines.push("");

  if (result.qualifiedPlayers.length) {
    result.qualifiedPlayers.forEach((player, index) => {
      const pos = String(index + 1).padStart(2, "0");
      lines.push(
        `${pos} ${player.playerName} - ${player.roleLabel} ${player.performanceScore}/${player.threshold} pts - ${vipStatus(player)}`
      );
    });
  } else {
    lines.push("Nenhum jogador bateu a meta da propria classe.");
  }

  return lines.join("\n");
}

function formatPrivateWinnerMessages(result, vipExpirationValue = "3 days") {
  const messages = [];
  const awardedPlayerIds = new Set();
  const vipUntil = formatVipExpiration(estimateVipExpirationDate(vipExpirationValue));

  function alreadyAwarded(player) {
    const key = String(player?.playerId || "").trim() || String(player?.playerName || "").trim().toLowerCase();
    if (!key) return false;
    if (awardedPlayerIds.has(key)) return true;
    awardedPlayerIds.add(key);
    return false;
  }

  result.qualifiedPlayers.forEach((player) => {
    if (player.isVip) return;
    if (alreadyAwarded(player)) return;
    messages.push({
      category: "role",
      player,
      message: [
        `Parabens, ${player.playerName}!`,
        "",
        `Voce bateu a meta de ${player.roleLabel}.`,
        `Pontuacao final: ${player.performanceScore}/${player.threshold} pts`,
        ...formatScoreFormulaLines(player.formulaParts),
        `Premio: VIP ate ${vipUntil}`,
        performanceInfoHint(),
      ].join("\n"),
    });
  });

  return messages;
}

function summarizePerformanceResult(result) {
  return {
    playersCount: result.players.length,
    qualifiedPlayers: result.qualifiedPlayers.map((player) => ({
      playerName: player.playerName,
      playerId: player.playerId,
      role: player.role,
      roleLabel: player.roleLabel,
      performanceScore: player.performanceScore,
      threshold: player.threshold,
      isVip: player.isVip,
    })),
  };
}

module.exports = {
  applyVipIds,
  buildPerformanceResult,
  formatPerformanceMessage,
  formatPrivateWinnerMessages,
  summarizePerformanceResult,
};
