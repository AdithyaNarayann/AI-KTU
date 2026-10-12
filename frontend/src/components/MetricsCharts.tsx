import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { HistoryPoint } from '../types';

interface MetricsChartsProps {
  history: HistoryPoint[];
}

export const MetricsCharts: React.FC<MetricsChartsProps> = ({ history }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Return Moving Average Chart */}
      <div className="rounded-xl border border-border bg-[#0f172a] p-4 shadow-xl flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
            Episode Return (Moving Average)
          </span>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            {history.length > 0 ? history[history.length - 1].ret_ma.toFixed(2) : '0.00'}
          </span>
        </div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="episode" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" domain={[-1.2, 1.3]} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#334155',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
              <Line
                type="monotone"
                dataKey="ret_ma"
                name="Return MA"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Success Rate Chart */}
      <div className="rounded-xl border border-border bg-[#0f172a] p-4 shadow-xl flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
            Greedy Success Rate (%)
          </span>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            {history.length > 0
              ? `${(history[history.length - 1].greedy_success * 100).toFixed(0)}%`
              : '0%'}
          </span>
        </div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="episode" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" domain={[0, 1]} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#334155',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
              <Line
                type="monotone"
                dataKey="greedy_success"
                name="Greedy Success"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="success_ma"
                name="Training Success MA"
                stroke="#a855f7"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
