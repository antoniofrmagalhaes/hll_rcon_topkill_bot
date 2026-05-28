const fs = require("fs");
const path = require("path");

const cache = new Map();

function boolEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return String(raw).toLowerCase() === "true";
}

function config() {
  return {
    enabled: boolEnv("MESSAGE_TEMPLATES_ENABLED", true),
    strict: boolEnv("MESSAGE_TEMPLATE_STRICT", false),
    cacheMs: Number(process.env.MESSAGE_TEMPLATE_CACHE_MS || 30000),
    dir: process.env.MESSAGE_TEMPLATES_DIR || "templates",
  };
}

function templatePath(name, cfg) {
  const safeName = String(name || "").trim();
  if (!safeName || safeName.includes("/") || safeName.includes("\\") || safeName.includes("..")) {
    throw new Error(`Invalid template name: ${name}`);
  }

  const baseDir = path.isAbsolute(cfg.dir) ? cfg.dir : path.resolve(__dirname, "..", cfg.dir);
  return path.join(baseDir, safeName);
}

function log(logInfo, message, data) {
  if (typeof logInfo === "function") {
    logInfo(message, data);
  }
}

function loadTemplate(name, cfg, logInfo) {
  if (!cfg.enabled) return null;

  const file = templatePath(name, cfg);
  const now = Date.now();
  const cached = cache.get(file);
  if (cached && now - cached.loadedAtMs < cfg.cacheMs) {
    return cached.content;
  }

  try {
    const content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    cache.set(file, { loadedAtMs: now, content });
    log(logInfo, "[templates] template loaded", { name, file });
    return content;
  } catch (err) {
    if (err?.code === "ENOENT" && !cfg.strict) {
      cache.set(file, { loadedAtMs: now, content: null });
      return null;
    }
    throw err;
  }
}

function renderMessageTemplate(name, context, fallback, options = {}) {
  const cfg = config();
  const logInfo = options.logInfo;

  try {
    const template = loadTemplate(name, cfg, logInfo);
    if (!template) return fallback;

    const data = context && typeof context === "object" ? context : {};
    const unknown = [];
    const rendered = template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        unknown.push(key);
        return cfg.strict ? match : "";
      }
      const value = data[key];
      return value === null || value === undefined ? "" : String(value);
    });

    if (unknown.length) {
      log(logInfo, "[templates] unknown placeholder", {
        name,
        placeholders: Array.from(new Set(unknown)),
      });
      if (cfg.strict) return fallback;
    }

    if (!rendered.trim()) {
      log(logInfo, "[templates] empty template result, using default", { name });
      return fallback;
    }

    return rendered;
  } catch (err) {
    log(logInfo, "[templates] render failed, using default", {
      name,
      error: err.message,
    });
    return fallback;
  }
}

module.exports = {
  renderMessageTemplate,
};
