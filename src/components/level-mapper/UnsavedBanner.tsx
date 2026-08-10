
import React from "react";
import { Button } from "@/components/ui/button";

type Props = {
    visible: boolean;
    onSave: () => void;
};
                                                                                                                                                                               
export const UnsavedBanner: React.FC<Props> = ({ visible, onSave }) => {
    if (!visible) return null;
    return (
        <div className="bg-yellow-100 text-yellow-900 px-4 py-2 text-center shadow transition-opacity duration-300">
            You have unsaved changes. <Button size="sm" onClick={onSave}>Save Changes</Button>
        </div>
    );
};

export default UnsavedBanner;
