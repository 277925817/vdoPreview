const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CONFIG = {
  input: "preview",
  mode: "push",
  size: 360,
  alwaysOnTop: true,
  clickThrough: false,
  autostart: true,
  version: 2
};

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeConfig(config = {}) {
  return {
    input: String(config.input || DEFAULT_CONFIG.input).trim(),
    mode: config.mode === "push" ? "push" : "view",
    size: clampNumber(config.size, 160, 960, DEFAULT_CONFIG.size),
    alwaysOnTop: Boolean(config.alwaysOnTop),
    clickThrough: Boolean(config.clickThrough),
    autostart: config.autostart !== false,
    version: DEFAULT_CONFIG.version
  };
}

function migrateConfig(config = {}) {
  const isLegacyDefaultViewer =
    config.version === undefined &&
    String(config.input || "").trim() === "preview" &&
    config.mode !== "push";

  if (isLegacyDefaultViewer) {
    return {
      ...config,
      mode: DEFAULT_CONFIG.mode
    };
  }

  return config;
}

function getElectronApp() {
  return require("electron").app;
}

function getConfigPath(electronApp = getElectronApp()) {
  return path.join(electronApp.getPath("userData"), "settings.json");
}

function readConfig(electronApp) {
  try {
    const raw = fs.readFileSync(getConfigPath(electronApp), "utf8");
    const parsedConfig = migrateConfig(JSON.parse(raw));
    return normalizeConfig({
      ...DEFAULT_CONFIG,
      ...parsedConfig
    });
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config, electronApp) {
  const nextConfig = normalizeConfig(config);
  const configPath = getConfigPath(electronApp);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
  return nextConfig;
}

module.exports = {
  DEFAULT_CONFIG,
  migrateConfig,
  normalizeConfig,
  readConfig,
  writeConfig
};
