const { app, BrowserWindow, Menu, ipcMain, session } = require("electron");
const path = require("node:path");

const {
  buildPreviewUrl,
  buildViewerFallbackUrl,
  expectsLocalCamera
} = require("./urlBuilder");
const { normalizeConfig, readConfig, writeConfig } = require("./config");
const { describePreviewSnapshot, mapPreviewIssue } = require("./mediaStatus");
const { applyCircleShape } = require("./windowShape");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let controlWindow = null;
let previewWindow = null;
let previewProbeTimer = null;
let previewProbeRunId = 0;
let lastPreviewIssue = null;
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
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const mediaPermissions = new Set(["media", "camera", "microphone", "display-capture"]);
    return mediaPermissions.has(permission) && isVdoNinjaUrl(requestingOrigin || webContents.getURL());
  });

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

  window.webContents.on("console-message", (details) => {
    const consoleMessage = details && typeof details === "object" ? details.message : "";
    const issue = mapPreviewIssue(consoleMessage);
    if (!issue) {
      return;
    }

    lastPreviewIssue = issue;
    sendPreviewState({
      mediaStatus: "warning",
      level: "warning",
      message: issue
    });
  });

  window.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedUrl) => {
    sendPreviewState({
      url: validatedUrl,
      mediaStatus: "warning",
      level: "warning",
      message: `VDO.Ninja 页面加载失败：${errorDescription || errorCode}`
    });
  });

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

function stopPreviewProbe() {
  previewProbeRunId += 1;

  if (previewProbeTimer) {
    clearInterval(previewProbeTimer);
    previewProbeTimer = null;
  }
}

function getPreviewMediaScript() {
  return `
    (async () => {
      const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const videos = Array.from(document.querySelectorAll("video")).map((video) => ({
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        readyState: video.readyState,
        paused: video.paused,
        ended: video.ended,
        currentTime: video.currentTime || 0,
        srcObjectActive: Boolean(video.srcObject && video.srcObject.active),
        tracks: video.srcObject && typeof video.srcObject.getTracks === "function"
          ? video.srcObject.getTracks().map((track) => ({
              kind: track.kind,
              enabled: track.enabled,
              muted: Boolean(track.muted),
              readyState: track.readyState
            }))
          : []
      }));

      const queryPermission = async (name) => {
        try {
          if (!navigator.permissions || !navigator.permissions.query) {
            return "unknown";
          }
          const permission = await navigator.permissions.query({ name });
          return permission.state || "unknown";
        } catch (error) {
          return "unknown";
        }
      };

      const readDevices = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return { videoInputs: null, audioInputs: null, error: "mediaDevices unavailable" };
          }
          const devices = await navigator.mediaDevices.enumerateDevices();
          return {
            videoInputs: devices.filter((device) => device.kind === "videoinput").length,
            audioInputs: devices.filter((device) => device.kind === "audioinput").length
          };
        } catch (error) {
          return {
            videoInputs: null,
            audioInputs: null,
            error: error && (error.name || error.message) ? error.name || error.message : String(error)
          };
        }
      };

      const devices = await readDevices();
      return {
        bodyText: normalize(document.body ? document.body.innerText : "").slice(0, 600),
        cameraPermission: await queryPermission("camera"),
        devices,
        deviceError: devices.error || "",
        title: document.title,
        url: location.href,
        videos
      };
    })()
  `;
}

async function inspectPreviewMedia(window) {
  if (!window || window.isDestroyed()) {
    return { error: "preview window closed" };
  }

  try {
    return await window.webContents.executeJavaScript(getPreviewMediaScript(), true);
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

function getLoadedPreviewMessage(url) {
  return expectsLocalCamera(url) ? "预览页面已打开，正在等待视频..." : "观看页面已打开，正在等待远端视频...";
}

function shouldFallbackToViewer(snapshot, state, url) {
  const videoInputs = Number(snapshot.devices && snapshot.devices.videoInputs);
  return (
    expectsLocalCamera(url) &&
    state.mediaStatus === "warning" &&
    state.message === "未检测到摄像头：请确认系统有可用摄像头" &&
    Number.isFinite(videoInputs) &&
    videoInputs === 0 &&
    Boolean(buildViewerFallbackUrl(url))
  );
}

function startPreviewProbe(window, url) {
  stopPreviewProbe();

  const runId = previewProbeRunId;
  const startedAt = Date.now();

  const tick = async () => {
    if (runId !== previewProbeRunId || !window || window.isDestroyed()) {
      return;
    }

    const snapshot = await inspectPreviewMedia(window);
    const state = describePreviewSnapshot(snapshot, Date.now() - startedAt, lastPreviewIssue, {
      expectsLocalCamera: expectsLocalCamera(url)
    });

    if (shouldFallbackToViewer(snapshot, state, url)) {
      const fallbackUrl = buildViewerFallbackUrl(url);
      await loadPreviewUrl(window, fallbackUrl, {
        loadedMessage: "本机未检测到摄像头，已改用观看模式，正在等待远端视频..."
      });
      return;
    }

    sendPreviewState({ url, ...state });

    if (state.mediaStatus === "playing") {
      stopPreviewProbe();
    }
  };

  tick();
  previewProbeTimer = setInterval(tick, 1000);
}

async function loadPreviewUrl(window, url, options = {}) {
  stopPreviewProbe();
  lastPreviewIssue = null;
  const loadingMessage = options.loadingMessage || "正在加载 VDO.Ninja...";
  const loadedMessage = options.loadedMessage || getLoadedPreviewMessage(url);

  sendPreviewState({
    url,
    mediaStatus: "loading",
    level: "info",
    message: loadingMessage
  });

  await window.loadURL(url);
  sendPreviewState({
    url,
    mediaStatus: "loading",
    level: "info",
    message: loadedMessage
  });
  startPreviewProbe(window, url);
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
    await loadPreviewUrl(previewWindow, url);
    previewWindow.show();
    return { config, url, message: getLoadedPreviewMessage(url) };
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
    stopPreviewProbe();
    previewWindow = null;
    sendPreviewState();
  });

  await loadPreviewUrl(previewWindow, url);
  return { config, url, message: getLoadedPreviewMessage(url) };
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
      stopPreviewProbe();
      sendPreviewState({
        url: previewWindow.webContents.getURL(),
        mediaStatus: "loading",
        level: "info",
        message: "正在刷新预览..."
      });
      previewWindow.webContents.once("did-finish-load", () => {
        if (previewWindow && !previewWindow.isDestroyed()) {
          startPreviewProbe(previewWindow, previewWindow.webContents.getURL());
        }
      });
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
  const status = await waitForControlStatus(window, [
    "预览页面已打开，正在等待视频...",
    "观看页面已打开，正在等待远端视频...",
    "本机未检测到摄像头，已改用观看模式，正在等待远端视频...",
    "已检测到视频流",
    "打开失败"
  ]);
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
