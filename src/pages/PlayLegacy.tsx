import { PuzzleGame } from "@/components/PuzzleGame";
import { PlayerAuthGate } from "@/components/PlayerAuthGate";
import bgImage from "@/assets/stone-age-bg.png";
import { useIsMobile } from "@/hooks/use-mobile";

console.log('📄 PlayLegacy.tsx loading...');

const PlayLegacy = () => {
    console.log('⚛️ PlayLegacy component rendering...');

    try {
        const isMobile = useIsMobile();

        return (
            <div
                className="relative h-[100svh] min-h-[100svh] w-screen overflow-hidden"
                style={{
                    backgroundImage: `url(${bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundAttachment: isMobile ? 'scroll' : 'fixed',
                }}
            >
                <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 40%), radial-gradient(circle at 80% 30%, rgba(255,220,170,0.08), transparent 45%), linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.35) 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                />
                <div className="absolute inset-0 bg-blue-900/40 scanline" />

                <div className="relative z-10 h-full w-full">
                    <PlayerAuthGate>
                        <PuzzleGame />
                    </PlayerAuthGate>
                </div>
            </div>
        );
    } catch (error) {
        console.error('❌ Error in PlayLegacy component:', error);
        throw error;
    }
};

console.log('✅ PlayLegacy.tsx loaded');

export default PlayLegacy;
