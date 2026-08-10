import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface DbLevel {
  id: number;
  grid: number[][];
  player_start: { x: number; y: number };
  cave_pos: { x: number; y: number };
  theme?: string;
  time_limit_seconds?: number | null;
  hourglass_bonus_by_cell?: Record<string, number> | null;
  provenance?: string | null;
  updated_at: string;
}

/** Fetch all levels from Supabase, ordered by id. Returns null if Supabase is not configured. */
export async function fetchAllLevelsFromDb(): Promise<DbLevel[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('levels')
    .select('*')
    .order('id', { ascending: true });
  if (error) {
    console.warn('[supabase] fetchAllLevels error:', error.message);
    return null;
  }
  return data as DbLevel[];
}

/** Fetch a single level by id. Returns null if not found or Supabase is not configured. */
export async function fetchLevelFromDb(id: number): Promise<DbLevel | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('levels')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn(`[supabase] fetchLevel(${id}) error:`, error.message);
    return null;
  }
  return data as DbLevel | null;
}
