// Centralized defaults for overlay image scaling in the Level Mapper.
//
// Many captured screenshots need a taller vertical axis to line the editable grid up
// with the source image. Treat that correction as the baseline so "100%" is aligned.

import { getMapperFactoryCalibration } from '@/data/mapperFactoryDefaults';

// Storage schema version for per-level overlay image scale persisted in localStorage.
// Bump when loading semantics change so old entries are re-migrated.
export const LEVEL_IMAGE_SCALE_STORAGE_VERSION = 6;

// Baseline vertical correction (applied to Y only).
// The former 91% calibration, plus the requested 1.5% Y adjustment, is the
// aligned position represented as 100% in the editor.
const LEGACY_OVERLAY_IMAGE_SCALE_Y_BASE = 1.15;
const LEGACY_DEFAULT_USER_Y_SCALE = 0.91;
const DEFAULT_Y_ADJUSTMENT = 1.015;
export const OVERLAY_IMAGE_SCALE_Y_BASE =
    LEGACY_OVERLAY_IMAGE_SCALE_Y_BASE * LEGACY_DEFAULT_USER_Y_SCALE * DEFAULT_Y_ADJUSTMENT;
const OLDEST_OVERLAY_IMAGE_SCALE_Y_BASE = 0.968;

// Default user-facing Y stretch when a level has no saved per-level calibration.
export const DEFAULT_OVERLAY_USER_Y_SCALE = 1;

export const clampOverlayUserScale = (value: number) => (
    Math.max(0.85, Math.min(1.15, value))
);

const approximatelyEqual = (left: number, right: number) => Math.abs(left - right) < 0.0001;

export const normalizeOverlayUserScaleY = (
    value: number,
    savedBaseY: number | null | undefined,
) => {
    if (!Number.isFinite(value)) return DEFAULT_OVERLAY_USER_Y_SCALE;
    const hasSavedBaseline = Number.isFinite(Number(savedBaseY)) && Number(savedBaseY) > 0;
    const baseline = hasSavedBaseline ? Number(savedBaseY) : OLDEST_OVERLAY_IMAGE_SCALE_Y_BASE;

    if (approximatelyEqual(baseline, OVERLAY_IMAGE_SCALE_Y_BASE)) {
        return clampOverlayUserScale(value);
    }

    const isLegacyDefault =
        approximatelyEqual(value, LEGACY_DEFAULT_USER_Y_SCALE) ||
        approximatelyEqual(value, DEFAULT_OVERLAY_USER_Y_SCALE);
    if (isLegacyDefault) {
        return DEFAULT_OVERLAY_USER_Y_SCALE;
    }

    return clampOverlayUserScale((value * baseline) / OVERLAY_IMAGE_SCALE_Y_BASE);
};

// Returns the factory-default overlay scale for a level.
// Falls back to the factory calibration table so values survive localStorage clears.
export const getDefaultOverlayImageScale = (levelId: number) => {
    const cal = getMapperFactoryCalibration(levelId);
    return { x: cal.imageScaleX, y: cal.imageScaleY, lock: false as const };
};
