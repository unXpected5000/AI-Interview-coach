import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DIST_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const MAX_PAGES_FILE_BYTES = 25 * 1024 * 1024;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  }));
  return nested.flat();
}

export async function validatePagesDist(distDir = DIST_DIR) {
  const files = await listFiles(distDir);
  if (!files.length) throw new Error("Cloudflare Pages build output is empty.");

  const fileSet = new Set(files.map((filePath) => path.resolve(filePath)));
  const oversized = [];
  let maxSize = 0;
  let workerPath;

  for (const filePath of files) {
    const fileStat = await stat(filePath);
    maxSize = Math.max(maxSize, fileStat.size);
    if (fileStat.size >= MAX_PAGES_FILE_BYTES) oversized.push({ filePath, size: fileStat.size });
    if (path.basename(filePath).startsWith("localSpeech.worker-") && filePath.endsWith(".js")) {
      workerPath = filePath;
    }

    if (!/\.(?:html|js|css)$/i.test(filePath)) continue;
    const source = await readFile(filePath, "utf8");
    if (/\/assets\/ort-wasm-simd-threaded[^"'`\s)]*\.wasm/i.test(source)) {
      throw new Error(`Generated output still references a local ONNX Runtime WASM file: ${filePath}`);
    }

    for (const match of source.matchAll(/\/assets\/([A-Za-z0-9._-]+)/g)) {
      const referencedPath = path.resolve(distDir, "assets", match[1]);
      if (!fileSet.has(referencedPath)) {
        throw new Error(`Generated output references a missing asset: ${match[0]} in ${filePath}`);
      }
    }
  }

  if (oversized.length) {
    const details = oversized.map(({ filePath, size }) => `${filePath} (${size} bytes)`).join("\n");
    throw new Error(`Cloudflare Pages files must be smaller than 25 MiB:\n${details}`);
  }
  if (!workerPath) throw new Error("The local speech worker is missing from the Pages build output.");

  const workerSource = await readFile(workerPath, "utf8");
  if (!/https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@[^"'`]+\/dist\/ort-wasm-simd-threaded\.asyncify\.wasm/.test(workerSource)) {
    throw new Error("The local speech worker is missing the versioned ONNX Runtime WASM URL.");
  }

  console.log(`Cloudflare Pages assets verified: ${files.length} files, maximum ${maxSize} bytes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validatePagesDist().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
