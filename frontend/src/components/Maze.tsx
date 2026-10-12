import { useRef, useEffect, useMemo, FC } from 'react';
import { ServerFrame } from '../types';

const DEFAULT_GRID = [
  '###########',
  '#S....#...#',
  '#.#####.#.#',
  '#.#...#.#.#',
  '#.#.#.#.#.#',
  '#.#.#...#.#',
  '#.#.#.#.#.#',
  '#...#.###.#',
  '#########.#',
  '#........G#',
  '###########',
];

function computeBfsPath(grid: string[]): [number, number][] {
  let start: [number, number] = [1, 1];
  let goal: [number, number] = [9, 9];
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 11; c++) {
      if (grid[r]?.[c] === 'S') start = [r, c];
      if (grid[r]?.[c] === 'G') goal = [r, c];
    }
  }
  const q: [number, number, [number, number][]][] = [[start[0], start[1], [start]]];
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  while (q.length > 0) {
    const [r, c, path] = q.shift()!;
    if (r === goal[0] && c === goal[1]) return path;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 11 && nc >= 0 && nc < 11 && grid[nr]?.[nc] !== '#') {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          q.push([nr, nc, [...path, [nr, nc]]]);
        }
      }
    }
  }
  return [];
}

interface MazeProps {
  frame: ServerFrame;
}

export const Maze: FC<MazeProps> = ({ frame }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const solvedTimeRef = useRef<number | null>(null);

  const grid = useMemo(() => {
    return frame.grid && frame.grid.length === 11 ? frame.grid : DEFAULT_GRID;
  }, [frame.grid]);

  const optimalPath = useMemo(() => {
    return computeBfsPath(grid);
  }, [grid]);

  useEffect(() => {
    if (frame.stage === 'solved' && solvedTimeRef.current === null) {
      solvedTimeRef.current = performance.now();
    } else if (frame.stage !== 'solved') {
      solvedTimeRef.current = null;
    }
  }, [frame.stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const size = 528;

      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const tileSize = size / 11;

      // 1. Draw base tiles & values
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          const x = c * tileSize;
          const y = r * tileSize;
          const char = grid[r]?.[c] ?? '#';

          if (char === '#') {
            ctx.fillStyle = '#111111';
            ctx.fillRect(x, y, tileSize, tileSize);
          } else {
            // Paper base
            ctx.fillStyle = '#F5F2EA';
            ctx.fillRect(x, y, tileSize, tileSize);

            // Learned value glow
            const val = frame.value[r]?.[c] || 0;
            if (val > 0.005) {
              const alpha = Math.min(val * 0.9, 0.9);
              ctx.fillStyle = `rgba(255, 79, 0, ${alpha})`;
              ctx.fillRect(x, y, tileSize, tileSize);
            }

            // Hairline grid
            ctx.strokeStyle = '#D9D4C7';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tileSize, tileSize);
          }
        }
      }

      // 2. Start marker 'S'
      for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
          if (grid[r]?.[c] === 'S') {
            const sx = c * tileSize + tileSize / 2;
            const sy = r * tileSize + tileSize / 2;
            ctx.fillStyle = '#111111';
            ctx.font = `700 ${Math.round(tileSize * 0.42)}px "Space Grotesk", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', sx, sy);
          } else if (grid[r]?.[c] === 'G') {
            // 3. Goal marker: bordered square with filled inner square
            const gx = c * tileSize;
            const gy = r * tileSize;
            const outerPad = tileSize * 0.2;
            const outerSize = tileSize * 0.6;
            ctx.strokeStyle = '#111111';
            ctx.lineWidth = 2;
            ctx.strokeRect(gx + outerPad, gy + outerPad, outerSize, outerSize);

            const innerPad = tileSize * 0.35;
            const innerSize = tileSize * 0.3;
            ctx.fillStyle = '#111111';
            ctx.fillRect(gx + innerPad, gy + innerPad, innerSize, innerSize);
          }
        }
      }

      // 4. Agent Trail (last 30 positions as fading accent squares)
      if (frame.trail && frame.trail.length > 0) {
        const trailLen = frame.trail.length;
        frame.trail.forEach(([tr, tc], i) => {
          const alpha = ((i + 1) / trailLen) * 0.4;
          const inset = tileSize * 0.28;
          ctx.fillStyle = `rgba(255, 79, 0, ${alpha})`;
          ctx.fillRect(
            tc * tileSize + inset,
            tr * tileSize + inset,
            tileSize - inset * 2,
            tileSize - inset * 2
          );
        });
      }

      // 5. Agent (solid accent square, slightly inset)
      if (frame.agent) {
        const [ar, ac] = frame.agent;
        const agentInset = tileSize * 0.16;
        ctx.fillStyle = '#FF4F00';
        ctx.fillRect(
          ac * tileSize + agentInset,
          ar * tileSize + agentInset,
          tileSize - agentInset * 2,
          tileSize - agentInset * 2
        );
      }

      // 6. Solved: animated 3px ink line along optimal path
      if (frame.stage === 'solved' && solvedTimeRef.current !== null && optimalPath.length > 0) {
        const elapsed = performance.now() - solvedTimeRef.current;
        const duration = 1200; // 1.2s sweep
        const progress = Math.min(elapsed / duration, 1.0);
        const pointsCount = Math.max(1, Math.floor(progress * optimalPath.length));

        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 3;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        for (let i = 0; i < pointsCount; i++) {
          const [pr, pc] = optimalPath[i];
          const px = pc * tileSize + tileSize / 2;
          const py = pr * tileSize + tileSize / 2;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        if (progress < 1.0) {
          animId = requestAnimationFrame(render);
        }
      }

      ctx.restore();
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [frame, grid, optimalPath]);

  return (
    <div className="w-full aspect-square bg-[#F5F2EA] border-2 border-[#111111] overflow-hidden shadow-[3px_3px_0px_#111111]">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};
