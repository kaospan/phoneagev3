// Factory calibration defaults for the Level Mapper overlay image alignment.
// These are baked into code so they survive localStorage cache clears.
// All levels default to 1.0 (100% — the baseline-aligned scale in the UI).
// To update for specific levels: edit MAPPER_FACTORY_CALIBRATIONS below.
// To export current calibrations from localStorage for baking in, run in the browser console:
//   copy(JSON.stringify(Object.fromEntries(Array.from({length:200},(_,i)=>[i+1,JSON.parse(localStorage.getItem(`level_mapper_image_scale_${i+1}`)||'null')]).filter(([,v])=>v&&v.y!=null).map(([k,v])=>[k,{imageScaleX:v.x??1,imageScaleY:v.y??1}])),null,2))

export type MapperFactoryCalibration = {
  imageScaleX: number;
  imageScaleY: number;
};

const DEFAULT_CAL: MapperFactoryCalibration = { imageScaleX: 1.0, imageScaleY: 1.0 };

// Per-level factory calibrations for levels 1-200.
// Individual entries can be added here to preserve specific per-level tuning across cache clears.
export const MAPPER_FACTORY_CALIBRATIONS: Partial<Record<number, MapperFactoryCalibration>> = {
  // Levels 1-200 all use the default 1.0 / 1.0 calibration.
  // Add per-level overrides here as needed, e.g.:
  // 5: { imageScaleX: 1.0, imageScaleY: 1.02 },
};

export const getMapperFactoryCalibration = (levelId: number): MapperFactoryCalibration => {
  return MAPPER_FACTORY_CALIBRATIONS[levelId] ?? DEFAULT_CAL;
};
