const MEDIA_READY_TIMEOUT_MS = 10000;
const REMOTE_MEDIA_READY_TIMEOUT_MS = 30000;
const DEVICE_CHECK_DELAY_MS = 3000;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mapPreviewIssue(value) {
  const text = normalizeText(value);
  const lowerText = text.toLowerCase();

  if (!lowerText) {
    return null;
  }

  if (
    /notallowederror|permission denied|permissions? .*denied|denied .*permissions?|blocked by the user/.test(
      lowerText
    )
  ) {
    return "摄像头权限被拒绝：请允许 VDO.Ninja 使用摄像头";
  }

  if (
    /notfounderror|devicesnotfounderror|requested device not found|no camera|no video source|video source not found/.test(
      lowerText
    )
  ) {
    return "未检测到摄像头：请确认系统有可用摄像头";
  }

  if (
    /notreadableerror|trackstarterror|could not start video source|camera .*busy|device .*busy|in use/.test(
      lowerText
    )
  ) {
    return "摄像头无法启动：可能正被其他软件占用";
  }

  if (/overconstrainederror|constraint/.test(lowerText)) {
    return "摄像头参数不兼容：请尝试更换摄像头或降低采集规格";
  }

  if (/add .*camera|share .*camera|start .*camera|select .*camera/.test(lowerText)) {
    return "VDO.Ninja 还停在摄像头启动页：请检查自启摄像头或摄像头授权";
  }

  if (/getusermedia|mediadevices|webcam|camera/.test(lowerText)) {
    return `VDO.Ninja 摄像头提示：${text.slice(0, 120)}`;
  }

  return null;
}

function hasPlayableVideo(snapshot = {}) {
  const videos = Array.isArray(snapshot.videos) ? snapshot.videos : [];
  return videos.some((video) => {
    const hasFrame = Number(video.width) > 0 && Number(video.height) > 0;
    const isReady = Number(video.readyState) >= 2;
    const hasLiveTrack = Array.isArray(video.tracks)
      ? video.tracks.some((track) => track.kind === "video" && track.readyState !== "ended")
      : false;

    return hasFrame && isReady && !video.ended && (hasLiveTrack || !video.srcObjectActive);
  });
}

function firstMappedIssue(snapshot = {}, consoleIssue) {
  return (
    consoleIssue ||
    mapPreviewIssue(snapshot.error) ||
    mapPreviewIssue(snapshot.deviceError) ||
    mapPreviewIssue(snapshot.bodyText)
  );
}

function describePreviewSnapshot(snapshot = {}, elapsedMs = 0, consoleIssue = null, options = {}) {
  const expectsLocalCamera = options.expectsLocalCamera !== false;

  if (hasPlayableVideo(snapshot)) {
    return {
      mediaStatus: "playing",
      level: "ok",
      message: "已检测到视频流"
    };
  }

  if (expectsLocalCamera && snapshot.cameraPermission === "denied") {
    return {
      mediaStatus: "warning",
      level: "warning",
      message: "摄像头权限被拒绝：请允许 VDO.Ninja 使用摄像头"
    };
  }

  const issue = expectsLocalCamera ? firstMappedIssue(snapshot, consoleIssue) : null;
  if (issue) {
    return {
      mediaStatus: "warning",
      level: "warning",
      message: issue
    };
  }

  const videoInputs = Number(snapshot.devices && snapshot.devices.videoInputs);
  if (
    expectsLocalCamera &&
    elapsedMs >= DEVICE_CHECK_DELAY_MS &&
    Number.isFinite(videoInputs) &&
    videoInputs === 0
  ) {
    return {
      mediaStatus: "warning",
      level: "warning",
      message: "未检测到摄像头：请确认系统有可用摄像头"
    };
  }

  const timeoutMs = expectsLocalCamera ? MEDIA_READY_TIMEOUT_MS : REMOTE_MEDIA_READY_TIMEOUT_MS;
  if (elapsedMs >= timeoutMs) {
    return {
      mediaStatus: "warning",
      level: "warning",
      message: expectsLocalCamera
        ? "页面已打开，但未检测到视频流：请检查摄像头权限或是否被占用"
        : "观看页面已打开，但未检测到远端视频流：请确认推流端已打开"
    };
  }

  return {
    mediaStatus: "loading",
    level: "info",
    message: expectsLocalCamera ? "预览页面已打开，正在等待视频..." : "观看页面已打开，正在等待远端视频..."
  };
}

module.exports = {
  describePreviewSnapshot,
  hasPlayableVideo,
  mapPreviewIssue
};
