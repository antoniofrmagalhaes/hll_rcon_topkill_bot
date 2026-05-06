require("dotenv").config();

const { spawn } = require("child_process");
const path = require("path");

const bots = [
  {
    name: "top",
    script: path.resolve(__dirname, "bot.js"),
    enabled: String(process.env.TOP_BOT_ENABLED || "true").toLowerCase() !== "false",
  },
  {
    name: "performance-info",
    script: path.resolve(__dirname, "performanceInfoBot.js"),
    enabled: String(process.env.PERFORMANCE_INFO_BOT_ENABLED || "true").toLowerCase() !== "false",
  },
  {
    name: "performance",
    script: path.resolve(__dirname, "performanceBot.js"),
    enabled: String(process.env.PERFORMANCE_BOT_ENABLED || "false").toLowerCase() === "true",
  },
];

const children = new Map();
let shuttingDown = false;

function nowIso() {
  return new Date().toISOString();
}

function log(message, data) {
  if (data !== undefined) {
    console.log(`[${nowIso()}] [runner] ${message}`, data);
    return;
  }
  console.log(`[${nowIso()}] [runner] ${message}`);
}

function prefixLines(botName, stream, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    stream.write(`[${botName}] ${line}\n`);
  }
}

function startBot(bot) {
  if (!bot.enabled) {
    log("bot disabled by env", { name: bot.name });
    return;
  }

  log("starting bot", { name: bot.name, script: bot.script });
  const child = spawn(process.execPath, [bot.script], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set(bot.name, child);
  child.stdout.on("data", (chunk) => prefixLines(bot.name, process.stdout, chunk));
  child.stderr.on("data", (chunk) => prefixLines(bot.name, process.stderr, chunk));

  child.on("exit", (code, signal) => {
    children.delete(bot.name);
    log("bot exited", { name: bot.name, code, signal });

    if (!shuttingDown) {
      shutdown(code || 1);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("stopping bots");

  for (const child of children.values()) {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const child of children.values()) {
      child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 3000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const bot of bots) {
  startBot(bot);
}

if (!children.size) {
  log("no bots enabled");
}
