const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CIRCLE_CSS,
  buildPreviewUrl,
  buildViewerFallbackUrl,
  expectsLocalCamera
} = require("../src/urlBuilder");
const { migrateConfig, normalizeConfig, readConfig } = require("../src/config");
const { describePreviewSnapshot, mapPreviewIssue } = require("../src/mediaStatus");
const { createCircleShape } = require("../src/windowShape");

test("builds a clean circular viewer URL from a stream id", () => {
  const url = new URL(buildPreviewUrl({ input: "guest-1", mode: "view" }));

  assert.equal(url.origin, "https://vdo.ninja");
  assert.equal(url.searchParams.get("view"), "guest-1");
  assert.equal(url.searchParams.get("cleanviewer"), "1");
  assert.equal(url.searchParams.get("transparent"), "1");
  assert.equal(url.searchParams.get("cover"), "1");
  assert.equal(url.searchParams.get("rounded"), "1000");
  assert.ok(url.searchParams.get("base64css"));
});

test("builds a publishing preview URL with autostart", () => {
  const url = new URL(buildPreviewUrl({ input: "camera-1", mode: "push" }));

  assert.equal(url.searchParams.get("push"), "camera-1");
  assert.equal(url.searchParams.get("cleanoutput"), "1");
  assert.equal(url.searchParams.get("fullscreen"), "1");
  assert.equal(url.searchParams.get("webcam"), "1");
  assert.equal(url.searchParams.get("autostart"), "1");
  assert.equal(url.searchParams.get("audiodevice"), "0");
});

test("keeps explicit sender media intent", () => {
  const url = new URL(
    buildPreviewUrl({
      input: "https://vdo.ninja/?push=camera-1&screenshare=1",
      mode: "push"
    })
  );

  assert.equal(url.searchParams.get("screenshare"), "1");
  assert.equal(url.searchParams.get("webcam"), null);
});

test("keeps explicit sender audio device", () => {
  const url = new URL(
    buildPreviewUrl({
      input: "https://vdo.ninja/?push=camera-1&audiodevice=studio",
      mode: "push"
    })
  );

  assert.equal(url.searchParams.get("audiodevice"), "studio");
});

test("converts a pasted push URL when viewing", () => {
  const url = new URL(
    buildPreviewUrl({
      input: "https://vdo.ninja/?push=camera-1&webcam=1&autostart=1&audiodevice=0",
      mode: "view"
    })
  );

  assert.equal(url.searchParams.get("push"), null);
  assert.equal(url.searchParams.get("webcam"), null);
  assert.equal(url.searchParams.get("autostart"), null);
  assert.equal(url.searchParams.get("audiodevice"), null);
  assert.equal(url.searchParams.get("view"), "camera-1");
  assert.equal(url.searchParams.get("cleanviewer"), "1");
});

test("builds a viewer fallback for push URLs", () => {
  const url = new URL(
    buildViewerFallbackUrl(
      "https://vdo.ninja/?push=dgxsparkcam&cleanoutput=1&fullscreen=1&webcam=1&autostart=1&audiodevice=0"
    )
  );

  assert.equal(url.searchParams.get("push"), null);
  assert.equal(url.searchParams.get("view"), "dgxsparkcam");
  assert.equal(url.searchParams.get("cleanoutput"), null);
  assert.equal(url.searchParams.get("cleanviewer"), "1");
  assert.equal(expectsLocalCamera(url.toString()), false);
});

test("preserves existing VDO.Ninja URL parameters", () => {
  const url = new URL(
    buildPreviewUrl({
      input: "https://vdo.ninja/?view=abc&room=myroom&rounded=222",
      mode: "view"
    })
  );

  assert.equal(url.searchParams.get("view"), "abc");
  assert.equal(url.searchParams.get("room"), "myroom");
  assert.equal(url.searchParams.get("rounded"), "222");
  assert.equal(url.searchParams.get("cleanviewer"), "1");
});

test("rejects non VDO.Ninja URLs", () => {
  assert.throws(
    () => buildPreviewUrl({ input: "https://example.com/?view=abc" }),
    /只支持 vdo\.ninja 链接/
  );
});

test("normalizes desktop preview settings", () => {
  assert.deepEqual(
    normalizeConfig({
      input: " abc ",
      mode: "push",
      size: 9999,
      alwaysOnTop: 1,
      clickThrough: "",
      autostart: false
    }),
    {
      input: "abc",
      mode: "push",
      size: 960,
      alwaysOnTop: true,
      clickThrough: false,
      autostart: false,
      version: 2
    }
  );
});

test("migrates the old empty viewer default to camera mode", () => {
  assert.equal(
    migrateConfig({
      input: "preview",
      mode: "view",
      size: 360,
      alwaysOnTop: true,
      clickThrough: false,
      autostart: true
    }).mode,
    "push"
  );
});

test("reads legacy saved settings as camera mode", () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "vdo-preview-"));
  fs.writeFileSync(
    path.join(userDataPath, "settings.json"),
    JSON.stringify({
      input: "preview",
      mode: "view",
      size: 360,
      alwaysOnTop: true,
      clickThrough: false,
      autostart: true
    })
  );

  const config = readConfig({
    getPath: () => userDataPath
  });

  assert.equal(config.mode, "push");
});

test("keeps a visible circular fallback for empty streams", () => {
  assert.match(CIRCLE_CSS, /body::before/);
  assert.match(CIRCLE_CSS, /body::after/);
  assert.match(CIRCLE_CSS, /border-radius: 50%/);
});

test("creates a circle-like native window shape", () => {
  const rects = createCircleShape(10, 2);

  assert.equal(rects[0].y, 0);
  assert.ok(rects[0].x > 0);
  assert.ok(rects.some((rect) => rect.x === 0));
  assert.equal(rects.at(-1).y, 8);
});

test("detects a playable preview video snapshot", () => {
  assert.deepEqual(
    describePreviewSnapshot({
      videos: [
        {
          width: 1280,
          height: 720,
          readyState: 4,
          ended: false,
          srcObjectActive: true,
          tracks: [{ kind: "video", readyState: "live" }]
        }
      ]
    }),
    {
      mediaStatus: "playing",
      level: "ok",
      message: "已检测到视频流"
    }
  );
});

test("maps media permission and device failures to user-facing status", () => {
  assert.equal(
    mapPreviewIssue("NotAllowedError: Permission denied"),
    "摄像头权限被拒绝：请允许 VDO.Ninja 使用摄像头"
  );

  assert.deepEqual(describePreviewSnapshot({ cameraPermission: "denied" }), {
    mediaStatus: "warning",
    level: "warning",
    message: "摄像头权限被拒绝：请允许 VDO.Ninja 使用摄像头"
  });

  assert.deepEqual(describePreviewSnapshot({ devices: { videoInputs: 0 } }, 4000), {
    mediaStatus: "warning",
    level: "warning",
    message: "未检测到摄像头：请确认系统有可用摄像头"
  });
});

test("viewer mode ignores missing local camera devices", () => {
  assert.deepEqual(
    describePreviewSnapshot({ devices: { videoInputs: 0 } }, 4000, null, {
      expectsLocalCamera: false
    }),
    {
      mediaStatus: "loading",
      level: "info",
      message: "观看页面已打开，正在等待远端视频..."
    }
  );

  assert.deepEqual(
    describePreviewSnapshot({ devices: { videoInputs: 0 } }, 12000, null, {
      expectsLocalCamera: false
    }),
    {
      mediaStatus: "warning",
      level: "warning",
      message: "观看页面已打开，但未检测到远端视频流：请确认推流端已打开"
    }
  );
});
