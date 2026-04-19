function normalizePlayers(scoreboardResponse) {
  const stats =
    scoreboardResponse?.result?.stats ||
    scoreboardResponse?.result?.players ||
    scoreboardResponse?.players ||
    [];
  if (!Array.isArray(stats)) return [];

  return stats.map((player) => {
    const kills = Number(player.kills || 0);
    const deaths = Number(player.deaths || 0);
    const kd = deaths === 0 ? kills : kills / deaths;

    return {
      playerName: String(player.player || "Unknown"),
      playerId: String(player.player_id || ""),
      kills,
      deaths,
      kd,
    };
  });
}

function computeTopKillers(players, limit = 10) {
  return [...players]
    .sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.kd !== a.kd) return b.kd - a.kd;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return a.playerName.localeCompare(b.playerName);
    })
    .slice(0, limit);
}

function formatSquadName(name) {
  return String(name || "").trim().toUpperCase();
}

function formatTopMessage(
  topPlayers,
  {
    includeHeader = true,
    bestCommander = null,
    bestSquadsByTeam = null,
  } = {}
) {
  const lines = topPlayers.map((p, idx) => {
    const position = String(idx + 1).padStart(2, " ");
    const kills = String(p.kills).padStart(2, " ");
    return `${position} ${p.playerName} ${kills} abates`;
  });

  const commanderLines = bestCommander
    ? [
        "",
        "Melhor Comandante",
        "",
        `${bestCommander.name} ${bestCommander.support} suporte / ${bestCommander.combat} combate`,
      ]
    : [];

  const squadSections = ["axis", "allies"].flatMap((team) => {
    const squad = bestSquadsByTeam?.[team] || null;
    const title = team === "axis" ? "Melhor Esquadrão Eixo" : "Melhor Esquadrão Aliados";

    if (!squad) {
      return ["", title, "", "Sem dados"];
    }

    const members = squad.members.length
      ? squad.members.map((member) => `- ${member.name} (${member.role})`)
      : ["Sem membros"];

    return [
      "",
      title,
      "",
      `${formatSquadName(squad.name)} ${squad.totalScore} pontos`,
      ...members,
    ];
  });

  const body = [...lines, ...commanderLines, ...squadSections].join("\n");

  if (!includeHeader) {
    return body;
  }

  return `TOP 10 Abates\n\n${body}`;
}

module.exports = { normalizePlayers, computeTopKillers, formatTopMessage };
