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
    label: "Atirador de Metralhadora",
    threshold: 3200,
    parts: [
      ["kills", "Abates", 120],
      ["kpm", "KPM", 1000],
      ["combat", "Combate", 0.7],
      ["defense", "Defesa", 0.4],
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
    label: "Atirador Automatico",
    threshold: 3000,
    parts: [
      ["kills", "Abates", 120],
      ["kpm", "KPM", 1000],
      ["combat", "Combate", 0.6],
      ["offense", "Ataque", 0.3],
      ["defense", "Defesa", 0.3],
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

const ROLE_RCON_NAMES = {
  commander: ["armycommander", "commander"],
  officer: ["officer"],
  rifleman: ["rifleman"],
  assault: ["assault"],
  automaticrifleman: ["automaticrifleman", "automatic rifleman"],
  medic: ["medic"],
  support: ["support"],
  machinegunner: ["machinegunner", "machine gunner"],
  antitank: ["antitank", "anti-tank", "anti tank"],
  engineer: ["engineer"],
  tankcommander: ["tankcommander", "tank commander"],
  crewman: ["crewman", "tankcrewman"],
  spotter: ["spotter"],
  sniper: ["sniper"],
};

const ROLE_METRIC_COMMANDS = {
  commander: { title: "Comandante", roles: ["commander"] },
  officer: { title: "Oficial de Esquadrao", roles: ["officer"] },
  rifleman: { title: "Rifleman", roles: ["rifleman"] },
  shooter: { title: "Rifleman", roles: ["rifleman"] },
  assault: { title: "Assault", roles: ["assault"] },
  automaticrifleman: { title: "Atirador Automatico", roles: ["automaticrifleman"] },
  autorifleman: { title: "Atirador Automatico", roles: ["automaticrifleman"] },
  medic: { title: "Medico", roles: ["medic"] },
  support: { title: "Suporte", roles: ["support"] },
  machinegunner: { title: "Atirador de Metralhadora", roles: ["machinegunner"] },
  mg: { title: "Atirador de Metralhadora", roles: ["machinegunner"] },
  antitank: { title: "Anti-Tank", roles: ["antitank"] },
  at: { title: "Anti-Tank", roles: ["antitank"] },
  engineer: { title: "Engenheiro", roles: ["engineer"] },
  tankcommander: { title: "Comandante de Tanque", roles: ["tankcommander"] },
  crewman: { title: "Tripulante", roles: ["crewman"] },
  spotter: { title: "Observador", roles: ["spotter"] },
  sniper: { title: "Sniper", roles: ["sniper"] },
};

const ROLE_GUIDES = {
  commander: [
    "Voce guia o time inteiro. Marque objetivos claros, mantenha a comunicacao com os oficiais e use recursos para abrir caminho.",
    "Priorize guarnicoes, suprimentos, bombardeios e reforcos no momento certo. Um bom comandante passa direcao sem lotar o radio.",
  ],
  officer: [
    "Seu papel e muito importante para o andamento da missao. Coordene seu esquadrao para cumprir a funcao designada e mantenha todos jogando juntos.",
    "Crie guarnicoes de respawn para o time, coloque postos de surgimento do esquadrao e nunca deixe sua tropa sem uma rota de volta para a luta.",
  ],
  rifleman: [
    "Voce e a base da linha de frente. Fique perto do esquadrao, cubra avancos, defenda setores e ajude a manter pressao no objetivo.",
    "Use sua caixa de municao quando o time precisar e jogue pelo terreno, nao por corrida solo ate o ponto.",
  ],
  assault: [
    "Sua funcao e abrir espaco para o esquadrao. Entre junto com a equipe, limpe trincheiras, casas e flancos curtos.",
    "Evite avancar sozinho. Assault funciona melhor quando quebra a primeira defesa e permite que o resto do esquadrao entre.",
  ],
  automaticrifleman: [
    "Voce da volume de fogo para o esquadrao. Segure angulos, acompanhe o avanco e force o inimigo a baixar a cabeca.",
    "Atire com controle e reposicione com frequencia. Ficar parado no mesmo lugar entrega sua posicao rapido.",
  ],
  medic: [
    "Sua prioridade e manter o esquadrao vivo e no combate. Fique um pouco atras da linha, reviva quem caiu em posicao segura e use fumaca para buscar aliados.",
    "Nem todo corpo vale uma corrida aberta. Escolha bem as revividas para nao virar mais uma baixa.",
  ],
  support: [
    "Voce carrega o recurso que muda a partida: suprimentos. Ande perto do oficial e ajude a construir guarnicoes onde o time precisa nascer.",
    "Depois de soltar suprimentos, continue ajudando no objetivo e combine com engenheiros quando houver necessidade de nos, defesas ou reparos.",
  ],
  machinegunner: [
    "Sua funcao e controlar area. Monte em posicoes com boa visao, corte avancos inimigos e proteja o movimento do esquadrao.",
    "Troque de lugar depois de pressionar por um tempo. Metralhadora parada por muito tempo vira alvo facil.",
  ],
  antitank: [
    "Voce e a resposta do esquadrao contra blindados. Avise contatos, flanqueie com calma e espere um bom angulo antes de gastar o disparo.",
    "Contra infantaria, ajude a segurar o objetivo, mas nao esqueca: tanque solto muda a partida.",
  ],
  engineer: [
    "Voce fortalece o time fora do combate direto. Construa nos, defesas, reparos e estruturas que ajudem o time a sustentar o mapa.",
    "Trabalhe com suporte e oficial. Um engenheiro bem usado cria recurso, protege ponto e mantem blindado vivo.",
  ],
  tankcommander: [
    "Voce comanda o blindado. Defina alvo, rota e prioridade, mantendo comunicacao clara com motorista, artilheiro e comando.",
    "Tanque bom nao joga isolado. Avance com infantaria por perto, recue para reparar e escolha lutas que seu blindado pode vencer.",
  ],
  crewman: [
    "Voce faz o tanque funcionar. Siga as chamadas do comandante, informe contatos e mantenha calma em manobras, tiros e reparos.",
    "Se estiver dirigindo, pense em cobertura e angulo. Se estiver atirando, priorize ameacas que podem destruir o blindado.",
  ],
  spotter: [
    "Voce lidera a dupla de reconhecimento. Marque guarnicoes, corte retaguarda, passe informacao e crie pressao onde o inimigo nao espera.",
    "Seu trabalho nao e so abate. Informacao boa, OP bem colocado e guarnicao inimiga removida valem muito para o time.",
  ],
  sniper: [
    "Voce trabalha junto do observador. Priorize alvos importantes, proteja a movimentacao da dupla e pressione posicoes que travam o time.",
    "Evite ficar longe demais da missao. Sniper ajuda mais quando remove ameacas e abre caminho, nao quando joga desconectado do mapa.",
  ],
};

const ROLE_HELP_COMMANDS = [
  ["Comandante", "!commander"],
  ["Oficial de Esquadrao", "!officer"],
  ["Rifleman / Shooter", "!rifleman ou !shooter"],
  ["Assault", "!assault"],
  ["Atirador Automatico", "!automaticrifleman"],
  ["Medico", "!medic"],
  ["Suporte", "!support"],
  ["Atirador de Metralhadora", "!machinegunner"],
  ["Anti-Tank", "!antitank"],
  ["Engenheiro", "!engineer"],
  ["Comandante de Tanque", "!tankcommander"],
  ["Tripulante", "!crewman"],
  ["Observador", "!spotter"],
  ["Sniper", "!sniper"],
];

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
    rawRole: String(rawRole || ""),
    role: normalizeRole(rawRole),
    roleLabel: roleLabel(normalizeRole(rawRole), rawRole),
    kills: numberValue(player?.kills),
    combat: numberValue(player?.combat),
    offense: numberValue(player?.offense),
    defense: numberValue(player?.defense),
    support: numberValue(player?.support),
    kpm: numberValue(player?.kills_per_minute),
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

  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function formatScoreFormulaLines(parts) {
  return parts
    .filter((part) => part && part.value !== undefined && part.multiplier !== undefined)
    .map((part) => `${part.label}: ${part.value} x ${part.multiplier}`);
}

function formatDecimal(value, digits = 2) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(digits);
}

function formatRuleMinimums(rule) {
  const minimums = Object.entries(rule.minimums || {});
  if (!minimums.length) return "nenhum";
  return minimums.map(([field, minimum]) => `${field} >= ${minimum}`).join(", ");
}

function formatMetricValue(field, value) {
  if (field === "kpm") return Number(value || 0).toFixed(2);
  return String(Math.round(numberValue(value)));
}

function formatFriendlyFormula(rule) {
  return rule.parts
    .map(([field, label, multiplier]) => `${label} x${multiplier}`)
    .join(" / ");
}

function formatPlayerMetricBreakdown(player) {
  const parts = Array.isArray(player.formulaParts) ? player.formulaParts : [];
  return parts
    .filter((part) => ["kills", "kpm", "combat", "support"].includes(part.field))
    .map((part) => `${part.label} ${formatMetricValue(part.field, part.value)}`)
    .join(" / ");
}

function commandName(value) {
  const raw = String(value || "").trim().split(/\s+/)[0] || "";
  return raw.replace(/^!+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveRoleMetricCommand(value) {
  const command = commandName(value);
  return ROLE_METRIC_COMMANDS[command]
    ? {
        command,
        ...ROLE_METRIC_COMMANDS[command],
      }
    : null;
}

function isClassesCommand(value) {
  return commandName(value) === "classes";
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
      kpm: numberValue(player?.kills_per_minute),
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
    kpm: stats.kpm,
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

function normalizePerformancePlayers(statsResponse, vipLookup = { byId: new Map(), byName: new Map() }) {
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
    const playerName = String(player.player || player.name || "Unknown");
    const playerId = String(player.player_id || "");

    return {
      playerName,
      playerId,
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
      isVip: isKnownVip({ playerId, playerName }, vipLookup),
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
    const playerName = String(commander.name || commander.player || "Unknown");
    const playerId = String(commander.player_id || "");

    commanders.push({
      team,
      playerName,
      playerId,
      role: commander.role || "commander",
      kills,
      deaths,
      combat,
      offense,
      defense,
      support,
      performanceScore,
      isVip: Boolean(commander.is_vip || commander.profile?.is_vip) ||
        isKnownVip({ playerId, playerName }, vipLookup),
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

function isTankSquad(name, squad) {
  const type = String(squad?.type || "").toLowerCase();
  if (type.includes("armor") || type.includes("tank")) return true;

  const squadName = String(name || "").toLowerCase();
  if (squadName.includes("tank") || squadName.includes("armor")) return true;

  const players = Array.isArray(squad?.players) ? squad.players : [];
  return players.some((player) => {
    const role = normalizeRole(player?.role || "");
    return role === "tankcommander" || role === "crewman";
  });
}

function normalizeTankSquads(teamViewResponse) {
  const result = teamViewResponse?.result || {};
  const squads = [];

  for (const team of ["allies", "axis"]) {
    const teamSquads = result?.[team]?.squads || {};
    for (const [name, squad] of Object.entries(teamSquads)) {
      if (!squad || typeof squad !== "object" || !isTankSquad(name, squad)) continue;

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
  const players = normalizePerformancePlayers(statsResponse, vipLookup);
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
      lines.push(
        `${pos} ${member.playerName} ${member.performanceScore} pts - ${vipStatus(member)}`
      );
    });
  } else {
    lines.push("Sem squad de tanque encontrado");
  }

  return lines.join("\n");
}

function formatRoleMetricsMessage(result, commandConfig) {
  const lines = [];
  const guideLines = commandConfig.roles.flatMap((role) => ROLE_GUIDES[role] || []);

  lines.push(commandConfig.title.toUpperCase());
  lines.push("");

  if (!guideLines.length) {
    lines.push("Jogue perto do seu esquadrao, siga a funcao da classe e ajude o time a manter pressao no objetivo.");
    return lines.join("\n");
  }

  lines.push(...guideLines);

  return lines.join("\n");
}

function formatClassesMessage() {
  return [
    "CLASSES",
    ...ROLE_HELP_COMMANDS.map(([label, command]) => `${command} (${label})`),
  ].join("\n");
}

function formatPrivateWinnerMessages(result, vipExpirationValue = "1 day") {
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
  formatClassesMessage,
  formatRoleMetricsMessage,
  isClassesCommand,
  resolveRoleMetricCommand,
  summarizePerformanceResult,
};
