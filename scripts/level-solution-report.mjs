import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const argMap = new Map();
argv.forEach((arg) => {
  const [key, value] = arg.split('=');
  argMap.set(key, value ?? true);
});

const useUrl = argMap.get('--url');
const reportDir = argMap.get('--out') ?? 'reports';
const maxMsPerLevel = Number(argMap.get('--maxMsPerLevel') ?? 4000);
const maxNodesPerLevel = Number(argMap.get('--maxNodesPerLevel') ?? 40000);
const maxDepth = Number(argMap.get('--maxDepth') ?? 200);
const seedPath = argMap.get('--seed');
const seedDefaultPath = argMap.get('--seedDefault') ?? 'solver-seed.json';
const tz = (argMap.get('--tz') && typeof argMap.get('--tz') === 'string')
  ? String(argMap.get('--tz'))
  : (Intl.DateTimeFormat().resolvedOptions().timeZone || undefined);

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');
const formatLocalIso = (d) => {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const ms = pad3(d.getMilliseconds());
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const offH = pad2(Math.floor(abs / 60));
  const offM = pad2(abs % 60);
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}${sign}${offH}:${offM}`;
};

const formatLocalForFilename = (d) => {
  // Avoid ':' and '.' in filenames on Windows, keep TZ offset visible.
  // Example: 2026-03-09T12-34-56-123+02-00
  return formatLocalIso(d).replace(/[:.]/g, '-');
};

const root = process.cwd();
let viteServer = null;
let baseUrl = useUrl;
let seed = null;

if (seedPath && typeof seedPath === 'string') {
  const fullSeedPath = path.isAbsolute(seedPath) ? seedPath : path.join(root, seedPath);
  const raw = readFileSync(fullSeedPath, 'utf8');
  seed = JSON.parse(raw);
  const count = seed?.localStorage && typeof seed.localStorage === 'object' ? Object.keys(seed.localStorage).length : 0;
  console.log(`[seed] loaded ${count} localStorage entries from ${seedPath}`);
} else {
  // Convenience: if you export a seed once (from the app) into solver-seed.json, reports will automatically
  // reflect your latest manual mapper edits (level_override_*) without needing to pass --seed every time.
  try {
    const fullSeedPath = path.isAbsolute(seedDefaultPath) ? seedDefaultPath : path.join(root, seedDefaultPath);
    const raw = readFileSync(fullSeedPath, 'utf8');
    seed = JSON.parse(raw);
    const count = seed?.localStorage && typeof seed?.localStorage === 'object' ? Object.keys(seed.localStorage).length : 0;
    console.log(`[seed] auto-loaded ${count} localStorage entries from ${seedDefaultPath}`);
  } catch {
    // no seed file; proceed with empty storage (built-in levels only)
  }
}

if (!baseUrl) {
  viteServer = await createServer({
    root,
    // This script is non-interactive; HMR can cause mid-run navigations that kill page.evaluate().
    // Disable it so a local file save doesn't crash report generation.
    server: { port: 5173, strictPort: false, hmr: false }
  });
  await viteServer.listen();
  baseUrl = viteServer.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
}

const browser = await chromium.launch();
const context = await browser.newContext(tz ? { timezoneId: tz } : undefined);
const page = await context.newPage();
page.on('console', (msg) => {
  const type = msg.type();
  const text = msg.text();
  // Keep it compact; Playwright often emits noisy warnings.
  if (type === 'error' || type === 'warning' || text.startsWith('[solve]') || text.startsWith('[seed]')) {
    console.log(`[page:${type}] ${text}`);
  }
});
page.on('pageerror', (err) => {
  console.log(`[pageerror] ${err?.message ?? String(err)}`);
  if (err?.stack) console.log(err.stack);
});

try {
  if (seed) {
    // Apply seed before any app code runs so both UI + solver see the same overrides.
    await page.addInitScript((seedObj) => {
      const entries = seedObj?.localStorage && typeof seedObj.localStorage === 'object' ? seedObj.localStorage : {};
      for (const [k, v] of Object.entries(entries)) {
        try {
          localStorage.setItem(String(k), String(v));
        } catch {
          // ignore
        }
      }
    }, seed);
  }

  // Vite dev server may reload once after dependency optimization; be tolerant.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  const runReport = async () => {
    await page.waitForFunction(() => typeof window.runSolveAllLevels === 'function', null, { timeout: 120000 });
    return await page.evaluate(async ({ maxMsPerLevel, maxNodesPerLevel, maxDepth }) => {
      return await window.runSolveAllLevels({
        maxMsPerLevel,
        maxNodesPerLevel,
        maxDepth,
        onProgress: (status) => console.log(`[solve] ${status}`)
      });
    }, { maxMsPerLevel, maxNodesPerLevel, maxDepth });
  };

  let report = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      report = await runReport();
      break;
    } catch (err) {
      const msg = err?.message ?? String(err);
      const isContextDestroyed =
        msg.includes('Execution context was destroyed') ||
        msg.includes('most likely because of a navigation') ||
        msg.includes('Target closed');
      if (!isContextDestroyed || attempt >= 3) throw err;
      console.log(`[retry] page navigated/reloaded during solve (attempt ${attempt}). Retrying...`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle');
    }
  }
  if (!report) throw new Error('Failed to generate report (unknown)');

  const timestamp = formatLocalForFilename(new Date());
  const filenameTxt = `level-solutions-${timestamp}.txt`;
  const filenameJson = `level-solutions-${timestamp}.json`;
  const outputPath = path.join(root, reportDir);
  await mkdir(outputPath, { recursive: true });
  const header =
    `# Local Time: ${formatLocalIso(new Date())}\n` +
    `# Timezone: ${tz ?? '(system default)'}\n\n`;
  await writeFile(path.join(outputPath, filenameTxt), header + report.text, 'utf8');
  await writeFile(path.join(outputPath, filenameJson), JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report saved to ${path.join(reportDir, filenameTxt)}`);
} finally {
  await browser.close();
  if (viteServer) {
    await viteServer.close();
  }
}
