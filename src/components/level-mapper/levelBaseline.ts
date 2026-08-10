import { DEFAULT_3D_HUD_SETTINGS, getAllLevels, isPlaceholderGrid, normalizeHud3DSettings, type ColorTheme, type Hud3DSettings, type LevelProvenance } from '@/data/levels';
import { voidGrid } from '@/lib/levelgrid';
import { normalizeMapperImage } from './imageNormalization';
import { DEFAULT_MAPPER_COLS, DEFAULT_MAPPER_ROWS, createDefaultMapperVoidGrid } from './mapperDefaults';
import { getLevelImageUrl } from './levelImageStore';
import { getDefaultOverlayImageScale, normalizeOverlayUserScaleY } from './overlayDefaults';
import {
  loadLevelImageScale,
  loadLevelLayoutOverride,
  loadLevelMapperSavedState,
} from './persistenceOperations';

type MapperLevel = ReturnType<typeof getAllLevels>[number];

export interface ResolvedLevelMapperBaseline {
  levelId: number;
  rows: number;
  cols: number;
  grid: number[][];
  playerStart: { x: number; y: number } | null;
  provenance: LevelProvenance | undefined;
  theme: ColorTheme | undefined;
  timeLimitSeconds: number | null;
  hud3d: Hud3DSettings;
  hourglassBonusByCell: Record<string, number>;
  imageURL: string | null;
  overlayEnabled: boolean;
  overlayOpacity: number;
  overlayStretch: boolean;
  imageScaleX: number;
  imageScaleY: number;
  imageOffsetX: number;
  imageOffsetY: number;
  lockImageAspect: boolean;
  zoom: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridFrameWidth: number | null;
  gridFrameHeight: number | null;
}

const cloneGrid = (grid: number[][]) => grid.map((row) => [...row]);

const sanitizeTimeLimit = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.max(0, Math.round(value));
  return rounded > 0 ? rounded : null;
};

export const resolveLevelMapperBaseline = async (
  level: MapperLevel,
): Promise<ResolvedLevelMapperBaseline> => {
  const storedUpload = await getLevelImageUrl(level.id);
  const normalizedURL = storedUpload ?? (level.image ? await normalizeMapperImage(level.image) : null);
  const savedState = loadLevelMapperSavedState(level.id);

  if (savedState) {
    return {
      levelId: level.id,
      rows: savedState.rows,
      cols: savedState.cols,
      grid: cloneGrid(savedState.grid),
      playerStart: savedState.playerStart ? { ...savedState.playerStart } : null,
      provenance: savedState.provenance ?? level.provenance,
      theme: savedState.theme,
      timeLimitSeconds: sanitizeTimeLimit(savedState.timeLimitSeconds),
      hud3d: normalizeHud3DSettings(savedState.hud3d),
      hourglassBonusByCell: { ...(savedState.hourglassBonusByCell ?? {}) },
      imageURL: normalizedURL,
      overlayEnabled: savedState.overlayEnabled ?? Boolean(normalizedURL),
      overlayOpacity:
        Number.isFinite(Number(savedState.overlayOpacity))
          ? Math.max(0, Math.min(1, Number(savedState.overlayOpacity)))
          : 0.5,
      overlayStretch: Boolean(savedState.overlayStretch ?? true),
      imageScaleX:
        Number.isFinite(Number(savedState.imageScaleX))
          ? Math.max(0.85, Math.min(1.15, Number(savedState.imageScaleX)))
          : 1,
      imageScaleY:
        Number.isFinite(Number(savedState.imageScaleY))
          ? normalizeOverlayUserScaleY(Number(savedState.imageScaleY), savedState.overlayScaleBaseY)
          : 1,
      imageOffsetX:
        Number.isFinite(Number(savedState.imageOffsetX)) ? Math.max(0, Number(savedState.imageOffsetX)) : 0,
      imageOffsetY:
        Number.isFinite(Number(savedState.imageOffsetY)) ? Math.max(0, Number(savedState.imageOffsetY)) : 0,
      lockImageAspect: Boolean(savedState.lockImageAspect ?? false),
      zoom: Number.isFinite(Number(savedState.zoom)) ? Math.max(0.2, Math.min(6, Number(savedState.zoom))) : 1,
      gridOffsetX: Number.isFinite(Number(savedState.gridOffsetX)) ? Number(savedState.gridOffsetX) : 0,
      gridOffsetY: Number.isFinite(Number(savedState.gridOffsetY)) ? Number(savedState.gridOffsetY) : 0,
      gridFrameWidth:
        savedState.gridFrameWidth == null || !Number.isFinite(Number(savedState.gridFrameWidth))
          ? null
          : Math.max(1, Number(savedState.gridFrameWidth)),
      gridFrameHeight:
        savedState.gridFrameHeight == null || !Number.isFinite(Number(savedState.gridFrameHeight))
          ? null
          : Math.max(1, Number(savedState.gridFrameHeight)),
    };
  }

  const layout = level.autoBuild && isPlaceholderGrid(level.grid)
    ? loadLevelLayoutOverride(level.id) ?? { rows: DEFAULT_MAPPER_ROWS, cols: DEFAULT_MAPPER_COLS }
    : null;
  const editableGrid =
    level.autoBuild && isPlaceholderGrid(level.grid)
      ? layout
        ? voidGrid(layout.rows, layout.cols)
        : createDefaultMapperVoidGrid()
      : cloneGrid(level.grid);
  const savedScale = loadLevelImageScale(level.id);
  const defaultScale = getDefaultOverlayImageScale(level.id);

  return {
    levelId: level.id,
    rows: editableGrid.length,
    cols: editableGrid[0]?.length ?? 0,
    grid: editableGrid,
    playerStart: level.playerStart ? { ...level.playerStart } : null,
    provenance: level.provenance,
    theme: level.theme,
    timeLimitSeconds: sanitizeTimeLimit(level.timeLimitSeconds ?? null),
    hud3d: normalizeHud3DSettings(level.hud3d ?? DEFAULT_3D_HUD_SETTINGS),
    hourglassBonusByCell: { ...(level.hourglassBonusByCell ?? {}) },
    imageURL: normalizedURL,
    overlayEnabled: Boolean(normalizedURL),
    overlayOpacity: 0.5,
    overlayStretch: true,
    imageScaleX: savedScale?.x ?? defaultScale.x,
    imageScaleY: savedScale?.y ?? defaultScale.y,
    imageOffsetX: Number((savedScale as { offsetX?: number } | null)?.offsetX ?? 0),
    imageOffsetY: Number((savedScale as { offsetY?: number } | null)?.offsetY ?? 0),
    lockImageAspect: savedScale?.lock ?? defaultScale.lock,
    zoom: 1,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridFrameWidth: null,
    gridFrameHeight: null,
  };
};
