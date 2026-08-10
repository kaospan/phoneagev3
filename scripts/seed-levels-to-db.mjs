/**
 * Seed all levels from promoted-levels.json into Supabase.
 * Run once after creating the table, and again whenever the JSON file
 * gains new entries that weren't written through the live asset-writer.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-levels-to-db.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const raw = readFileSync(resolve(__dir, '../src/data/promoted-levels.json'), 'utf8');
const levels = JSON.parse(raw);

if (!Array.isArray(levels) || levels.length === 0) {
  console.error('promoted-levels.json is empty or malformed');
  process.exit(1);
}

const rows = levels.map((l) => ({
  id: l.id,
  grid: l.grid,
  player_start: l.playerStart,
  cave_pos: l.cavePos,
  theme: l.theme ?? null,
  time_limit_seconds: l.timeLimitSeconds ?? null,
  hourglass_bonus_by_cell: l.hourglassBonusByCell ?? null,
  provenance: l.provenance ?? null,
  updated_at: new Date().toISOString(),
}));

console.log(`Seeding ${rows.length} levels …`);

const resp = await fetch(`${supabaseUrl}/rest/v1/levels`, {
  method: 'POST',
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});

if (!resp.ok) {
  const txt = await resp.text();
  console.error(`Supabase error ${resp.status}:`, txt);
  process.exit(1);
}

console.log(`✅ Seeded ${rows.length} levels to Supabase (ids: ${rows.map((r) => r.id).join(', ')})`);
