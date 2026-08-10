import { voidGrid } from '@/lib/levelgrid';

export const DEFAULT_MAPPER_ROWS = 11;
export const DEFAULT_MAPPER_COLS = 20;

export const createDefaultMapperVoidGrid = () => voidGrid(DEFAULT_MAPPER_ROWS, DEFAULT_MAPPER_COLS);
