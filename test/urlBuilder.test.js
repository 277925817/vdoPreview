const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { CIRCLE_CSS, buildPreviewUrl } = require("../src/urlBuilder");
const { migrateConfig, normalizeConfig, readConfig } = require("../src/config");
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
