export function clampPanelPosition(position, panelSize, stageSize, reservedBottom = 128) {
  return {
    x: Math.max(8, Math.min(position.x, Math.max(8, stageSize.width - panelSize.width - 8))),
    y: Math.max(48, Math.min(position.y, Math.max(48, stageSize.height - reservedBottom - panelSize.height))),
  };
}

export function clampPanelSize(size, position, stageSize, reservedBottom = 128, min = { width: 170, height: 120 }) {
  return {
    width: Math.max(min.width, Math.min(size.width, Math.max(min.width, stageSize.width - position.x - 8))),
    height: Math.max(min.height, Math.min(size.height, Math.max(min.height, stageSize.height - position.y - reservedBottom))),
  };
}

export function getDefaultPanelLayout(stageSize) {
  const compact = stageSize.width < 520;
  const size = compact ? { width: 170, height: 120 } : { width: 220, height: 150 };
  return {
    size,
    position: {
      x: Math.max(8, stageSize.width - size.width - 16),
      y: compact ? Math.max(48, stageSize.height - 128 - size.height) : 64,
    },
  };
}
