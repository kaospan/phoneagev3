// Grid manipulation operations

export const addColumnLeft = (
    grid: number[][],
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    setCols: (c: number) => void,
    setUndoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setRedoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setIsSaved: (b: boolean) => void,
    skipAutoResizeRef: React.MutableRefObject<boolean>,
    prevSizeRef: React.MutableRefObject<{ rows: number; cols: number }>,
    rows: number
) => {
    setGrid(g => {
        const snap = g.map(r => [...r]);
        setUndoStack(s => [...s, snap]);
        setRedoStack([]);
        setIsSaved(false);
        const newG = g.map(r => [5, ...r]);
        skipAutoResizeRef.current = true;
        setCols(g[0]?.length + 1);
        prevSizeRef.current = { rows, cols: (g[0]?.length || 0) + 1 };
        return newG;
    });
};

export const addColumnRight = (
    grid: number[][],
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    setCols: (c: number) => void,
    setUndoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setRedoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setIsSaved: (b: boolean) => void,
    skipAutoResizeRef: React.MutableRefObject<boolean>,
    prevSizeRef: React.MutableRefObject<{ rows: number; cols: number }>,
    rows: number
) => {
    setGrid(g => {
        const snap = g.map(r => [...r]);
        setUndoStack(s => [...s, snap]);
        setRedoStack([]);
        setIsSaved(false);
        const newG = g.map(r => [...r, 5]);
        skipAutoResizeRef.current = true;
        setCols(g[0]?.length + 1);
        prevSizeRef.current = { rows, cols: (g[0]?.length || 0) + 1 };
        return newG;
    });
};

export const addRowTop = (
    grid: number[][],
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    setRows: (r: number) => void,
    setCols: (c: number) => void,
    setUndoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setRedoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setIsSaved: (b: boolean) => void,
    skipAutoResizeRef: React.MutableRefObject<boolean>,
    prevSizeRef: React.MutableRefObject<{ rows: number; cols: number }>,
    cols: number
) => {
    setGrid(g => {
        const snap = g.map(r => [...r]);
        setUndoStack(s => [...s, snap]);
        setRedoStack([]);
        setIsSaved(false);
        const width = g[0]?.length || cols;
        const newRow = Array.from({ length: width }, () => 5);
        const newG = [newRow, ...g.map(r => [...r])];
        skipAutoResizeRef.current = true;
        setRows(g.length + 1);
        prevSizeRef.current = { rows: g.length + 1, cols };
        return newG;
    });
};

export const addRowBottom = (
    grid: number[][],
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    setRows: (r: number) => void,
    setCols: (c: number) => void,
    setUndoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setRedoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setIsSaved: (b: boolean) => void,
    skipAutoResizeRef: React.MutableRefObject<boolean>,
    prevSizeRef: React.MutableRefObject<{ rows: number; cols: number }>,
    cols: number
) => {
    setGrid(g => {
        const snap = g.map(r => [...r]);
        setUndoStack(s => [...s, snap]);
        setRedoStack([]);
        setIsSaved(false);
        const width = g[0]?.length || cols;
        const newRow = Array.from({ length: width }, () => 5);
        const newG = [...g.map(r => [...r]), newRow];
        skipAutoResizeRef.current = true;
        setRows(g.length + 1);
        prevSizeRef.current = { rows: g.length + 1, cols };
        return newG;
    });
};

export const addMultipleColumns = (
    side: 'left' | 'right',
    count: number,
    grid: number[][],
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    setCols: (c: number) => void,
    setUndoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setRedoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setIsSaved: (b: boolean) => void,
    skipAutoResizeRef: React.MutableRefObject<boolean>,
    prevSizeRef: React.MutableRefObject<{ rows: number; cols: number }>,
    rows: number
) => {
    setGrid(g => {
        const snap = g.map(r => [...r]);
        setUndoStack(s => [...s, snap]);
        setRedoStack([]);
        setIsSaved(false);
        const voidCols = Array(count).fill(5);
        const newG = side === 'left' ? g.map(r => [...voidCols, ...r]) : g.map(r => [...r, ...voidCols]);
        skipAutoResizeRef.current = true;
        setCols((g[0]?.length || 0) + count);
        prevSizeRef.current = { rows, cols: (g[0]?.length || 0) + count };
        return newG;
    });
};

export const addMultipleRows = (
    side: 'top' | 'bottom',
    count: number,
    grid: number[][],
    setGrid: React.Dispatch<React.SetStateAction<number[][]>>,
    setRows: (r: number) => void,
    setCols: (c: number) => void,
    setUndoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setRedoStack: React.Dispatch<React.SetStateAction<number[][][]>>,
    setIsSaved: (b: boolean) => void,
    skipAutoResizeRef: React.MutableRefObject<boolean>,
    prevSizeRef: React.MutableRefObject<{ rows: number; cols: number }>,
    cols: number
) => {
    setGrid(g => {
        const snap = g.map(r => [...r]);
        setUndoStack(s => [...s, snap]);
        setRedoStack([]);
        setIsSaved(false);
        const width = g[0]?.length || cols;
        const newRows = Array.from({ length: count }, () => Array.from({ length: width }, () => 5));
        const newG = side === 'top' ? [...newRows, ...g.map(r => [...r])] : [...g.map(r => [...r]), ...newRows];
        skipAutoResizeRef.current = true;
        setRows(g.length + count);
        prevSizeRef.current = { rows: g.length + count, cols };
        return newG;
    });
};
