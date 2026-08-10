import { useState, useRef, useMemo, useLayoutEffect, useEffect } from "react";
import { CellType } from "@/game/types";


export type ViewMode = "3d" | "fps" | "2d" | "sprite" | "top";


export interface UseCameraGesturesProps {
  renderGrid: CellType[][];
  viewMode: ViewMode;
  isMobilePortrait: boolean;
  isMobile: boolean;
  onPushHudMessage: (message: string) => void;
}


const CAMERA_BASELINE_ZOOM_FACTOR = 0.66;
const CAMERA_ZOOM_PERCENT_LEVELS = Array.from({ length: 23 }, (_, index) => 40 + index * 5);
export const CAMERA_ZOOM_LEVELS = CAMERA_ZOOM_PERCENT_LEVELS.map(
  (percent) => CAMERA_BASELINE_ZOOM_FACTOR / (percent / 100)
);
export const DEFAULT_CAMERA_ZOOM_INDEX = CAMERA_ZOOM_PERCENT_LEVELS.indexOf(100);
export const MOBILE_DEFAULT_CAMERA_ZOOM_INDEX = DEFAULT_CAMERA_ZOOM_INDEX;
const PINCH_ZOOM_STEP_DISTANCE_PX = 18;


const distanceBetweenTouches = (
  t1: Pick<React.Touch, "clientX" | "clientY">,
  t2: Pick<React.Touch, "clientX" | "clientY">
) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);


export interface TwoFingerGesture {
  startDist: number;
  startMidX: number;
  startMidY: number;
  lastDist: number;
  lastMidX: number;
  lastMidY: number;
  intent: "pinch" | "pan" | null;
}


export interface UseCameraGesturesReturn {
  cameraOffset: { x: number; z: number };
  setCameraOffset: React.Dispatch<React.SetStateAction<{ x: number; z: number }>>;
  cameraZoomIndex: number;
  setCameraZoomIndex: React.Dispatch<React.SetStateAction<number>>;
  cameraZoomFactor: number;
  cameraZoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  fitToWidthZoomIndex: number;
  userZoomTouched: boolean;
  setUserZoomTouched: React.Dispatch<React.SetStateAction<boolean>>;
  isDragging: boolean;
  gestureSurfaceRef: React.RefObject<HTMLDivElement | null>;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onDoubleClick: () => void;
  };
}


export const useCameraGestures = ({
  renderGrid,
  viewMode,
  isMobilePortrait,
  isMobile,
  onPushHudMessage,
}: UseCameraGesturesProps): UseCameraGesturesReturn => {
  const [cameraOffset, setCameraOffset] = useState({ x: 0, z: 0 });
  const [cameraZoomIndex, setCameraZoomIndex] = useState(() =>
    isMobile ? MOBILE_DEFAULT_CAMERA_ZOOM_INDEX : DEFAULT_CAMERA_ZOOM_INDEX
  );
  const [userZoomTouched, setUserZoomTouched] = useState(false);
  const [gestureSurfaceSize, setGestureSurfaceSize] = useState({ w: 0, h: 0 });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffsetStart, setDragOffsetStart] = useState({ x: 0, z: 0 });

  const gestureSurfaceRef = useRef<HTMLDivElement | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const multiTouchActiveRef = useRef(false);
  const twoFingerGestureRef = useRef<TwoFingerGesture | null>(null);

  const portraitFitZoomRef = useRef(0);
  const isMobilePortraitRef = useRef(isMobilePortrait);

  useEffect(() => {
    isMobilePortraitRef.current = isMobilePortrait;
  }, [isMobilePortrait]);

  useLayoutEffect(() => {
    const el = gestureSurfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setGestureSurfaceSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cameraZoomFactor = CAMERA_ZOOM_LEVELS[cameraZoomIndex] ?? CAMERA_BASELINE_ZOOM_FACTOR;
  const cameraZoomPercent = CAMERA_ZOOM_PERCENT_LEVELS[cameraZoomIndex] ?? 100;

  const fitToWidthZoomIndex = useMemo(() => {
    const cols = renderGrid[0]?.length ?? 0;
    const rows = renderGrid.length;
    if (cols === 0 || viewMode === "fps") return 0;
    if (viewMode === "sprite" || viewMode === "top")
      return isMobilePortrait ? DEFAULT_CAMERA_ZOOM_INDEX : 0;

    const is2D = viewMode === "2d";
    const fovDeg = is2D ? 42 : 50;
    const baseH = is2D ? 24 : 18;
    const fovRad = (fovDeg * Math.PI) / 180;

    if (isMobilePortrait) {
      const gsW = gestureSurfaceSize.w > 0 ? gestureSurfaceSize.w : window.innerWidth;
      const gsH = gestureSurfaceSize.h > 0 ? gestureSurfaceSize.h : window.innerHeight;
      const aspect = gsH / Math.max(1, gsW);
      for (let i = CAMERA_ZOOM_LEVELS.length - 1; i >= 0; i--) {
        const vh = 2 * Math.tan(fovRad / 2) * baseH * CAMERA_ZOOM_LEVELS[i];
        const vw = vh * aspect;
        if (vw >= cols && vh >= rows) return i;
      }
      return 0;
    }

    const estAspect = window.innerWidth / Math.max(1, window.innerHeight * 0.55);
    for (let i = CAMERA_ZOOM_LEVELS.length - 1; i >= 0; i--) {
      const vw = 2 * Math.tan(fovRad / 2) * baseH * CAMERA_ZOOM_LEVELS[i] * estAspect;
      if (vw >= cols) return i;
    }
    return 0;
  }, [renderGrid, viewMode, isMobilePortrait, gestureSurfaceSize]);

  portraitFitZoomRef.current = fitToWidthZoomIndex;

  const canZoomIn = cameraZoomIndex < CAMERA_ZOOM_LEVELS.length - 1;
  const canZoomOut = cameraZoomIndex > fitToWidthZoomIndex;

  useEffect(() => {
    if (viewMode === "fps") setIsDragging(false);
  }, [viewMode]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === "fps" || viewMode === "sprite" || viewMode === "top") return;
    if (e.button === 0 && e.target === e.currentTarget) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (viewMode === "fps" || viewMode === "sprite" || viewMode === "top") return;
    if (isDragging) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const sensitivity = 0.1;
      setCameraOffset({
        x: dragOffsetStart.x - deltaX * sensitivity,
        z: dragOffsetStart.z - deltaY * sensitivity,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (viewMode === "fps" || viewMode === "sprite" || viewMode === "top") return;
    if (e.touches.length >= 2) {
      multiTouchActiveRef.current = true;
      setIsDragging(false);
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const t2 = e.touches[2];
      const dist = distanceBetweenTouches(t0, t1);
      const midX = t2
        ? (t0.clientX + t1.clientX + t2.clientX) / 3
        : (t0.clientX + t1.clientX) / 2;
      const midY = t2
        ? (t0.clientY + t1.clientY + t2.clientY) / 3
        : (t0.clientY + t1.clientY) / 2;
      pinchDistanceRef.current = dist;
      twoFingerGestureRef.current = {
        startDist: dist,
        startMidX: midX,
        startMidY: midY,
        lastDist: dist,
        lastMidX: midX,
        lastMidY: midY,
        intent: e.touches.length >= 3 ? "pan" : null,
      };
      return;
    }
    if (e.touches.length === 1 && e.target === e.currentTarget && !multiTouchActiveRef.current) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (viewMode === "fps" || viewMode === "sprite" || viewMode === "top") return;
    if (e.touches.length >= 2) {
      const gesture = twoFingerGestureRef.current;
      if (!gesture) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const t2 = e.touches[2];
      const newDist = distanceBetweenTouches(t0, t1);
      const midX = t2
        ? (t0.clientX + t1.clientX + t2.clientX) / 3
        : (t0.clientX + t1.clientX) / 2;
      const midY = t2
        ? (t0.clientY + t1.clientY + t2.clientY) / 3
        : (t0.clientY + t1.clientY) / 2;

      if (e.touches.length >= 3 && gesture.intent !== "pan") gesture.intent = "pan";

      if (gesture.intent === null) {
        const distDelta = Math.abs(newDist - gesture.startDist);
        const midDelta = Math.hypot(midX - gesture.startMidX, midY - gesture.startMidY);
        if (distDelta > 10) gesture.intent = "pinch";
        else if (midDelta > 12) gesture.intent = "pan";
      }

      if (gesture.intent === "pinch") {
        const delta = newDist - gesture.lastDist;
        if (Math.abs(delta) >= PINCH_ZOOM_STEP_DISTANCE_PX) {
          setCameraZoomIndex((idx) => {
            const nextIdx = delta > 0 ? idx + 1 : idx - 1;
            return Math.max(fitToWidthZoomIndex, Math.min(CAMERA_ZOOM_LEVELS.length - 1, nextIdx));
          });
          gesture.lastDist = newDist;
        }
      } else if (gesture.intent === "pan") {
        const sensitivity = 0.1;
        const dx = midX - gesture.lastMidX;
        const dy = midY - gesture.lastMidY;
        setCameraOffset((prev) =>
          isMobilePortrait
            ? { x: prev.x + dy * sensitivity, z: prev.z - dx * sensitivity }
            : { x: prev.x - dx * sensitivity, z: prev.z - dy * sensitivity }
        );
      }

      gesture.lastMidX = midX;
      gesture.lastMidY = midY;
      pinchDistanceRef.current = newDist;
      return;
    }

    if (isDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStart.x;
      const deltaY = touch.clientY - dragStart.y;
      const sensitivity = 0.1;
      setCameraOffset(
        isMobilePortrait
          ? { x: dragOffsetStart.x + deltaY * sensitivity, z: dragOffsetStart.z - deltaX * sensitivity }
          : { x: dragOffsetStart.x - deltaX * sensitivity, z: dragOffsetStart.z - deltaY * sensitivity }
      );
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      multiTouchActiveRef.current = false;
      setIsDragging(false);
      twoFingerGestureRef.current = null;
      pinchDistanceRef.current = null;
    } else if (e.touches.length < 2) {
      twoFingerGestureRef.current = null;
      pinchDistanceRef.current = null;
      setIsDragging(false);
    }
  };

  const handleDoubleClick = () => {
    if (viewMode === "fps" || viewMode === "sprite" || viewMode === "top") return;
    setCameraOffset({ x: 0, z: 0 });
    onPushHudMessage("View reset");
  };

  return {
    cameraOffset,
    setCameraOffset,
    cameraZoomIndex,
    setCameraZoomIndex,
    cameraZoomFactor,
    cameraZoomPercent,
    canZoomIn,
    canZoomOut,
    fitToWidthZoomIndex,
    userZoomTouched,
    setUserZoomTouched,
    isDragging,
    gestureSurfaceRef,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onDoubleClick: handleDoubleClick,
    },
  };
};
