import { FC, useState, useEffect } from 'react';
import { PerformanceReport, BenchmarkResult } from '../types';
import { Maze } from './Maze';

interface ReportModalProps {
  report: PerformanceReport;
  isOpen: boolean;
  onClose: () => void;
  onRunBenchmark: (seeds: number) => void;
  isBenchmarking: boolean;
  benchmarkProgress: { done: number; total: number } | null;
  benchmarkResult: BenchmarkResult | null;
}

export const ReportModal: FC<ReportModalProps> = ({
  report,
  isOpen,
  onClose,
  onRunBenchmark,
  isBenchmarking,
  benchmarkProgress,
  benchmarkResult,
}) => {
  const [showArrows, setShowArrows] = useState(false);
  const [activeTabBenchmark, setActiveTabBenchmark] = useState(report.meta.maze_index);

  // Esc hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Download JSON export
  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `watch-it-learn-report-maze${report.meta.maze_index}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Download Episode CSV export
  const handleDownloadCSV = () => {
    const rows = [
      ['episode_index', 'steps', 'success_rolling10', 'epsilon', 'cumulative_regret'],
    ];
    const { episode_index, steps, success_rolling10, epsilon, cum_regret } = report.curves;
    for (let i = 0; i < episode_index.length; i++) {
      rows.push([
        String(episode_index[i]),
        String(steps[i] ?? ''),
        String(success_rolling10[i] ?? ''),
        String(epsilon[i] ?? ''),
        String(cum_regret[i] ?? ''),
      ]);
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `watch-it-learn-episodes-maze${report.meta.maze_index}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const { verdict, efficiency, curves, policy_accuracy, value_error, robustness, knowledge, meta } = report;

  return (
    <div className="fixed inset-0 z-50 bg-[#1A202C]/30 backdrop-blur-sm flex justify-center overflow-y-auto p-3 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="w-full max-w-4xl bg-[#E6EAF0] text-[#1A202C] rounded-[20px] neu-raised-md p-6 sm:p-8 my-auto flex flex-col gap-6 print:shadow-none print:border-none print:p-0 print:rounded-none">
        {/* Top Header / Actions */}
        <div className="flex items-center justify-between border-b border-[#D8DFE8] pb-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1E6B3E]" />
            <h2 className="text-lg font-bold tracking-tight text-[#1A202C]">
              Performance Analysis Report
            </h2>
            <span className="text-xs bg-[#DCE2EB] text-[#5A6A80] px-2.5 py-0.5 rounded-full font-medium">
              {meta.maze_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1 text-xs font-semibold rounded-[10px] bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm transition-all text-[#1A202C]"
            >
              Print / PDF
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm flex items-center justify-center text-xs font-bold text-[#5A6A80] hover:text-[#1A202C] transition-all"
              aria-label="Close report"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 1. Verdict Banner */}
        <section className="bg-[#E6EAF0] neu-inset-sm rounded-[16px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  verdict.status === 'optimal'
                    ? 'bg-[#1E6B3E] text-white'
                    : verdict.status === 'near_optimal'
                    ? 'bg-[#B33600] text-white'
                    : 'bg-[#5A6A80] text-white'
                }`}
              >
                {verdict.status.replace('_', ' ')}
              </span>
              <span className="text-xs text-[#5A6A80]">
                BFS length: {meta.optimal_len} steps
              </span>
            </div>
            <p className="text-base font-semibold text-[#1A202C] leading-snug">
              {verdict.sentence}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-center px-3 py-1.5 bg-[#E6EAF0] neu-raised-sm rounded-[10px]">
              <div className="text-[10px] text-[#5A6A80]">Success</div>
              <div className="text-sm font-bold text-[#1E6B3E] tabular-nums">
                {verdict.rollouts_success}/100
              </div>
            </div>
            <div className="text-center px-3 py-1.5 bg-[#E6EAF0] neu-raised-sm rounded-[10px]">
              <div className="text-[10px] text-[#5A6A80]">Optimal</div>
              <div className="text-sm font-bold text-[#1A202C] tabular-nums">
                {verdict.rollouts_optimal}/100
              </div>
            </div>
          </div>
        </section>

        {/* 2. Five KPI Tiles */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <div className="bg-[#E6EAF0] neu-inset-sm p-3 rounded-[12px] flex flex-col justify-between">
            <span className="text-[11px] text-[#5A6A80] font-medium">Gap to optimal</span>
            <div className="text-xl font-bold tabular-nums text-[#1A202C] my-0.5">
              {verdict.gap_pct}%
            </div>
            <span className="text-[10px] text-[#5A6A80] leading-tight">
              Extra steps above BFS minimum
            </span>
          </div>

          <div className="bg-[#E6EAF0] neu-inset-sm p-3 rounded-[12px] flex flex-col justify-between">
            <span className="text-[11px] text-[#5A6A80] font-medium">Greedy success</span>
            <div className="text-xl font-bold tabular-nums text-[#1E6B3E] my-0.5">
              {verdict.rollouts_success}/100
            </div>
            <span className="text-[10px] text-[#5A6A80] leading-tight">
              Reaching goal without noise
            </span>
          </div>

          <div className="bg-[#E6EAF0] neu-inset-sm p-3 rounded-[12px] flex flex-col justify-between">
            <span className="text-[11px] text-[#5A6A80] font-medium">Episodes to learn</span>
            <div className="text-xl font-bold tabular-nums text-[#1A202C] my-0.5">
              {efficiency.converged_episode ?? efficiency.episodes_total}
            </div>
            <span className="text-[10px] text-[#5A6A80] leading-tight">
              Attempts to 3-streak convergence
            </span>
          </div>

          <div className="bg-[#E6EAF0] neu-inset-sm p-3 rounded-[12px] flex flex-col justify-between">
            <span className="text-[11px] text-[#5A6A80] font-medium">Moves practiced</span>
            <div className="text-xl font-bold tabular-nums text-[#1A202C] my-0.5">
              {efficiency.transitions_total.toLocaleString()}
            </div>
            <span className="text-[10px] text-[#5A6A80] leading-tight">
              Total transitions across training
            </span>
          </div>

          <div className="bg-[#E6EAF0] neu-inset-sm p-3 rounded-[12px] flex flex-col justify-between col-span-2 sm:col-span-1">
            <span className="text-[11px] text-[#5A6A80] font-medium">Wasted steps</span>
            <div className="text-xl font-bold tabular-nums text-[#B33600] my-0.5">
              {efficiency.wasted_step_pct}%
            </div>
            <span className="text-[10px] text-[#5A6A80] leading-tight">
              Share of steps in wall bumps or loops
            </span>
          </div>
        </section>

        {/* 3 & 4. Learning Curve & Cumulative Regret */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <h3 className="text-xs font-bold text-[#1A202C]">Learning curve (steps per attempt)</h3>
              <span className="text-[10px] text-[#5A6A80]">Log scale</span>
            </div>
            <div className="w-full h-44 relative bg-[#E6EAF0] neu-inset-sm rounded-[10px] p-2">
              <LearningCurveSVG curves={curves} optimalLen={meta.optimal_len} convergedEp={efficiency.converged_episode} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#5A6A80] px-0.5">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-[#FF4F00] inline-block" /> Steps
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-[#5A6A80] border-t border-dashed inline-block" /> Optimum ({meta.optimal_len})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-[#94A3B8] inline-block" /> Random moves (ε)
              </span>
            </div>
          </div>

          <div className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-2">
            <div className="flex justify-between items-baseline">
              <h3 className="text-xs font-bold text-[#1A202C]">Cumulative regret</h3>
              <span className="text-[10px] text-[#5A6A80]">Total: {efficiency.regret_total.toLocaleString()}</span>
            </div>
            <div className="w-full h-44 relative bg-[#E6EAF0] neu-inset-sm rounded-[10px] p-2">
              <CumulativeRegretSVG curves={curves} convergedEp={efficiency.converged_episode} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#5A6A80] px-0.5">
              <span>Flattens once optimal path is learned</span>
              {efficiency.converged_episode && (
                <span className="font-semibold text-[#1E6B3E]">
                  Flat after attempt {efficiency.converged_episode}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 5. Knowledge Map */}
        <section className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold text-[#1A202C]">Knowledge map</h3>
              <p className="text-[11px] text-[#5A6A80]">
                State values V(s) and greedy actions
              </p>
            </div>
            <button
              onClick={() => setShowArrows(!showArrows)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-[8px] transition-all flex items-center gap-1 ${
                showArrows
                  ? 'bg-[#E6EAF0] neu-inset-sm text-[#B33600]'
                  : 'bg-[#E6EAF0] neu-raised-sm text-[#5A6A80]'
              }`}
            >
              <span>{showArrows ? '●' : '○'}</span>
              <span>Policy arrows</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-[#1A202C]">What the agent believes</span>
              <div className="w-full max-w-[240px]">
                <Maze
                  layer="beliefs"
                  valuesGrid={knowledge.v_learned}
                  policyGrid={knowledge.policy_learned}
                  showPolicyArrows={showArrows}
                />
              </div>
              <span className="text-[10px] text-[#5A6A80] text-center">
                Learned values V(s)
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-[#1A202C]">Ground truth</span>
              <div className="w-full max-w-[240px]">
                <Maze
                  layer="ground_truth"
                  valuesGrid={knowledge.v_star}
                  policyOptimalSets={knowledge.policy_optimal_sets}
                  showPolicyArrows={showArrows}
                />
              </div>
              <span className="text-[10px] text-[#5A6A80] text-center">
                Optimal V*(s) via value iteration
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-[#1A202C]">Where it is wrong</span>
              <div className="w-full max-w-[240px]">
                <Maze
                  layer="error"
                  valuesGrid={knowledge.v_error_abs}
                  policyGrid={knowledge.policy_learned}
                  showPolicyArrows={showArrows}
                />
              </div>
              <span className="text-[10px] text-[#5A6A80] text-center">
                Absolute error |V(s) - V*(s)|
              </span>
            </div>
          </div>
        </section>

        {/* 6. Policy Accuracy & Value Error */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-2.5">
            <h3 className="text-xs font-bold text-[#1A202C]">Policy accuracy</h3>
            <div className="flex flex-col gap-2.5 py-0.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#5A6A80]">On optimal path</span>
                  <span className="font-bold tabular-nums">{(policy_accuracy.on_path * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-[#DCE2EB] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E6B3E] rounded-full transition-all"
                    style={{ width: `${policy_accuracy.on_path * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#5A6A80]">Visited squares (≥ 3 visits)</span>
                  <span className="font-bold tabular-nums">{(policy_accuracy.visited * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-[#DCE2EB] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#FF4F00] rounded-full transition-all"
                    style={{ width: `${policy_accuracy.visited * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#5A6A80]">Whole map</span>
                  <span className="font-bold tabular-nums">{(policy_accuracy.reachable * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-[#DCE2EB] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#5A6A80] rounded-full transition-all"
                    style={{ width: `${policy_accuracy.reachable * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[#5A6A80] leading-relaxed pt-1">
              The agent only needs to know the corridor it uses. Dead ends it stopped visiting stay uncertain, and that is expected.
            </p>
          </div>

          <div className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-2.5">
            <h3 className="text-xs font-bold text-[#1A202C]">Value error & Bellman residual</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#E6EAF0] neu-inset-sm p-2.5 rounded-[10px]">
                <span className="text-[10px] text-[#5A6A80]">RMSE on path</span>
                <div className="text-base font-bold tabular-nums text-[#1A202C]">
                  {value_error.rmse_on_path.toFixed(4)}
                </div>
              </div>

              <div className="bg-[#E6EAF0] neu-inset-sm p-2.5 rounded-[10px]">
                <span className="text-[10px] text-[#5A6A80]">Max on path</span>
                <div className="text-base font-bold tabular-nums text-[#1A202C]">
                  {value_error.max_on_path.toFixed(4)}
                </div>
              </div>

              <div className="bg-[#E6EAF0] neu-inset-sm p-2.5 rounded-[10px]">
                <span className="text-[10px] text-[#5A6A80]">RMSE visited</span>
                <div className="text-base font-bold tabular-nums text-[#1A202C]">
                  {value_error.rmse_visited.toFixed(4)}
                </div>
              </div>

              <div className="bg-[#E6EAF0] neu-inset-sm p-2.5 rounded-[10px]">
                <span className="text-[10px] text-[#5A6A80]">Bellman residual</span>
                <div className="text-base font-bold tabular-nums text-[#1A202C]">
                  {value_error.bellman_residual_visited.toFixed(4)}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-[#5A6A80]">
              Coverage: <strong>{(policy_accuracy.coverage * 100).toFixed(0)}%</strong> of reachable squares visited ≥ 3 times.
            </div>
          </div>
        </section>

        {/* 7. Robustness */}
        <section className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-3">
          <h3 className="text-xs font-bold text-[#1A202C]">Robustness analysis</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#1A202C]">Noise sweep (success rate vs injected noise ε)</span>
              <div className="w-full h-36 bg-[#E6EAF0] neu-inset-sm rounded-[10px] p-2">
                <NoiseSweepSVG noise={robustness.noise} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#1A202C]">Baseline ladder (mean steps to goal)</span>
              <div className="w-full h-36 bg-[#E6EAF0] neu-inset-sm rounded-[10px] p-3 flex flex-col justify-around">
                <BaselineLadder baseline={robustness.baseline} />
              </div>
            </div>
          </div>
        </section>

        {/* 8. Benchmark Section */}
        <section className="bg-[#E6EAF0] neu-raised-sm p-4 rounded-[16px] flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold text-[#1A202C]">Reliability benchmark</h3>
              <p className="text-[11px] text-[#5A6A80]">
                20-seed convergence verification across presets
              </p>
            </div>
            <button
              onClick={() => onRunBenchmark(20)}
              disabled={isBenchmarking}
              className="px-3.5 py-1.5 text-xs font-bold rounded-[10px] bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm active:neu-inset-sm transition-all text-[#B33600] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isBenchmarking ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#FF4F00] dot-pulse" />
                  <span>
                    Running {benchmarkProgress ? `(${benchmarkProgress.done}/${benchmarkProgress.total})` : ''}
                  </span>
                </>
              ) : (
                'Run 20-seed benchmark'
              )}
            </button>
          </div>

          {isBenchmarking && benchmarkProgress && (
            <div className="w-full bg-[#DCE2EB] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#FF4F00] h-full rounded-full transition-all duration-200"
                style={{ width: `${(benchmarkProgress.done / benchmarkProgress.total) * 100}%` }}
              />
            </div>
          )}

          {benchmarkResult && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-2 border-b border-[#D8DFE8] pb-1.5">
                {benchmarkResult.mazes.map((m, idx) => (
                  <button
                    key={m.maze_index}
                    onClick={() => setActiveTabBenchmark(idx)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-[8px] transition-all ${
                      activeTabBenchmark === idx
                        ? 'bg-[#E6EAF0] neu-inset-sm text-[#1A202C]'
                        : 'text-[#5A6A80] hover:text-[#1A202C]'
                    }`}
                  >
                    {m.maze_name}
                  </button>
                ))}
              </div>

              {benchmarkResult.mazes[activeTabBenchmark] && (
                <BenchmarkMazeDetail stats={benchmarkResult.mazes[activeTabBenchmark]} />
              )}
            </div>
          )}
        </section>

        {/* 9. Method Notes */}
        <section className="bg-[#E6EAF0] neu-inset-sm p-3.5 rounded-[14px] flex flex-col gap-1.5 text-xs text-[#5A6A80] leading-relaxed">
          <h4 className="font-bold text-[#1A202C]">Methodology notes</h4>
          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
            <li>
              <strong>Ground truth Q* and V*:</strong> Precomputed via value iteration until Bellman residual error &lt; 10⁻¹⁰.
            </li>
            <li>
              <strong>Regret convention:</strong> Episode regret = steps taken − BFS shortest path. Truncated episodes count as 200 steps.
            </li>
            <li>
              <strong>Epsilon schedule:</strong> Linear decay over the first 70% of training time budget T from 1.0 down to 0.02 floor.
            </li>
            <li>
              <strong>Statistical rigor:</strong> IQM (interquartile mean) computed with 10,000 percentile-bootstrap resamples (Agarwal et al., NeurIPS 2021).
            </li>
            <li className="text-[#1A202C] font-medium pt-0.5">
              Scope: Tabular Q-learning learns this one maze. Change the maze and it starts from zero.
            </li>
          </ul>
        </section>

        {/* 10. Export Actions */}
        <section className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#D8DFE8] print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadJSON}
              className="px-3 py-1.5 text-xs font-semibold rounded-[10px] bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm active:neu-inset-sm transition-all text-[#1A202C]"
            >
              Download JSON
            </button>
            <button
              onClick={handleDownloadCSV}
              className="px-3 py-1.5 text-xs font-semibold rounded-[10px] bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm active:neu-inset-sm transition-all text-[#1A202C]"
            >
              Download CSV
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-[10px] bg-[#E6EAF0] neu-raised-sm hover:neu-inset-sm active:neu-inset-sm transition-all text-[#5A6A80] hover:text-[#1A202C]"
          >
            Close (Esc)
          </button>
        </section>
      </div>
    </div>
  );
};

// SVG Charts
const LearningCurveSVG: FC<{
  curves: PerformanceReport['curves'];
  optimalLen: number;
  convergedEp: number | null;
}> = ({ curves, optimalLen, convergedEp }) => {
  const width = 440;
  const height = 160;
  const pad = { top: 12, right: 15, bottom: 20, left: 30 };

  const { episode_index, steps, epsilon } = curves;
  const n = episode_index.length;
  if (n === 0) return null;

  const minEp = episode_index[0];
  const maxEp = episode_index[n - 1] || 1;
  const logMin = Math.log10(10);
  const logMax = Math.log10(200);

  const getX = (ep: number) => pad.left + ((ep - minEp) / Math.max(1, maxEp - minEp)) * (width - pad.left - pad.right);
  const getYLog = (val: number) => {
    const clamped = Math.max(10, Math.min(200, val));
    const logVal = Math.log10(clamped);
    return height - pad.bottom - ((logVal - logMin) / (logMax - logMin)) * (height - pad.top - pad.bottom);
  };
  const getYEps = (eps: number) => height - pad.bottom - eps * (height - pad.top - pad.bottom);

  const stepsPath = steps
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(episode_index[i]).toFixed(1)},${getYLog(s).toFixed(1)}`)
    .join(' ');
  const epsPath = epsilon
    .map((eps, i) => `${i === 0 ? 'M' : 'L'} ${getX(episode_index[i]).toFixed(1)},${getYEps(eps).toFixed(1)}`)
    .join(' ');

  const optimalY = getYLog(optimalLen);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {[20, 50, 100, 200].map((yVal) => (
        <g key={yVal}>
          <line
            x1={pad.left}
            y1={getYLog(yVal)}
            x2={width - pad.right}
            y2={getYLog(yVal)}
            stroke="#D8DFE8"
            strokeWidth="0.8"
          />
          <text x={pad.left - 4} y={getYLog(yVal) + 3} fontSize="8" fill="#5A6A80" textAnchor="end">
            {yVal}
          </text>
        </g>
      ))}

      <line
        x1={pad.left}
        y1={optimalY}
        x2={width - pad.right}
        y2={optimalY}
        stroke="#5A6A80"
        strokeDasharray="3 3"
        strokeWidth="1"
      />

      <path d={epsPath} fill="none" stroke="#94A3B8" strokeWidth="0.9" strokeDasharray="2 2" />
      <path d={stepsPath} fill="none" stroke="#FF4F00" strokeWidth="1.6" />

      {convergedEp && (
        <g>
          <line
            x1={getX(convergedEp)}
            y1={pad.top}
            x2={getX(convergedEp)}
            y2={height - pad.bottom}
            stroke="#1E6B3E"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />
          <circle cx={getX(convergedEp)} cy={getYLog(optimalLen)} r="3" fill="#1E6B3E" />
        </g>
      )}

      <text x={pad.left} y={height - 6} fontSize="8" fill="#5A6A80">Ep 1</text>
      <text x={width - pad.right} y={height - 6} fontSize="8" fill="#5A6A80" textAnchor="end">Ep {maxEp}</text>
    </svg>
  );
};

const CumulativeRegretSVG: FC<{
  curves: PerformanceReport['curves'];
  convergedEp: number | null;
}> = ({ curves, convergedEp }) => {
  const width = 440;
  const height = 160;
  const pad = { top: 12, right: 15, bottom: 20, left: 35 };

  const { episode_index, cum_regret } = curves;
  const n = episode_index.length;
  if (n === 0) return null;

  const minEp = episode_index[0];
  const maxEp = episode_index[n - 1] || 1;
  const maxRegret = Math.max(10, Math.max(...cum_regret));

  const getX = (ep: number) => pad.left + ((ep - minEp) / Math.max(1, maxEp - minEp)) * (width - pad.left - pad.right);
  const getY = (val: number) => height - pad.bottom - (val / maxRegret) * (height - pad.top - pad.bottom);

  const pathD = cum_regret
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${getX(episode_index[i]).toFixed(1)},${getY(r).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {[0, 0.5, 1.0].map((frac) => {
        const val = Math.round(maxRegret * frac);
        return (
          <g key={frac}>
            <line
              x1={pad.left}
              y1={getY(val)}
              x2={width - pad.right}
              y2={getY(val)}
              stroke="#D8DFE8"
              strokeWidth="0.8"
            />
            <text x={pad.left - 4} y={getY(val) + 3} fontSize="8" fill="#5A6A80" textAnchor="end">
              {val}
            </text>
          </g>
        );
      })}

      <path d={pathD} fill="none" stroke="#FF4F00" strokeWidth="1.8" />

      {convergedEp && (
        <g>
          <line
            x1={getX(convergedEp)}
            y1={pad.top}
            x2={getX(convergedEp)}
            y2={height - pad.bottom}
            stroke="#1E6B3E"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        </g>
      )}

      <text x={pad.left} y={height - 6} fontSize="8" fill="#5A6A80">Ep 1</text>
      <text x={width - pad.right} y={height - 6} fontSize="8" fill="#5A6A80" textAnchor="end">Ep {maxEp}</text>
    </svg>
  );
};

const NoiseSweepSVG: FC<{ noise: PerformanceReport['robustness']['noise'] }> = ({ noise }) => {
  const width = 380;
  const height = 120;
  const pad = { top: 10, right: 15, bottom: 20, left: 30 };

  if (!noise || noise.length === 0) return null;
  const maxEps = 0.3;

  const getX = (eps: number) => pad.left + (eps / maxEps) * (width - pad.left - pad.right);
  const getYSuccess = (rate: number) => height - pad.bottom - rate * (height - pad.top - pad.bottom);

  const pathD = noise
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.eps).toFixed(1)},${getYSuccess(p.success_rate).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {[0, 0.5, 1.0].map((r) => (
        <g key={r}>
          <line
            x1={pad.left}
            y1={getYSuccess(r)}
            x2={width - pad.right}
            y2={getYSuccess(r)}
            stroke="#D8DFE8"
            strokeWidth="0.8"
          />
          <text x={pad.left - 4} y={getYSuccess(r) + 3} fontSize="8" fill="#5A6A80" textAnchor="end">
            {Math.round(r * 100)}%
          </text>
        </g>
      ))}

      <path d={pathD} fill="none" stroke="#FF4F00" strokeWidth="1.8" />
      {noise.map((p) => (
        <circle
          key={p.eps}
          cx={getX(p.eps)}
          cy={getYSuccess(p.success_rate)}
          r="3"
          fill="#FF4F00"
          stroke="#FFFFFF"
          strokeWidth="1.2"
        />
      ))}
      {noise.map((p) => (
        <text key={p.eps} x={getX(p.eps)} y={height - 6} fontSize="8" fill="#5A6A80" textAnchor="middle">
          {p.eps}
        </text>
      ))}
    </svg>
  );
};

const BaselineLadder: FC<{ baseline: PerformanceReport['robustness']['baseline'] }> = ({ baseline }) => {
  const { random_mean_steps, learned_steps, optimal_steps } = baseline;
  const maxSteps = 200;

  return (
    <div className="flex flex-col gap-2.5 justify-center h-full">
      <div>
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-[#5A6A80]">Shortest possible</span>
          <span className="font-bold tabular-nums text-[#1A202C]">{optimal_steps} steps</span>
        </div>
        <div className="h-2 bg-[#DCE2EB] rounded-full overflow-hidden">
          <div className="h-full bg-[#1E6B3E] rounded-full" style={{ width: `${(optimal_steps / maxSteps) * 100}%` }} />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-[#5A6A80]">Learned agent</span>
          <span className="font-bold tabular-nums text-[#FF4F00]">{learned_steps} steps</span>
        </div>
        <div className="h-2 bg-[#DCE2EB] rounded-full overflow-hidden">
          <div className="h-full bg-[#FF4F00] rounded-full" style={{ width: `${(learned_steps / maxSteps) * 100}%` }} />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-[#5A6A80]">Uniform random</span>
          <span className="font-bold tabular-nums text-[#5A6A80]">{random_mean_steps} steps</span>
        </div>
        <div className="h-2 bg-[#DCE2EB] rounded-full overflow-hidden">
          <div className="h-full bg-[#94A3B8] rounded-full" style={{ width: `${(random_mean_steps / maxSteps) * 100}%` }} />
        </div>
      </div>
    </div>
  );
};

const BenchmarkMazeDetail: FC<{ stats: BenchmarkResult['mazes'][0] }> = ({ stats }) => {
  const { episodes, transitions, success_rate, learning_curve, reliability_curve } = stats;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-[#E6EAF0] neu-inset-sm p-2 rounded-[8px]">
          <span className="text-[10px] text-[#5A6A80]">Success</span>
          <div className="text-sm font-bold text-[#1E6B3E] tabular-nums">
            {(success_rate * 100).toFixed(0)}%
          </div>
        </div>

        {episodes && (
          <>
            <div className="bg-[#E6EAF0] neu-inset-sm p-2 rounded-[8px]">
              <span className="text-[10px] text-[#5A6A80]">IQM episodes</span>
              <div className="text-sm font-bold text-[#1A202C] tabular-nums">
                {episodes.iqm.toFixed(1)}
              </div>
            </div>

            <div className="bg-[#E6EAF0] neu-inset-sm p-2 rounded-[8px]">
              <span className="text-[10px] text-[#5A6A80]">Median episodes</span>
              <div className="text-sm font-bold text-[#1A202C] tabular-nums">
                {episodes.median}
              </div>
            </div>

            <div className="bg-[#E6EAF0] neu-inset-sm p-2 rounded-[8px]">
              <span className="text-[10px] text-[#5A6A80]">Transitions IQM</span>
              <div className="text-sm font-bold text-[#1A202C] tabular-nums">
                {transitions ? transitions.iqm.toLocaleString() : '—'}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[#E6EAF0] neu-inset-sm p-2.5 rounded-[10px] flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-[#1A202C]">Reliability curve</span>
          <div className="h-32 w-full">
            <ReliabilityCurveSVG curve={reliability_curve} />
          </div>
        </div>

        <div className="bg-[#E6EAF0] neu-inset-sm p-2.5 rounded-[10px] flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-[#1A202C]">Learning band</span>
          <div className="h-32 w-full">
            <LearningBandCurveSVG curve={learning_curve} optimalLen={stats.optimal_len} />
          </div>
        </div>
      </div>
    </div>
  );
};

const ReliabilityCurveSVG: FC<{ curve: BenchmarkResult['mazes'][0]['reliability_curve'] }> = ({ curve }) => {
  const width = 340;
  const height = 120;
  const pad = { top: 8, right: 12, bottom: 18, left: 25 };

  const { episode_indices, fraction_converged } = curve;
  if (!episode_indices || episode_indices.length === 0) return null;

  const maxEp = episode_indices[episode_indices.length - 1] || 1;
  const getX = (ep: number) => pad.left + (ep / maxEp) * (width - pad.left - pad.right);
  const getY = (frac: number) => height - pad.bottom - frac * (height - pad.top - pad.bottom);

  const pathD = fraction_converged
    .map((f, i) => `${i === 0 ? 'M' : 'L'} ${getX(episode_indices[i]).toFixed(1)},${getY(f).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {[0, 0.5, 1.0].map((f) => (
        <g key={f}>
          <line
            x1={pad.left}
            y1={getY(f)}
            x2={width - pad.right}
            y2={getY(f)}
            stroke="#D8DFE8"
            strokeWidth="0.8"
          />
          <text x={pad.left - 4} y={getY(f) + 3} fontSize="8" fill="#5A6A80" textAnchor="end">
            {Math.round(f * 100)}%
          </text>
        </g>
      ))}
      <path d={pathD} fill="none" stroke="#1E6B3E" strokeWidth="1.8" />
      <text x={pad.left} y={height - 4} fontSize="8" fill="#5A6A80">0</text>
      <text x={width - pad.right} y={height - 4} fontSize="8" fill="#5A6A80" textAnchor="end">{maxEp}</text>
    </svg>
  );
};

const LearningBandCurveSVG: FC<{
  curve: BenchmarkResult['mazes'][0]['learning_curve'];
  optimalLen: number;
}> = ({ curve, optimalLen }) => {
  const width = 340;
  const height = 120;
  const pad = { top: 8, right: 12, bottom: 18, left: 25 };

  const { episode_indices, median, p25, p75 } = curve;
  if (!episode_indices || episode_indices.length === 0) return null;

  const maxEp = episode_indices[episode_indices.length - 1] || 1;
  const maxSteps = 200;

  const getX = (ep: number) => pad.left + (ep / maxEp) * (width - pad.left - pad.right);
  const getY = (steps: number) => height - pad.bottom - (steps / maxSteps) * (height - pad.top - pad.bottom);

  const medianPath = median
    .map((m, i) => `${i === 0 ? 'M' : 'L'} ${getX(episode_indices[i]).toFixed(1)},${getY(m).toFixed(1)}`)
    .join(' ');

  let bandD = '';
  for (let i = 0; i < episode_indices.length; i++) {
    bandD += `${i === 0 ? 'M' : 'L'} ${getX(episode_indices[i]).toFixed(1)},${getY(p75[i]).toFixed(1)} `;
  }
  for (let i = episode_indices.length - 1; i >= 0; i--) {
    bandD += `L ${getX(episode_indices[i]).toFixed(1)},${getY(p25[i]).toFixed(1)} `;
  }
  bandD += 'Z';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      {[50, 100, 200].map((s) => (
        <g key={s}>
          <line
            x1={pad.left}
            y1={getY(s)}
            x2={width - pad.right}
            y2={getY(s)}
            stroke="#D8DFE8"
            strokeWidth="0.8"
          />
          <text x={pad.left - 4} y={getY(s) + 3} fontSize="8" fill="#5A6A80" textAnchor="end">
            {s}
          </text>
        </g>
      ))}

      <line
        x1={pad.left}
        y1={getY(optimalLen)}
        x2={width - pad.right}
        y2={getY(optimalLen)}
        stroke="#5A6A80"
        strokeDasharray="3 2"
        strokeWidth="1"
      />

      <path d={bandD} fill="rgba(255, 79, 0, 0.12)" />
      <path d={medianPath} fill="none" stroke="#FF4F00" strokeWidth="1.6" />

      <text x={pad.left} y={height - 4} fontSize="8" fill="#5A6A80">0</text>
      <text x={width - pad.right} y={height - 4} fontSize="8" fill="#5A6A80" textAnchor="end">{maxEp}</text>
    </svg>
  );
};

export default ReportModal;
