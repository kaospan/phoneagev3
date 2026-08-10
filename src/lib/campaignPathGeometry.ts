// Shared layout math for the campaign snake path — used by the level-browser map
// (CampaignMapPath) and the journey overlay (CampaignJourneyOverlay) so both draw
// the exact same winding path and never drift out of sync.

export const DOTS_PER_ROW = 4;
export const ROW_HEIGHT = 108;
export const DOT_SIZE = 56;
// Keeps dots away from the container edges (as a fraction of width) so they never get clipped.
export const EDGE_INSET_FRAC = 0.14;

/** x position (0-1 fraction of width) of the i-th dot within its row, snaking left-right. */
export const xFractionForCol = (col: number, row: number): number => {
  const t = DOTS_PER_ROW <= 1 ? 0.5 : col / (DOTS_PER_ROW - 1);
  const eased = EDGE_INSET_FRAC + t * (1 - EDGE_INSET_FRAC * 2);
  return row % 2 === 0 ? eased : 1 - eased;
};

export interface CampaignPathPoint<T> {
  item: T;
  row: number;
  col: number;
  xFrac: number;
  y: number;
}

export const contentHeightForCount = (count: number): number => {
  const rowCount = Math.max(1, Math.ceil(count / DOTS_PER_ROW));
  return rowCount * ROW_HEIGHT + DOT_SIZE;
};

export function buildCampaignPathPoints<T>(items: T[]): CampaignPathPoint<T>[] {
  return items.map((item, i) => {
    const row = Math.floor(i / DOTS_PER_ROW);
    const col = i % DOTS_PER_ROW;
    const xFrac = xFractionForCol(col, row);
    return { item, row, col, xFrac, y: row * ROW_HEIGHT + DOT_SIZE / 2 };
  });
}

/**
 * The SVG uses a 0-100 (percent-like) X coordinate space via viewBox + preserveAspectRatio="none",
 * so this can share the exact same xFrac used to position the HTML dot buttons.
 */
export function buildCampaignPathD(points: Array<{ xFrac: number; y: number }>): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${(p.xFrac * 100).toFixed(2)} ${p.y}`).join(" ");
}
