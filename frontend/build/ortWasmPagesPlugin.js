/**
 * Cloudflare Pages caps each deployed file at 25 MiB. Transformers.js already
 * configures ONNX Runtime to load its WASM files from the matching version on
 * jsDelivr. Rewrite static import.meta.url fallbacks before Vite's asset plugin
 * sees them, keeping the runtime URL tied to the installed ONNX Runtime version.
 */
export function createOrtWasmPagesPlugin(version) {
  if (!version || typeof version !== "string") {
    throw new TypeError("An installed onnxruntime-web version is required.");
  }

  return {
    name: "externalize-onnxruntime-wasm-for-pages",
    apply: "build",
    enforce: "pre",
    transform(code) {
      const staticWasmUrl = /new URL\((["'])(ort-wasm-simd-threaded(?:\.[a-z0-9-]+)*\.wasm)\1,\s*import\.meta\.url\)(\.href)?/gi;
      let replacements = 0;
      const transformed = code.replace(staticWasmUrl, (_match, _quote, wasmName, href = "") => {
        replacements += 1;
        const remoteUrl = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/${wasmName}`;
        return href ? JSON.stringify(remoteUrl) : `new URL(${JSON.stringify(remoteUrl)})`;
      });
      return replacements ? { code: transformed, map: null } : null;
    },
  };
}
