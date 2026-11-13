import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Serve and emit MediaPipe's WASM runtime from the installed
 * @mediapipe/tasks-vision package instead of a CDN. This keeps the JS API and
 * WASM binary on the same version and removes a third-party script origin.
 * Each file is ~11 MiB, under Cloudflare Pages' 25 MiB per-file limit.
 */
export const MEDIAPIPE_WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

export function createMediaPipeWasmPlugin(sourceDir, publicPath = "mediapipe/wasm") {
  if (!sourceDir) throw new TypeError("The @mediapipe/tasks-vision wasm directory is required.");
  const contentType = (name) => (name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
  return {
    name: "self-host-mediapipe-wasm",
    configureServer(server) {
      server.middlewares.use(`/${publicPath}/`, (request, response, next) => {
        const name = path.basename(String(request.url ?? "").split("?")[0]);
        if (!MEDIAPIPE_WASM_FILES.includes(name)) return next();
        response.setHeader("Content-Type", contentType(name));
        createReadStream(path.join(sourceDir, name)).on("error", next).pipe(response);
        return undefined;
      });
    },
    generateBundle() {
      for (const name of MEDIAPIPE_WASM_FILES) {
        this.emitFile({ type: "asset", fileName: `${publicPath}/${name}`, source: readFileSync(path.join(sourceDir, name)) });
      }
    },
  };
}
