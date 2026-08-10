import { createContext, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getAllLevels, type ColorTheme, type Hud3DSettings, type LevelProvenance } from '@/data/levels';
import type { DetectedGrid } from './gridDetection';

// Centralized context/types to keep Fast Refresh stable.
export type BulkContextType = 'column-left' | 'column-right' | 'row-top' | 'row-bottom';

export type LevelMapperHistoryEntry =
  | number[][]
  | {
      kind: 'layout';
      grid: number[][];
      rows: number;
      cols: number;
      imageScaleX: number;
      imageScaleY: number;
      imageOffsetX: number;
      imageOffsetY: number;
      lockImageAspect: boolean;
      gridOffsetX: number;
      gridOffsetY: number;
      gridFrameWidth: number | null;
      gridFrameHeight: number | null;
    };

export interface LevelMapperDraft {
  rows: number;
  cols: number;
  grid: number[][];
  playerStart: { x: number; y: number } | null;
  provenance?: LevelProvenance;
  theme: ColorTheme | undefined;
  timeLimitSeconds: number | null;
  hud3d: Hud3DSettings;
  hourglassBonusByCell: Record<string, number>;
  overlayEnabled: boolean;
  overlayOpacity: number;
  overlayStretch: boolean;
  imageScaleX: number;
  imageScaleY: number;
  overlayScaleBaseY?: number;
  imageOffsetX: number;
  imageOffsetY: number;
  lockImageAspect: boolean;
  zoom: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridFrameWidth: number | null;
  gridFrameHeight: number | null;
  undoStack: LevelMapperHistoryEntry[];
  redoStack: LevelMapperHistoryEntry[];
  updatedAt: number;
}

export interface LevelMapperSavedState {
  rows: number;
  cols: number;
  grid: number[][];
  playerStart: { x: number; y: number } | null;
  provenance?: LevelProvenance;
  theme: ColorTheme | undefined;
  timeLimitSeconds: number | null;
  hud3d: Hud3DSettings;
  hourglassBonusByCell: Record<string, number>;
  overlayEnabled: boolean;
  overlayOpacity: number;
  overlayStretch: boolean;
  imageScaleX: number;
  imageScaleY: number;
  overlayScaleBaseY?: number;
  imageOffsetX: number;
  imageOffsetY: number;
  lockImageAspect: boolean;
  zoom: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridFrameWidth: number | null;
  gridFrameHeight: number | null;
  updatedAt: number;
}

export interface LevelMapperContextValue {
  // Dimensions & grid
  rows: number;
  cols: number;
  setRows: (r: number) => void;
  setCols: (c: number) => void;
  grid: number[][];
  setGrid: Dispatch<SetStateAction<number[][]>>;
  activeTile: number;
  setActiveTile: (id: number) => void;

  // Hourglass (+time) configuration
  // Per-cell bonuses keyed by "x,y" (column,row). Used only for tile id 20.
  hourglassBonusByCell: Record<string, number>;
  setHourglassBonusByCell: Dispatch<SetStateAction<Record<string, number>>>;
  // Brush value applied when painting hourglass tiles (seconds added when collected).
  hourglassBrushSeconds: number;
  setHourglassBrushSeconds: (n: number) => void;

  // Player start position
  playerStart: { x: number; y: number } | null;
  currentLevelProvenance: LevelProvenance | undefined;
  setPlayerStart: (pos: { x: number; y: number } | null) => void;

  // Theme
  theme: ColorTheme | undefined;
  setTheme: (theme: ColorTheme | undefined) => void;

  // Optional per-level countdown timer (seconds). null = no timer.
  timeLimitSeconds: number | null;
  setTimeLimitSeconds: (n: number | null) => void;
  hud3d: Hud3DSettings;
  setHud3d: Dispatch<SetStateAction<Hud3DSettings>>;

  // Image & canvas
  imageURL: string | null;
  setImageURL: (url: string | null) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  zoom: number;
  setZoom: (z: number) => void;
  gridOffsetX: number;
  setGridOffsetX: (n: number) => void;
  gridOffsetY: number;
  setGridOffsetY: (n: number) => void;
  gridFrameWidth: number | null;
  setGridFrameWidth: (n: number | null) => void;
  gridFrameHeight: number | null;
  setGridFrameHeight: (n: number | null) => void;
  showGrid: boolean;
  setShowGrid: (b: boolean) => void;

  // Overlay
  overlayEnabled: boolean;
  setOverlayEnabled: (b: boolean) => void;
  overlayOpacity: number;
  setOverlayOpacity: (n: number) => void;
  overlayStretch: boolean;
  setOverlayStretch: (b: boolean) => void;

  // Overlay image distortion (independent X/Y scaling for non-square pixels)
  imageScaleX: number;
  setImageScaleX: (n: number) => void;
  imageScaleY: number;
  setImageScaleY: (n: number) => void;
  // Extra overlay image horizontal translation (in source image pixels), used to anchor stretch from left/right.
  imageOffsetX: number;
  setImageOffsetX: (n: number) => void;
  // Extra overlay image vertical translation (in source image pixels), used to anchor stretch from top/bottom.
  imageOffsetY: number;
  setImageOffsetY: (n: number) => void;
  lockImageAspect: boolean;
  setLockImageAspect: (b: boolean) => void;

  // Levels compare/import
  allLevels: ReturnType<typeof getAllLevels>;
  setAllLevels: Dispatch<SetStateAction<ReturnType<typeof getAllLevels>>>;
  compareLevelIndex: number;
  setCompareLevelIndex: (i: number) => void;
  compareLevel: ReturnType<typeof getAllLevels>[number] | undefined;
  importLevelIndex: number | null;
  setImportLevelIndex: (i: number | null) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Save state
  isSaved: boolean;
  setIsSaved: (b: boolean) => void;
  saveChanges: (options?: { force?: boolean }) => Promise<void>;
  lastSavedAt: number | null;
  lastSavedRepoStatus: 'saved' | 'failed' | 'unavailable' | null;
  showUnsavedBanner: boolean;
  restoreDraftForLevel: (levelId: number) => boolean;

  // Detection
  detectGrid: () => Promise<DetectedGrid | null>;
  snapToLockedCounts: () => Promise<DetectedGrid | null>;
  detectCells: () => Promise<void>;
  lastGridDetection: DetectedGrid | null;

  // Bulk context menu
  contextMenu: { x: number; y: number; type: BulkContextType } | null;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; type: BulkContextType } | null>>;
  addMultipleColumns: (side: 'left' | 'right', count: number) => void;
  addMultipleRows: (side: 'top' | 'bottom', count: number) => void;

  // Shape helpers
  addColumnLeft: () => void;
  addColumnRight: () => void;
  addRowTop: () => void;
  addRowBottom: () => void;
  removeColumnLeft: () => void;
  removeColumnRight: () => void;
  removeRowTop: () => void;
  removeRowBottom: () => void;

  // Export
  exportTS: () => void;
  jsonInput: string;
  setJsonInput: (json: string) => void;
  syncJsonInputToGrid: () => void;
  applyJsonInput: () => void;
  setLoadedSnapshot: (snapshot: {
    levelId?: number | null;
    grid: number[][];
    playerStart: { x: number; y: number } | null;
    provenance?: LevelProvenance;
    theme: ColorTheme | undefined;
    timeLimitSeconds: number | null;
    hud3d?: Hud3DSettings;
    // Per-cell hourglass bonuses keyed by "x,y" (column,row). Used only for tile id 20.
    hourglassBonusByCell?: Record<string, number>;
    imageURL: string | null;
    overlayEnabled: boolean;
    overlayOpacity: number;
    overlayStretch: boolean;
    imageScaleX: number;
    imageScaleY: number;
    imageOffsetX?: number;
    imageOffsetY?: number;
    lockImageAspect: boolean;
    zoom: number;
    gridOffsetX: number;
    gridOffsetY: number;
    gridFrameWidth: number | null;
    gridFrameHeight: number | null;
  }) => void;
  resetToLoadedSnapshot: () => void;

  // Editing helpers
  pushUndo: () => void;
  // Pushes a snapshot that includes layout (overlay scale/offset) so undo/redo can revert image alignment tweaks.
  pushUndoSnapshot: () => void;
  replaceGridShape: (nextGrid: number[][]) => void;
}

export const LevelMapperContext = createContext<LevelMapperContextValue | undefined>(undefined);
