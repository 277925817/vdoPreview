const form = document.querySelector("#settings-form");
const input = document.querySelector("#input");
const sizeRange = document.querySelector("#size-range");
const sizeNumber = document.querySelector("#size-number");
const sizeOutput = document.querySelector("#size-output");
const alwaysOnTop = document.querySelector("#always-on-top");
const clickThrough = document.querySelector("#click-through");
const autostart = document.querySelector("#autostart");
const statusText = document.querySelector("#status");
const statusDot = document.querySelector(".status-dot");
const openButton = document.querySelector("#open-preview");
const reloadButton = document.querySelector("#reload-preview");
const closeButton = document.querySelector("#close-preview");

function getMode() {
  const selected = document.querySelector("input[name='mode']:checked");
  return selected ? selected.value : "view";
}

function setMode(mode) {
  const nextMode = mode === "push" ? "push" : "view";
  document.querySelector(`input[name='mode'][value='${nextMode}']`).checked = true;
}

function updateSize(value) {
  const size = Math.min(960, Math.max(160, Number(value) || 360));
  sizeRange.value = String(size);
  sizeNumber.value = String(size);
  sizeOutput.value = `${size} px`;
}

function collectConfig() {
  return {
    input: input.value,
    mode: getMode(),
    size: Number(sizeNumber.value),
    alwaysOnTop: alwaysOnTop.checked,
    clickThrough: clickThrough.checked,
    autostart: autostart.checked
  };
}

function applyConfig(config) {
  input.value = config.input || "";
  setMode(config.mode);
  updateSize(config.size);
  alwaysOnTop.checked = Boolean(config.alwaysOnTop);
  clickThrough.checked = Boolean(config.clickThrough);
  autostart.checked = config.autostart !== false;
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("is-error", isError);
}

function setOpenState(isOpen) {
  statusDot.classList.toggle("is-open", Boolean(isOpen));
}

function setBusy(isBusy) {
  openButton.disabled = Boolean(isBusy);
  openButton.textContent = isBusy ? "打开中..." : "打开预览";
}

async function saveCurrentConfig() {
  const config = await window.previewTool.saveConfig(collectConfig());
  applyConfig(config);
  return config;
}

sizeRange.addEventListener("input", () => updateSize(sizeRange.value));
sizeNumber.addEventListener("input", () => updateSize(sizeNumber.value));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setStatus("正在打开预览...");

  try {
    const result = await window.previewTool.openPreview(collectConfig());
    applyConfig(result.config);
    setOpenState(true);
    setStatus("预览已打开");
  } catch (error) {
    setStatus(error.message || "打开失败", true);
  } finally {
    setBusy(false);
  }
});

reloadButton.addEventListener("click", async () => {
  const result = await window.previewTool.reloadPreview();
  setOpenState(result.open);
  setStatus(result.open ? "预览已刷新" : "预览未打开");
});

closeButton.addEventListener("click", async () => {
  await window.previewTool.closePreview();
  setOpenState(false);
  setStatus("预览已关闭");
});

form.addEventListener("change", () => {
  saveCurrentConfig().catch((error) => setStatus(error.message || "保存失败", true));
});

window.previewTool.onPreviewState((state) => {
  setOpenState(state.open);
});

window.previewTool
  .getConfig()
  .then((config) => {
    applyConfig(config);
    setStatus("就绪");
  })
  .catch((error) => setStatus(error.message || "载入失败", true));
