import { VIEW_MODES, type ViewMode } from "@/components/PuzzleGame";

// Display order is the reading order players expect (TOP → 3D → 2D → SPRITE → FPS), independent
// from VIEW_MODES, which only defines the cycle order used elsewhere.
const DISPLAY_ORDER: ViewMode[] = ["top", "3d", "2d", "sprite", "fps"];

interface ViewModeSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabledModes?: Set<ViewMode>;
  compact?: boolean;
}

export const ViewModeSwitcher = ({ value, onChange, disabledModes, compact = false }: ViewModeSwitcherProps) => {
  const buttonSizeClass = compact ? "h-8 px-2 text-[10px]" : "h-9 px-2.5 text-xs";

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-white/15 bg-black/20 p-0.5" role="group" aria-label="View mode">
      {DISPLAY_ORDER.map((mode) => {
        if (!VIEW_MODES.includes(mode)) return null;
        const isDisabled = disabledModes?.has(mode) ?? false;
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            disabled={isDisabled}
            onClick={() => { if (!isDisabled) onChange(mode); }}
            title={isDisabled ? `${mode.toUpperCase()} (disabled)` : `Switch to ${mode.toUpperCase()} view`}
            aria-pressed={isActive}
            className={`${buttonSizeClass} rounded font-black tracking-wide transition-colors ${
              isActive
                ? "bg-white/90 text-black"
                : isDisabled
                ? "text-white/30 cursor-not-allowed"
                : "text-white/80 hover:bg-white/15 hover:text-white"
            }`}
          >
            {mode.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};
