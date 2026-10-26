import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createOrtWasmPagesPlugin } from "./build/ortWasmPagesPlugin.js";
import { defineConfig } from "vite";

const ortManifest = JSON.parse(
  readFileSync(new URL("./node_modules/onnxruntime-web/package.json", import.meta.url), "utf8"),
);

export default defineConfig({
  plugins: [react(), createOrtWasmPagesPlugin(ortManifest.version)],
  worker: {
    plugins: () => [createOrtWasmPagesPlugin(ortManifest.version)],
  },
});

