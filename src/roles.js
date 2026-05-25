const ROLE_ALIASES = {
  armycommander: "commander",
  automaticrifleman: "automaticrifleman",
  automaticrifle: "automaticrifleman",
  autorifleman: "automaticrifleman",
  antitank: "antitank",
  antitanker: "antitank",
  tankcommander: "tankcommander",
  tankcrewman: "crewman",
  heavymachinegunner: "machinegunner",
  heavygunner: "machinegunner",
  mg: "machinegunner",
};

const ROLE_LABELS_PT_BR = {
  commander: "Comandante",
  officer: "Oficial",
  rifleman: "Atirador",
  assault: "Assalto",
  automaticrifleman: "Atirador Automático",
  medic: "Médico",
  support: "Suporte",
  machinegunner: "Atirador de Metralhadora",
  antitank: "Antitanque",
  engineer: "Engenheiro",
  tankcommander: "Comandante de Tanque",
  crewman: "Tripulante",
  spotter: "Observador",
  sniper: "Franco-Atirador",
};

function normalizeRole(value) {
  const compact = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ROLE_ALIASES[compact] || compact;
}

function translateRolePtBr(value, fallback = "Classe desconhecida") {
  const normalized = normalizeRole(value);
  return ROLE_LABELS_PT_BR[normalized] || String(value || fallback);
}

module.exports = {
  ROLE_LABELS_PT_BR,
  normalizeRole,
  translateRolePtBr,
};
