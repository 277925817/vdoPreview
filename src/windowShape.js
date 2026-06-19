function createCircleShape(size, step = 2) {
  const safeSize = Math.max(1, Math.round(Number(size) || 1));
  const safeStep = Math.max(1, Math.round(Number(step) || 1));
  const radius = safeSize / 2;
  const center = radius;
  const rects = [];

  for (let y = 0; y < safeSize; y += safeStep) {
    const bandHeight = Math.min(safeStep, safeSize - y);
    const sampleY = y + bandHeight / 2;
    const distanceY = sampleY - center;
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - distanceY * distanceY));
    const x = Math.max(0, Math.floor(center - halfWidth));
    const width = Math.min(safeSize - x, Math.ceil(halfWidth * 2));

    if (width > 0) {
      rects.push({ x, y, width, height: bandHeight });
    }
  }

  return rects;
}

function applyCircleShape(window, size) {
  if (typeof window.setShape !== "function") {
    return;
  }

  if (process.platform !== "linux" && process.platform !== "win32") {
    return;
  }

  window.setShape(createCircleShape(size));
}

module.exports = {
  applyCircleShape,
  createCircleShape
};
