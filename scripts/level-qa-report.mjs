import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const argMap = new Map();
argv.forEach((arg) => {
  const [key, value] = arg.split('=');
  argMap.set(key, value ?? true);
});

const useUrl = argMap.get('--url');
const reportDir = argMap.get('--out') ?? 'reports';
const solveMaxMsPerLevel = Number(argMap.get('--solveMaxMsPerLevel') ?? 1500);
const solveMaxNodesPerLevel = Number(argMap.get('--solveMaxNodesPerLevel') ?? 10000);
const solveMaxDepth = Number(argMap.get('--solveMaxDepth') ?? 120);
const detectTimeoutMs = Number(argMap.get('--detectTimeoutMs') ?? 5000);
const matchThreshold = Number(argMap.get('--matchThreshold') ?? 0.75);
const deepImageMatch = argMap.get('--deepImageMatch') === '1' || argMap.get('--deepImageMatch') === true;

const root = process.cwd();
let viteServer = null;
let baseUrl = useUrl;

if (!baseUrl) {
  viteServer = await createServer({
    root,
    server: { port: 5173, strictPort: false, hmr: false },
  });
  await viteServer.listen();
  baseUrl = viteServer.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  const text = msg.text();
  if (text.startsWith('[qa]')) console.log(text);
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => typeof window.runLevelQaReport === 'function', null, { timeout: 120000 });

  const report = await page.evaluate(
    async ({ solveMaxMsPerLevel, solveMaxNodesPerLevel, solveMaxDepth, detectTimeoutMs, matchThreshold, deepImageMatch }) => {
      return await window.runLevelQaReport({
        solveMaxMsPerLevel,
        solveMaxNodesPerLevel,
        solveMaxDepth,
        detectTimeoutMs,
        matchThreshold,
        deepImageMatch,
        onProgress: (status) => console.log(`[qa] ${status}`),
      });
    },
    { solveMaxMsPerLevel, solveMaxNodesPerLevel, solveMaxDepth, detectTimeoutMs, matchThreshold, deepImageMatch },
  );

  const timestamp = new Date().toISOString().split('.')[0].replace(/[T:]/g, '-');
  const filename = `level-qa-report-${timestamp}.json`;
  const outputPath = path.join(root, reportDir);
  await mkdir(outputPath, { recursive: true });
  await writeFile(path.join(outputPath, filename), JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report saved to ${path.join(reportDir, filename)}`);
} finally {
  await browser.close();
  if (viteServer) await viteServer.close();
}
