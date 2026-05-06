const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function listBotPids() {
  const output = execSync("ps -eo pid=,args=", { encoding: "utf8" });
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);

  return lines
    .map((line) => {
      const parts = line.match(/^(\d+)\s+(.+)$/);
      if (!parts) return null;
      return { pid: Number(parts[1]), cmd: parts[2] };
    })
    .filter(Boolean)
    .filter((proc) => proc.pid !== process.pid)
    .filter(
      (proc) =>
        /node\b/.test(proc.cmd) &&
        /(src\/bot\.js|src\/performanceInfoBot\.js|src\/performanceBot\.js|src\/runBots\.js)\b/.test(proc.cmd)
    )
    .map((proc) => proc.pid);
}

function killPids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (err) {
      if (err.code !== "ESRCH") throw err;
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const pids = listBotPids();

  if (!pids.length) {
    console.log("[clear] nenhum processo do bot encontrado");
  } else {
    killPids(pids, "SIGTERM");
    await sleep(500);

    const remaining = listBotPids().filter((pid) => pids.includes(pid));
    if (remaining.length) {
      killPids(remaining, "SIGKILL");
    }

    console.log(`[clear] processos encerrados: ${pids.join(", ")}`);
  }

  for (const file of ["bot.lock", "performance-info-bot.lock", "performance-bot.lock"]) {
    const lockPath = path.resolve(__dirname, "..", "artifacts", file);
    try {
      fs.unlinkSync(lockPath);
      console.log(`[clear] lock removido: ${lockPath}`);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
}

main().catch((err) => {
  console.error("[clear] erro ao encerrar processos:", err.message);
  process.exit(1);
});
