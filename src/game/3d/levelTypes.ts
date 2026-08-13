export type Tile3DType = "floor" | "wall" | "goal";

export interface Cell3D {
  x: number;
  z: number;
  height: number;
  type?: Tile3DType;
}

export interface Position3D {
  x: number;
  z: number;
}

export interface Level3D {
  id: string;
  name: string;
  width: number;
  depth: number;
  maxHeight: number;
  cells: Cell3D[];
  playerStart: Position3D;
  goal: Position3D;
}

export interface GameState3D {
  player: Position3D;
  moves: number;
  complete: boolean;
}
