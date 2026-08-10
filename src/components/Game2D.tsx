import { buildGoalCaveKeySet } from "@/game/caves";

interface Game2DProps {
    grid: number[][];
    playerPos: { x: number; y: number };
    cavePos: { x: number; y: number };
    selectedArrow?: { x: number; y: number } | null;
    onArrowClick?: (x: number, y: number) => void;
    onCancelSelection?: () => void;
  }
  
  export const Game2D = ({ grid, playerPos, cavePos, selectedArrow, onArrowClick, onCancelSelection }: Game2DProps) => {
    const goalCaveKeys = buildGoalCaveKeySet(grid, cavePos);

    const getCellDisplay = (cell: number, isPlayer: boolean, isCave: boolean) => {
      if (isPlayer) return "🦖";
      if (isCave) return "🕳️";
      switch (cell) {
        case 0: return ""; // land
        case 1: return "🔥"; // fire wall
        case 2: return "🪨"; // stone
        case 18: return "⬤"; // start cave marker
        case 19: return "🌀"; // teleport
        case 20: return "⏰"; // bonus time
        case 14: return "🗝️"; // red key
        case 15: return "🔑"; // green key
        case 16: return "🔒"; // red lock
        case 17: return "🔒"; // green lock
        case 7: return "⬆️"; // arrow up
        case 8: return "➡️"; // arrow right
        case 9: return "⬇️"; // arrow down
        case 10: return "⬅️"; // arrow left
        case 4: return "💧"; // water
        case 5: return ""; // void
        case 6: return "╳"; // breakable rock
        case 11: return "⬍"; // up-down arrow
        case 12: return "⬌"; // left-right arrow
        case 13: return "✚"; // omnidirectional arrow
        default: return "";
      }
    };
  
    const getCellColor = (cell: number) => {
      switch (cell) {
        case 0: return "bg-amber-200"; // land
        case 1: return "bg-red-500"; // fire wall
        case 2: return "bg-stone-500"; // stone
        case 18: return "bg-neutral-900"; // start cave marker
        case 19: return "bg-gradient-to-br from-cyan-200 via-fuchsia-200 to-indigo-200"; // teleport
        case 20: return "bg-yellow-300"; // bonus time
        case 14: return "bg-red-600"; // red key
        case 15: return "bg-green-600"; // green key
        case 16: return "bg-red-900"; // red lock
        case 17: return "bg-green-900"; // green lock
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
        case 12:
        case 13: return "bg-amber-800"; // arrows
        case 4: return "bg-blue-400"; // water
        case 5: return "bg-sky-400"; // void
        case 6: return "bg-amber-700 text-amber-100"; // breakable rock
        default: return "bg-stone-300";
      }
    };
  
    return (
      <div 
        className="w-full h-[600px] flex flex-col justify-center items-center p-4 bg-sky-200 rounded-lg"
        onClick={() => onCancelSelection?.()}
      >
        <div className="text-2xl font-bold text-purple-800 mb-4">2D TOP VIEW</div>
        <div className="inline-grid gap-1 bg-stone-900 p-4 rounded-xl shadow-lg border-4 border-purple-400">
          {grid.map((row, y) => (
            <div key={y} className="flex gap-1">
              {row.map((cell, x) => {
                const isPlayer = playerPos.x === x && playerPos.y === y;
                const isCave = goalCaveKeys.has(`${x},${y}`);
                const isArrow = (cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13;
                const isSelectedArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                const cellColor = isCave ? "bg-emerald-700" : getCellColor(cell);
                
                return (
                  <div
                    key={`${x}-${y}`}
                    className={`
                      w-16 h-16 flex items-center justify-center text-3xl font-bold
                      ${cellColor}
                      ${isPlayer ? "ring-4 ring-green-400 animate-pulse shadow-sm" : ""}
                      ${isCave ? "ring-4 ring-emerald-300 shadow-sm text-black" : ""}
                      ${isSelectedArrow ? "ring-4 ring-white shadow-sm animate-pulse" : ""}
                      transition-all duration-200 rounded-lg
                      border-2 border-stone-700 shadow-sm
                      ${isArrow ? "cursor-pointer hover:brightness-110" : ""}
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isArrow) {
                        onArrowClick?.(x, y);
                      }
                    }}
                  >
                    {getCellDisplay(cell, isPlayer, isCave)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };
