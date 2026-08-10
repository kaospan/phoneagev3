import type { SolverTrace } from "./trace/trace";
import { reconstructState } from "./trace/trace";

const CELL_COLORS: Record<number, string> = {
  0: "#4a4a4a", 1: "#ef4444", 2: "#78716c", 3: "#22c55e", 4: "#3b82f6", 5: "#0f172a",
  6: "#a16207", 7: "#f97316", 8: "#f97316", 9: "#f97316", 10: "#f97316", 11: "#f97316",
  12: "#f97316", 13: "#f97316", 14: "#dc2626", 15: "#16a34a", 16: "#dc2626", 17: "#16a34a",
  18: "#0ea5e9", 19: "#a855f7", 20: "#facc15",
};

export function generateSolverTraceHTML(trace: SolverTrace): string {
  const nodes = Array.from(trace.nodes.values());
  const goalSet = new Set(trace.goalCaves.map((g) => `${g.x},${g.y}`));
  const furthest =
    trace.furthestStateId !== null
      ? trace.furthestStateId
      : nodes[nodes.length - 1]?.id ?? trace.startStateId;
  const initial = trace.lastExpandedStateId ?? furthest ?? trace.startStateId;

  const importantNodes = new Set<number>([
    trace.startStateId,
    furthest,
    initial,
    ...(trace.lastExpandedStateId != null ? [trace.lastExpandedStateId] : []),
  ]);
  for (const node of nodes) {
    if (importantNodes.has(node.id) && !node.renderedState) {
      node.renderedState = reconstructState(trace, node.id);
    }
  }

  const nodesJson = JSON.stringify(nodes.map((n) => {
    const state = n.renderedState;
    return {
      id: n.id,
      parentId: n.parentId,
      action: n.action,
      depth: n.depth,
      expansionOrder: n.expansionOrder,
      playerPos: n.playerPos,
      inventory: n.inventory,
      grid: state?.grid ?? [],
      baseGrid: state?.baseGrid ?? [],
      breakableRockStates: state?.breakableRockStates
        ? Array.from(state.breakableRockStates.entries())
        : [],
      attemptedActions: n.attemptedActions,
      distanceToGoal: n.distanceToGoal,
    };
  }));

  const initialIndex = nodes.findIndex((n) => n.id === initial);
  const startIndex = nodes.findIndex((n) => n.id === trace.startStateId);
  const furthestIndex = nodes.findIndex((n) => n.id === furthest);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Solver Trace - Level ${trace.levelId}</title>
<style>
  :root { --bg: #0f172a; --panel: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  h1 { margin: 0 0 12px; font-size: 20px; line-height: 1.2; }
  .layout { display: grid; grid-template-columns: 1fr 340px; gap: 16px; padding: 16px; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .board { display: grid; gap: 2px; }
  .cell { width: 36px; height: 36px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; border: 2px solid transparent; position: relative; }
  .cell.player::after { content: "😀"; font-size: 20px; }
  .cell.goal { border-color: #ef4444; }
  .meta { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .meta b { color: var(--text); }
  .log { max-height: 320px; overflow: auto; font-size: 12px; line-height: 1.5; }
  .log .line { padding: 2px 0; }
  .log .accepted { color: #22c55e; }
  .log .rejected { color: #ef4444; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  button { background: #334155; color: var(--text); border: 1px solid #475569; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-family: inherit; }
  button:hover { background: #475569; }
</style>
</head>
<body>
<div class="layout">
  <div>
    <h1>Solver Trace - Level ${trace.levelId}</h1>
    <div class="panel" style="margin-bottom:12px">
      <div class="controls">
        <button onclick="jumpFurthest()">Furthest State</button>
        <button onclick="jumpStart()">Start</button>
      </div>
      <div id="board" class="board"></div>
      <div class="meta" style="margin-top:12px">
        <div>State: <b id="stateId">-</b></div>
        <div>Parent: <b id="parentId">-</b></div>
        <div>Action: <b id="action">-</b></div>
        <div>Depth: <b id="depth">-</b></div>
        <div>Expansion: <b id="expansion">-</b></div>
        <div>Dist to goal: <b id="dist">-</b></div>
        <div>End reason: <b id="reason">${trace.endReason}</b></div>
      </div>
    </div>
    <div class="panel">
      <div class="meta"><b>Move history</b></div>
      <div id="history" class="log"></div>
    </div>
  </div>
  <div>
    <div class="panel" style="margin-bottom:12px">
      <div class="meta"><b>Attempted moves at current state</b></div>
      <div id="moves" class="log"></div>
    </div>
    <div class="panel">
      <div class="meta"><b>Statistics</b></div>
      <div class="meta" style="margin-top:8px">
        <div>States generated: <b>${trace.statesGenerated}</b></div>
        <div>Nodes expanded: <b>${trace.nodesExpanded}</b></div>
        <div>Collisions: <b>${trace.collisions.length}</b></div>
        <div>Dead ends: <b>${trace.deadEnds.length}</b></div>
      </div>
    </div>
  </div>
</div>
<script>
  const CELL_COLORS = ${JSON.stringify(CELL_COLORS)};
  const nodes = ${nodesJson};
  const goalSet = new Set(${JSON.stringify(Array.from(goalSet))});
  const startStateId = ${trace.startStateId};
  let currentIdx = ${Math.max(0, initialIndex)};

  function render() {
    const node = nodes[currentIdx];
    if (!node) return;
    const board = document.getElementById('board');
    const grid = Array.isArray(node.grid) ? node.grid : [];
    board.style.gridTemplateColumns = 'repeat(' + (grid[0]?.length || 0) + ', 36px)';
    board.innerHTML = '';
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const v = grid[y][x];
        cell.style.background = CELL_COLORS[v] || '#000';
        cell.textContent = v;
        const key = x+','+y;
        if (goalSet.has(key)) cell.classList.add('goal');
        if (node.playerPos.x === x && node.playerPos.y === y) cell.classList.add('player');
        board.appendChild(cell);
      }
    }
    document.getElementById('stateId').textContent = '#' + node.id;
    document.getElementById('parentId').textContent = node.parentId === null ? 'start' : '#' + node.parentId;
    document.getElementById('action').textContent = node.action;
    document.getElementById('depth').textContent = node.depth;
    document.getElementById('expansion').textContent = node.expansionOrder !== undefined ? '#' + node.expansionOrder : '-';
    document.getElementById('dist').textContent = node.distanceToGoal;

    const history = document.getElementById('history');
    history.innerHTML = '';
    const path = [];
    let cur = node.id;
    while (cur !== undefined && cur !== startStateId) {
      const n = nodes.find(x => x.id === cur);
      if (!n) break;
      path.unshift(n.action);
      cur = n.parentId;
    }
    path.unshift('Start');
    history.innerHTML = path.map(a => '<div class="line">' + a + '</div>').join('');

    document.getElementById('moves').innerHTML = (node.attemptedActions || []).map(a =>
      '<div class="line ' + (a.accepted ? 'accepted' : 'rejected') + '">' +
      (a.accepted ? '✓' : '✗') + ' ' + (a.description || a.actionString) +
      (a.rejectionReason ? ' — ' + a.rejectionReason : '') +
      '</div>'
    ).join('');
  }

  function jump(id) {
    const idx = nodes.findIndex(n => n.id === id);
    if (idx >= 0) currentIdx = idx;
    render();
  }
  function jumpStart() { jump(${trace.startStateId}); }
  function jumpFurthest() { jump(${furthest}); }
  render();
</script>
</body>
</html>`;

  return html;
}
