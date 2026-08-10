import type { ColorTheme, Level } from '@/data/levels';

// Custom levels are stored client-side (localStorage) so they can be created from the mapper
// even when there is no corresponding `NN.png` committed in `src/assets/`.
//
// This intentionally stores only the *level definition* (grid/playerStart/theme/etc).
// The uploaded screenshot image is stored separately by the mapper (IndexedDB).

export type CustomLevelDefinition = Pick<
  Level,
  'id' | 'grid' | 'playerStart' | 'cavePos' | 'theme' | 'timeLimitSeconds' | 'provenance'
> & {
  createdAt?: number;
  updatedAt?: number;
};

const IDS_KEY = 'custom_level_ids_v1';
const defKey = (id: number) => `custom_level_def_${id}`;

const safeParseJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const loadCustomLevelIds = (): number[] => {
  if (typeof window === 'undefined') return [];
  const parsed = safeParseJson<number[]>(localStorage.getItem(IDS_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
};

const saveCustomLevelIds = (ids: number[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(IDS_KEY, JSON.stringify(Array.from(new Set(ids)).sort((a, b) => a - b)));
};

export const loadCustomLevelDefinition = (id: number): CustomLevelDefinition | null => {
  if (typeof window === 'undefined') return null;
  const parsed = safeParseJson<CustomLevelDefinition>(localStorage.getItem(defKey(id)));
  if (!parsed || typeof parsed !== 'object') return null;
  if (Number(parsed.id) !== id) return null;
  if (!Array.isArray(parsed.grid) || parsed.grid.length === 0) return null;
  return parsed;
};

export const saveCustomLevelDefinition = (def: CustomLevelDefinition) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const prev = loadCustomLevelDefinition(def.id);
  const payload: CustomLevelDefinition = {
    ...def,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  localStorage.setItem(defKey(def.id), JSON.stringify(payload));
  const ids = loadCustomLevelIds();
  if (!ids.includes(def.id)) saveCustomLevelIds([...ids, def.id]);
};

export const removeCustomLevelDefinition = (id: number) => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(defKey(id));
  const ids = loadCustomLevelIds().filter((n) => n !== id);
  saveCustomLevelIds(ids);
};

export const guessThemeForLevelId = (levelId: number): ColorTheme => {
  const themeCycle: ColorTheme[] = ['default', 'ocean', 'forest', 'sunset', 'lava', 'crystal', 'neon'];
  return themeCycle[(Math.max(1, levelId) - 1) % themeCycle.length];
};
