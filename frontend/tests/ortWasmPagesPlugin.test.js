import test from "node:test";
import assert from "node:assert/strict";

import { createOrtWasmPagesPlugin } from "../build/ortWasmPagesPlugin.js";

test("externalizes ONNX WASM import.meta URLs using the installed runtime version", () => {
  const plugin = createOrtWasmPagesPlugin("1.31.0-test");
  const source = 'const wasm = new URL("ort-wasm-simd-threaded.asyncify.wasm", import.meta.url).href;';
  const result = plugin.transform(source, "/node_modules/onnxruntime-web/dist/ort.mjs");

  assert.match(result.code, /https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.31\.0-test\/dist\/ort-wasm-simd-threaded\.asyncify\.wasm/);
  assert.doesNotMatch(result.code, /new URL\("ort-wasm-simd-threaded\.asyncify\.wasm", import\.meta\.url\)/);
});

test("leaves unrelated asset URLs untouched", () => {
  const plugin = createOrtWasmPagesPlugin("1.31.0-test");
  const source = 'const avatar = new URL("avatar.glb", import.meta.url).href;';
  assert.equal(plugin.transform(source, "/src/avatar.js"), null);
});
