import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// ── Supabase integration ──────────────────────────────────────────────────────
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment (.env or shell).
// The service-role key bypasses RLS so the server can write freely.
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '') ?? null;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

/**
 * Upsert a single level row into Supabase.
 * Silently skips if env vars are not set (local dev without DB is still fine).
 */
async function upsertLevelToDb(entry) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, reason: 'no Supabase env vars — skipping DB write' };
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/levels`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ ...entry, updated_at: new Date().toISOString() }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, status: resp.status, error: txt };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const pad3 = (n) => String(n).padStart(3, '0');

const readJson = async (req) => {
  const bytes = await readBody(req);
  if (!bytes || bytes.length < 2) return null;
  const txt = bytes.toString('utf8');
  return JSON.parse(txt);
};

const isGrid = (grid) => Array.isArray(grid) && grid.length > 0 && Array.isArray(grid[0]);

const isInt = (n) => Number.isInteger(n);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      res.end();
      return;
    }

    const parsed = url.parse(req.url, true);
    if (req.method !== 'POST' || (parsed.pathname !== '/write-level-image' && parsed.pathname !== '/write-level-default')) {
      send(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    const id = Number(parsed.query.id);
    const overwrite = parsed.query.overwrite === '1' || parsed.query.overwrite === 'true';
    if (!Number.isInteger(id) || id <= 0) {
      send(res, 400, { ok: false, error: 'Invalid id' });
      return;
    }

    const repoRoot = process.cwd();

    if (parsed.pathname === '/write-level-image') {
      const bytes = await readBody(req);
      if (!bytes || bytes.length < 10) {
        send(res, 400, { ok: false, error: 'Empty body' });
        return;
      }

      const filename = `level_${pad3(id)}.png`;
      const assetsDir = path.resolve(repoRoot, 'src', 'assets');
      const outPath = path.resolve(assetsDir, filename);

      try {
        const stat = await fs.stat(outPath);
        if (stat.isFile() && !overwrite) {
          send(res, 409, { ok: false, error: `Refusing to overwrite existing ${filename}` });
          return;
        }
      } catch {
        // does not exist
      }

      await fs.mkdir(assetsDir, { recursive: true });
      await fs.writeFile(outPath, bytes);

      send(res, 200, { ok: true, path: outPath, bytes: bytes.length });
      return;
    }

    // write-level-default: dev-only helper that promotes a mapper-saved level to repo defaults
    // by updating src/data/promoted-levels.json. (Static deployments cannot write to the repo.)
    const body = await readJson(req);
    if (!body || typeof body !== 'object') {
      send(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    const grid = body.grid;
    const playerStart = body.playerStart;
    const cavePos = body.cavePos;
    if (!isGrid(grid)) {
      send(res, 400, { ok: false, error: 'Missing/invalid grid' });
      return;
    }
    if (!playerStart || typeof playerStart !== 'object' || !isInt(playerStart.x) || !isInt(playerStart.y)) {
      send(res, 400, { ok: false, error: 'Missing/invalid playerStart' });
      return;
    }
    if (!cavePos || typeof cavePos !== 'object' || !isInt(cavePos.x) || !isInt(cavePos.y)) {
      send(res, 400, { ok: false, error: 'Missing/invalid cavePos' });
      return;
    }

    const rows = grid.length;
    const cols = Array.isArray(grid[0]) ? grid[0].length : 0;
    if (rows <= 0 || cols <= 0) {
      send(res, 400, { ok: false, error: 'Invalid grid size' });
      return;
    }
    if (playerStart.x < 0 || playerStart.y < 0 || playerStart.y >= rows || playerStart.x >= cols) {
      send(res, 400, { ok: false, error: 'playerStart out of bounds' });
      return;
    }
    if (cavePos.x < 0 || cavePos.y < 0 || cavePos.y >= rows || cavePos.x >= cols) {
      send(res, 400, { ok: false, error: 'cavePos out of bounds' });
      return;
    }

    const outPath = path.resolve(repoRoot, 'src', 'data', 'promoted-levels.json');
    let existing = [];
    try {
      const txt = await fs.readFile(outPath, 'utf8');
      const parsedExisting = JSON.parse(txt);
      if (Array.isArray(parsedExisting)) existing = parsedExisting;
    } catch {
      // treat as empty
    }

    const force = parsed.query.force === '1' || parsed.query.force === 'true';
    const idx = existing.findIndex((e) => e && typeof e === 'object' && Number(e.id) === id);
    if (idx !== -1 && !overwrite) {
      send(res, 409, { ok: false, error: `Refusing to overwrite existing default for level ${id}` });
      return;
    }
    if (idx !== -1 && existing[idx].locked && !force) {
      send(res, 423, { ok: false, error: `Level ${id} is locked. Pass ?force=1 to override.` });
      return;
    }

    const prevLocked = idx !== -1 ? existing[idx].locked : undefined;
    const nextEntry = { id, ...body };
    if (prevLocked) nextEntry.locked = true;
    if (idx === -1) existing.push(nextEntry);
    else existing[idx] = nextEntry;

    existing.sort((a, b) => Number(a.id) - Number(b.id));
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    // Mirror to Supabase — runs concurrently, does not block the response.
    const dbEntry = {
      id,
      grid,
      player_start: playerStart,
      cave_pos: cavePos,
      theme: body.theme ?? null,
      time_limit_seconds: body.timeLimitSeconds ?? null,
      hourglass_bonus_by_cell: body.hourglassBonusByCell ?? null,
      provenance: body.provenance ?? null,
    };
    upsertLevelToDb(dbEntry).then((dbResult) => {
      if (!dbResult.ok) console.warn(`[supabase] level ${id}: ${dbResult.reason ?? dbResult.error}`);
      else console.log(`[supabase] level ${id} upserted`);
    });

    send(res, 200, { ok: true, path: outPath, levelId: id });
  } catch (err) {
    send(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

server.listen(PORT, () => {
   
  console.log(`asset-writer listening on http://localhost:${PORT}/write-level-image`);
   
  console.log(`asset-writer listening on http://localhost:${PORT}/write-level-default`);
});
