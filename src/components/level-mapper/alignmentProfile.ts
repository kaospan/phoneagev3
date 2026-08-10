export interface AlignmentProfile {
  samples: number;
  cellWidthPx: number;
  cellHeightPx: number;
  preferredCols?: number;
  preferredRows?: number;
  updatedAt: number;
}

const STORAGE_KEY = 'stone-age-mapper-alignment-profile-v1';

export const loadAlignmentProfile = (): AlignmentProfile | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AlignmentProfile;
    if (!parsed || typeof parsed.cellWidthPx !== 'number' || typeof parsed.cellHeightPx !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveAlignmentProfile = (profile: AlignmentProfile | null) => {
  try {
    if (!profile) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
};

export const updateAlignmentProfile = (sample: {
  cellWidthPx: number;
  cellHeightPx: number;
  cols?: number;
  rows?: number;
}) => {
  const prev = loadAlignmentProfile();
  const nextSamples = (prev?.samples ?? 0) + 1;
  const prevW = prev?.cellWidthPx ?? sample.cellWidthPx;
  const prevH = prev?.cellHeightPx ?? sample.cellHeightPx;
  const prevN = prev?.samples ?? 0;

  const next: AlignmentProfile = {
    samples: nextSamples,
    cellWidthPx: (prevW * prevN + sample.cellWidthPx) / nextSamples,
    cellHeightPx: (prevH * prevN + sample.cellHeightPx) / nextSamples,
    preferredCols: sample.cols ?? prev?.preferredCols,
    preferredRows: sample.rows ?? prev?.preferredRows,
    updatedAt: Date.now(),
  };

  saveAlignmentProfile(next);
  return next;
};

export const getAlignmentHints = (): {
  hintCellWidth?: number;
  hintCellHeight?: number;
  preferredCols?: number;
  preferredRows?: number;
} => {
  const profile = loadAlignmentProfile();
  if (!profile) return {};
  return {
    hintCellWidth: profile.cellWidthPx,
    hintCellHeight: profile.cellHeightPx,
    preferredCols: profile.preferredCols,
    preferredRows: profile.preferredRows,
  };
};

