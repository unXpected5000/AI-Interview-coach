// Converts timeline points to SVG polyline segments, breaking at missing values.
export function seriesSegments(points, key, { width, height, maxT }) {
  const segments = [];
  let current = [];
  for (const point of points) {
    const value = point[key];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    const x = maxT > 0 ? (point.t / maxT) * width : 0;
    const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  if (current.length) segments.push(current);
  return segments;
}
