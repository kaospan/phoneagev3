import React from 'react';
import { HelpCircle, Keyboard, MousePointer2, Smartphone, RotateCw, ArrowUp, ArrowLeft, ArrowRight, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const KeyCap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex min-w-8 items-center justify-center rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs font-bold text-foreground">
    {children}
  </span>
);

const Step: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="rounded-lg border border-border/60 bg-background/60 p-3">
    <div className="flex items-center gap-2">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
    </div>
    <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </div>
);

export const HowToPlayDialog: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 w-8 p-0 hover:bg-primary/20"
          title="How to play"
          aria-label="How to play"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How To Play</DialogTitle>
          <DialogDescription>
            Move the hero to the cave. Arrows can slide across void and water; keys open matching locks.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pc">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pc">PC</TabsTrigger>
            <TabsTrigger value="mobile">Mobile</TabsTrigger>
          </TabsList>

          <TabsContent value="pc" className="mt-3 space-y-3">
            <Step title="Move The Hero" icon={<Keyboard className="h-4 w-4" />}>
              Use <KeyCap>Arrow Keys</KeyCap> (or <KeyCap>W</KeyCap><KeyCap>A</KeyCap><KeyCap>S</KeyCap><KeyCap>D</KeyCap>) to move one tile.
              Moves are counted at the top.
            </Step>

            <Step title="Select And Move Arrow Blocks" icon={<MousePointer2 className="h-4 w-4" />}>
              Double click an arrow block to select it, then use the arrow keys to slide it.
              You can also navigate selection with the keyboard and press <KeyCap>Space</KeyCap> or <KeyCap>Enter</KeyCap>.
            </Step>

            <Step title="Glide Rules" icon={<ArrowRight className="h-4 w-4" />}>
              Standing on an arrow and pushing in its direction will glide over <b>void</b> and <b>water</b>.
              Remote arrows can glide over <b>void</b>, <b>water</b>, and <b>fire</b>.
            </Step>

            <Step title="Keys, Locks, Breakables" icon={<ArrowDown className="h-4 w-4" />}>
              Pick up red or green keys to open matching locks. Stepping off a breakable rock makes it crumble.
            </Step>
          </TabsContent>

          <TabsContent value="mobile" className="mt-3 space-y-3">
            <Step title="Rotate To Landscape" icon={<RotateCw className="h-4 w-4" />}>
              The game requires landscape on mobile so the whole board fits on screen.
            </Step>

            <Step title="Move The Hero" icon={<Smartphone className="h-4 w-4" />}>
              Use the on-screen controls (D-pad or thumbstick) to move tile-by-tile.
            </Step>

            <Step title="Select And Move Arrow Blocks" icon={<ArrowUp className="h-4 w-4" />}>
              Tap or double tap arrow blocks to select them, then use the on-screen arrows to slide them.
            </Step>

            <Step title="Quick Legend" icon={<ArrowLeft className="h-4 w-4" />}>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-black/80" /> void
                <span className="inline-block h-3 w-3 rounded bg-blue-500/70" /> water
                <span className="inline-block h-3 w-3 rounded bg-red-500/70" /> fire
                <span className="inline-block h-3 w-3 rounded bg-emerald-500/70" /> cave
              </span>
            </Step>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

