import { getAllLevels } from '@/data/levels';
import { buildLevelFromSources } from '@/lib/levelImageDetection';
import { saveLevelOverride } from '@/lib/levelOverrides';
import { seedDefaultReferences } from '@/lib/referenceSeeder';

export interface BulkBuildOptions {
  force?: boolean;
  timeoutMs?: number;
  onProgress?: (status: string) => void;
}

export interface BulkBuildResult {
  total: number;
  built: number;
  skipped: number;
  failed: number;
  errors: { id: number; message: string }[];
  levels: Array<{
    id: number;
    source: string;
    grid: number[][];
    playerStart: { x: number; y: number };
    cavePos: { x: number; y: number };
    theme?: string;
    stats: {
      totalCells: number;
      spriteMatches: number;
      heuristicMatches: number;
      nonVoidCount: number;
      voidRatio: number;
      spriteMatchRatio: number;
      confidenceScore: number;
      caveAutoPlaced: boolean;
      playerAdjusted: boolean;
      sourceWidth: number;
      sourceHeight: number;
    };
  }>;
}

export const runBulkBuild = async (options: BulkBuildOptions = {}): Promise<BulkBuildResult> => {
  if (typeof window === 'undefined') {
    throw new Error('Bulk build can only run in a browser context');
  }

  const levels = getAllLevels();
  const result: BulkBuildResult = {
    total: levels.length,
    built: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    levels: []
  };

  await seedDefaultReferences();

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const primarySource = level.image ?? level.sources?.[0];
    const sources = primarySource ? [primarySource] : [];

    if (sources.length === 0) {
      result.skipped += 1;
      continue;
    }

    if (!options.force) {
      const existingOverride = localStorage.getItem(`level_override_${level.id}`);
      if (existingOverride) {
        result.skipped += 1;
        continue;
      }
    }

    options.onProgress?.(`Level ${level.id} (${index + 1}/${levels.length})`);

    try {
      const built = await buildLevelFromSources(sources, {
        minSimilarity: 0.72,
        timeoutMs: options.timeoutMs ?? 8000,
        onProgress: (status) => options.onProgress?.(`Level ${level.id}: ${status}`)
      });
      saveLevelOverride(level.id, built.grid, built.playerStart, level.theme);
      result.levels.push({
        id: level.id,
        source: built.source,
        grid: built.grid,
        playerStart: built.playerStart,
        cavePos: built.cavePos,
        theme: level.theme,
        stats: built.stats
      });
      result.built += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        id: level.id,
        message: (error as Error).message
      });
    }

    await new Promise(requestAnimationFrame);
  }

  return result;
};

const downloadJson = (data: unknown, filename: string) => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const runBulkBuildAndDownload = async (options: BulkBuildOptions = {}) => {
  const result = await runBulkBuild(options);

  const edgeCases = result.levels
    .filter((level) =>
      level.stats.spriteMatchRatio < 0.05 ||
      level.stats.voidRatio > 0.8 ||
      level.stats.confidenceScore < 0.25 ||
      level.stats.caveAutoPlaced ||
      level.stats.playerAdjusted
    )
    .map((level) => ({
      id: level.id,
      source: level.source,
      confidenceScore: level.stats.confidenceScore,
      spriteMatchRatio: level.stats.spriteMatchRatio,
      voidRatio: level.stats.voidRatio,
      caveAutoPlaced: level.stats.caveAutoPlaced,
      playerAdjusted: level.stats.playerAdjusted
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: result.total,
      built: result.built,
      skipped: result.skipped,
      failed: result.failed
    },
    errors: result.errors,
    edgeCases,
    levels: result.levels
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadJson(report, `level-build-report-${timestamp}.json`);

  return report;
};

export const runBulkBuildReport = async (options: BulkBuildOptions = {}) => {
  const result = await runBulkBuild(options);

  const edgeCases = result.levels
    .filter((level) =>
      level.stats.spriteMatchRatio < 0.05 ||
      level.stats.voidRatio > 0.8 ||
      level.stats.confidenceScore < 0.25 ||
      level.stats.caveAutoPlaced ||
      level.stats.playerAdjusted
    )
    .map((level) => ({
      id: level.id,
      source: level.source,
      confidenceScore: level.stats.confidenceScore,
      spriteMatchRatio: level.stats.spriteMatchRatio,
      voidRatio: level.stats.voidRatio,
      caveAutoPlaced: level.stats.caveAutoPlaced,
      playerAdjusted: level.stats.playerAdjusted
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: result.total,
      built: result.built,
      skipped: result.skipped,
      failed: result.failed
    },
    errors: result.errors,
    edgeCases,
    levels: result.levels
  };
};
