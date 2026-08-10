/**
 * Re-solves every "UNSOLVED" entry in level_solutions.txt with a much larger search budget than
 * the original report used (up to 20s/300k nodes). Earlier investigation confirmed at least one
 * such level (12) is genuinely solvable — the UNSOLVED mark was a search-budget artifact, not
 * evidence of unsolvability. Updates the file in place, incrementally, after each level, so
 * partial progress survives if the run is interrupted.
 *
 * Usage: node scripts/resolve-unsolved-levels.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOLUTIONS_PATH = path.join(ROOT, 'level_solutions.txt');

const PER_LEVEL_MS = 45000;
const PER_LEVEL_NODES = 900000;
const PER_LEVEL_DEPTH = 400;

// The file uses CRLF line endings; split on \r?\n so trailing \r doesn't break the "Level N"
// header regex, and rejoin with \r\n to avoid silently converting the file to LF.
const EOL = '\r\n';

async function main() {
  const raw = readFileSync(SOLUTIONS_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);

  // Find "Level N" header lines followed by "UNSOLVED" on the next line.
  const targets = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Level (\d+)$/);
    if (m && lines[i + 1]?.trim() === 'UNSOLVED') {
      targets.push({ id: Number(m[1]), lineIndex: i + 1 });
    }
  }
  console.log(`Found ${targets.length} UNSOLVED levels to retry:`, targets.map((t) => t.id).join(', '));

  const server = await createServer({ root: ROOT, server: { port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://localhost:${address.port}/`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.runSolveLevel === 'function', { timeout: 20000 });

  let solvedCount = 0;
  let stillUnsolvedCount = 0;

  for (const target of targets) {
    const startedAt = Date.now();
    console.log(`\n[${new Date().toLocaleTimeString()}] Solving level ${target.id}...`);
    let result;
    try {
      result = await page.evaluate(
        ({ id, maxMsPerLevel, maxNodesPerLevel, maxDepth }) =>
          window.runSolveLevel(id, { maxMsPerLevel, maxNodesPerLevel, maxDepth }),
        { id: target.id, maxMsPerLevel: PER_LEVEL_MS, maxNodesPerLevel: PER_LEVEL_NODES, maxDepth: PER_LEVEL_DEPTH },
      );
    } catch (err) {
      console.error(`  Level ${target.id} errored:`, err?.message ?? err);
      stillUnsolvedCount++;
      continue;
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    // Re-read the file fresh each time in case something else touched it, then reapply the line replace by id.
    const currentRaw = readFileSync(SOLUTIONS_PATH, 'utf8');
    const currentLines = currentRaw.split(/\r?\n/);
    const headerIdx = currentLines.findIndex((l) => l.trim() === `Level ${target.id}`);
    if (headerIdx === -1) {
      console.warn(`  Level ${target.id} header no longer found in file, skipping write.`);
      continue;
    }
    const bodyIdx = headerIdx + 1;

    if (result.solved) {
      currentLines[bodyIdx] = result.actions.join(' ');
      solvedCount++;
      console.log(`  SOLVED in ${elapsed}s: ${result.moves} moves, ${result.nodesExpanded} nodes expanded.`);
    } else {
      stillUnsolvedCount++;
      console.log(`  Still unsolved after ${elapsed}s (${result.nodesExpanded} nodes, reason: ${result.reason ?? 'budget exceeded'}).`);
    }
    writeFileSync(SOLUTIONS_PATH, currentLines.join(EOL), 'utf8');
  }

  console.log(`\nDone. Solved ${solvedCount} / ${targets.length}. Still unsolved: ${stillUnsolvedCount}.`);

  await browser.close();
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
