import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedDefaultReferences } from "@/lib/referenceSeeder";
import { runBulkBuildAndDownload, runBulkBuildReport } from "@/lib/levelBulkBuilder";
import { dumpLevel, runSolveAllLevels, runSolveLevel, solveGrid } from "@/lib/levelSolver";
import { runLevelQaReport } from "@/lib/levelQa";

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

devLog('🚀 main.tsx starting...');

type LocalStorageSeed = {
  version: 1;
  generatedAt: string;
  localStorage: Record<string, string>;
};

const buildLocalStorageSeed = (): LocalStorageSeed => {
  const prefixes = [
    // Grid overrides saved by the mapper
    'level_override_',
    // Custom levels
    'custom_level_def_',
    'custom_level_ids_v1',
    // Per-level rows/cols overrides
    'level_layout_override_',
    // Mapper overlay scale tweaks
    'level_mapper_image_scale_',
  ];

  const out = {} as Record<string, string>;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === 'custom_level_ids_v1') {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = v;
        continue;
      }
      if (!prefixes.some((p) => k.startsWith(p))) continue;
      const v = localStorage.getItem(k);
      if (v == null) continue;
      out[k] = v;
    }
  } catch {
    // ignore; seed will just be empty if storage access fails
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    localStorage: out,
  };
};

const applyLocalStorageSeed = (seed: unknown) => {
  const seedRecord = seed && typeof seed === 'object' ? seed as Partial<LocalStorageSeed> : null;
  const entries = seedRecord?.localStorage && typeof seedRecord.localStorage === 'object' ? seedRecord.localStorage : null;
  if (!entries) return { applied: 0 };
  let applied = 0;
  for (const [k, v] of Object.entries(entries)) {
    try {
      localStorage.setItem(String(k), String(v));
      applied += 1;
    } catch {
      // ignore
    }
  }
  return { applied };
};

const maybeReloadOnceForNewBuild = () => {
  if (typeof window === 'undefined') return;
  // Only do this in production builds where VITE_BUILD_ID is set by CI.
  if (!import.meta.env.PROD) return;
  const buildId = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '';
  if (!buildId) return;

  const lastKey = 'stone-age-last-build-id';
  const onceKey = `stone-age-reloaded-${buildId}`;
  const last = localStorage.getItem(lastKey) ?? '';
  if (last !== buildId) {
    localStorage.setItem(lastKey, buildId);
    // Prevent loops: reload at most once per build per tab/session.
    if (!sessionStorage.getItem(onceKey)) {
      sessionStorage.setItem(onceKey, '1');
      window.location.reload();
    }
  }
};

// GitHub Pages doesn't support custom response headers, so the index.html cache-control meta
// tags (see index.html) are only a best-effort hint — a tab left open across a new deploy can
// still be running a stale build indefinitely, since maybeReloadOnceForNewBuild above only ever
// compares against whatever build is ALREADY loaded. This actively re-checks what's actually
// live, bypassing any HTTP cache via `cache: 'no-store'`, and offers a refresh instead of forcing
// one — a forced reload mid-puzzle would be more disruptive than a stale tab.
const VERSION_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const UPDATE_BANNER_ID = 'stone-age-update-banner';

const showUpdateBanner = () => {
  if (document.getElementById(UPDATE_BANNER_ID)) return;
  const banner = document.createElement('div');
  banner.id = UPDATE_BANNER_ID;
  banner.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
    'z-index:2147483647', 'background:rgba(20,14,10,0.95)', 'color:#fef3c7',
    'border:1px solid rgba(252,211,77,0.4)', 'border-radius:9999px', 'padding:10px 16px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', 'font-size:13px',
    'display:flex', 'align-items:center', 'gap:10px', 'box-shadow:0 10px 30px rgba(0,0,0,0.4)',
  ].join(';');
  banner.innerHTML = `
    <span>A new version is available.</span>
    <button type="button" style="background:#fbbf24;color:#1c140e;border:none;border-radius:9999px;padding:4px 12px;font-weight:700;cursor:pointer;font-size:13px;">Refresh</button>
  `;
  banner.querySelector('button')?.addEventListener('click', () => window.location.reload());
  document.body.appendChild(banner);
};

const checkForNewVersion = async () => {
  if (!import.meta.env.PROD) return;
  const currentBuildId = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '';
  if (!currentBuildId) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const match = html.match(/<meta name="build-id" content="([^"]*)"/);
    const remoteBuildId = match?.[1] ?? '';
    if (remoteBuildId && remoteBuildId !== currentBuildId) {
      showUpdateBanner();
    }
  } catch {
    // Best-effort — a network hiccup shouldn't nag the player.
  }
};

const startVersionWatch = () => {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return;
  window.setInterval(() => void checkForNewVersion(), VERSION_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForNewVersion();
  });
  window.addEventListener('focus', () => void checkForNewVersion());
};

try {
  const rootElement = document.getElementById("root");
  devLog('📦 Root element:', rootElement);

  if (!rootElement) {
    throw new Error('Root element not found!');
  }

  maybeReloadOnceForNewBuild();
  startVersionWatch();

  devLog('🎯 Creating React root...');
  const root = createRoot(rootElement);

  seedDefaultReferences().catch((error) => {
    console.warn('Failed to seed default references:', error);
  });

  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    const debugWindow = window as Window & {
      runBulkBuildAndDownload: typeof runBulkBuildAndDownload;
      runBulkBuildReport: typeof runBulkBuildReport;
      runSolveAllLevels: typeof runSolveAllLevels;
      runSolveLevel: typeof runSolveLevel;
      solveGrid: typeof solveGrid;
      dumpLevel: typeof dumpLevel;
      runLevelQaReport: typeof runLevelQaReport;
      exportLocalStorageSeed: typeof buildLocalStorageSeed;
      importLocalStorageSeed: typeof applyLocalStorageSeed;
    };

    debugWindow.runBulkBuildAndDownload = runBulkBuildAndDownload;
    debugWindow.runBulkBuildReport = runBulkBuildReport;
    debugWindow.runSolveAllLevels = runSolveAllLevels;
    debugWindow.runSolveLevel = runSolveLevel;
    debugWindow.solveGrid = solveGrid;
    debugWindow.dumpLevel = dumpLevel;
    debugWindow.runLevelQaReport = runLevelQaReport;

    // Used to make Playwright reports match your current mapper edits/overrides.
    // Example:
    //   const seed = exportLocalStorageSeed(); copy(JSON.stringify(seed, null, 2));
    debugWindow.exportLocalStorageSeed = buildLocalStorageSeed;
    debugWindow.importLocalStorageSeed = applyLocalStorageSeed;

    const params = new URLSearchParams(window.location.search);
    if (params.has('bulkbuild') && sessionStorage.getItem('bulkbuild-ran') !== '1') {
      sessionStorage.setItem('bulkbuild-ran', '1');
      setTimeout(() => {
        runBulkBuildAndDownload({
          onProgress: (status) => console.log(`[bulkbuild] ${status}`)
        })
          .then((report) => {
            console.log('[bulkbuild] complete', report.summary, 'edge cases', report.edgeCases?.length ?? 0);
          })
          .catch((error) => {
            console.error('[bulkbuild] failed', error);
          });
      }, 500);
    }
  }

  devLog('⚛️ Rendering App...');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  devLog('✅ App rendered successfully!');
} catch (error) {
  console.error('❌ Fatal error in main.tsx:', error);
  const isDev = import.meta.env.DEV;
  const details = isDev
    ? `<p><strong>Error:</strong> ${(error as Error).message}</p><pre>${(error as Error).stack}</pre>`
    : `<p>Please refresh the page. If the problem persists, contact support.</p>`;
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: monospace; color: red;">
      <h1>🚨 Application Failed to Load</h1>
      ${details}
    </div>
  `;
}
