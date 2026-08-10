import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

type ContextType = 'column-left' | 'column-right' | 'row-top' | 'row-bottom';

export type BulkMenuState = {
    x: number;
    y: number;
    type: ContextType;
} | null;

type Props = {
    menu: BulkMenuState;
    onAdd: (type: ContextType, count: number) => void;
    onClose: () => void;
};

export const BulkAddContextMenu: React.FC<Props> = ({ menu, onAdd, onClose }) => {
    const [count, setCount] = useState(1);

    useEffect(() => {
        // reset count whenever the menu opens
        if (menu) setCount(1);
    }, [menu]);

    if (!menu) return null;

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-3 min-w-[200px]"
                style={{ left: `${menu.x}px`, top: `${menu.y}px`, transform: 'translate(-50%, -10px)' }}
            >
                <div className="text-sm font-medium mb-2">
                    Add {menu.type.includes('column') ? 'Columns' : 'Rows'}
                </div>
                <div className="flex items-center gap-2 mb-3">
                    <input
                        type="number"
                        min={1}
                        max={20}
                        value={count}
                        onChange={(e) => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                        className="w-20 px-2 py-1 border rounded text-sm"
                        autoFocus
                    />
                    <span className="text-xs text-muted-foreground">
                        {menu.type.includes('column') ? 'columns' : 'rows'}
                    </span>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => onAdd(menu.type, count)}>Add</Button>
                    <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </>
    );
};

export default BulkAddContextMenu;
