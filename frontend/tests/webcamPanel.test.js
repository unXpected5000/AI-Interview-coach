import test from "node:test";
import assert from "node:assert/strict";
import { clampPanelPosition, clampPanelSize, getDefaultPanelLayout } from "../src/utils/webcamPanel.js";

test("webcam drag stays inside stage and above the question overlay", () => {
  assert.deepEqual(clampPanelPosition({ x: 900, y: 900 }, { width: 220, height: 150 }, { width: 800, height: 460 }), { x: 572, y: 182 });
  assert.deepEqual(clampPanelPosition({ x: -40, y: -20 }, { width: 220, height: 150 }, { width: 800, height: 460 }), { x: 8, y: 48 });
});

test("webcam resize obeys minimums and stage boundaries", () => {
  assert.deepEqual(clampPanelSize({ width: 800, height: 800 }, { x: 400, y: 48 }, { width: 800, height: 460 }), { width: 392, height: 284 });
  assert.deepEqual(clampPanelSize({ width: 20, height: 20 }, { x: 20, y: 48 }, { width: 800, height: 460 }), { width: 170, height: 120 });
});

test("webcam default layout avoids the question overlay on compact stages", () => {
  const compactStage = { width: 390, height: 520 };
  const compact = getDefaultPanelLayout(compactStage);
  assert.deepEqual(compact.size, { width: 170, height: 120 });
  assert.equal(compact.position.x + compact.size.width <= compactStage.width - 8, true);
  assert.equal(compact.position.y + compact.size.height <= compactStage.height - 128, true);

  const desktop = getDefaultPanelLayout({ width: 900, height: 560 });
  assert.deepEqual(desktop.size, { width: 220, height: 150 });
  assert.deepEqual(desktop.position, { x: 664, y: 64 });
});
