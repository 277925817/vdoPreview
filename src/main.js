const { app, BrowserWindow, Menu, ipcMain, session } = require("electron");
const path = require("node:path");

const { buildPreviewUrl } = require("./urlBuilder");
const { normalizeConfig, readConfig, writeConfig } = require("./config");
const { applyCircleShape } = require("./windowShape");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let controlWindow = null;
let previewWindow = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function isVdoNinjaUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "vdo.ninja" || host.endsWith(".vdo.ninja"));
  } catch (error) {
    return false;
  }
}

function sendPreviewState(extra = {}) {
  if (!controlWindow || controlWindow.isDestroyed()) {
    return;
  }

  controlWindow.webContents.send("preview:state", {
    open: Boolean(previewWindow && !previewWindow.isDestroyed()),
    ...extra
  });
}

function configureVdoSession() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const mediaPermissions = new Set(["media", "camera", "microphone", "display-capture"]);
    callback(mediaPermissions.has(permission) && isVdoNinjaUrl(requestingUrl));
  });
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 440,
    height: 575,
    minWidth: 390,
    minHeight: 540,
    title: "VDO.Ninja 圆形预览",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controlWindow.loadFile(path.join(__dirname, "control.html"));
  controlWindow.on("closed", () => {
    controlWindow = null;
  });

  return controlWindow;
}

function configurePreviewWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  window.webContents.on("will-navigate", (event, nextUrl) => {
    if (!isVdoNinjaUrl(nextUrl)) {
      event.preventDefault();
    }
  });

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }

    const key = input.key.toLowerCase();
    if (key === "escape" || (input.control && key === "w")) {
      event.preventDefault();
      window.close();
    }

    if (input.control && key === "r") {
      event.preventDefault();
      window.reload();
    }
  });
}

function applyPreviewWindowOptions(window, config) {
  window.setSize(config.size, config.size);
  window.setAspectRatio(1);
  applyCircleShape(window, config.size);
  window.setAlwaysOnTop(config.alwaysOnTop, "floating");

  if (process.platform !== "win32") {
    window.setVisibleOnAllWorkspaces(config.alwaysOnTop);
  }

  window.setIgnoreMouseEvents(config.clickThrough, { forward: true });
}

async function openPreview(configInput) {
  const config = writeConfig(normalizeConfig(configInput), app);
  const url = buildPreviewUrl(config);

  if (previewWindow && !previewWindow.isDestroyed()) {
    applyPreviewWindowOptions(previewWindow, config);
    await previewWindow.loadURL(url);
    previewWindow.show();
    sendPreviewState({ url });
    return { config, url };
  }

  previewWindow = new BrowserWindow({
    width: config.size,
    height: config.size,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    title: "VDO.Ninja 圆形预览",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  applyPreviewWindowOptions(previewWindow, config);
  configurePreviewWindow(previewWindow);

  previewWindow.once("ready-to-show", () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.show();
    }
  });

  previewWindow.on("closed", () => {
    previewWindow = null;
    sendPreviewState();
  });

  await previewWindow.loadURL(url);
  sendPreviewState({ url });
  return { config, url };
}

function registerIpcHandlers() {
  ipcMain.handle("config:get", () => readConfig(app));
  ipcMain.handle("config:save", (event, config) => writeConfig(config, app));
  ipcMain.handle("preview:open", (event, config) => openPreview(config));
  ipcMain.handle("preview:close", () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }
    return { open: false };
  });
  ipcMain.handle("preview:reload", () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.reload();
      return { open: true };
    }
    return { open: false };
  });
}

function showExistingWindows() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    if (controlWindow.isMinimized()) {
      controlWindow.restore();
    }
    controlWindow.show();
    controlWindow.focus();
  }

  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.show();
  }
}

function waitForControlLoad(window) {
  if (!window.webContents.isLoadingMainFrame()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.webContents.once("did-finish-load", resolve);
  });
}

function waitForPreviewWindow(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (previewWindow && !previewWindow.isDestroyed()) {
        clearInterval(timer);
        resolve(previewWindow);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("preview window was not created"));
      }
    }, 100);
  });
}

function waitForControlStatus(window, statuses, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      try {
        const status = await window.webContents.executeJavaScript(`
          document.querySelector("#status").textContent
        `);

        if (statuses.includes(status)) {
          clearInterval(timer);
          resolve(status);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`timed out waiting for status: ${statuses.join(", ")}`));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 200);
  });
}

async function runSmokeClickOpen() {
  const window = createControlWindow();
  await waitForControlLoad(window);
  await window.webContents.executeJavaScript(`
    document.querySelector("#input").value = "preview";
    document.querySelector("#open-preview").click();
  `);
  await waitForPreviewWindow();
  const status = await waitForControlStatus(window, ["预览已打开", "打开失败"]);
  console.log(`smoke-click-open ok: ${status}`);
  setTimeout(() => app.quit(), 1200);
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  Menu.setApplicationMenu(null);
  configureVdoSession();
  registerIpcHandlers();

  if (process.argv.includes("--self-test")) {
    const config = normalizeConfig(readConfig(app));
    const url = buildPreviewUrl(config);
    console.log(`self-test ok: ${url}`);
    app.quit();
    return;
  }

  if (process.argv.includes("--smoke-open-preview")) {
    const config = normalizeConfig(readConfig(app));
    const result = await openPreview(config);
    console.log(`smoke-open-preview ok: ${result.url}`);
    setTimeout(() => app.quit(), 1200);
    return;
  }

  if (process.argv.includes("--smoke-click-open")) {
    await runSmokeClickOpen();
    return;
  }

  createControlWindow();
});

app.on("second-instance", () => {
  showExistingWindows();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createControlWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
