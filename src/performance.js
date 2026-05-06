function numberValue(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function collectTeamViewPlayers(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const players = [];

  for (const team of ["allies", "axis", "unassigned"]) {
    const squads = result?.[team]?.squads || {};
    for (const squad of Object.values(squads)) {
      if (!squad || typeof squad !== "object" || !Array.isArray(squad.players)) continue;
      for (const player of squad.players) {
        players.push({
          playerName: String(player?.name || "Unknown"),
          playerId: String(player?.player_id || ""),
          isVip: Boolean(player?.is_vip || player?.profile?.is_vip),
        });
      }
    }
  }

  return players;
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
  return player?.isVip ? "ja tem VIP" : "VIP 1 dia";
}

function formatVipExpiration(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
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

function formatDecimal(value, digits = 2) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(digits);
}

function formatScoreFormulaLines(parts) {
  return parts
    .filter((part) => part && part.value !== undefined && part.multiplier !== undefined)
    .map((part) => `${part.label}: ${part.value} x ${part.multiplier}`);
}

function performanceInfoHint() {
  return "Digite !perf ou !performance para saber mais!";
}

function normalizePlayers(statsResponse, vipLookup = { byId: new Map(), byName: new Map() }) {
  const stats =
    statsResponse?.result?.stats ||
    statsResponse?.result?.players ||
    statsResponse?.players ||
    [];
  if (!Array.isArray(stats)) return [];

  return stats.map((player) => {
    const kills = numberValue(player.kills);
    const deaths = numberValue(player.deaths);
    const combat = numberValue(player.combat);
    const offense = numberValue(player.offense);
    const defense = numberValue(player.defense);
    const support = numberValue(player.support);
    const kpm = numberValue(player.kills_per_minute);
    const kd = numberValue(player.kill_death_ratio) || (deaths === 0 ? kills : kills / deaths);
    const kpmBonus = Math.min(kpm * 100, 200);
    const performanceScore = Math.round(
      kills * 20 + combat + offense + defense + support * 1.2 + kpmBonus
    );

    return {
      playerName: String(player.player || player.name || "Unknown"),
      playerId: String(player.player_id || ""),
      kills,
      deaths,
      combat,
      offense,
      defense,
      support,
      kpm,
      kd,
      kpmBonus,
      performanceScore,
      isVip: isKnownVip(
        {
          playerId: String(player.player_id || ""),
          playerName: String(player.player || player.name || "Unknown"),
        },
        vipLookup
      ),
    };
  });
}

function normalizeCommanders(teamViewResponse, vipLookup = { byId: new Map(), byName: new Map() }) {
  const result = teamViewResponse?.result || {};
  const commanders = [];

  for (const team of ["allies", "axis"]) {
    const commander = result?.[team]?.commander || null;
    if (!commander || typeof commander !== "object") continue;

    const kills = numberValue(commander.kills);
    const deaths = numberValue(commander.deaths);
    const combat = numberValue(commander.combat);
    const offense = numberValue(commander.offense);
    const defense = numberValue(commander.defense);
    const support = numberValue(commander.support);
    const performanceScore = Math.round(support + combat + (offense + defense) * 0.5 + kills * 10);

    commanders.push({
      team,
      playerName: String(commander.name || commander.player || "Unknown"),
      playerId: String(commander.player_id || ""),
      role: commander.role || "commander",
      kills,
      deaths,
      combat,
      offense,
      defense,
      support,
      performanceScore,
      isVip: Boolean(commander.is_vip || commander.profile?.is_vip) ||
        isKnownVip(
          {
            playerId: String(commander.player_id || ""),
            playerName: String(commander.name || commander.player || "Unknown"),
          },
          vipLookup
        ),
    });
  }

  return commanders;
}

function pickBestCommander(commanders) {
  return [...commanders].sort((a, b) => {
    if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
    if (b.support !== a.support) return b.support - a.support;
    if (b.combat !== a.combat) return b.combat - a.combat;
    if (b.offense + b.defense !== a.offense + a.defense) {
      return b.offense + b.defense - (a.offense + a.defense);
    }
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.playerName.localeCompare(b.playerName);
  })[0] || null;
}

function computeTopCombatPlayers(players, { limit = 3, excludePlayerIds = [] } = {}) {
  const excluded = new Set(excludePlayerIds.filter(Boolean).map(String));

  return [...players]
    .filter((player) => !excluded.has(String(player.playerId || "")))
    .sort((a, b) => {
      if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.combat !== a.combat) return b.combat - a.combat;
      if (b.kd !== a.kd) return b.kd - a.kd;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return a.playerName.localeCompare(b.playerName);
    })
    .slice(0, limit);
}

function isTankSquad(squad) {
  const type = String(squad?.type || "").toLowerCase();
  return type.includes("armor") || type.includes("tank");
}

function normalizeTankSquads(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const squads = [];

  for (const team of ["allies", "axis"]) {
    const teamSquads = result?.[team]?.squads || {};
    for (const [name, squad] of Object.entries(teamSquads)) {
      if (!squad || typeof squad !== "object" || !isTankSquad(squad)) continue;

      const kills = numberValue(squad.kills);
      const deaths = numberValue(squad.deaths);
      const combat = numberValue(squad.combat);
      const offense = numberValue(squad.offense);
      const defense = numberValue(squad.defense);
      const support = numberValue(squad.support);
      const performanceScore = Math.round(combat + offense + defense + support + kills * 10);
      const members = Array.isArray(squad.players)
        ? squad.players.map((player) => ({
            playerName: String(player?.name || "Unknown"),
            playerId: String(player?.player_id || ""),
            role: player?.role || null,
            kills: numberValue(player?.kills),
            deaths: numberValue(player?.deaths),
            combat: numberValue(player?.combat),
            offense: numberValue(player?.offense),
            defense: numberValue(player?.defense),
            support: numberValue(player?.support),
            performanceScore: Math.round(
              numberValue(player?.combat) +
                numberValue(player?.offense) +
                numberValue(player?.defense) +
                numberValue(player?.support) +
                numberValue(player?.kills) * 10
            ),
            isVip: Boolean(player?.is_vip || player?.profile?.is_vip),
          }))
        : [];

      squads.push({
        team,
        name: String(name || "").toUpperCase(),
        type: squad.type || null,
        kills,
        deaths,
        combat,
        offense,
        defense,
        support,
        performanceScore,
        members,
      });
    }
  }

  return squads;
}

function pickBestTankSquad(squads) {
  return [...squads].sort((a, b) => {
    if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (b.combat !== a.combat) return b.combat - a.combat;
    if (b.support !== a.support) return b.support - a.support;
    return a.name.localeCompare(b.name);
  })[0] || null;
}

function buildPerformanceResult(statsResponse, teamViewResponse) {
  const vipLookup = buildVipLookup(teamViewResponse);
  const players = normalizePlayers(statsResponse, vipLookup);
  const commanders = normalizeCommanders(teamViewResponse, vipLookup);
  const bestCommander = pickBestCommander(commanders);
  const topCombatPlayers = computeTopCombatPlayers(players, {
    limit: 3,
    excludePlayerIds: bestCommander?.playerId ? [bestCommander.playerId] : [],
  });
  const tankSquads = normalizeTankSquads(teamViewResponse);
  const bestTankSquad = pickBestTankSquad(tankSquads);

  return {
    players,
    commanders,
    bestCommander,
    topCombatPlayers,
    tankSquads,
    bestTankSquad,
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
  result.commanders.forEach(mark);
  mark(result.bestCommander);
  result.topCombatPlayers.forEach(mark);
  result.tankSquads.forEach((squad) => squad.members.forEach(mark));
  if (result.bestTankSquad) {
    result.bestTankSquad.members.forEach(mark);
  }
  return result;
}

function formatPlayerLine(player, index) {
  const pos = String(index + 1).padStart(2, "0");
  return `${pos} ${player.playerName} ${player.performanceScore} pts - ${vipStatus(player)}`;
}

function sortByIndividualScore(players) {
  return [...players].sort((a, b) => {
    if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.playerName.localeCompare(b.playerName);
  });
}

function formatPerformanceMessage(result) {
  const lines = [];

  lines.push("TOP PERFORMANCE DA PARTIDA");
  lines.push("");

  lines.push("Melhor Comandante");
  if (result.bestCommander) {
    lines.push(
      `01 ${result.bestCommander.playerName} ${result.bestCommander.performanceScore} pts - ${vipStatus(result.bestCommander)}`
    );
  } else {
    lines.push("Sem comandante");
  }

  lines.push("");
  lines.push("Top 3 Jogadores da Partida");
  if (result.topCombatPlayers.length) {
    lines.push(...result.topCombatPlayers.map(formatPlayerLine));
  } else {
    lines.push("Sem jogadores com dados");
  }

  lines.push("");
  lines.push("Melhor Squad Tanque");
  if (result.bestTankSquad) {
    lines.push(`${result.bestTankSquad.name} ${result.bestTankSquad.performanceScore} pts`);
    sortByIndividualScore(result.bestTankSquad.members).forEach((member, index) => {
      const pos = String(index + 1).padStart(2, "0");
      lines.push(`${pos} ${member.playerName} ${member.performanceScore} pts - ${vipStatus(member)}`);
    });
  } else {
    lines.push("Sem squad de tanque encontrado");
  }

  return lines.join("\n");
}

function formatPrivateWinnerMessages(result) {
  const messages = [];
  const awardedPlayerIds = new Set();
  const vipUntil = formatVipExpiration();

  function alreadyAwarded(player) {
    const key = String(player?.playerId || "").trim() || String(player?.playerName || "").trim().toLowerCase();
    if (!key) return false;
    if (awardedPlayerIds.has(key)) return true;
    awardedPlayerIds.add(key);
    return false;
  }

  if (result.bestCommander && !result.bestCommander.isVip && !alreadyAwarded(result.bestCommander)) {
    messages.push({
      category: "commander",
      player: result.bestCommander,
      message: [
        `Parabens, ${result.bestCommander.playerName}!`,
        "",
        "Voce foi o melhor comandante da partida.",
        `Pontuacao final: ${result.bestCommander.performanceScore} pts`,
        ...formatScoreFormulaLines([
          { label: "Suporte", value: result.bestCommander.support, multiplier: 1 },
          { label: "Combate", value: result.bestCommander.combat, multiplier: 1 },
          { label: "Ataque", value: result.bestCommander.offense, multiplier: 0.5 },
          { label: "Defesa", value: result.bestCommander.defense, multiplier: 0.5 },
          { label: "Abates", value: result.bestCommander.kills, multiplier: 10 },
        ]),
        `Premio: VIP ate ${vipUntil}`,
        performanceInfoHint(),
      ].join("\n"),
    });
  }

  result.topCombatPlayers.forEach((player, index) => {
    if (player.isVip) return;
    if (alreadyAwarded(player)) return;
    messages.push({
      category: "combat",
      player,
      message: [
        `Parabens, ${player.playerName}!`,
        "",
        `Voce ficou em ${index + 1}o lugar entre os jogadores da partida.`,
        `Pontuacao final: ${player.performanceScore} pts`,
        ...formatScoreFormulaLines([
          { label: "Kills", value: player.kills, multiplier: 20 },
          { label: "KPM", value: formatDecimal(player.kpm), multiplier: 100 },
          { label: "Combate", value: player.combat, multiplier: 1 },
          { label: "Ataque", value: player.offense, multiplier: 1 },
          { label: "Defesa", value: player.defense, multiplier: 1 },
          { label: "Suporte", value: player.support, multiplier: 1.2 },
        ]),
        `Premio: VIP ate ${vipUntil}`,
        performanceInfoHint(),
      ].join("\n"),
    });
  });

  if (result.bestTankSquad) {
    for (const member of result.bestTankSquad.members) {
      if (member.isVip) continue;
      if (alreadyAwarded(member)) continue;
      messages.push({
        category: "tank",
        player: member,
        squad: result.bestTankSquad,
        message: [
          `Parabens, ${member.playerName}!`,
          "",
          `Seu squad de tanque ${result.bestTankSquad.name} foi o melhor da partida.`,
          `Pontuacao final do esquadrao: ${result.bestTankSquad.performanceScore} pts`,
          `Sua pontuacao: ${member.performanceScore} pts`,
          ...formatScoreFormulaLines([
            { label: "Kills", value: member.kills, multiplier: 10 },
            { label: "Combate", value: member.combat, multiplier: 1 },
            { label: "Ataque", value: member.offense, multiplier: 1 },
            { label: "Defesa", value: member.defense, multiplier: 1 },
            { label: "Suporte", value: member.support, multiplier: 1 },
          ]),
          `Premio: VIP ate ${vipUntil}`,
          performanceInfoHint(),
        ].join("\n"),
      });
    }
  }

  return messages;
}

function summarizePerformanceResult(result) {
  return {
    playersCount: result.players.length,
    commanders: result.commanders,
    bestCommander: result.bestCommander,
    topCombatPlayers: result.topCombatPlayers,
    tankSquads: result.tankSquads.map((squad) => ({
      team: squad.team,
      name: squad.name,
      type: squad.type,
      performanceScore: squad.performanceScore,
      kills: squad.kills,
      members: squad.members.map((member) => ({
          playerName: member.playerName,
          playerId: member.playerId,
          role: member.role,
          performanceScore: member.performanceScore,
          isVip: member.isVip,
        })),
    })),
    bestTankSquad: result.bestTankSquad,
  };
}

module.exports = {
  applyVipIds,
  buildPerformanceResult,
  formatPerformanceMessage,
  formatPrivateWinnerMessages,
  summarizePerformanceResult,
};
