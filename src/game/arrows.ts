import { CellType } from './types';

export const isArrowCell = (cell: CellType) =>
  (cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13;

export const getArrowDirections = (cell: CellType): { dx: number; dy: number }[] => {
  switch (cell) {
    case 7: return [{ dx: 0, dy: -1 }]; // up
    case 8: return [{ dx: 1, dy: 0 }]; // right
    case 9: return [{ dx: 0, dy: 1 }]; // down
    case 10: return [{ dx: -1, dy: 0 }]; // left
    case 11: return [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }]; // up/down
    case 12: return [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }]; // left/right
    case 13: return [ // omni
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
    ];
    default: return [];
  }
};
