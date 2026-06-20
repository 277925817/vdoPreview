const DEFAULT_VDO_ORIGIN = "https://vdo.ninja/";

const CIRCLE_CSS = `
html,
body,
#main {
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: transparent !important;
}

body {
  app-region: drag;
  -webkit-app-region: drag;
  user-select: none !important;
}

body::before,
body::after {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  border-radius: 50% !important;
  pointer-events: none !important;
}

body::before {
  background: rgba(17, 97, 73, 0.2) !important;
  z-index: 0 !important;
}

body::after {
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.7),
    0 12px 34px rgba(0, 0, 0, 0.22) !important;
  z-index: 2147483647 !important;
}

button,
input,
select,
textarea,
a {
  app-region: no-drag;
  -webkit-app-region: no-drag;
}

video,
canvas,
.videoContainer,
.video-container,
[data-streamid] {
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 50% !important;
  object-fit: cover !important;
  overflow: hidden !important;
  position: relative !important;
  z-index: 1 !important;
}
`;

function encodeVdoCss(css = CIRCLE_CSS) {
  return Buffer.from(encodeURIComponent(css), "utf8").toString("base64");
}

function cleanInputValue(value) {
  return String(value || "").trim();
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(value);
}

function assertVdoHost(url) {
  const host = url.hostname.toLowerCase();
  if (host === "vdo.ninja" || host.endsWith(".vdo.ninja")) {
    return;
  }

  throw new Error("只支持 vdo.ninja 链接");
}

function buildBaseUrl(input, mode) {
  const value = cleanInputValue(input);
  if (!value) {
    throw new Error("请先填写 VDO.Ninja 链接或 stream ID");
  }

  if (looksLikeUrl(value)) {
    const url = new URL(value);
    assertVdoHost(url);
    return url;
  }

  const url = new URL(DEFAULT_VDO_ORIGIN);
  url.searchParams.set(mode === "push" ? "push" : "view", value);
  return url;
}

function hasMediaPush(url) {
  return url.searchParams.has("push");
}

function hasSenderMediaIntent(url) {
  return (
    url.searchParams.has("webcam") ||
    url.searchParams.has("webcam2") ||
    url.searchParams.has("screenshare") ||
    url.searchParams.has("ss")
  );
}

function hasSenderAudioDevice(url) {
  return (
    url.searchParams.has("audiodevice") ||
    url.searchParams.has("adevice") ||
    url.searchParams.has("ad")
  );
}

function hasViewerScale(url) {
  return (
    url.searchParams.has("scale") ||
    url.searchParams.has("viewwidth") ||
    url.searchParams.has("viewheight")
  );
}

function hasViewerVideoBitrate(url) {
  return (
    url.searchParams.has("videobitrate") ||
    url.searchParams.has("bitrate") ||
    url.searchParams.has("vb")
  );
}

function hasViewerBuffer(url) {
  return url.searchParams.has("buffer") || url.searchParams.has("buffer2");
}

function deleteSenderOnlyParams(url) {
  [
    "push",
    "cleanoutput",
    "fullscreen",
    "webcam",
    "webcam2",
    "screenshare",
    "ss",
    "autostart",
    "audiodevice",
    "adevice",
    "ad"
  ].forEach((name) => url.searchParams.delete(name));
}

function addFlag(url, name) {
  if (!url.searchParams.has(name)) {
    url.searchParams.set(name, "1");
  }
}

function addDefaultViewerQualityParams(url) {
  if (!hasViewerScale(url)) {
    url.searchParams.set("scale", "100");
  }

  if (!hasViewerVideoBitrate(url)) {
    url.searchParams.set("videobitrate", "6000");
  }

  if (!hasViewerBuffer(url)) {
    url.searchParams.set("buffer", "200");
  }
}

function addDefaultPreviewParams(url, options = {}) {
  const isPush = hasMediaPush(url) || options.mode === "push";

  if (isPush) {
    addFlag(url, "cleanoutput");
    addFlag(url, "fullscreen");
    if (!hasSenderMediaIntent(url)) {
      addFlag(url, "webcam");
    }
    if (options.autostart) {
      addFlag(url, "autostart");
    }
    if (!hasSenderAudioDevice(url)) {
      url.searchParams.set("audiodevice", "0");
    }
  } else {
    addFlag(url, "cleanviewer");
    addDefaultViewerQualityParams(url);
  }

  addFlag(url, "transparent");
  addFlag(url, "cover");
  addFlag(url, "nocursor");

  if (!url.searchParams.has("rounded")) {
    url.searchParams.set("rounded", "1000");
  }

  if (!url.searchParams.has("margin")) {
    url.searchParams.set("margin", "0");
  }

  if (!url.searchParams.has("base64css") && !url.searchParams.has("b64css")) {
    url.searchParams.set("base64css", encodeVdoCss());
  }

  return url;
}

function buildPreviewUrl(options = {}) {
  const mode = options.mode === "push" ? "push" : "view";
  const url = buildBaseUrl(options.input, mode);

  if (mode === "view") {
    const viewerUrl = buildViewerFallbackUrl(url.toString());
    if (viewerUrl) {
      return viewerUrl;
    }
  }

  addDefaultPreviewParams(url, {
    autostart: options.autostart !== false,
    mode
  });
  return url.toString();
}

function buildViewerFallbackUrl(value) {
  const url = new URL(value);
  assertVdoHost(url);

  if (!url.searchParams.has("push") || url.searchParams.has("view")) {
    return null;
  }

  const streamId = url.searchParams.get("push");
  if (!streamId) {
    return null;
  }

  deleteSenderOnlyParams(url);
  url.searchParams.set("view", streamId);
  addDefaultPreviewParams(url, { mode: "view", autostart: false });
  return url.toString();
}

function expectsLocalCamera(value) {
  try {
    const url = new URL(value);
    return url.searchParams.has("push") && !url.searchParams.has("view");
  } catch (error) {
    return false;
  }
}

module.exports = {
  CIRCLE_CSS,
  DEFAULT_VDO_ORIGIN,
  buildPreviewUrl,
  buildViewerFallbackUrl,
  expectsLocalCamera,
  encodeVdoCss
};
