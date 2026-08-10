import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, cp, readdir, stat } from "node:fs/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const distDir = path.join(projectRoot, "dist");
const outDir = path.resolve(here, "..", "www");

async function main() {
  await mkdir(outDir, { recursive: true });
  try {
    await stat(distDir);
  } catch {
    throw new Error(`Missing ${distDir}. From repo root, run: npm run build`);
  }

  // Remove everything except the tracked .gitkeep.
  const entries = await readdir(outDir);
  await Promise.all(
    entries
      .filter((name) => name !== ".gitkeep")
      .map((name) => rm(path.join(outDir, name), { recursive: true, force: true }))
  );

  await cp(distDir, outDir, { recursive: true });
  console.log(`[sync-web] Copied ${distDir} -> ${outDir}`);
}

main().catch((err) => {
  console.error("[sync-web] Failed:", err);
  process.exitCode = 1;
});
