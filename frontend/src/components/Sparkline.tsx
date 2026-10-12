import { FC } from 'react';

interface SparklineProps {
  data: number[];
  optimal?: number;
}

export const Sparkline: FC<SparklineProps> = ({ data, optimal = 32 }) => {
  const height = 36;
  const width = 500;

  const points = data.length > 0 ? data : [200];
  const maxVal = Math.max(200, ...points);
  const minVal = Math.min(optimal, ...points);
  const range = Math.max(1, maxVal - minVal);

  const getX = (i: number) => {
    if (points.length <= 1) return 0;
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

  return (
    <div className="w-full flex flex-col gap-1 border-t border-[#D9D4C7] pt-2">
      <div className="flex justify-between items-center text-xs text-[#111111]">
        <span className="font-mono uppercase tracking-wider text-[10px] font-semibold text-[#111111]/80">
          Steps per attempt
        </span>
        <span className="font-mono text-[11px] font-bold text-[#111111]">
          {data.length > 0 ? `${latestVal} steps` : '—'}
        </span>
      </div>

      <div className="w-full h-9 bg-white/40 border border-[#D9D4C7] px-1 relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Optimal dashed baseline */}
          <line
            x1="0"
            y1={optimalY}
            x2={width}
            y2={optimalY}
            stroke="#D9D4C7"
            strokeDasharray="4 3"
            strokeWidth="1"
          />

          {/* Steps sparkline */}
          {points.length > 1 && (
            <path
              d={pathD}
              fill="none"
              stroke="#111111"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Latest point circle */}
          {points.length > 1 && (
            <circle
              cx={getX(points.length - 1)}
              cy={getY(latestVal)}
              r="2.5"
              fill="#FF4F00"
            />
          )}
        </svg>
      </div>
    </div>
  );
};
