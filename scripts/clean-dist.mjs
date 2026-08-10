import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDist() {
  const attempts = 5;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(distDir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 150,
      });

      console.log(`[clean:dist] Removed ${distDir}`);
      return;
    } catch (error) {
      const isLastAttempt = attempt === attempts;

      if (isLastAttempt) {
        throw new Error(
          `[clean:dist] Failed to remove ${distDir}. Close any explorer preview, sync, or antivirus lock on dist/assets and retry.\n${error instanceof Error ? error.message : String(error)}`,
        );
      }

      console.warn(
        `[clean:dist] Retry ${attempt}/${attempts - 1} after cleanup failure: ${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(250 * attempt);
    }
  }
}

await removeDist();
