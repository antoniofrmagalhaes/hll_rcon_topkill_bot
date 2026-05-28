const { renderMessageTemplate } = require("./messageTemplates");

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

function formatSquadMembers(members) {
  if (!Array.isArray(members) || !members.length) return ["Sem membros"];

  const sortedMembers = [...members].sort((a, b) => {
    const pointsA = Number(a.points || 0);
    const pointsB = Number(b.points || 0);
    if (pointsB !== pointsA) return pointsB - pointsA;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  const positionWidth = String(sortedMembers.length).length;
  const pointsWidth = sortedMembers.reduce((width, member) => {
    return Math.max(width, String(Math.round(Number(member.points || 0))).length);
  }, 1);

  return sortedMembers.map((member, idx) => {
    const position = String(idx + 1).padStart(positionWidth, " ");
    const points = String(Math.round(Number(member.points || 0))).padStart(pointsWidth, " ");
    const name = member.name || "Unknown";
    const role = member.role || "Classe desconhecida";
    return `${position} ${points} pts ${name} (${role})`;
  });
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
    const position = `${idx + 1}°`;
    return `${position} ${p.playerName} ${p.kills} abates`;
  });

  const commanderLines = bestCommander
    ? [
        "",
        "Melhor Comandante",
        "",
        `${bestCommander.name} ${bestCommander.support} suporte / ${bestCommander.combat} combate`,
      ]
    : [];

  const squadSectionLines = ["axis", "allies"].flatMap((team) => {
    const squad = bestSquadsByTeam?.[team] || null;
    const title = team === "axis" ? "Melhor Esquadrão Eixo" : "Melhor Esquadrão Aliados";

    if (!squad) {
      return ["", title, "", "Sem dados"];
    }

    const members = formatSquadMembers(squad.members);

    return [
      "",
      title,
      "",
      `${formatSquadName(squad.name)} ${squad.totalScore} pontos`,
      ...members,
    ];
  });

  const body = [...lines, ...commanderLines, ...squadSectionLines].join("\n");
  const commanderBlock = commanderLines.length ? `\n${commanderLines.join("\n")}` : "";
  const squadSectionsBlock = `\n${squadSectionLines.join("\n")}`;

  if (!includeHeader) {
    return renderMessageTemplate(
      "top.message.txt",
      {
        topHeader: "",
        topPlayersLines: lines.join("\n"),
        commanderBlock,
        squadSectionsBlock,
      },
      body
    );
  }

  const fallback = `TOP 10 Abates\n\n${body}`;
  return renderMessageTemplate(
    "top.message.txt",
    {
      topHeader: "TOP 10 Abates\n\n",
      topPlayersLines: lines.join("\n"),
      commanderBlock,
      squadSectionsBlock,
    },
    fallback
  );
}

module.exports = { normalizePlayers, computeTopKillers, formatTopMessage, formatSquadMembers };
