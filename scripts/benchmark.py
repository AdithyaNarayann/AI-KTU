"""Run headless benchmark across 20 seeds on all 3 mazes and print measured results."""

import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.evaluate import run_benchmark

def main():
    start_time = time.perf_counter()
    res = run_benchmark(n_seeds=20, maze_indices=[0, 1, 2], progress_callback=None)
    elapsed = time.perf_counter() - start_time

    print("\nBenchmark Summary (20 seeds per maze):")
    print(f"| {'Metric':<34} | {'Result':<22} | {'How measured':<45} |")
    print(f"| {'-' * 34} | {'-' * 22} | {'-' * 45} |")

    total_transitions = 0
    total_episodes = 0

    for m in res["mazes"]:
        name = m["maze_name"]
        opt = m.get("optimal_len", 32)
        rate = m["success_rate"] * 100.0
        n_seeds = m["n_seeds"]
        ep = m["episodes"]
        tr = m["transitions"]

        ep_med = ep["median"]
        ep_iqm = ep["iqm"]
        tr_med = int(tr["median"])

        s_rate = f"{rate:.0f}% ({n_seeds}/{n_seeds} seeds)"
        s_ep = f"{ep_med:.0f} (IQM {ep_iqm:.1f})"
        s_tr = f"{tr_med:,}"

        print(f"| {name + ' convergence':<34} | {s_rate:<22} | {f'10 greedy rollouts matching BFS ({opt} steps)':<45} |")
        print(f"| {name + ' median episodes':<34} | {s_ep:<22} | {'Episodes until 3 consecutive optimal checks':<45} |")
        print(f"| {name + ' median transitions':<34} | {s_tr:<22} | {'Total environment steps to converge':<45} |")

        for s in m["seeds"]:
            total_transitions += s["transitions"]
            total_episodes += s["converged_episode"] if s["converged_episode"] else 0

    throughput_ep = total_episodes / elapsed
    throughput_tr = total_transitions / elapsed

    s_t_ep = f"{throughput_ep:,.0f} ep/s"
    s_t_tr = f"{throughput_tr:,.0f} steps/s"

    print(f"| {'Simulation throughput (episodes)':<34} | {s_t_ep:<22} | {f'Total episodes / wall-clock time ({elapsed:.2f}s)':<45} |")
    print(f"| {'Simulation throughput (transitions)':<34} | {s_t_tr:<22} | {'Total environment transitions / wall-clock time':<45} |")

if __name__ == "__main__":
    main()
