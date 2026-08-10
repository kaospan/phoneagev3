import type { RefObject } from "react";
import { useEffect, useRef } from "react";

interface TouchControlsProps {
  onMove: (dx: number, dy: number) => void;
  disabled?: boolean;
  /**
   * Element to attach the touch listeners to. Prefer passing a stable ref to the game surface,
   * rather than querying for a canvas (SPR view has no canvas).
   */
  targetRef?: RefObject<HTMLElement | null>;
}

export const TouchControls = ({ onMove, disabled, targetRef }: TouchControlsProps) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const targetEl =
      targetRef?.current ??
      (document.querySelector("[data-touch-controls-target]") as HTMLElement | null) ??
      (document.querySelector("canvas") as HTMLElement | null);

    if (!targetEl) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (disabled) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (disabled || !touchStartRef.current) return;
      if (e.changedTouches.length < 1) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Minimum swipe distance to register
      const minSwipeDistance = 30;

      // Calculate total distance moved
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Only trigger movement if it's a clear swipe (moved enough distance)
      // This allows taps (little to no movement) to pass through to 3D objects.
      if (totalDistance >= minSwipeDistance) {
        // Determine direction based on larger delta.
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal swipe
          onMove(deltaX > 0 ? 1 : -1, 0);
        } else {
          // Vertical swipe
          onMove(0, deltaY > 0 ? 1 : -1);
        }
      }

      touchStartRef.current = null;
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
    };

    targetEl.addEventListener("touchstart", handleTouchStart, { passive: true });
    targetEl.addEventListener("touchend", handleTouchEnd, { passive: true });
    targetEl.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      targetEl.removeEventListener("touchstart", handleTouchStart);
      targetEl.removeEventListener("touchend", handleTouchEnd);
      targetEl.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [onMove, disabled, targetRef]);

  return null;
};
