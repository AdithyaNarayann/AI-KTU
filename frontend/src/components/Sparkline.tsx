import { FC, useState } from 'react';

interface SparklineProps {
  data: number[];
  optimal?: number;
}

export const Sparkline: FC<SparklineProps> = ({ data, optimal = 32 }) => {
  const height = 36;
  const width = 500;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = data.length > 0 ? data : [200];
  const maxVal = Math.max(200, ...points);
  const minVal = Math.min(optimal, ...points);
  const range = Math.max(1, maxVal - minVal);

  const getX = (i: number) => {
    if (points.length <= 1) return 8;
    return (i / (points.length - 1)) * (width - 16) + 8;
  };

  const getY = (val: number) => {
    const pad = 3;
    return pad + ((maxVal - val) / range) * (height - pad * 2);
  };

  const pathD = points
    .map((val, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)},${getY(val).toFixed(1)}`)
    .join(' ');

  const optimalY = getY(optimal);
  const latestVal = points[points.length - 1];

  const handlePointer = (clientX: number, target: SVGSVGElement) => {
    if (points.length <= 1) return;
    const rect = target.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(relX * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const activeVal = hoverIndex !== null ? points[hoverIndex] : latestVal;
  const activeIdx = hoverIndex !== null ? hoverIndex : points.length - 1;

  return (
    <div className="w-full flex flex-col gap-1 border-t border-[#D9D4C7] pt-2">
      <div className="flex justify-between items-center text-xs text-[#111111]">
        <span className="font-mono text-[11px] text-[#111111]/70 transition-colors">
          {hoverIndex !== null ? (
            <span className="text-[#FF4F00] font-semibold">Attempt {hoverIndex + 1}</span>
          ) : (
            'Steps per attempt'
          )}
        </span>
        <span className="font-mono text-[11px] font-bold text-[#111111] tabular-nums">
          {data.length > 0 ? (
            hoverIndex !== null ? (
              <span className="text-[#FF4F00]">
                {activeVal} steps {activeVal === optimal ? '(optimal)' : `(+${activeVal - optimal})`}
              </span>
            ) : (
              `${latestVal}`
            )
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="w-full h-9 bg-white/40 hover:bg-white/70 border border-[#D9D4C7] px-1 relative transition-colors cursor-crosshair">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible touch-none"
          preserveAspectRatio="none"
          onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget)}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchStart={(e) => {
            if (e.touches[0]) handlePointer(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) handlePointer(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchEnd={() => setHoverIndex(null)}
        >
          {/* Optimal dashed baseline */}
          <line
            x1="0"
            y1={optimalY}
            x2={width}
            y2={optimalY}
            stroke="#111111"
            strokeDasharray="4 3"
            strokeWidth="1"
            strokeOpacity="0.4"
          />

          {/* Steps sparkline: orange line */}
          {points.length > 1 && (
            <path
              d={pathD}
              fill="none"
              stroke="#FF4F00"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active / Hover crosshair */}
          {hoverIndex !== null && points.length > 1 && (
            <line
              x1={getX(hoverIndex)}
              y1={2}
              x2={getX(hoverIndex)}
              y2={height - 2}
              stroke="#111111"
              strokeWidth="1"
              strokeDasharray="2 2"
              strokeOpacity="0.6"
            />
          )}

          {/* Active point circle */}
          {points.length > 0 && (
            <circle
              cx={getX(activeIdx)}
              cy={getY(activeVal)}
              r={hoverIndex !== null ? 3.5 : 2.5}
              fill="#FF4F00"
              stroke="#FFFFFF"
              strokeWidth={hoverIndex !== null ? 1.5 : 0.5}
              className="transition-all"
            />
          )}
        </svg>
      </div>
    </div>
  );
};
export default Sparkline;
