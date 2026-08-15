import { type ViewMode } from "@/components/PuzzleGame";

interface ViewModeSwitcherProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabledModes?: Set<ViewMode>;
  compact?: boolean;
}

// View-mode selection is intentionally hidden from player settings.
// The game continues to use its configured/default view internally.
export const ViewModeSwitcher = (_props: ViewModeSwitcherProps) => null;
