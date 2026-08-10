import React, { useMemo } from "react";
import { TILE_TYPES } from "@/lib/levelgrid";
import { referenceSpriteUrls } from "@/data/assetCatalog";
import {
    createBreakableRockTileDataUrl,
    createHourglassIconDataUrl,
    createKeyIconDataUrl,
    createLockIconDataUrl,
    createVortexIconDataUrl,
} from "@/lib/canvasIcons";
import globalFloorUrl from "@/assets/tile-sprites/floor.png";
import globalWallUrl from "@/assets/tile-sprites/wall.png";
import globalStoneUrl from "@/assets/tile-sprites/stone.png";
import globalArrowUpUrl from "@/assets/tile-sprites/arrow-up.png";
import globalArrowRightUrl from "@/assets/tile-sprites/arrow-right.png";
import globalArrowDownUrl from "@/assets/tile-sprites/arrow-down.png";
import globalArrowLeftUrl from "@/assets/tile-sprites/arrow-left.png";
import globalArrowVerticalUrl from "@/assets/tile-sprites/arrow-vertical.png";
import globalArrowHorizontalUrl from "@/assets/tile-sprites/arrow-horizontal.png";
import globalArrowOmniUrl from "@/assets/tile-sprites/arrow-omni.png";

type Props = {
    activeTile: number;
    setActiveTile: (id: number) => void;
};

/** Same real/generated sprite art the game itself renders per tile type — lets a level
 *  designer recognize tiles by how they actually look, not just a flat swatch. */
export const useTileSpriteUrls = (): Record<number, string> =>
    useMemo(
        () => ({
            0: globalFloorUrl,
            1: globalWallUrl,
            2: globalStoneUrl,
            3: referenceSpriteUrls.cave,
            6: createBreakableRockTileDataUrl(64) ?? "",
            7: globalArrowUpUrl,
            8: globalArrowRightUrl,
            9: globalArrowDownUrl,
            10: globalArrowLeftUrl,
            11: globalArrowVerticalUrl,
            12: globalArrowHorizontalUrl,
            13: globalArrowOmniUrl,
            14: createKeyIconDataUrl(48, { accent: "rgba(239,68,68,0.98)", glow: "rgba(239,68,68,0.18)" }) ?? "",
            15: createKeyIconDataUrl(48, { accent: "rgba(34,197,94,0.98)", glow: "rgba(34,197,94,0.18)" }) ?? "",
            16: createLockIconDataUrl(48, { body: "rgba(185,28,28,0.97)", shackle: "rgba(120,20,20,0.95)", glow: "rgba(220,38,38,0.22)" }) ?? "",
            17: createLockIconDataUrl(48, { body: "rgba(21,128,61,0.97)", shackle: "rgba(16,80,40,0.95)", keyhole: "rgba(255,255,255,0.85)", glow: "rgba(34,197,94,0.22)" }) ?? "",
            19: createVortexIconDataUrl(48) ?? "",
            20: createHourglassIconDataUrl(48) ?? "",
        }),
        [],
    );

/** Compact vertical list for a narrow sidebar: sprite thumbnail (colored ring = tile identity) + full name. */
export const Palette: React.FC<Props> = ({ activeTile, setActiveTile }) => {
    const spriteUrls = useTileSpriteUrls();

    return (
        <div className="flex flex-col gap-1">
            {TILE_TYPES.map((t) => {
                const sprite = spriteUrls[t.id];
                const isActive = activeTile === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => setActiveTile(t.id)}
                        className={`flex items-center gap-2 rounded-lg border px-1.5 py-1 text-left transition-colors ${
                            isActive
                                ? "border-amber-300 bg-amber-500/15 ring-1 ring-amber-300/60"
                                : "border-border/50 bg-background/30 hover:border-amber-200/40 hover:bg-background/50"
                        }`}
                        title={t.name}
                    >
                        <span
                            className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border-2"
                            style={{
                                borderColor: t.color,
                                backgroundColor: t.color,
                                backgroundImage: sprite ? `url(${sprite})` : undefined,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                imageRendering: "pixelated",
                            }}
                        />
                        <span className="min-w-0 truncate text-[11px] font-semibold leading-tight text-foreground">
                            {t.name}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default Palette;
