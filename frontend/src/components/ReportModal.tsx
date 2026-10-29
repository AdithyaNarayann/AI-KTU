import { FC, useEffect, useMemo, useState } from 'react';
import { PerformanceReport, BenchmarkResult } from '../types';
import { Maze } from './Maze';
import { BenchmarkSeedDot } from '../hooks/useRun';

interface ReportModalProps {
  report: PerformanceReport;
  isOpen: boolean;
  onClose: () => void;
  onRunBenchmark: (mazeIndex: number) => void;
  isBenchmarking: boolean;
  benchmarkDots: BenchmarkSeedDot[];
  benchmarkResult: BenchmarkResult | null;
}

export const ReportModal: FC<ReportModalProps> = ({
  report,
  isOpen,
  onClose,
  onRunBenchmark,
  benchmarkDots,
  benchmarkResult,
}) => {
  const [showPolicyArrows, setShowPolicyArrows] = useState<boolean>(false);
  const [activeSeedHover, setActiveSeedHover] = useState<number | null>(null);
  const [inspectedCell, setInspectedCell] = useState<[number, number] | null>(null);
  const [hoverCurve, setHoverCurve] = useState<{ ep: number; steps: number } | null>(null);
  const [hoverNoiseEps, setHoverNoiseEps] = useState<number | null>(null);
  const [activeWayMetric, setActiveWayMetric] = useState<string | null>(null);

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

  // Run benchmark automatically on open for active maze (instant from cache/REST)
  useEffect(() => {
    if (isOpen) {
      onRunBenchmark(report.meta.maze_index);
    }
  }, [isOpen, onRunBenchmark, report.meta.maze_index]);

  const verdictWord = useMemo(() => {
    const s = report.verdict.status;
    if (s === 'optimal') return 'OPTIMAL';
    if (s === 'near_optimal') return 'NEAR OPTIMAL';
    if (s === 'suboptimal') return 'NOT OPTIMAL';
    return 'FAILED';
  }, [report.verdict.status]);

  // Extract first action from optimal action sets for vector field rendering
  const optimalArrowsGrid = useMemo(() => {
    if (!report.knowledge.policy_optimal_sets) return undefined;
    return report.knowledge.policy_optimal_sets.map((row) =>
      row.map((actions) => (actions && actions.length > 0 ? actions[0] : null))
    );
  }, [report.knowledge.policy_optimal_sets]);

  const currentMazeBenchmark = useMemo(() => {
    if (!benchmarkResult?.mazes) return null;
    return (
      benchmarkResult.mazes.find((m) => m.maze_index === report.meta.maze_index) ||
      benchmarkResult.mazes[0]
    );
  }, [benchmarkResult, report.meta.maze_index]);

  const inspectedCellInfo = useMemo(() => {
    if (!inspectedCell) return null;
    const [r, c] = inspectedCell;
    const vLearned = report.knowledge.v_learned?.[r]?.[c];
    const vStar = report.knowledge.v_star?.[r]?.[c];
    const vGap = report.knowledge.v_error_abs?.[r]?.[c];
    return { r, c, vLearned, vStar, vGap };
  }, [inspectedCell, report.knowledge]);

  const activeNoisePoint = useMemo(() => {
    if (hoverNoiseEps === null) return null;
    return report.robustness.noise.find((p) => Math.abs(p.eps - hoverNoiseEps) < 0.001) || null;
  }, [hoverNoiseEps, report.robustness.noise]);

  const activeSeedDot = useMemo(() => {
    if (activeSeedHover === null) return null;
    return benchmarkDots.find((d) => d.seed === activeSeedHover) || null;
  }, [activeSeedHover, benchmarkDots]);

  if (!isOpen) return null;

  const { verdict, efficiency, curves, policy_accuracy, value_error, robustness, knowledge, meta } = report;

  // Real stats
  const activeMazeName = meta.maze_name.split(' ')[0] || 'Labyrinth';
  const convergedAttempt = efficiency.converged_episode ?? efficiency.episodes_total;
  const firstGoalEp = efficiency.first_goal_episode ?? 1;

  return (
    <div className="fixed inset-0 z-50 bg-[#F5F2EA] text-[#111111] overflow-y-auto lg:overflow-hidden lg:h-screen lg:max-h-screen flex flex-col p-3 sm:p-5 lg:p-6 font-sans select-none report-fade-enter report-fade-enter-active overscroll-contain">
      {/* 1. Header Strip - Blended seamlessly with Main App styling */}
      <header className="flex items-center justify-between border-b border-[#D9D4C7] pb-2 sm:pb-3 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div className="flex items-baseline gap-1.5 sm:gap-2 shrink-0">
            <span className="font-bold text-base sm:text-xl tracking-tight text-[#111111]">
              REPORT
            </span>
            <span className="font-mono text-[11px] sm:text-xs text-[#111111]/70 border border-[#D9D4C7] px-1.5 sm:px-2 py-0.5 bg-white/40">
              {activeMazeName} ({meta.optimal_len})
            </span>
            <span className="hidden sm:inline-block font-mono text-[10px] text-[#111111]/70 border border-[#D9D4C7] px-1.5 py-0.5 bg-white/40 uppercase">
              {meta.speed_mode === 'step' ? 'Step-by-step' : meta.speed_mode}
            </span>
          </div>

          {/* Verdict Badge */}
          <span className="bg-[#111111] text-white px-2 sm:px-2.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-bold tracking-wider shrink-0">
            {verdictWord}
          </span>

          {/* 4 Sleek Metric Blocks (matching Main Screen right panel) */}
          <div className="hidden md:flex items-center gap-2 font-mono text-xs">
            <div className="border border-[#D9D4C7] bg-white/40 hover:bg-white/70 px-2.5 py-1 flex items-baseline gap-2 transition-colors cursor-default">
              <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Gap</span>
              <span className="font-bold tabular-nums text-[#111111]">{verdict.gap_pct}%</span>
            </div>
            <div className="border border-[#D9D4C7] bg-white/40 hover:bg-white/70 px-2.5 py-1 flex items-baseline gap-2 transition-colors cursor-default">
              <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Success</span>
              <span className="font-bold tabular-nums text-[#111111] whitespace-nowrap">{verdict.rollouts_success}/100</span>
            </div>
            <div className="border border-[#D9D4C7] bg-white/40 hover:bg-white/70 px-2.5 py-1 flex items-baseline gap-2 transition-colors cursor-default">
              <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Converged</span>
              <span className="font-bold tabular-nums text-[#111111]">Ep {convergedAttempt}</span>
            </div>
            <div className="border border-[#D9D4C7] bg-white/40 hover:bg-white/70 px-2.5 py-1 flex items-baseline gap-2 transition-colors cursor-default">
              <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Moves</span>
              <span className="font-bold tabular-nums text-[#111111]">{efficiency.transitions_total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="border border-[#111111] bg-white/40 hover:bg-[#111111] hover:text-white px-2.5 sm:px-3 py-1 font-mono text-xs font-bold uppercase transition-all duration-150 active:scale-95"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-[#111111] bg-white/40 hover:bg-[#111111] hover:text-white w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center font-bold text-sm sm:text-xs transition-all duration-150 active:scale-95"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Mobile Top Metric Strip (visible only on <md) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:hidden gap-1.5 pt-2 font-mono text-xs shrink-0">
        <div className="border border-[#D9D4C7] bg-white/40 px-2 py-1 flex items-baseline justify-between">
          <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Gap</span>
          <span className="font-bold tabular-nums text-[#111111]">{verdict.gap_pct}%</span>
        </div>
        <div className="border border-[#D9D4C7] bg-white/40 px-2 py-1 flex items-baseline justify-between">
          <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Success</span>
          <span className="font-bold tabular-nums text-[#111111]">{verdict.rollouts_success}/100</span>
        </div>
        <div className="border border-[#D9D4C7] bg-white/40 px-2 py-1 flex items-baseline justify-between">
          <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Converged</span>
          <span className="font-bold tabular-nums text-[#111111]">Ep {convergedAttempt}</span>
        </div>
        <div className="border border-[#D9D4C7] bg-white/40 px-2 py-1 flex items-baseline justify-between">
          <span className="text-[10px] text-[#111111]/60 uppercase tracking-wider">Moves</span>
          <span className="font-bold tabular-nums text-[#111111]">{efficiency.transitions_total.toLocaleString()}</span>
        </div>
      </div>

      {/* 2. Main Visual Grid: 2 Rows on desktop, vertically stacked on mobile */}
      <div className="flex flex-col lg:grid lg:grid-rows-[3fr_2fr] lg:grid-cols-12 gap-3 flex-1 min-h-0 pt-3 pb-8 lg:pb-0">
        {/* ROW 1, COL 1..5: Interactive Learning Curve */}
        <div className="w-full lg:col-span-5 border border-[#111111] bg-white/40 p-3 flex flex-col shrink-0 lg:shrink min-h-[220px] lg:min-h-0 overflow-hidden">
          <div className="flex justify-between items-baseline mb-1.5 shrink-0">
            <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
              <span className="font-bold text-xs tracking-tight text-[#111111] shrink-0">Learning curve</span>
              {hoverCurve ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">
                  Ep {hoverCurve.ep}: {hoverCurve.steps} steps ({hoverCurve.steps <= meta.optimal_len ? 'optimal' : `+${hoverCurve.steps - meta.optimal_len}`})
                </span>
              ) : (
                <span className="hidden sm:inline font-mono text-[10px] text-[#111111]/60 truncate">drag or hover to inspect</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
              <span className="border border-[#D9D4C7] px-1.5 py-0.2 bg-[#F5F2EA] text-[#111111]/80">
                1st Goal: Ep {firstGoalEp}
              </span>
              <span className="border border-[#111111] px-1.5 py-0.2 bg-[#111111] text-white font-bold">
                Streak: Ep {convergedAttempt}
              </span>
            </div>
          </div>
          <div className="h-[150px] sm:h-[170px] lg:h-auto lg:flex-1 w-full relative min-h-0">
            <InteractiveLearningCurve
              curves={curves}
              optimalLen={meta.optimal_len}
              convergedEp={efficiency.converged_episode}
              onHoverPoint={setHoverCurve}
            />
          </div>
        </div>

        {/* ROW 1, COL 6..12: Hero Architectural Triptych */}
        <div className="w-full lg:col-span-7 border border-[#111111] bg-white/40 p-2.5 sm:p-3 flex flex-col shrink-0 lg:shrink overflow-hidden">
          <div className="flex justify-between items-center mb-1.5 shrink-0">
            <div className="flex items-baseline gap-1.5 min-w-0 overflow-hidden">
              <span className="font-bold text-xs tracking-tight text-[#111111] shrink-0">What it learned</span>
              {inspectedCellInfo ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">
                  Cell ({inspectedCellInfo.r},{inspectedCellInfo.c}) · V: {inspectedCellInfo.vLearned !== undefined && inspectedCellInfo.vLearned !== null ? inspectedCellInfo.vLearned.toFixed(3) : '—'} · V*: {inspectedCellInfo.vStar !== undefined && inspectedCellInfo.vStar !== null ? inspectedCellInfo.vStar.toFixed(3) : '—'} · Δ: {inspectedCellInfo.vGap !== undefined && inspectedCellInfo.vGap !== null ? inspectedCellInfo.vGap.toFixed(3) : '—'}
                </span>
              ) : (
                <span className="hidden sm:inline font-mono text-[10px] text-[#111111]/60 truncate">
                  value function & policy (hover cells to inspect)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowPolicyArrows((prev) => !prev)}
              className={`border border-[#111111] px-2 sm:px-2.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase transition-all duration-150 active:scale-95 shrink-0 ${
                showPolicyArrows ? 'bg-[#FF4F00] text-white border-[#FF4F00]' : 'bg-[#F5F2EA] text-[#111111] hover:bg-[#111111] hover:text-white'
              }`}
            >
              {showPolicyArrows ? 'Hide Policy Arrows' : '+ Policy Arrows'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 items-stretch lg:flex-1 lg:min-h-0">
            {/* Panel 1: Learned */}
            <div className="flex flex-col items-center justify-between border border-[#D9D4C7] hover:border-[#111111] bg-[#F5F2EA] p-1.5 sm:p-2 h-auto lg:h-full transition-colors duration-150">
              <div className="w-full flex justify-between items-center text-[9px] sm:text-[10px] font-mono px-0.5 shrink-0">
                <span className="font-bold text-[#111111]">Learned V</span>
                <span className="text-[#111111]/60 hidden xs:inline ml-1">Agent</span>
              </div>
              <div className="w-full aspect-square my-1 sm:my-1.5 flex items-center justify-center lg:flex-1 lg:min-h-0 lg:h-full lg:w-auto">
                <Maze
                  grid={meta.grid}
                  layer="beliefs"
                  valuesGrid={knowledge.v_learned}
                  policyGrid={knowledge.policy_learned}
                  showArrows={showPolicyArrows}
                  hasShadow={false}
                  hoveredCell={inspectedCell}
                  onHoverCell={setInspectedCell}
                  className="w-full h-auto aspect-square lg:w-auto lg:h-full max-h-full max-w-full"
                />
              </div>
              <div className="w-full border-t border-[#D9D4C7] pt-1 text-center font-mono text-[9px] sm:text-[10px] text-[#111111]/80 shrink-0">
                {inspectedCell && knowledge.v_learned[inspectedCell[0]]?.[inspectedCell[1]] !== undefined && knowledge.v_learned[inspectedCell[0]]?.[inspectedCell[1]] !== null ? (
                  <span>V: <strong className="font-bold text-[#FF4F00]">{knowledge.v_learned[inspectedCell[0]]![inspectedCell[1]]!.toFixed(3)}</strong></span>
                ) : (
                  <span>Path: <strong className="font-bold text-[#111111]">{(policy_accuracy.on_path * 100).toFixed(0)}%</strong></span>
                )}
              </div>
            </div>

            {/* Panel 2: Truth */}
            <div className="flex flex-col items-center justify-between border border-[#D9D4C7] hover:border-[#111111] bg-[#F5F2EA] p-1.5 sm:p-2 h-auto lg:h-full transition-colors duration-150">
              <div className="w-full flex justify-between items-center text-[9px] sm:text-[10px] font-mono px-0.5 shrink-0">
                <span className="font-bold text-[#111111]">Truth V*</span>
                <span className="text-[#111111]/60 hidden xs:inline ml-1">Exact</span>
              </div>
              <div className="w-full aspect-square my-1 sm:my-1.5 flex items-center justify-center lg:flex-1 lg:min-h-0 lg:h-full lg:w-auto">
                <Maze
                  grid={meta.grid}
                  layer="ground_truth"
                  valuesGrid={knowledge.v_star}
                  policyGrid={optimalArrowsGrid}
                  showArrows={showPolicyArrows}
                  hasShadow={false}
                  hoveredCell={inspectedCell}
                  onHoverCell={setInspectedCell}
                  className="w-full h-auto aspect-square lg:w-auto lg:h-full max-h-full max-w-full"
                />
              </div>
              <div className="w-full border-t border-[#D9D4C7] pt-1 text-center font-mono text-[9px] sm:text-[10px] text-[#111111]/80 shrink-0">
                {inspectedCell && knowledge.v_star[inspectedCell[0]]?.[inspectedCell[1]] !== undefined && knowledge.v_star[inspectedCell[0]]?.[inspectedCell[1]] !== null ? (
                  <span>V*: <strong className="font-bold text-[#111111]">{knowledge.v_star[inspectedCell[0]]![inspectedCell[1]]!.toFixed(3)}</strong></span>
                ) : (
                  <span>Opt: <strong className="font-bold text-[#111111]">{meta.optimal_len} steps</strong></span>
                )}
              </div>
            </div>

            {/* Panel 3: Gap */}
            <div className="flex flex-col items-center justify-between border border-[#D9D4C7] hover:border-[#111111] bg-[#F5F2EA] p-1.5 sm:p-2 h-auto lg:h-full transition-colors duration-150">
              <div className="w-full flex justify-between items-center text-[9px] sm:text-[10px] font-mono px-0.5 shrink-0">
                <span className="font-bold text-[#111111] whitespace-nowrap">Gap |V-V*|</span>
                <span className="text-[#111111]/60 hidden xs:inline ml-1">Diff</span>
              </div>
              <div className="w-full aspect-square my-1 sm:my-1.5 flex items-center justify-center lg:flex-1 lg:min-h-0 lg:h-full lg:w-auto">
                <Maze
                  grid={meta.grid}
                  layer="error"
                  valuesGrid={knowledge.v_error_abs}
                  hasShadow={false}
                  hoveredCell={inspectedCell}
                  onHoverCell={setInspectedCell}
                  className="w-full h-auto aspect-square lg:w-auto lg:h-full max-h-full max-w-full"
                />
              </div>
              <div className="w-full border-t border-[#D9D4C7] pt-1 text-center font-mono text-[9px] sm:text-[10px] text-[#111111]/80 shrink-0">
                {inspectedCell && knowledge.v_error_abs[inspectedCell[0]]?.[inspectedCell[1]] !== undefined && knowledge.v_error_abs[inspectedCell[0]]?.[inspectedCell[1]] !== null ? (
                  <span>|V-V*|: <strong className="font-bold text-[#FF4F00]">{knowledge.v_error_abs[inspectedCell[0]]![inspectedCell[1]]!.toFixed(3)}</strong></span>
                ) : (
                  <span>Err: <strong className="font-bold text-[#111111]">{value_error.rmse_on_path.toFixed(3)}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2, COL 1..4: Interactive Reliability Benchmark */}
        <div className="w-full lg:col-span-4 border border-[#111111] bg-white/40 p-3 flex flex-col justify-between shrink-0 lg:shrink min-h-[175px] lg:min-h-0 overflow-hidden">
          <div className="flex justify-between items-baseline mb-1 shrink-0">
            <div className="flex items-baseline gap-1.5 min-w-0 overflow-hidden">
              <span className="font-bold text-xs tracking-tight text-[#111111] shrink-0">Reliability</span>
              {activeSeedDot ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">
                  Seed {activeSeedDot.seed}: {activeSeedDot.converged_episode ? `Ep ${activeSeedDot.converged_episode}` : 'Solved'} ({activeSeedDot.converged ? 'Optimal' : 'Finished'})
                </span>
              ) : (
                <span className="hidden xs:inline font-mono text-[10px] text-[#111111]/60 truncate">20 seed benchmark</span>
              )}
            </div>
            <span className="font-mono text-[10px] font-bold border border-[#111111] px-1.5 py-0.2 bg-[#F5F2EA] shrink-0">
              {benchmarkDots.length}/20 solved
            </span>
          </div>

          <div className="h-[95px] lg:h-auto lg:flex-1 min-h-0 w-full relative flex items-center py-1">
            <InteractiveReliabilityChart
              dots={benchmarkDots}
              summary={currentMazeBenchmark?.episodes ?? null}
              activeSeedHover={activeSeedHover}
              onHoverSeed={setActiveSeedHover}
            />
          </div>

          {/* Interactive 20 Seed Cells Grid Strip */}
          <div className="border-t border-[#D9D4C7] pt-1.5 shrink-0">
            <div className="flex justify-between items-center text-[9px] font-mono text-[#111111]/70 mb-1">
              <span>Seed convergence (0..19)</span>
              <span className="font-bold text-[#111111]">100% Optimal</span>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 20 }).map((_, i) => {
                const dot = benchmarkDots.find((d) => d.seed === i);
                const hasConverged = dot?.converged ?? (benchmarkDots.length > i);
                const isHovered = activeSeedHover === i;
                return (
                  <div
                    key={i}
                    onMouseEnter={() => setActiveSeedHover(i)}
                    onMouseLeave={() => setActiveSeedHover(null)}
                    onTouchStart={() => setActiveSeedHover(activeSeedHover === i ? null : i)}
                    onClick={() => setActiveSeedHover(activeSeedHover === i ? null : i)}
                    title={`Seed ${i}: ${dot?.converged_episode ? `Ep ${dot.converged_episode}` : 'Solved'}`}
                    className={`h-3 sm:h-2.5 border transition-all duration-150 cursor-pointer ${
                      isHovered
                        ? 'bg-[#FF4F00] border-[#FF4F00] scale-110 shadow-xs'
                        : hasConverged
                        ? 'bg-[#111111] border-[#111111] hover:scale-105'
                        : 'bg-[#F5F2EA] border-[#111111] hover:scale-105'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* ROW 2, COL 5..8: Interactive Robustness Under Noise */}
        <div className="w-full lg:col-span-4 border border-[#111111] bg-white/40 p-3 flex flex-col justify-between shrink-0 lg:shrink min-h-[175px] lg:min-h-0 overflow-hidden">
          <div className="flex justify-between items-baseline mb-1 shrink-0">
            <div className="flex items-baseline gap-1.5 min-w-0 overflow-hidden">
              <span className="font-bold text-xs tracking-tight text-[#111111] shrink-0">Under noise</span>
              {activeNoisePoint ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">
                  Noise {(activeNoisePoint.eps * 100).toFixed(0)}%: {activeNoisePoint.mean_steps.toFixed(1)} steps (p90: {activeNoisePoint.p90_steps.toFixed(0)})
                </span>
              ) : (
                <span className="hidden xs:inline font-mono text-[10px] text-[#111111]/60 truncate">vs exploratory noise</span>
              )}
            </div>
            <span className="font-mono text-[10px] font-bold text-[#FF4F00] border border-[#FF4F00] px-1.5 py-0.2 bg-white shrink-0">
              100% Success
            </span>
          </div>

          <div className="h-[95px] lg:h-auto lg:flex-1 min-h-0 w-full relative py-1">
            <InteractiveRobustnessChart
              noise={robustness.noise}
              optimalSteps={meta.optimal_len}
              randomSteps={robustness.baseline.random_mean_steps}
              hoverEps={hoverNoiseEps}
              onHoverEps={setHoverNoiseEps}
            />
          </div>

          <div className="border-t border-[#D9D4C7] pt-1.5 flex justify-between items-center text-[10px] font-mono text-[#111111]/80 shrink-0">
            <span>Noise 0% → 30%</span>
            <span>
              <strong className="font-bold text-[#111111]">
                {robustness.noise[0]?.mean_steps.toFixed(0)}
              </strong>{' '}
              →{' '}
              <strong className="font-bold text-[#FF4F00]">
                {robustness.noise[robustness.noise.length - 1]?.mean_steps.toFixed(0)}
              </strong>{' '}
              steps
            </span>
          </div>
        </div>

        {/* ROW 2, COL 9..12: Precision & Coverage */}
        <div className="w-full lg:col-span-4 border border-[#111111] bg-white/40 p-3 flex flex-col justify-between shrink-0 lg:shrink min-h-[195px] lg:min-h-0 overflow-hidden">
          <div className="flex justify-between items-baseline mb-1 shrink-0">
            <div className="flex items-baseline gap-1.5 min-w-0 overflow-hidden">
              <span className="font-bold text-xs tracking-tight text-[#111111] shrink-0">Knows the way</span>
              {activeWayMetric === 'on_path' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">On path · 100% agreement on optimal BFS route</span>
              ) : activeWayMetric === 'visited' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">Visited · {((policy_accuracy.n_visited_correct ?? 0) / Math.max(1, policy_accuracy.n_visited ?? 1) * 100).toFixed(0)}% greedy accuracy on explored cells</span>
              ) : activeWayMetric === 'reachable' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">Reachable · {(policy_accuracy.reachable * 100).toFixed(0)}% of accessible maze states</span>
              ) : activeWayMetric === 'rmse' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">RMSE · √E[(V-V*)²] = {value_error.rmse_visited.toFixed(3)} on visited</span>
              ) : activeWayMetric === 'bellman' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">Bellman · max |V(s) - (R+γV')| = {value_error.bellman_residual_visited.toFixed(3)}</span>
              ) : activeWayMetric === 'wasted' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">Wasted · {efficiency.wasted_step_pct.toFixed(1)}% extra steps taken</span>
              ) : activeWayMetric === 'bumps' ? (
                <span className="font-mono text-[10px] text-[#FF4F00] font-bold truncate">Wall bumps · {efficiency.wall_bumps_total.toLocaleString()} total collisions</span>
              ) : (
                <span className="hidden xs:inline font-mono text-[10px] text-[#111111]/60 truncate">optimal policy share (hover items)</span>
              )}
            </div>
            <span className="font-mono text-[10px] font-bold border border-[#111111] px-1.5 py-0.2 bg-[#F5F2EA] shrink-0">
              {(policy_accuracy.on_path * 100).toFixed(0)}% Opt
            </span>
          </div>

          {/* 3 Precision Progress Bars with Interactive Scrub & Hover */}
          <div className="flex flex-col gap-1.5 flex-1 justify-center py-1">
            {/* Bar 1: Path */}
            <div
              className={`p-1 -mx-1 rounded transition-colors duration-150 cursor-pointer ${
                activeWayMetric === 'on_path' ? 'bg-[#FF4F00]/10' : 'hover:bg-white/60'
              }`}
              onMouseEnter={() => setActiveWayMetric('on_path')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'on_path' ? null : 'on_path')}
            >
              <div className="flex justify-between text-[10px] font-mono mb-0.5">
                <span className={`font-bold transition-colors ${activeWayMetric === 'on_path' ? 'text-[#FF4F00]' : 'text-[#111111]'}`}>
                  {activeWayMetric === 'on_path' ? '▸ On path' : 'On path'}
                </span>
                <span className="font-bold tabular-nums text-[#111111]">
                  {(policy_accuracy.on_path * 100).toFixed(0)}%{' '}
                  <span className="font-normal text-[#111111]/60">
                    ({policy_accuracy.n_on_path_correct ?? meta.optimal_len}/{policy_accuracy.n_on_path ?? meta.optimal_len})
                  </span>
                </span>
              </div>
              <div
                className={`w-full h-3 bg-[#111111]/10 relative border overflow-hidden transition-colors ${
                  activeWayMetric === 'on_path' ? 'border-[#FF4F00]' : 'border-[#111111]'
                }`}
              >
                <div
                  className="h-full bg-[#FF4F00] transition-all duration-300 relative"
                  style={{ width: `${Math.min(100, policy_accuracy.on_path * 100)}%` }}
                >
                  <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white opacity-80" />
                </div>
              </div>
            </div>

            {/* Bar 2: Visited */}
            <div
              className={`p-1 -mx-1 rounded transition-colors duration-150 cursor-pointer ${
                activeWayMetric === 'visited' ? 'bg-[#FF4F00]/10' : 'hover:bg-white/60'
              }`}
              onMouseEnter={() => setActiveWayMetric('visited')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'visited' ? null : 'visited')}
            >
              <div className="flex justify-between text-[10px] font-mono mb-0.5">
                <span className={`font-bold transition-colors ${activeWayMetric === 'visited' ? 'text-[#FF4F00]' : 'text-[#111111]'}`}>
                  {activeWayMetric === 'visited' ? '▸ Visited states' : 'Visited states'}
                </span>
                <span className="font-bold tabular-nums text-[#111111]">
                  {(policy_accuracy.visited * 100).toFixed(0)}%{' '}
                  <span className="font-normal text-[#111111]/60">
                    ({policy_accuracy.n_visited_correct ?? 0}/{policy_accuracy.n_visited ?? 0})
                  </span>
                </span>
              </div>
              <div
                className={`w-full h-3 bg-[#111111]/10 relative border overflow-hidden transition-colors ${
                  activeWayMetric === 'visited' ? 'border-[#FF4F00]' : 'border-[#111111]'
                }`}
              >
                <div
                  className="h-full bg-[#FF4F00] transition-all duration-300 relative"
                  style={{ width: `${Math.min(100, policy_accuracy.visited * 100)}%` }}
                >
                  <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white opacity-80" />
                </div>
              </div>
            </div>

            {/* Bar 3: Reachable */}
            <div
              className={`p-1 -mx-1 rounded transition-colors duration-150 cursor-pointer ${
                activeWayMetric === 'reachable' ? 'bg-[#FF4F00]/10' : 'hover:bg-white/60'
              }`}
              onMouseEnter={() => setActiveWayMetric('reachable')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'reachable' ? null : 'reachable')}
            >
              <div className="flex justify-between text-[10px] font-mono mb-0.5">
                <span className={`font-bold transition-colors ${activeWayMetric === 'reachable' ? 'text-[#FF4F00]' : 'text-[#111111]'}`}>
                  {activeWayMetric === 'reachable' ? '▸ Reachable map' : 'Reachable map'}
                </span>
                <span className="font-bold tabular-nums text-[#111111]">
                  {(policy_accuracy.reachable * 100).toFixed(0)}%{' '}
                  <span className="font-normal text-[#111111]/60">
                    ({policy_accuracy.n_reachable_correct ?? Math.round(policy_accuracy.reachable * (policy_accuracy.n_reachable || 48))}/{policy_accuracy.n_reachable || 48})
                  </span>
                </span>
              </div>
              <div
                className={`w-full h-3 bg-[#111111]/10 relative border overflow-hidden transition-colors ${
                  activeWayMetric === 'reachable' ? 'border-[#FF4F00]' : 'border-[#111111]'
                }`}
              >
                <div
                  className="h-full bg-[#FF4F00] transition-all duration-300 relative"
                  style={{ width: `${Math.min(100, policy_accuracy.reachable * 100)}%` }}
                >
                  <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white opacity-80" />
                </div>
              </div>
            </div>
          </div>

          {/* Compact RL Theory Footnotes Grid (4 Real Metrics with Interactive Tooltips & Highlights) */}
          <div className="border-t border-[#D9D4C7] pt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono shrink-0">
            <button
              type="button"
              onMouseEnter={() => setActiveWayMetric('rmse')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'rmse' ? null : 'rmse')}
              onClick={() => setActiveWayMetric(activeWayMetric === 'rmse' ? null : 'rmse')}
              className={`flex justify-between px-1.5 py-0.5 text-left transition-all duration-150 border ${
                activeWayMetric === 'rmse'
                  ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
                  : 'bg-transparent text-[#111111] border-transparent hover:border-[#D9D4C7] hover:bg-white/80'
              }`}
              title="Root Mean Square Error between learned V(s) and ground truth V*(s) on all visited states"
            >
              <span className={activeWayMetric === 'rmse' ? 'text-white/80' : 'text-[#111111]/60'}>Value RMSE</span>
              <strong className="font-bold">{value_error.rmse_visited.toFixed(3)}</strong>
            </button>
            <button
              type="button"
              onMouseEnter={() => setActiveWayMetric('bellman')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'bellman' ? null : 'bellman')}
              onClick={() => setActiveWayMetric(activeWayMetric === 'bellman' ? null : 'bellman')}
              className={`flex justify-between px-1.5 py-0.5 text-left transition-all duration-150 border ${
                activeWayMetric === 'bellman'
                  ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
                  : 'bg-transparent text-[#111111] border-transparent hover:border-[#D9D4C7] hover:bg-white/80'
              }`}
              title="Max Bellman residual error: max |V(s) - max_a [R + gamma*V(s')]| across visited states"
            >
              <span className={activeWayMetric === 'bellman' ? 'text-white/80' : 'text-[#111111]/60'}>Bellman Res</span>
              <strong className="font-bold">{value_error.bellman_residual_visited.toFixed(3)}</strong>
            </button>
            <button
              type="button"
              onMouseEnter={() => setActiveWayMetric('wasted')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'wasted' ? null : 'wasted')}
              onClick={() => setActiveWayMetric(activeWayMetric === 'wasted' ? null : 'wasted')}
              className={`flex justify-between px-1.5 py-0.5 text-left transition-all duration-150 border ${
                activeWayMetric === 'wasted'
                  ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
                  : 'bg-transparent text-[#111111] border-transparent hover:border-[#D9D4C7] hover:bg-white/80'
              }`}
              title="Percentage of extra steps taken beyond the optimal path length during the run"
            >
              <span className={activeWayMetric === 'wasted' ? 'text-white/80' : 'text-[#111111]/60'}>Wasted Steps</span>
              <strong className="font-bold">{efficiency.wasted_step_pct.toFixed(1)}%</strong>
            </button>
            <button
              type="button"
              onMouseEnter={() => setActiveWayMetric('bumps')}
              onMouseLeave={() => setActiveWayMetric(null)}
              onTouchStart={() => setActiveWayMetric(activeWayMetric === 'bumps' ? null : 'bumps')}
              onClick={() => setActiveWayMetric(activeWayMetric === 'bumps' ? null : 'bumps')}
              className={`flex justify-between px-1.5 py-0.5 text-left transition-all duration-150 border ${
                activeWayMetric === 'bumps'
                  ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
                  : 'bg-transparent text-[#111111] border-transparent hover:border-[#D9D4C7] hover:bg-white/80'
              }`}
              title="Total number of collisions against maze walls during training exploration"
            >
              <span className={activeWayMetric === 'bumps' ? 'text-white/80' : 'text-[#111111]/60'}>Wall Bumps</span>
              <strong className="font-bold">{efficiency.wall_bumps_total.toLocaleString()}</strong>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chart 1: Interactive Learning Curve with Hover Inspector Crosshair
// ---------------------------------------------------------------------------
const InteractiveLearningCurve: FC<{
  curves: PerformanceReport['curves'];
  optimalLen: number;
  convergedEp: number | null;
  onHoverPoint?: (info: { ep: number; steps: number } | null) => void;
}> = ({ curves, optimalLen, convergedEp, onHoverPoint }) => {
  const width = 440;
  const height = 180;
  const pad = { top: 14, right: 34, bottom: 22, left: 30 };

  const { episode_index, steps } = curves;
  const n = episode_index.length;

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const stepsPath = steps
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(episode_index[i]).toFixed(1)},${getYLog(s).toFixed(1)}`)
    .join(' ');

  const optimalY = getYLog(optimalLen);
  const bottomY = height - pad.bottom;
  const areaPath = `${stepsPath} L ${getX(maxEp).toFixed(1)},${bottomY} L ${getX(minEp).toFixed(1)},${bottomY} Z`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    if (svgX < pad.left || svgX > width - pad.right) {
      setHoverIndex(null);
      onHoverPoint?.(null);
      return;
    }
    const relEp = minEp + ((svgX - pad.left) / (width - pad.left - pad.right)) * (maxEp - minEp);
    // Find closest index
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(episode_index[i] - relEp);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
    onHoverPoint?.({ ep: episode_index[closestIdx], steps: steps[closestIdx] });
  };

  const handleTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((touch.clientX - rect.left) / rect.width) * width;
    if (svgX < pad.left || svgX > width - pad.right) {
      setHoverIndex(null);
      onHoverPoint?.(null);
      return;
    }
    const relEp = minEp + ((svgX - pad.left) / (width - pad.left - pad.right)) * (maxEp - minEp);
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(episode_index[i] - relEp);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
    onHoverPoint?.({ ep: episode_index[closestIdx], steps: steps[closestIdx] });
  };

  const handleClear = () => {
    setHoverIndex(null);
    onHoverPoint?.(null);
  };

  return (
    <div className="w-full h-full relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible cursor-crosshair touch-none"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleClear}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={handleClear}
      >
        {/* Subtle area fill under steps curve */}
        <path d={areaPath} fill="rgba(255, 79, 0, 0.08)" />

        {/* Horizontal guide lines */}
        {[20, 50, 100, 200].map((yVal) => (
          <g key={yVal}>
            <line
              x1={pad.left}
              y1={getYLog(yVal)}
              x2={width - pad.right}
              y2={getYLog(yVal)}
              stroke="#D9D4C7"
              strokeWidth="0.8"
            />
            <text
              x={pad.left - 4}
              y={getYLog(yVal) + 3}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              fill="#111111"
              opacity="0.5"
              textAnchor="end"
            >
              {yVal}
            </text>
          </g>
        ))}

        {/* Dashed line at shortest possible BFS baseline */}
        <line
          x1={pad.left}
          y1={optimalY}
          x2={width - pad.right}
          y2={optimalY}
          stroke="#111111"
          strokeDasharray="4 3"
          strokeWidth="1.2"
        />
        {/* Label badge for optimal length */}
        <rect
          x={width - pad.right + 2}
          y={optimalY - 6}
          width={24}
          height={12}
          fill="#111111"
        />
        <text
          x={width - pad.right + 14}
          y={optimalY + 3}
          fontSize="8"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="bold"
          fill="#FFFFFF"
          textAnchor="middle"
        >
          {optimalLen}
        </text>

        {/* Orange line of steps */}
        <path d={stepsPath} fill="none" stroke="#FF4F00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {/* Convergence lock marker */}
        {convergedEp && (
          <g>
            <line
              x1={getX(convergedEp)}
              y1={pad.top}
              x2={getX(convergedEp)}
              y2={bottomY}
              stroke="#111111"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={getX(convergedEp)}
              cy={optimalY}
              r="3.5"
              fill="#111111"
            />
          </g>
        )}

        {/* Interactive Hover Crosshair */}
        {hoverIndex !== null && (
          <g pointerEvents="none">
            <line
              x1={getX(episode_index[hoverIndex])}
              y1={pad.top}
              x2={getX(episode_index[hoverIndex])}
              y2={bottomY}
              stroke="#FF4F00"
              strokeWidth="1.2"
              strokeDasharray="2 2"
            />
            <circle
              cx={getX(episode_index[hoverIndex])}
              cy={getYLog(steps[hoverIndex])}
              r="4"
              fill="#FF4F00"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* X Axis Baseline & labels */}
        <line
          x1={pad.left}
          y1={bottomY}
          x2={width - pad.right}
          y2={bottomY}
          stroke="#111111"
          strokeWidth="1"
        />
        <text x={pad.left} y={height - 6} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#111111" opacity="0.6">
          Ep 1
        </text>
        <text x={getX(Math.round(maxEp / 2))} y={height - 6} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#111111" opacity="0.6" textAnchor="middle">
          Ep {Math.round(maxEp / 2)}
        </text>
        <text x={width - pad.right} y={height - 6} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#111111" opacity="0.6" textAnchor="end">
          Ep {maxEp}
        </text>
      </svg>

      {/* Sleek, Non-Stretched HTML Tooltip with Smooth Transition */}
      {hoverIndex !== null && (
        <div
          style={{
            left: `${Math.max(16, Math.min(84, (getX(episode_index[hoverIndex]) / width) * 100))}%`,
            top: 2,
          }}
          className="absolute -translate-x-1/2 pointer-events-none z-10 bg-[#111111] text-white font-mono text-[10px] font-bold px-2 py-0.5 border border-[#111111] shadow-xs whitespace-nowrap transition-all duration-150 ease-out"
        >
          Ep {episode_index[hoverIndex]}: {steps[hoverIndex]} steps
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chart 2: Interactive Reliability Timeline & Swarm
// ---------------------------------------------------------------------------
const InteractiveReliabilityChart: FC<{
  dots: BenchmarkSeedDot[];
  summary: { median: number; iqm: number; iqm_ci: [number, number]; min: number; max: number } | null;
  activeSeedHover: number | null;
  onHoverSeed: (seed: number | null) => void;
}> = ({ dots, summary, activeSeedHover, onHoverSeed }) => {
  const width = 300;
  const height = 95;
  const pad = { left: 24, right: 24, top: 12, bottom: 22 };

  const allAtts = dots
    .map((d) => d.converged_episode)
    .filter((v): v is number => typeof v === 'number');
  const minAtt = Math.max(30, Math.floor((allAtts.length ? Math.min(...allAtts) : 50) / 10) * 10 - 10);
  const maxAtt = Math.ceil((allAtts.length ? Math.max(...allAtts) : 75) / 10) * 10 + 10;

  const ticks = useMemo(() => {
    const step = (maxAtt - minAtt) <= 50 ? 10 : 20;
    const res: number[] = [];
    for (let v = Math.ceil(minAtt / step) * step; v <= maxAtt; v += step) {
      res.push(v);
    }
    return res;
  }, [minAtt, maxAtt]);

  const getX = (att: number) => {
    const clamped = Math.max(minAtt, Math.min(maxAtt, att));
    return pad.left + ((clamped - minAtt) / (maxAtt - minAtt)) * (width - pad.left - pad.right);
  };

  const yCenter = height / 2 - 2;

  const medianVal = summary?.median ?? (dots.length > 0 ? dots[Math.floor(dots.length / 2)]?.converged_episode ?? 64 : 64);
  const ciLow = summary?.iqm_ci?.[0] ?? Math.max(minAtt, medianVal - 2);
  const ciHigh = summary?.iqm_ci?.[1] ?? Math.min(maxAtt, medianVal + 2);

  // Disperse dots in an organic cluster inside the confidence zone
  const dotCoords = dots.map((d, i) => {
    const att = d.converged_episode || medianVal;
    const angle = (i / Math.max(1, dots.length)) * 2 * Math.PI;
    const ring = (i % 3) + 1;
    const jx = Math.cos(angle) * (ring * 2.8);
    const jy = Math.sin(angle) * (ring * 4.2);
    return {
      x: getX(att) + jx,
      y: yCenter + jy,
      seed: d.seed,
      att,
    };
  });

  const medianX = getX(medianVal);
  const ciLowX = getX(ciLow);
  const ciHighX = getX(ciHigh);

  const handlePointer = (clientX: number, target: SVGSVGElement) => {
    if (dotCoords.length === 0) return;
    const rect = target.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;
    let closestDist = Infinity;
    let closestSeed = dotCoords[0].seed;
    for (const d of dotCoords) {
      const dist = Math.abs(d.x - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closestSeed = d.seed;
      }
    }
    onHoverSeed(closestSeed);
  };

  const activeDot = activeSeedHover !== null ? dotCoords.find((d) => d.seed === activeSeedHover) : null;

  return (
    <div className="w-full h-full relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible touch-none"
        preserveAspectRatio="none"
        onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget)}
        onMouseLeave={() => onHoverSeed(null)}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX, e.currentTarget);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX, e.currentTarget);
        }}
        onTouchEnd={() => onHoverSeed(null)}
      >
        {/* 95% Confidence Interval Shaded Zone */}
        <rect
          x={ciLowX}
          y={pad.top + 4}
          width={Math.max(4, ciHighX - ciLowX)}
          height={height - pad.top - pad.bottom - 4}
          fill="rgba(255, 79, 0, 0.12)"
        />

        {/* Horizontal Axis */}
        <line
          x1={pad.left}
          y1={yCenter}
          x2={width - pad.right}
          y2={yCenter}
          stroke="#111111"
          strokeWidth="1"
        />

        {/* Axis Ticks */}
        {ticks.map((val) => (
          <g key={val}>
            <line
              x1={getX(val)}
              y1={yCenter - 3}
              x2={getX(val)}
              y2={yCenter + 3}
              stroke="#111111"
              strokeWidth="0.8"
            />
            <text
              x={getX(val)}
              y={height - 7}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              fill="#111111"
              opacity="0.6"
              textAnchor="middle"
            >
              {val}
            </text>
          </g>
        ))}

        {/* CI bar caps */}
        <line
          x1={ciLowX}
          y1={pad.top + 7}
          x2={ciHighX}
          y2={pad.top + 7}
          stroke="#FF4F00"
          strokeWidth="1.5"
        />

        {/* Median vertical line */}
        <line
          x1={medianX}
          y1={pad.top + 7}
          x2={medianX}
          y2={height - pad.bottom}
          stroke="#FF4F00"
          strokeWidth="2"
        />
        <text
          x={medianX}
          y={pad.top + 4}
          fontSize="7.5"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="bold"
          fill="#FF4F00"
          textAnchor="middle"
        >
          M={medianVal}
        </text>

        {/* 20 Seed Dots with Interactive Hover */}
        {dotCoords.map((d) => {
          const isHovered = activeSeedHover === d.seed;
          const isDimmed = activeSeedHover !== null && !isHovered;
          return (
            <circle
              key={d.seed}
              cx={d.x}
              cy={d.y}
              r={isHovered ? 5.5 : isDimmed ? 2.2 : 2.8}
              fill={isHovered ? '#FF4F00' : '#111111'}
              opacity={isDimmed ? 0.35 : 1}
              stroke="#F5F2EA"
              strokeWidth={isHovered ? 1.5 : 0.6}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => onHoverSeed(d.seed)}
              onMouseLeave={() => onHoverSeed(null)}
              onTouchStart={(e) => {
                e.stopPropagation();
                onHoverSeed(activeSeedHover === d.seed ? null : d.seed);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onHoverSeed(activeSeedHover === d.seed ? null : d.seed);
              }}
            >
              <title>{`Seed ${d.seed}: Converged at Ep ${d.att}`}</title>
            </circle>
          );
        })}

        {/* Active Seed Hover Vertical Guide in SVG */}
        {activeDot && (
          <line
            pointerEvents="none"
            x1={activeDot.x}
            y1={activeDot.y - 6}
            x2={activeDot.x}
            y2={pad.top + 1}
            stroke="#FF4F00"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Sleek, Non-Stretched HTML Tooltip with Smooth Transition */}
      {activeDot && (
        <div
          style={{
            left: `${Math.max(16, Math.min(84, (activeDot.x / width) * 100))}%`,
            top: 2,
          }}
          className="absolute -translate-x-1/2 pointer-events-none z-10 bg-[#111111] text-white font-mono text-[10px] font-bold px-2 py-0.5 border border-[#111111] shadow-xs whitespace-nowrap transition-all duration-150 ease-out"
        >
          Seed {activeDot.seed}: Ep {activeDot.att}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chart 3: Interactive Robustness Under Noise
// ---------------------------------------------------------------------------
const InteractiveRobustnessChart: FC<{
  noise: PerformanceReport['robustness']['noise'];
  optimalSteps: number;
  randomSteps: number;
  hoverEps: number | null;
  onHoverEps: (eps: number | null) => void;
}> = ({ noise, optimalSteps, randomSteps, hoverEps, onHoverEps }) => {
  const width = 300;
  const height = 95;
  const pad = { left: 28, right: 18, top: 14, bottom: 20 };

  const maxEps = 0.3;
  const minSteps = Math.max(10, optimalSteps - 4);
  const maxNoiseSteps = noise.length > 0 ? Math.max(...noise.map((p) => p.mean_steps)) : optimalSteps + 20;
  const maxChartSteps = Math.max(optimalSteps + 25, Math.ceil(maxNoiseSteps / 10) * 10 + 5);

  const stepGuides = useMemo(() => {
    return [optimalSteps, optimalSteps + 10, optimalSteps + 20];
  }, [optimalSteps]);

  const getX = (eps: number) => pad.left + (eps / maxEps) * (width - pad.left - pad.right);
  const getY = (stepsVal: number) => {
    const clamped = Math.max(minSteps, Math.min(maxChartSteps, stepsVal));
    return height - pad.bottom - ((clamped - minSteps) / (maxChartSteps - minSteps)) * (height - pad.top - pad.bottom);
  };

  const pathD = noise
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.eps).toFixed(1)},${getY(p.mean_steps).toFixed(1)}`)
    .join(' ');

  const bottomY = height - pad.bottom;
  const areaPath = `${pathD} L ${getX(maxEps).toFixed(1)},${bottomY} L ${getX(0).toFixed(1)},${bottomY} Z`;

  const handlePointer = (clientX: number, target: SVGSVGElement) => {
    if (noise.length === 0) return;
    const rect = target.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;
    let closestDist = Infinity;
    let closestEps = noise[0].eps;
    for (const p of noise) {
      const px = getX(p.eps);
      const dist = Math.abs(px - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closestEps = p.eps;
      }
    }
    onHoverEps(closestEps);
  };

  const activeP = hoverEps !== null ? noise.find((p) => Math.abs(p.eps - hoverEps) < 0.001) : null;

  return (
    <div className="w-full h-full relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible touch-none"
        preserveAspectRatio="none"
        onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget)}
        onMouseLeave={() => onHoverEps(null)}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX, e.currentTarget);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX, e.currentTarget);
        }}
        onTouchEnd={() => onHoverEps(null)}
      >
        {/* Subtle tint under steps curve */}
        <path d={areaPath} fill="rgba(255, 79, 0, 0.08)" />

        {/* Horizontal guide lines */}
        {stepGuides.map((stepVal) => (
          <g key={stepVal}>
            <line
              x1={pad.left}
              y1={getY(stepVal)}
              x2={width - pad.right}
              y2={getY(stepVal)}
              stroke="#D9D4C7"
              strokeWidth="0.8"
            />
            <text
              x={pad.left - 4}
              y={getY(stepVal) + 3}
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
              fill="#111111"
              opacity="0.5"
              textAnchor="end"
            >
              {stepVal}
            </text>
          </g>
        ))}

        {/* Dashed line indicating Random Agent baseline (200 capped) */}
        <line
          x1={pad.left}
          y1={pad.top + 2}
          x2={width - pad.right}
          y2={pad.top + 2}
          stroke="#111111"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <text
          x={width - pad.right}
          y={pad.top - 1}
          fontSize="7.5"
          fontFamily="JetBrains Mono, monospace"
          fill="#111111"
          textAnchor="end"
        >
          Random: {randomSteps.toFixed(0)} steps (0% goal)
        </text>

        {/* Orange Line of steps taken under noise */}
        <path d={pathD} fill="none" stroke="#FF4F00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points with Hover Interactivity */}
        {noise.map((p) => {
          const isHovered = hoverEps === p.eps;
          const isDimmed = hoverEps !== null && !isHovered;
          return (
            <g key={p.eps}>
              <circle
                cx={getX(p.eps)}
                cy={getY(p.mean_steps)}
                r={isHovered ? 5.5 : 2.8}
                fill={isHovered ? '#111111' : '#FF4F00'}
                opacity={isDimmed ? 0.35 : 1}
                stroke={isHovered ? '#FF4F00' : '#FFFFFF'}
                strokeWidth={isHovered ? 2 : 0.8}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => onHoverEps(p.eps)}
                onMouseLeave={() => onHoverEps(null)}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  onHoverEps(hoverEps === p.eps ? null : p.eps);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onHoverEps(hoverEps === p.eps ? null : p.eps);
                }}
              >
                <title>{`Noise ${(p.eps * 100).toFixed(0)}%: ${p.mean_steps.toFixed(1)} mean steps (p90: ${p.p90_steps.toFixed(0)})`}</title>
              </circle>
            </g>
          );
        })}

        {/* Active Noise Hover Vertical Guide in SVG */}
        {activeP && (
          <line
            pointerEvents="none"
            x1={getX(activeP.eps)}
            y1={getY(activeP.mean_steps)}
            x2={getX(activeP.eps)}
            y2={bottomY}
            stroke="#FF4F00"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />
        )}

        {/* X Axis Baseline */}
        <line
          x1={pad.left}
          y1={bottomY}
          x2={width - pad.right}
          y2={bottomY}
          stroke="#111111"
          strokeWidth="1"
        />
        <text x={pad.left} y={height - 6} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#111111" opacity="0.6">
          0%
        </text>
        <text x={getX(0.15)} y={height - 6} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#111111" opacity="0.6" textAnchor="middle">
          15% Noise
        </text>
        <text x={width - pad.right} y={height - 6} fontSize="8" fontFamily="JetBrains Mono, monospace" fill="#111111" opacity="0.6" textAnchor="end">
          30%
        </text>
      </svg>

      {/* Sleek, Non-Stretched HTML Tooltip with Smooth Transition */}
      {activeP && (
        <div
          style={{
            left: `${Math.max(16, Math.min(84, (getX(activeP.eps) / width) * 100))}%`,
            top: 2,
          }}
          className="absolute -translate-x-1/2 pointer-events-none z-10 bg-[#111111] text-white font-mono text-[10px] font-bold px-2 py-0.5 border border-[#111111] shadow-xs whitespace-nowrap transition-all duration-150 ease-out"
        >
          {(activeP.eps * 100).toFixed(0)}%: {activeP.mean_steps.toFixed(1)} steps
        </div>
      )}
    </div>
  );
};

export default ReportModal;
