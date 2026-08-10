import * as React from "react";

const MOBILE_BREAKPOINT = 768;

type LegacyMediaQueryList = MediaQueryList & {
    addListener(listener: (event: MediaQueryListEvent) => void): void;
    removeListener(listener: (event: MediaQueryListEvent) => void): void;
};

export function useIsMobile() {
    const computeIsMobile = React.useCallback(() => {
        if (typeof window === "undefined") return false;

        const byWidth = window.innerWidth < MOBILE_BREAKPOINT;
        const canMatch = typeof window.matchMedia === "function";
        const coarsePointer = canMatch ? window.matchMedia("(pointer: coarse)").matches : false;
        const noHover = canMatch ? window.matchMedia("(hover: none)").matches : false;
        const hasTouchPoints = typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0;

        // Landscape phones can exceed the width breakpoint; treat coarse/no-hover touch devices as mobile too.
        const byPointer = coarsePointer && noHover && hasTouchPoints;

        return byWidth || byPointer;
    }, []);

    const [isMobile, setIsMobile] = React.useState<boolean>(() => computeIsMobile());

    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

        const mqlWidth = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const mqlPointer = window.matchMedia("(pointer: coarse)");
        const mqlHover = window.matchMedia("(hover: none)");

        const onChange = () => setIsMobile(computeIsMobile());

        const add = (mql: MediaQueryList) => {
            if ("addEventListener" in mql) mql.addEventListener("change", onChange);
            else (mql as LegacyMediaQueryList).addListener(onChange);
        };
        const remove = (mql: MediaQueryList) => {
            if ("removeEventListener" in mql) mql.removeEventListener("change", onChange);
            else (mql as LegacyMediaQueryList).removeListener(onChange);
        };

        add(mqlWidth);
        add(mqlPointer);
        add(mqlHover);
        window.addEventListener("resize", onChange, { passive: true });

        onChange();

        return () => {
            remove(mqlWidth);
            remove(mqlPointer);
            remove(mqlHover);
            window.removeEventListener("resize", onChange);
        };
    }, [computeIsMobile]);

    return isMobile;
}
