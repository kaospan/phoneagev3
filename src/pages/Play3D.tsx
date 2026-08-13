import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { Cell3D, Level3D, Position3D } from "@/game/3d/levelTypes";
import { levels3D } from "@/game/3d/levels3D";
import "./Play3D.css";

const key = (p: Position3D) => `${p.x}:${p.z}`;
const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];

function heightAt(level: Level3D, p: Position3D) {
  return level.cells.find(c => c.x === p.x && c.z === p.z)?.height ?? 0;
}

function legalMove(level: Level3D, from: Position3D, to: Position3D) {
  if (to.x < 0 || to.z < 0 || to.x >= level.width || to.z >= level.depth) return false;
  const target = heightAt(level, to);
  const current = heightAt(level, from);
  return target > 0 && target <= current + 1;
}

function Block({ cell, goal }: { cell: Cell3D; goal: boolean }) {
  return <group position={[cell.x, cell.height / 2, cell.z]}>
    <mesh castShadow receiveShadow>
      <boxGeometry args={[0.92, cell.height, 0.92]} />
      <meshStandardMaterial color={goal ? "#d6a84f" : cell.height >= 4 ? "#6b6256" : cell.height >= 3 ? "#827668" : cell.height === 2 ? "#9b8d7b" : "#b0a18e"} roughness={0.9} />
    </mesh>
    {goal && <mesh position={[0, cell.height / 2 + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.3, 24]} />
      <meshBasicMaterial color="#f5d77b" />
    </mesh>}
  </group>;
}

function Player({ position, height }: { position: Position3D; height: number }) {
  return <group position={[position.x, height + 0.38, position.z]}>
    <mesh castShadow>
      <capsuleGeometry args={[0.22, 0.32, 4, 8]} />
      <meshStandardMaterial color="#2d2924" roughness={0.65} />
    </mesh>
    <mesh position={[0, 0.28, 0]}>
      <sphereGeometry args={[0.2, 16, 12]} />
      <meshStandardMaterial color="#d4b38a" roughness={0.8} />
    </mesh>
  </group>;
}

function Scene({ level, player }: { level: Level3D; player: Position3D }) {
  const cells = useMemo(() => level.cells, [level]);
  const playerHeight = heightAt(level, player);
  return <>
    <ambientLight intensity={1.6} />
    <directionalLight position={[6, 10, 4]} intensity={2.2} castShadow />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(level.width - 1) / 2, -0.03, (level.depth - 1) / 2]} receiveShadow>
      <planeGeometry args={[level.width + 1, level.depth + 1]} />
      <meshStandardMaterial color="#29251f" roughness={1} />
    </mesh>
    {cells.map(cell => <Block key={`${cell.x}:${cell.z}`} cell={cell} goal={cell.x === level.goal.x && cell.z === level.goal.z} />)}
    <Player position={player} height={playerHeight} />
  </>;
}

export default function Play3D() {
  const [levelIndex, setLevelIndex] = useState(0);
  const level = levels3D[levelIndex];
  const [player, setPlayer] = useState(level.playerStart);
  const [moves, setMoves] = useState(0);
  const [complete, setComplete] = useState(false);

  const reset = useCallback(() => {
    setPlayer(level.playerStart); setMoves(0); setComplete(false);
  }, [level]);

  const move = useCallback((dx: number, dz: number) => {
    if (complete) return;
    const next = { x: player.x + dx, z: player.z + dz };
    if (!legalMove(level, player, next)) return;
    const nextMoves = moves + 1;
    setPlayer(next); setMoves(nextMoves);
    if (key(next) === key(level.goal)) setComplete(true);
  }, [complete, level, moves, player]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const map: Record<string, [number, number]> = { ArrowRight: [1, 0], d: [1, 0], ArrowLeft: [-1, 0], a: [-1, 0], ArrowDown: [0, 1], s: [0, 1], ArrowUp: [0, -1], w: [0, -1] };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault(); move(...direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const selectLevel = (index: number) => { setLevelIndex(index); setPlayer(levels3D[index].playerStart); setMoves(0); setComplete(false); };

  return <main className="play3d">
    <header className="play3d__header">
      <div><span className="eyebrow">PHONEAGE 3D</span><h1>{level.name}</h1></div>
      <div className="stats"><span>LEVEL {levelIndex + 1}/10</span><span>MOVES {moves}</span></div>
    </header>
    <section className="play3d__board">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [8, 9, 8], fov: 35 }}>
        <color attach="background" args={["#171512"]} />
        <OrthographicCamera makeDefault position={[9, 9, 9]} zoom={62} near={0.1} far={100} />
        <Scene level={level} player={player} />
        <OrbitControls enablePan={false} minPolarAngle={0.9} maxPolarAngle={1.25} minAzimuthAngle={-Math.PI / 2} maxAzimuthAngle={Math.PI / 2} minZoom={40} maxZoom={100} />
      </Canvas>
      {complete && <div className="play3d__complete"><strong>LEVEL COMPLETE</strong><span>{moves} moves</span><button onClick={() => selectLevel(Math.min(levelIndex + 1, levels3D.length - 1))}>NEXT LEVEL</button></div>}
    </section>
    <nav className="play3d__controls" aria-label="3D controls">
      <div className="dpad"><button onClick={() => move(0, -1)}>↑</button><div><button onClick={() => move(-1, 0)}>←</button><button onClick={() => move(0, 1)}>↓</button><button onClick={() => move(1, 0)}>→</button></div></div>
      <div className="level-picker">{levels3D.map((item, i) => <button key={item.id} className={i === levelIndex ? "active" : ""} onClick={() => selectLevel(i)}>{i + 1}</button>)}</div>
      <button className="reset" onClick={reset}>RESET</button>
    </nav>
    <p className="hint">Move one height at a time. A taller block is a wall; lower blocks can be descended onto.</p>
  </main>;
}
