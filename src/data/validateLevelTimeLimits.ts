import { getAllLevels } from './levels';
import { DEFAULT_LEVEL_TIME_LIMITS as expected } from './defaultLevelTimes';

const levels = getAllLevels();
const byId = new Map(levels.map((l) => [l.id, l]));
const issues: string[] = [];

for (let id = 1; id <= 100; id += 1) {
  const level = byId.get(id);
  if (!level) {
    issues.push(`LEVEL${id}: missing`);
    continue;
  }

  const actual = level.timeLimitSeconds;
  const want = expected[id];

  if (actual !== want) {
    issues.push(`LEVEL${id}: expected ${want}, got ${actual ?? 'undefined'}`);
  }
}

if (issues.length > 0) {
  console.error(`Time limit validation failed (${issues.length}):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log('OK: LEVEL1..LEVEL100 all have expected timeLimitSeconds.');