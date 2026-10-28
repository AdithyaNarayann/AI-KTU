import { useRef, useEffect, FC } from 'react';
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

export interface MazeProps {
  frame?: ServerFrame;
  grid?: string[];
  layer?: 'interactive' | 'beliefs' | 'ground_truth' | 'error';
  valuesGrid?: (number | null)[][];
  policyGrid?: (number | null)[][];
  policyOptimalSets?: (number[] | null)[][];
  showPolicyArrows?: boolean;
  className?: string;
}

const ACTION_DELTAS = [
  [-1, 0], // 0: UP
  [1, 0],  // 1: DOWN
  [0, -1], // 2: LEFT
  [0, 1],  // 3: RIGHT
];

function computeBfsPath(g: string[]): [number, number][] {
  let start: [number, number] = [1, 1];
  let goal: [number, number] = [9, 9];
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 11; c++) {
      if (g[r]?.[c] === 'S') start = [r, c];
      if (g[r]?.[c] === 'G') goal = [r, c];
    }
  }
  const q: [number, number, [number, number][]][] = [[start[0], start[1], [start]]];
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  while (q.length > 0) {
    const [r, c, path] = q.shift()!;
    if (r === goal[0] && c === goal[1]) return path;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 11 && nc >= 0 && nc < 11 && g[nr]?.[nc] !== '#') {
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

export const Maze: FC<MazeProps> = ({
  frame,
  grid: customGrid,
  layer = 'interactive',
  valuesGrid,
  policyGrid,
  policyOptimalSets,
  showPolicyArrows = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cachedGridRef = useRef<string>('');
  const solvedTimeRef = useRef<number | null>(null);

  const activeGrid = customGrid || (frame?.grid && frame.grid.length === 11 ? frame.grid : DEFAULT_GRID);
  const optimalPath = computeBfsPath(activeGrid);
  const isSolved = frame?.stage === 'solved';

  useEffect(() => {
    if (isSolved && solvedTimeRef.current === null) {
      solvedTimeRef.current = performance.now();
    } else if (!isSolved) {
      solvedTimeRef.current = null;
    }
  }, [isSolved]);

  // Pre-render static background to offscreen canvas
  useEffect(() => {
    const gridKey = activeGrid.join('');
    if (staticCanvasRef.current && cachedGridRef.current === gridKey) {
      return;
    }

    const size = 528;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const tileSize = size / 11;

    // 1. Surface slab
    ctx.fillStyle = '#E6EAF0';
    ctx.fillRect(0, 0, size, size);

    // 2. Corridors: carved floor
    const floorColor = '#DCE2EB';
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        if (activeGrid[r]?.[c] !== '#') {
          ctx.fillStyle = floorColor;
          ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
        }
      }
    }

    // 3. Subtle inset shadows for carved feel
    const darkShadow = 'rgba(160, 175, 195, 0.5)';
    const lightHighlight = 'rgba(255, 255, 255, 0.85)';
    const shadowWidth = Math.max(2, tileSize * 0.1);

    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        if (activeGrid[r]?.[c] === '#') continue;

        const x = c * tileSize;
        const y = r * tileSize;

        // Top inner shadow
        if (r === 0 || activeGrid[r - 1]?.[c] === '#') {
          const grad = ctx.createLinearGradient(x, y, x, y + shadowWidth);
          grad.addColorStop(0, darkShadow);
          grad.addColorStop(1, 'rgba(160, 175, 195, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, tileSize, shadowWidth);
        }

        // Left inner shadow
        if (c === 0 || activeGrid[r]?.[c - 1] === '#') {
          const grad = ctx.createLinearGradient(x, y, x + shadowWidth, y);
          grad.addColorStop(0, darkShadow);
          grad.addColorStop(1, 'rgba(160, 175, 195, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, shadowWidth, tileSize);
        }

        // Bottom inner highlight
        if (r === 10 || activeGrid[r + 1]?.[c] === '#') {
          const grad = ctx.createLinearGradient(x, y + tileSize, x, y + tileSize - shadowWidth);
          grad.addColorStop(0, lightHighlight);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y + tileSize - shadowWidth, tileSize, shadowWidth);
        }

        // Right inner highlight
        if (c === 10 || activeGrid[r]?.[c + 1] === '#') {
          const grad = ctx.createLinearGradient(x + tileSize, y, x + tileSize - shadowWidth, y);
          grad.addColorStop(0, lightHighlight);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x + tileSize - shadowWidth, y, shadowWidth, tileSize);
        }
      }
    }

    // 4. Start (S) and Goal (G)
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        const char = activeGrid[r]?.[c];
        const cx = c * tileSize + tileSize / 2;
        const cy = r * tileSize + tileSize / 2;

        if (char === 'S') {
          const radius = tileSize * 0.34;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = '#D6DCE6';
          ctx.fill();

          ctx.strokeStyle = 'rgba(160, 175, 195, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#1A202C';
          ctx.font = `700 ${Math.round(tileSize * 0.42)}px "Manrope Variable", "Manrope", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', cx, cy + 1);
        } else if (char === 'G') {
          const radius = tileSize * 0.34;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = '#D6DCE6';
          ctx.fill();

          ctx.strokeStyle = 'rgba(160, 175, 195, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Glowing orange core
          const coreGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius * 0.65);
          coreGrad.addColorStop(0, '#FFA875');
          coreGrad.addColorStop(0.6, '#FF4F00');
          coreGrad.addColorStop(1, '#D94000');

          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = coreGrad;
          ctx.fill();
        }
      }
    }

    staticCanvasRef.current = offscreen;
    cachedGridRef.current = gridKey;
  }, [activeGrid]);

  // Main rendering loop
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

      // Draw static background
      if (staticCanvasRef.current) {
        ctx.drawImage(staticCanvasRef.current, 0, 0, size, size);
      }

      const tileSize = size / 11;

      // 1. Value heatmap: soft bloom inside corridors
      if (layer === 'interactive' && frame?.value) {
        for (let r = 0; r < 11; r++) {
          for (let c = 0; c < 11; c++) {
            const val = frame.value[r]?.[c] || 0;
            if (val > 0.005 && activeGrid[r]?.[c] !== '#') {
              const cx = c * tileSize + tileSize / 2;
              const cy = r * tileSize + tileSize / 2;
              const maxRadius = tileSize * 0.6;

              const bloomGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
              const alpha = Math.min(val * 0.7, 0.7);
              bloomGrad.addColorStop(0, `rgba(255, 79, 0, ${alpha})`);
              bloomGrad.addColorStop(0.7, `rgba(255, 110, 40, ${alpha * 0.35})`);
              bloomGrad.addColorStop(1, 'rgba(255, 79, 0, 0)');

              ctx.fillStyle = bloomGrad;
              ctx.beginPath();
              ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else if (valuesGrid) {
        let maxV = 1e-4;
        for (let r = 0; r < 11; r++) {
          for (let c = 0; c < 11; c++) {
            const v = valuesGrid[r]?.[c];
            if (v !== null && v !== undefined && Math.abs(v) > maxV) {
              maxV = Math.abs(v);
            }
          }
        }

        for (let r = 0; r < 11; r++) {
          for (let c = 0; c < 11; c++) {
            const v = valuesGrid[r]?.[c];
            if (v !== null && v !== undefined && activeGrid[r]?.[c] !== '#') {
              const cx = c * tileSize + tileSize / 2;
              const cy = r * tileSize + tileSize / 2;
              const maxRadius = tileSize * 0.6;
              const norm = Math.min(1.0, Math.abs(v) / maxV);

              if (norm > 0.01) {
                const bloomGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
                if (layer === 'error') {
                  const alpha = Math.min(norm * 0.75, 0.75);
                  bloomGrad.addColorStop(0, `rgba(220, 38, 38, ${alpha})`);
                  bloomGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
                } else if (layer === 'ground_truth') {
                  const alpha = Math.min(norm * 0.65, 0.65);
                  bloomGrad.addColorStop(0, `rgba(79, 70, 229, ${alpha})`);
                  bloomGrad.addColorStop(1, 'rgba(79, 70, 229, 0)');
                } else {
                  const alpha = Math.min(norm * 0.7, 0.7);
                  bloomGrad.addColorStop(0, `rgba(255, 79, 0, ${alpha})`);
                  bloomGrad.addColorStop(1, 'rgba(255, 79, 0, 0)');
                }

                ctx.fillStyle = bloomGrad;
                ctx.beginPath();
                ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }

      // 2. Policy arrows for report maps
      if (showPolicyArrows) {
        ctx.strokeStyle = '#1A202C';
        ctx.fillStyle = '#1A202C';
        ctx.lineWidth = 1.4;

        for (let r = 0; r < 11; r++) {
          for (let c = 0; c < 11; c++) {
            if (activeGrid[r]?.[c] === '#' || activeGrid[r]?.[c] === 'G') continue;

            const actions: number[] = [];
            if (policyGrid && policyGrid[r]?.[c] !== null && policyGrid[r]?.[c] !== undefined) {
              actions.push(policyGrid[r][c] as number);
            }
            if (policyOptimalSets && policyOptimalSets[r]?.[c]) {
              const optSet = policyOptimalSets[r][c];
              if (optSet && Array.isArray(optSet)) {
                optSet.forEach((a) => {
                  if (!actions.includes(a)) actions.push(a);
                });
              }
            }

            const cx = c * tileSize + tileSize / 2;
            const cy = r * tileSize + tileSize / 2;
            const arrowLen = tileSize * 0.2;

            actions.forEach((a) => {
              const delta = ACTION_DELTAS[a];
              if (!delta) return;
              const [dr, dc] = delta;
              const tipX = cx + dc * arrowLen;
              const tipY = cy + dr * arrowLen;
              const baseX = cx - dc * (arrowLen * 0.35);
              const baseY = cy - dr * (arrowLen * 0.35);

              ctx.beginPath();
              ctx.moveTo(baseX, baseY);
              ctx.lineTo(tipX, tipY);
              ctx.stroke();

              const angle = Math.atan2(dr, dc);
              const headLen = 3.5;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(
                tipX - headLen * Math.cos(angle - Math.PI / 6),
                tipY - headLen * Math.sin(angle - Math.PI / 6)
              );
              ctx.lineTo(
                tipX - headLen * Math.cos(angle + Math.PI / 6),
                tipY - headLen * Math.sin(angle + Math.PI / 6)
              );
              ctx.closePath();
              ctx.fill();
            });
          }
        }
      }

      // 3. Fading trail dots
      if (layer === 'interactive' && frame?.trail && frame.trail.length > 0) {
        const trailLen = frame.trail.length;
        frame.trail.forEach(([tr, tc], i) => {
          const cx = tc * tileSize + tileSize / 2;
          const cy = tr * tileSize + tileSize / 2;
          const alpha = 0.12 + (i / trailLen) * 0.45;
          const dotRadius = Math.max(2, tileSize * 0.07 * (0.6 + 0.4 * (i / trailLen)));

          ctx.beginPath();
          ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 79, 0, ${alpha})`;
          ctx.fill();
        });
      }

      // 4. Glossy orange orb agent
      if (layer === 'interactive' && frame?.agent) {
        const [ar, ac] = frame.agent;
        const cx = ac * tileSize + tileSize / 2;
        const cy = ar * tileSize + tileSize / 2;
        const orbRadius = tileSize * 0.3;

        // Shadow under orb
        ctx.beginPath();
        ctx.arc(cx + 1.5, cy + 1.5, orbRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(160, 175, 195, 0.4)';
        ctx.fill();

        // Orb radial gradient
        const orbGrad = ctx.createRadialGradient(
          cx - orbRadius * 0.3,
          cy - orbRadius * 0.3,
          orbRadius * 0.05,
          cx,
          cy,
          orbRadius
        );
        orbGrad.addColorStop(0, '#FFA875');
        orbGrad.addColorStop(0.35, '#FF5E14');
        orbGrad.addColorStop(0.75, '#FF4F00');
        orbGrad.addColorStop(1, '#B33600');

        ctx.beginPath();
        ctx.arc(cx, cy, orbRadius, 0, Math.PI * 2);
        ctx.fillStyle = orbGrad;
        ctx.fill();

        // Highlight
        ctx.beginPath();
        ctx.arc(
          cx - orbRadius * 0.3,
          cy - orbRadius * 0.3,
          orbRadius * 0.2,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }

      // 5. Solved path glowing line sweep
      if (layer === 'interactive' && frame?.stage === 'solved' && solvedTimeRef.current !== null && optimalPath.length > 0) {
        const elapsed = performance.now() - solvedTimeRef.current;
        const duration = 1200;
        const progress = Math.min(elapsed / duration, 1.0);
        const pointsCount = Math.max(1, Math.floor(progress * optimalPath.length));

        ctx.save();
        ctx.shadowColor = 'rgba(255, 79, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#FF4F00';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (let i = 0; i < pointsCount; i++) {
          const [pr, pc] = optimalPath[i];
          const px = pc * tileSize + tileSize / 2;
          const py = pr * tileSize + tileSize / 2;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFF1EA';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

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
  }, [
    frame,
    activeGrid,
    optimalPath,
    layer,
    valuesGrid,
    policyGrid,
    policyOptimalSets,
    showPolicyArrows,
  ]);

  return (
    <div
      className={`w-full aspect-square bg-[#E6EAF0] overflow-hidden rounded-[20px] p-2 neu-raised-md ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block rounded-[14px]"
      />
    </div>
  );
};
export default Maze;
