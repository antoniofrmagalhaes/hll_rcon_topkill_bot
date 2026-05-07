function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function readAdminCommandConfig(env = process.env) {
  const enableTestCommands = String(env.ENABLE_TEST_COMMANDS || "false").toLowerCase() === "true";
  const adminId = String(env.ADMINISTRADOR_ID || "").trim();

  if (enableTestCommands && !adminId) {
    throw new Error("Missing required env var: ADMINISTRADOR_ID when ENABLE_TEST_COMMANDS=true");
  }

  return {
    enableTestCommands,
    adminId,
  };
}

function isChatCommand(log, command) {
  if (!log || typeof log !== "object") return false;
  if (!String(log.action || "").startsWith("CHAT")) return false;

  const content = normalizeText(log.sub_content);
  const normalizedCommand = normalizeText(command);
  return content === normalizedCommand || content.startsWith(`${normalizedCommand} `);
}

function isAdminCommand(log, cfg, command) {
  return Boolean(cfg.enableTestCommands) && isChatCommand(log, command);
}

function isAdminActor(log, cfg) {
  return String(log?.player_id_1 || "").trim() === String(cfg.adminId || "").trim();
}

function adminCommandKey(log, namespace) {
  const playerRef = String(log?.player_id_1 || "").trim() || normalizeText(log?.player_name_1) || "unknown";
  const normalizedRaw = normalizeText(log?.raw);
  if (normalizedRaw) {
    return `${namespace}-admin-command|${playerRef}|${normalizedRaw}`;
  }

  const ts = Number(log?.timestamp_ms || 0);
  const bucket = Number.isFinite(ts) && ts > 0 ? Math.floor(ts / 1000) : "no-ts";
  return `${namespace}-admin-command|${playerRef}|${normalizeText(log?.sub_content)}|${bucket}`;
}

async function sendAdminPrivate(client, cfg, message, metadata = {}) {
  if (!cfg.adminId) {
    throw new Error("Cannot send admin private message without ADMINISTRADOR_ID");
  }

  if (typeof cfg.logInfo === "function") {
    cfg.logInfo("[admin-command] sending private preview", {
      adminId: cfg.adminId,
      previewType: metadata.previewType || null,
      originalPlayerId: metadata.originalPlayerId || null,
      originalPlayerName: metadata.originalPlayerName || null,
      message,
    });
  }

  await client.post("message_player", {
    player_id: cfg.adminId,
    player_name: "",
    message,
    by: metadata.by || "hll-admin-command",
    save_message: false,
  });
}

module.exports = {
  adminCommandKey,
  isAdminActor,
  isAdminCommand,
  readAdminCommandConfig,
  sendAdminPrivate,
};
