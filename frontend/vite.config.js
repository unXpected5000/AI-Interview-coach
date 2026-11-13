import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createOrtWasmPagesPlugin } from "./build/ortWasmPagesPlugin.js";
import { createMediaPipeWasmPlugin } from "./build/mediapipeWasmPlugin.js";
import { defineConfig } from "vite";

// onnxruntime-web is installed as a dependency of @huggingface/transformers.
const ortManifest = JSON.parse(
  readFileSync(new URL("./node_modules/onnxruntime-web/package.json", import.meta.url), "utf8"),
);
const mediapipeWasmDir = fileURLToPath(new URL("./node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url));

export default defineConfig({
  plugins: [react(), createOrtWasmPagesPlugin(ortManifest.version), createMediaPipeWasmPlugin(mediapipeWasmDir)],
  worker: {
    plugins: () => [createOrtWasmPagesPlugin(ortManifest.version)],
  },
});
