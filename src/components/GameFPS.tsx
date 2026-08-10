import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { themes, type ColorTheme } from '@/data/levels';
import {
  bucketGridForFps,
  FLOOR_THICKNESS,
  WALL_HEIGHT,
  WATER_DEPTH,
  type FpsArrowPropArchetype,
} from '@/lib/fpsArchetypes';
import { createBreakableRockTileCanvas, createVortexIconCanvas } from '@/lib/canvasIcons';
import { findGoalCaves } from '@/game/caves';

// FPS mode's own eye-level camera + miniature-diorama renderer. Deliberately separate from
// Game3D.tsx's chase/orbit camera pipeline — reads the same canonical grid/player state as every
// other view mode, but owns its own Canvas, camera rig, and geometry. Movement (WASD) stays fully
// owned by useGameControls.ts's existing facing-relative remap for viewMode === "fps"; this
// component only ever touches camera position/rotation for presentation, never player state.

type PlayerFacing = 'up' | 'right' | 'down' | 'left';

interface FpsPlayer {
  id: string;
  pos: { x: number; y: number };
  facing: PlayerFacing;
  color: string;
  isLocal?: boolean;
  teleportWarpTicksLeft?: number;
}

interface GameFPSProps {
  grid: number[][];
  cavePos: { x: number; y: number };
  selectedArrow?: { x: number; y: number } | null;
  selectorPos?: { x: number; y: number } | null;
  theme?: ColorTheme;
  players: FpsPlayer[];
  localPlayerId?: string;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
  rotateUpright?: boolean;
  crumbleAnimations?: Map<string, number>;
  isMobile?: boolean;
}

const FPS_EYE_HEIGHT = 0.6;
const CRUMBLE_ANIMATION_TICKS = 42;
const WATER_COLOR = '#3f7fb0';
// Arrow cones tip sideways per-instance (see eulerForWorldDir), so unlike stone/breakable they
// can't have their "sits on the floor" offset baked into the geometry itself — that offset would
// get rotated along with the tip. Lifting the instance position clear of the floor instead.
const ARROW_LIFT = 0.22;

// Grid-facing -> world-space forward vector, matching Game3D.tsx's worldForwardByFacing exactly
// (Game3D.tsx:44-49) — grid "down" is +Z, "up" is -Z, "right" is +X, "left" is -X. Used with
// camera.lookAt() rather than a hand-picked Euler angle, since a camera's neutral forward (-Z) is
// not the same reference frame as a character mesh's neutral orientation.
const worldForwardByFacing: Record<PlayerFacing, { x: number; z: number }> = {
  up: { x: 0, z: -1 },
  right: { x: 1, z: 0 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
};

const ARROW_WORLD_DIR: Record<FpsArrowPropArchetype, { x: number; z: number }> = {
  arrowUp: { x: 0, z: -1 },
  arrowRight: { x: 1, z: 0 },
  arrowDown: { x: 0, z: 1 },
  arrowLeft: { x: -1, z: 0 },
};

/** The rotation that tips a shape whose "pointer" axis is +Y so it instead points along a target
 * world-space horizontal direction — computed via THREE's own setFromUnitVectors rather than
 * hand-derived Euler angles, which is exactly the kind of easy-to-get-backwards math that caused
 * the camera-facing bug this file used to have. Cone/pyramid symmetry around its own axis means
 * the unconstrained "roll" setFromUnitVectors leaves free doesn't matter here. */
const eulerForWorldDir = (fx: number, fz: number): THREE.Euler => {
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(fx, 0, fz).normalize()
  );
  return new THREE.Euler().setFromQuaternion(quaternion);
};

/** Generic three.js instancing helper — a fresh, small duplicate of Game3D.tsx's InstancedMeshSet
 * (Game3D.tsx:1579-1621, not exported from that file) so the two rendering pipelines stay fully
 * decoupled per this feature's requirement of an independent FPS renderer. */
const InstancedMeshSet = ({
  positions,
  geometry,
  material,
  castShadow = false,
  receiveShadow = true,
  rotation,
}: {
  positions: Array<[number, number, number]>;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  rotation?: THREE.Euler;
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    positions.forEach((pos, index) => {
      tempObject.position.set(pos[0], pos[1], pos[2]);
      if (rotation) tempObject.rotation.copy(rotation);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(index, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, rotation, tempObject]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, positions.length]} castShadow={castShadow} receiveShadow={receiveShadow} />
  );
};

/** Eases the camera toward the player's current grid cell every frame — canonical state still
 * snaps instantly per simulation tick; this is a purely cosmetic visual smoothing layer, matching
 * the spirit (not the code) of Game3D.tsx's Player position lerp.
 *
 * Rotation is intentionally handled differently depending on lock state: while NOT pointer-locked
 * (desktop, before the player clicks to enable mouse-look; or always, on mobile, where pointer
 * lock isn't offered) the camera continuously tracks the player's discrete facing, giving a
 * sensible default view. The instant pointer lock engages, this rig stops touching rotation
 * entirely — PointerLockControls owns camera.quaternion exclusively from then on, so mouse-look
 * can never be fought or overridden by facing changes from ordinary grid movement. */
const FpsCameraRig = ({
  playerPos,
  playerFacing,
  offsetX,
  offsetZ,
  isLocked,
}: {
  playerPos: { x: number; y: number };
  playerFacing: PlayerFacing;
  offsetX: number;
  offsetZ: number;
  isLocked: boolean;
}) => {
  const targetPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  useFrame((state) => {
    targetPos.current.set(playerPos.x + offsetX, FPS_EYE_HEIGHT, playerPos.y + offsetZ);
    if (!initialized.current) {
      state.camera.position.copy(targetPos.current);
      initialized.current = true;
    } else {
      state.camera.position.lerp(targetPos.current, 0.25);
    }
    if (!isLocked) {
      const forward = worldForwardByFacing[playerFacing];
      state.camera.up.set(0, 1, 0);
      state.camera.lookAt(targetPos.current.x + forward.x, targetPos.current.y, targetPos.current.z + forward.z);
    }
  });

  return null;
};

/** A small non-instanced prop sitting on a floor tile — pedestal + accent shape. Used for keys.
 * Low cardinality per level (a handful at most), so individual meshes (not instanced) are fine,
 * matching the plan's guidance for prop-like archetypes. */
const KeyProp = ({ position, color }: { position: [number, number, number]; color: string }) => (
  <group position={position}>
    <mesh position={[0, 0.08, 0]} castShadow>
      <cylinderGeometry args={[0.1, 0.14, 0.16, 8]} />
      <meshStandardMaterial color="#8a8a8a" roughness={0.7} metalness={0.1} />
    </mesh>
    <mesh position={[0, 0.28, 0]} castShadow>
      <sphereGeometry args={[0.12, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.15} emissive={color} emissiveIntensity={0.25} />
    </mesh>
  </group>
);

const LockProp = ({ position, color }: { position: [number, number, number]; color: string }) => (
  <group position={position}>
    <mesh position={[0, 0.16, 0]} castShadow>
      <boxGeometry args={[0.32, 0.28, 0.18]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.15} />
    </mesh>
    <mesh position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[0.12, 0.035, 8, 16, Math.PI]} />
      <meshStandardMaterial color="#c9c9c9" roughness={0.4} metalness={0.4} />
    </mesh>
  </group>
);

const BonusTimeProp = ({ position }: { position: [number, number, number] }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = 0.32 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    ref.current.rotation.y = state.clock.elapsedTime * 1.2;
  });
  return (
    <group position={position}>
      <mesh ref={ref} position={[0, 0.32, 0]} castShadow>
        <icosahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial color="#ffd166" roughness={0.4} metalness={0.2} emissive="#ffb703" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
};

/** A soft dark disc under the local player's feet — the only "player representation" in FPS mode
 * per the product spec (no visible first-person body, no weapon viewmodel), but enough to judge
 * exactly which tile you're currently standing on when looking down. */
const ContactShadow = ({ position }: { position: [number, number, number] }) => (
  <mesh position={[position[0], 0.005, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
    <circleGeometry args={[0.32, 20]} />
    <meshBasicMaterial color="#000000" transparent opacity={0.35} />
  </mesh>
);

/** World-space feedback for the existing keyboard-driven selector (Space/Enter + arrow keys,
 * useGameControls.ts:201-393) — not a new interaction, just making its already-working state
 * visible in a camera that has no cursor to point at anything. A vertical beam reads from any
 * viewing angle (unlike a flat ground outline, which can go edge-on and vanish); the ground ring
 * pinpoints the exact tile. `armed` distinguishes "cursor browsing" (white) from "arrow selected,
 * ready to move" (amber) — mirroring the two states Game3D.tsx shows via its selectorPos-vs-
 * selectedArrow branches (Game3D.tsx:2589-2622,2670-2693), condensed into one marker here. */
const SelectorBeacon = ({ position, armed }: { position: [number, number, number]; armed: boolean }) => {
  const ringRef = useRef<THREE.Mesh>(null);
  const color = armed ? '#ffb703' : '#ffffff';

  useFrame((state) => {
    if (!ringRef.current) return;
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
    ringRef.current.scale.set(pulse, pulse, 1);
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.2, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.5, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

/** Two-tier raised dais used for both the goal cave and the (dimmer, non-goal) start-cave marker —
 * a small physical "structure" rather than a flat decal, per the diorama brief. */
const DaisProp = ({ position, color, isGoal }: { position: [number, number, number]; color: string; isGoal: boolean }) => (
  <group position={position}>
    <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[0.42, 0.46, 0.16, 10]} />
      <meshStandardMaterial color={color} roughness={0.75} metalness={0.05} />
    </mesh>
    <mesh position={[0, 0.22, 0]} castShadow>
      <cylinderGeometry args={[0.16, 0.2, 0.12, 8]} />
      <meshStandardMaterial
        color={color}
        roughness={0.5}
        metalness={0.1}
        emissive={isGoal ? color : '#000000'}
        emissiveIntensity={isGoal ? 0.6 : 0}
      />
    </mesh>
  </group>
);

/** A raised portal riser + rotating vortex, distinct from Game3D.tsx's flat ground-level teleport
 * decal so it silhouettes as an obvious structure even from eye level. `flashing` mirrors
 * Game3D.tsx's own flashingTeleportKeys logic exactly (Game3D.tsx:2176-2182): true while any
 * player is mid-warp *from* this pad (their pos stays frozen here for the warp-flash duration). */
const TeleportProp = ({
  position,
  vortexTexture,
  flashing,
}: {
  position: [number, number, number];
  vortexTexture: THREE.CanvasTexture | null;
  flashing: boolean;
}) => {
  const vortexRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (vortexRef.current) vortexRef.current.rotation.z = state.clock.elapsedTime * 0.9;
    if (flashRef.current) {
      flashRef.current.opacity = flashing ? Math.abs(Math.sin(state.clock.elapsedTime * 14)) : 0;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.38, 0.42, 0.14, 12]} />
        <meshStandardMaterial color="#2d2a3a" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.045, 8, 20]} />
        <meshStandardMaterial color="#4dd0e1" roughness={0.4} metalness={0.3} emissive="#2ea3b0" emissiveIntensity={0.5} />
      </mesh>
      {vortexTexture && (
        <mesh ref={vortexRef} position={[0, 0.145, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.32, 24]} />
          <meshStandardMaterial map={vortexTexture} transparent roughness={0.5} emissive="#7fe9f2" emissiveIntensity={0.3} />
        </mesh>
      )}
      <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial ref={flashRef} color="#ffffff" transparent opacity={0} />
      </mesh>
      <pointLight position={[0, 0.4, 0]} intensity={0.5} color="#4dd0e1" distance={2.5} />
    </group>
  );
};

/** A breakable rock mid-crumble — scales down and fades out as progress approaches
 * CRUMBLE_ANIMATION_TICKS, mirroring the progress/CRUMBLE_ANIMATION_TICKS math Game3D.tsx uses for
 * the same transition (Game3D.tsx:1632-1636), reimplemented fresh for this renderer. */
const CrumblingBreakableProp = ({
  position,
  progress,
  material,
}: {
  position: [number, number, number];
  progress: number;
  material: THREE.Material;
}) => {
  const remaining = 1 - Math.min(1, progress / CRUMBLE_ANIMATION_TICKS);
  return (
    <mesh position={[position[0], 0.15 * remaining, position[2]]} scale={[1, remaining, 1]} castShadow receiveShadow>
      <boxGeometry args={[0.8, 0.3, 0.8]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

const FpsDiorama = ({
  grid,
  cavePos,
  offsetX,
  offsetZ,
  themeColors,
  crumbleAnimations,
  players,
  focusPlayerWorldPos,
  selectorPos,
  selectedArrow,
}: {
  grid: number[][];
  cavePos: { x: number; y: number };
  offsetX: number;
  offsetZ: number;
  themeColors: (typeof themes)[ColorTheme];
  crumbleAnimations: Map<string, number>;
  players: FpsPlayer[];
  focusPlayerWorldPos: [number, number, number];
  selectorPos?: { x: number; y: number } | null;
  selectedArrow?: { x: number; y: number } | null;
}) => {
  const floorGeometry = useMemo(() => new THREE.BoxGeometry(0.96, FLOOR_THICKNESS, 0.96), []);
  const wallGeometry = useMemo(() => new THREE.BoxGeometry(0.9, WALL_HEIGHT, 0.9), []);
  const waterGeometry = useMemo(() => new THREE.BoxGeometry(0.96, 0.06, 0.96), []);
  // Prop bucket positions are anchored at the tile's floor-top (y=0) — stone/breakable are never
  // rotated per-instance, so translating the geometry once (baking the "base sits at y=0" offset
  // into its vertices) is safe and means every downstream position can just mean "base here."
  const stoneGeometry = useMemo(() => new THREE.CylinderGeometry(0.32, 0.38, 0.5, 6).translate(0, 0.25, 0), []);
  const breakableGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.3, 0.8).translate(0, 0.15, 0), []);
  // NOT translated: arrow cones get a per-instance tip rotation (see arrowRotations below), so a
  // baked vertex offset would get rotated away from "resting on the tile" too. Their instance
  // position is nudged up by ARROW_LIFT instead (see props.arrowX usage).
  const arrowGeometry = useMemo(() => new THREE.ConeGeometry(0.22, 0.4, 10), []);

  const floorMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: themeColors.floor, roughness: 0.85, metalness: 0.05 }),
    [themeColors.floor]
  );
  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: themeColors.wall, roughness: 0.8, metalness: 0.05 }),
    [themeColors.wall]
  );
  const waterMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: WATER_COLOR, roughness: 0.5, metalness: 0.1 }),
    []
  );
  const stoneMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: themeColors.stone, roughness: 0.8, metalness: 0.05 }),
    [themeColors.stone]
  );
  const arrowMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: themeColors.arrow, roughness: 0.7, metalness: 0.1 }),
    [themeColors.arrow]
  );
  const breakableMaterial = useMemo(() => {
    const canvas = createBreakableRockTileCanvas(256, { base: themeColors.breakable });
    if (!canvas) return new THREE.MeshStandardMaterial({ color: themeColors.breakable, roughness: 0.8 });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0.05 });
  }, [themeColors.breakable]);
  // Hoisted once (not per-pad-instance) — the same fix as breakableMaterial above.
  const vortexTexture = useMemo(() => {
    const canvas = createVortexIconCanvas(256);
    if (!canvas) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  const arrowRotations = useMemo(
    () => ({
      arrowUp: eulerForWorldDir(ARROW_WORLD_DIR.arrowUp.x, ARROW_WORLD_DIR.arrowUp.z),
      arrowRight: eulerForWorldDir(ARROW_WORLD_DIR.arrowRight.x, ARROW_WORLD_DIR.arrowRight.z),
      arrowDown: eulerForWorldDir(ARROW_WORLD_DIR.arrowDown.x, ARROW_WORLD_DIR.arrowDown.z),
      arrowLeft: eulerForWorldDir(ARROW_WORLD_DIR.arrowLeft.x, ARROW_WORLD_DIR.arrowLeft.z),
    }),
    []
  );

  const { ground, props } = useMemo(() => bucketGridForFps(grid, offsetX, offsetZ), [grid, offsetX, offsetZ]);

  const lift = (positions?: Array<[number, number, number]>) =>
    (positions ?? []).map(([x, y, z]) => [x, y + ARROW_LIFT, z] as [number, number, number]);
  const arrowUpPositions = useMemo(() => lift(props.arrowUp), [props.arrowUp]);
  const arrowRightPositions = useMemo(() => lift(props.arrowRight), [props.arrowRight]);
  const arrowDownPositions = useMemo(() => lift(props.arrowDown), [props.arrowDown]);
  const arrowLeftPositions = useMemo(() => lift(props.arrowLeft), [props.arrowLeft]);

  // Mirrors Game3D.tsx's flashingTeleportKeys exactly (Game3D.tsx:2176-2182) — a player mid-warp
  // stays frozen at the origin pad's grid position for the flash duration, so that position is
  // what identifies which pad should be strobing.
  const flashingTeleportKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of players) {
      if ((p.teleportWarpTicksLeft ?? 0) > 0) keys.add(`${p.pos.x},${p.pos.y}`);
    }
    return keys;
  }, [players]);

  const goalCaves = useMemo(() => findGoalCaves(grid, cavePos), [grid, cavePos]);
  const startCaves = useMemo(() => {
    const positions: Array<[number, number, number]> = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 18) positions.push([x + offsetX, 0, y + offsetZ]);
      }
    }
    return positions;
  }, [grid, offsetX, offsetZ]);

  const { stableBreakable, crumbling } = useMemo(() => {
    const stable: Array<[number, number, number]> = [];
    const crumblingList: Array<{ pos: [number, number, number]; progress: number }> = [];
    for (const pos of props.breakable ?? []) {
      const gridX = Math.round(pos[0] - offsetX);
      const gridY = Math.round(pos[2] - offsetZ);
      const progress = crumbleAnimations.get(`${gridX},${gridY}`);
      if (progress !== undefined) {
        crumblingList.push({ pos, progress });
      } else {
        stable.push(pos);
      }
    }
    return { stableBreakable: stable, crumbling: crumblingList };
  }, [props.breakable, crumbleAnimations, offsetX, offsetZ]);

  return (
    <>
      <InstancedMeshSet positions={ground.floor} geometry={floorGeometry} material={floorMaterial} receiveShadow />
      <InstancedMeshSet positions={ground.wall} geometry={wallGeometry} material={wallMaterial} castShadow receiveShadow />
      <InstancedMeshSet positions={ground.water} geometry={waterGeometry} material={waterMaterial} receiveShadow />
      <InstancedMeshSet positions={props.stone ?? []} geometry={stoneGeometry} material={stoneMaterial} castShadow receiveShadow />
      <InstancedMeshSet positions={stableBreakable} geometry={breakableGeometry} material={breakableMaterial} castShadow receiveShadow />

      <InstancedMeshSet positions={arrowUpPositions} geometry={arrowGeometry} material={arrowMaterial} rotation={arrowRotations.arrowUp} castShadow />
      <InstancedMeshSet positions={arrowRightPositions} geometry={arrowGeometry} material={arrowMaterial} rotation={arrowRotations.arrowRight} castShadow />
      <InstancedMeshSet positions={arrowDownPositions} geometry={arrowGeometry} material={arrowMaterial} rotation={arrowRotations.arrowDown} castShadow />
      <InstancedMeshSet positions={arrowLeftPositions} geometry={arrowGeometry} material={arrowMaterial} rotation={arrowRotations.arrowLeft} castShadow />

      {crumbling.map(({ pos, progress }, i) => (
        <CrumblingBreakableProp key={`crumbling-${i}`} position={pos} progress={progress} material={breakableMaterial} />
      ))}

      {(props.keyRed ?? []).map((pos, i) => <KeyProp key={`keyRed-${i}`} position={pos} color="#e6483c" />)}
      {(props.keyGreen ?? []).map((pos, i) => <KeyProp key={`keyGreen-${i}`} position={pos} color="#3ecf5f" />)}
      {(props.lockRed ?? []).map((pos, i) => <LockProp key={`lockRed-${i}`} position={pos} color="#e6483c" />)}
      {(props.lockGreen ?? []).map((pos, i) => <LockProp key={`lockGreen-${i}`} position={pos} color="#3ecf5f" />)}
      {(props.bonusTime ?? []).map((pos, i) => <BonusTimeProp key={`bonusTime-${i}`} position={pos} />)}
      {(props.teleport ?? []).map((pos, i) => {
        const gridX = Math.round(pos[0] - offsetX);
        const gridY = Math.round(pos[2] - offsetZ);
        return (
          <TeleportProp
            key={`teleport-${i}`}
            position={pos}
            vortexTexture={vortexTexture}
            flashing={flashingTeleportKeys.has(`${gridX},${gridY}`)}
          />
        );
      })}

      {goalCaves.map((cave, i) => (
        <DaisProp key={`goal-${i}`} position={[cave.x + offsetX, 0, cave.y + offsetZ]} color={themeColors.cave} isGoal />
      ))}
      {startCaves.map((pos, i) => (
        <DaisProp key={`start-${i}`} position={pos} color="#8a8a8a" isGoal={false} />
      ))}

      <ContactShadow position={focusPlayerWorldPos} />
      {selectedArrow ? (
        <SelectorBeacon position={[selectedArrow.x + offsetX, 0, selectedArrow.y + offsetZ]} armed />
      ) : selectorPos ? (
        <SelectorBeacon position={[selectorPos.x + offsetX, 0, selectorPos.y + offsetZ]} armed={false} />
      ) : null}
    </>
  );
};

export const GameFPS = ({
  grid,
  cavePos,
  theme = 'default',
  players,
  localPlayerId,
  selectorPos,
  selectedArrow,
  onCancelSelection,
  crumbleAnimations,
  isMobile = false,
}: GameFPSProps) => {
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length || 0;
  const offsetX = -gridWidth / 2;
  const offsetZ = -gridHeight / 2;
  const themeColors = themes[theme];
  const [isLocked, setIsLocked] = useState(false);

  const focusPlayer = players.find((p) => p.id === localPlayerId) ?? players[0];
  const focusPlayerPos = focusPlayer?.pos ?? { x: 0, y: 0 };
  const focusPlayerFacing = focusPlayer?.facing ?? 'down';
  const focusPlayerWorldPos: [number, number, number] = [
    focusPlayerPos.x + offsetX,
    0,
    focusPlayerPos.y + offsetZ,
  ];
  // Matches useGameEngine.ts's TELEPORT_WARP_FLASH_TICKS (useGameEngine.ts:92). The 3D pad-side
  // strobe (TeleportProp) is visible in every mode, but only FPS needs this screen-space flash —
  // a chase/top camera can still see the destination pad during the jump; an eye-level camera
  // can't, so the warp needs its own readable cue independent of world geometry (per the product
  // spec's explicit call-out that FPS teleport feedback needs special care).
  const warpTicksLeft = focusPlayer?.teleportWarpTicksLeft ?? 0;
  const warpFlashOpacity = warpTicksLeft > 0 ? Math.min(0.7, (warpTicksLeft / 60) * 0.7) : 0;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          physicallyCorrectLights: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        onClick={() => onCancelSelection?.()}
      >
        <PerspectiveCamera makeDefault position={[0, FPS_EYE_HEIGHT, 0]} fov={75} />
        <FpsCameraRig
          playerPos={focusPlayerPos}
          playerFacing={focusPlayerFacing}
          offsetX={offsetX}
          offsetZ={offsetZ}
          isLocked={isLocked}
        />
        {!isMobile && (
          <PointerLockControls
            makeDefault
            selector=".fps-lock-overlay"
            onLock={() => setIsLocked(true)}
            onUnlock={() => setIsLocked(false)}
          />
        )}

        {/* Deliberately just two lights (vs. Game3D.tsx's 7-light rig, tuned for a distant
            top-down view) — at FPS eye-level proximity, more lights read as videogame glare
            rather than "soft physical miniature." The hemisphere light's ground component keeps
            shadow-side surfaces readable instead of falling to black. */}
        <hemisphereLight intensity={0.55} color={themeColors.ambient} groundColor={themeColors.wall} />
        <directionalLight
          position={[6, 8, 4]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        <FpsDiorama
          grid={grid}
          cavePos={cavePos}
          offsetX={offsetX}
          offsetZ={offsetZ}
          themeColors={themeColors}
          crumbleAnimations={crumbleAnimations ?? new Map()}
          players={players}
          focusPlayerWorldPos={focusPlayerWorldPos}
          selectorPos={selectorPos}
          selectedArrow={selectedArrow}
        />
      </Canvas>

      {warpFlashOpacity > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{ background: `radial-gradient(circle, rgba(255,255,255,${warpFlashOpacity}) 0%, rgba(255,255,255,0) 70%)` }}
        />
      )}

      {!isMobile && !isLocked && (
        <div className="fps-lock-overlay absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/40 text-center text-white">
          <div>
            <div className="text-sm font-bold">Click to look around</div>
            <div className="mt-1 text-xs text-white/70">WASD to move · ESC to release the mouse</div>
          </div>
        </div>
      )}
      {!isMobile && isLocked && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
      )}
    </div>
  );
};
