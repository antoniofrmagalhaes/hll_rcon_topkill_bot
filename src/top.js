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

function formatPlayerName(name) {
  return String(name || "Unknown")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function translateRole(role) {
  const roleKey = String(role || "").trim().toLowerCase();
  const roleMap = {
    commander: "Comandante",
    officer: "Oficial",
    squadleader: "Lider de Esquadrao",
    squad_leader: "Lider de Esquadrao",
    tankcommander: "Comandante de Tanque",
    tank_commander: "Comandante de Tanque",
    spotter: "Observador",
    sniper: "Atirador de Elite",
    rifleman: "Atirador",
    support: "Suporte",
    medic: "Medico",
    engineer: "Engenheiro",
    machinegunner: "Metralhador",
    machine_gunner: "Metralhador",
    heavymachinegunner: "Atirador de Metralhadora",
    heavy_machine_gunner: "Atirador de Metralhadora",
    automaticrifleman: "Atirador Automatico",
    automatic_rifleman: "Atirador Automatico",
    assault: "Assalto",
    antitank: "Antitanque",
    anti_tank: "Antitanque",
    crewman: "Tripulante",
  };

  if (roleMap[roleKey]) return roleMap[roleKey];
  return toTitleCase(roleKey || "Sem classe");
}

function formatTopMessage(
  topPlayers,
  {
    includeHeader = true,
    bestCommander = null,
    bestSquadsByTeam = null,
  } = {}
) {
  const maxNameLength = Math.max(
    ...topPlayers.map((p) => formatPlayerName(p.playerName).length),
    8
  );
  const maxKillsLength = Math.max(...topPlayers.map((p) => String(p.kills).length), 1);

  const lines = topPlayers.map((p, idx) => {
    const rank = idx + 1;
    const extraSpacing = rank === 1 ? " " : rank === 10 ? "  " : "";
    const position = `#${String(rank).padStart(2, "0")}`.padEnd(5, " ") + extraSpacing;
    const playerName = formatPlayerName(p.playerName).padEnd(maxNameLength, " ");
    const kills = String(p.kills).padStart(maxKillsLength, " ");
    return `${position}${playerName} = ${kills} abates`;
  });

  const commanderLines = bestCommander
    ? [
        "",
        "MELHOR COMANDANTE",
        `${formatPlayerName(bestCommander.name)} = ${bestCommander.support} suporte | ${bestCommander.combat} combate`,
      ]
    : [];

  const squadSections = ["axis", "allies"].flatMap((team) => {
    const squad = bestSquadsByTeam?.[team] || null;
    const title = team === "axis" ? "MELHOR ESQUADRAO EIXO" : "MELHOR ESQUADRAO ALIADOS";
    if (!squad) {
      return ["", title, "Sem dados"];
    }

    const members = squad.members.length
      ? squad.members.map((member) => {
          const memberName = formatPlayerName(member.name);
          const translatedRole = translateRole(member.role);
          return `- ${memberName} (${translatedRole})`;
        })
      : ["Sem membros"];

    return [
      "",
      title,
      `${formatSquadName(squad.name)} = ${squad.totalScore} pontos`,
      ...members,
    ];
  });

  const bodyLines = [...lines, ...commanderLines, ...squadSections];
  const topTitle = "# TOP 10 ABATES";
  const contentWidth = Math.max(
    topTitle.length,
    ...bodyLines.map((line) => line.length)
  );
  const fullDivider = "=".repeat(contentWidth);

  const sectionTitles = new Set([
    "MELHOR COMANDANTE",
    "MELHOR ESQUADRAO EIXO",
    "MELHOR ESQUADRAO ALIADOS",
  ]);

  const body = bodyLines
    .flatMap((line) => {
      if (sectionTitles.has(line)) {
        return [line, fullDivider];
      }
      return [line];
    })
    .join("\n");

  if (!includeHeader) {
    return body;
  }

  const topDivider = fullDivider;

  return `${topTitle}\n${topDivider}\n${body}`;
}

module.exports = { normalizePlayers, computeTopKillers, formatTopMessage };
