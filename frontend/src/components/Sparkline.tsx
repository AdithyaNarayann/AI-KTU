import { FC, useState } from 'react';

interface SparklineProps {
  data: number[];
  optimal?: number;
}

export const Sparkline: FC<SparklineProps> = ({ data, optimal = 32 }) => {
  const height = 44;
  const width = 500;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = data.length > 0 ? data : [200];
  const maxVal = Math.max(200, ...points);
  const minVal = Math.min(optimal, ...points);
  const range = Math.max(1, maxVal - minVal);

  const getX = (i: number) => {
    if (points.length <= 1) return 10;
    return (i / (points.length - 1)) * (width - 20) + 10;
  };

  const getY = (val: number) => {
    const pad = 6;
    return pad + ((maxVal - val) / range) * (height - pad * 2);
  };

  const pathD = points
    .map((val, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)},${getY(val).toFixed(1)}`)
    .join(' ');

  const optimalY = getY(optimal);
  const latestVal = points[points.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.max(10, Math.min(width - 10, mouseX));
    const ratio = (clampedX - 10) / (width - 20);
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const activeIdx = hoverIndex !== null ? hoverIndex : points.length - 1;
  const displayVal = points[activeIdx];

  return (
    <div className="w-full flex flex-col gap-1.5 pt-0.5">
      <div className="flex justify-between items-baseline text-xs text-[#5A6A80] px-0.5">
        <span>Steps per attempt (lower is better)</span>
        <span className="font-semibold tabular-nums text-[#1A202C]">
          {data.length > 0 ? (
            hoverIndex !== null ? (
              <span>
                Attempt {hoverIndex + 1}: <strong className="text-[#B33600]">{displayVal}</strong>
              </span>
            ) : (
              <span>
                Latest: <strong>{latestVal}</strong>
              </span>
            )
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="w-full h-11 bg-[#E6EAF0] neu-inset-sm p-1 relative overflow-hidden rounded-[12px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible cursor-crosshair"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Optimal dashed baseline */}
          <line
            x1="6"
            y1={optimalY}
            x2={width - 6}
            y2={optimalY}
            stroke="#5A6A80"
            strokeDasharray="3 3"
            strokeWidth="1"
            strokeOpacity="0.4"
          />

          {/* Steps sparkline */}
          {points.length > 1 && (
            <path
              d={pathD}
              fill="none"
              stroke="#FF4F00"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Active point indicator */}
          {points.length > 0 && (
            <circle
              cx={getX(activeIdx)}
              cy={getY(displayVal)}
              r="3.5"
              fill="#FF4F00"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          )}
        </svg>
      </div>
    </div>
  );
};
export default Sparkline;
