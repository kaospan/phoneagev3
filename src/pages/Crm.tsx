import { MapperAuthGate } from "@/components/MapperAuthGate";
import { CrmDashboard } from "@/components/CrmDashboard";

const Crm = () => (
    <div className="h-[100svh] min-h-[100svh] w-screen overflow-hidden bg-stone-950">
        <MapperAuthGate>
            <CrmDashboard />
        </MapperAuthGate>
    </div>
);

export default Crm;
