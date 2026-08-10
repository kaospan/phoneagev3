import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Resources {
  food: number;
  wood: number;
  stone: number;
}

export const GameBoard = () => {
  const [resources, setResources] = useState<Resources>({
    food: 10,
    wood: 5,
    stone: 5,
  });
  const [score, setScore] = useState(0);
  const [population, setPopulation] = useState(1);

  useEffect(() => {
    // Auto-generate resources based on population
    const interval = setInterval(() => {
      setResources((prev) => ({
        food: Math.min(prev.food + population * 0.5, 999),
        wood: prev.wood,
        stone: prev.stone,
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, [population]);

  const gatherResource = (type: keyof Resources, amount: number) => {
    setResources((prev) => ({
      ...prev,
      [type]: Math.min(prev[type] + amount, 999),
    }));
    setScore((prev) => prev + amount * 10);
    toast(`+${amount} ${type.toUpperCase()}!`, {
      duration: 1000,
    });
  };

  const buildHut = () => {
    if (resources.wood >= 10 && resources.stone >= 5) {
      setResources((prev) => ({
        ...prev,
        wood: prev.wood - 10,
        stone: prev.stone - 5,
      }));
      setPopulation((prev) => prev + 1);
      setScore((prev) => prev + 100);
      toast("🏠 HUT BUILT! +1 POPULATION", {
        duration: 2000,
      });
    } else {
      toast("NOT ENOUGH RESOURCES!", {
        duration: 1500,
      });
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="retro-border bg-card p-4 scanline">
        <h1 className="pixel-text text-3xl text-center text-primary mb-2">
          === STONE AGE ===
        </h1>
        <div className="flex justify-between text-foreground pixel-text text-sm">
          <span>SCORE: {Math.floor(score)}</span>
          <span>POPULATION: {population}</span>
        </div>
      </div>

      {/* Resources Display */}
      <div className="grid grid-cols-3 gap-4">
        <div className="retro-border bg-card p-4 scanline">
          <div className="pixel-text text-center">
            <div className="text-2xl mb-1">🍖</div>
            <div className="text-xs text-muted-foreground">FOOD</div>
            <div className="text-xl text-primary">{Math.floor(resources.food)}</div>
          </div>
        </div>
        <div className="retro-border bg-card p-4 scanline">
          <div className="pixel-text text-center">
            <div className="text-2xl mb-1">🪵</div>
            <div className="text-xs text-muted-foreground">WOOD</div>
            <div className="text-xl text-primary">{Math.floor(resources.wood)}</div>
          </div>
        </div>
        <div className="retro-border bg-card p-4 scanline">
          <div className="pixel-text text-center">
            <div className="text-2xl mb-1">🪨</div>
            <div className="text-xs text-muted-foreground">STONE</div>
            <div className="text-xl text-primary">{Math.floor(resources.stone)}</div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="retro-border bg-card p-6 scanline">
        <h2 className="pixel-text text-xl text-primary mb-4 text-center">
          &gt; ACTIONS &lt;
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button
            onClick={() => gatherResource("food", 5)}
            className="retro-border bg-secondary hover:bg-secondary/80 text-secondary-foreground pixel-text h-20"
          >
            HUNT
            <br />
            +5 FOOD
          </Button>
          <Button
            onClick={() => gatherResource("wood", 3)}
            className="retro-border bg-secondary hover:bg-secondary/80 text-secondary-foreground pixel-text h-20"
          >
            CHOP
            <br />
            +3 WOOD
          </Button>
          <Button
            onClick={() => gatherResource("stone", 2)}
            className="retro-border bg-secondary hover:bg-secondary/80 text-secondary-foreground pixel-text h-20"
          >
            MINE
            <br />
            +2 STONE
          </Button>
          <Button
            onClick={buildHut}
            className="retro-border bg-accent hover:bg-accent/80 text-accent-foreground pixel-text h-20 animate-pulse-glow"
          >
            BUILD HUT
            <br />
            <span className="text-xs">10W + 5S</span>
          </Button>
        </div>
      </div>

      {/* Info Panel */}
      <div className="retro-border bg-card p-4 scanline">
        <div className="pixel-text text-xs text-muted-foreground text-center">
          GATHER RESOURCES • BUILD HUTS TO INCREASE POPULATION • SURVIVE!
          <br />
          AUTO-FOOD GENERATION: {population * 0.5}/3s
        </div>
      </div>
    </div>
  );
};
