"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  Clock,
  Cpu,
  Grid3x3,
  ListOrdered,
  MapPinned,
  Package,
  Repeat2,
  Route as RouteIcon,
  Scissors,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import { useAppData } from "@/components/AppData";
import { BarChart } from "@/components/BarChart";
import { NetworkPanel, COLORS } from "@/components/map/NetworkPanel";
import type { RouteOverlay } from "@/components/map/types";
import { Badge, Card, EmptyState, LoadingBlock, PageHeader, SequenceChips, Spinner, StatCard } from "@/components/ui";
import { usePlanRunner } from "@/components/usePlanRunner";
import { api, fmtKm, fmtMin, fmtNum, fmtPct } from "@/lib/client";

export default function RoutePage() {
  const { data, loading, nameOf, refresh, notify } = useAppData();
  const { run, running } = usePlanRunner();
  const [show, setShow] = useState<"optimised" | "initial" | "both">("optimised");

  if (loading || !data) return <LoadingBlock />;
  const plan = data.lastPlan;
  const status = new Map(data.delivery.stops.map((s) => [s.locationId, s.status]));

  const actions = (
    <>
      {plan && (
        <button
          className="btn"
          onClick={async () => {
            try {
              await api("/api/plan", "DELETE");
              await refresh();
              notify("info", "Route cleared.");
            } catch (e) {
              notify("error", (e as Error).message);
            }
          }}
        >
          <X size={15} /> Clear result
        </button>
      )}
      <button className="btn btn-primary" onClick={() => run(false)} disabled={running || data.delivery.stops.length === 0}>
        {running ? <Spinner label="Optimising…" /> : <><Sparkles size={15} /> {plan ? "Recalculate" : "Calculate & optimise"}</>}
      </button>
    </>
  );

  if (!plan) {
    return (
      <>
        <PageHeader title="Route Results" actions={actions} />
        <Card>
          <EmptyState
            title="No route calculated yet"
            text={data.delivery.stops.length === 0 ? "Add delivery stops first, then run the planner." : "Run the planner to compute shortest paths, the nearest-neighbour tour, and the 2-opt optimisation."}
            action={data.delivery.stops.length === 0 ? <Link className="btn" href="/deliveries">Go to Deliveries</Link> : undefined}
          />
        </Card>
      </>
    );
  }

  if (!plan.feasible) {
    return (
      <>
        <PageHeader title="Route Results" actions={actions} />
        <div className="notice notice-error"><b>No feasible route.</b> {plan.reason}</div>
        {plan.unreachableStops.length > 0 && (
          <div className="notice notice-warn">Unreachable from the warehouse: {plan.unreachableStops.map(nameOf).join(", ")}</div>
        )}
      </>
    );
  }

  const s = plan.stats!;
  const init = plan.initial!;
  const opt = plan.optimised!;
  const exact = plan.exact!;

  const overlays: RouteOverlay[] = [];
  if (show !== "optimised") overlays.push({ path: init.fullPath, color: COLORS.initial, label: "Initial route (nearest neighbour)", dashed: true, weight: 5 });
  if (show !== "initial") overlays.push({ path: opt.fullPath, color: COLORS.optimised, label: "Optimised route (2-opt)", weight: 6 });
  const shownSeq = show === "initial" ? init.sequence : opt.sequence;
  const stopOrder: Record<string, number> = {};
  shownSeq.forEach((id, i) => {
    if (i > 0 && id !== plan.warehouse) stopOrder[id] = i;
  });

  const bars = [
    { label: "Nearest neighbour", note: "initial greedy tour", value: s.initialDistance, color: COLORS.initial },
    { label: "After 2-opt", note: `${plan.twoOpt!.moves.length} improving move(s)`, value: s.optimisedDistance, color: COLORS.optimised },
  ];
  if (exact.computed && exact.cost !== undefined)
    bars.push({ label: "True optimum", note: "Held–Karp DP (benchmark)", value: exact.cost, color: "#7c3aed" });

  const labels = plan.matrix!.labels;

  return (
    <>
      <PageHeader
        title="Route Results"
        subtitle={`Computed ${new Date(plan.computedAt).toLocaleString()} by the C++ engine in ${plan.engineMs} ms · ${plan.returnToWarehouse ? "round trip" : "one-way trip"} from ${nameOf(plan.warehouse)}`}
        actions={actions}
      />

      {plan.unreachableStops.length > 0 && (
        <div className="notice notice-warn">
          <b>Skipped {plan.unreachableStops.length} unreachable stop(s):</b> {plan.unreachableStops.map(nameOf).join(", ")}. No road path connects them to the warehouse (Dijkstra distance = ∞).
        </div>
      )}

      <div className="grid grid-stats">
        <StatCard icon={RouteIcon} label="Initial (NN)" value={fmtKm(s.initialDistance, 2)} hint="nearest-neighbour tour" tone="rose" />
        <StatCard icon={Sparkles} label="Optimised (2-opt)" value={fmtKm(s.optimisedDistance, 2)} hint="final route length" tone="teal" />
        <StatCard icon={TrendingDown} label="Distance saved" value={fmtKm(s.savedKm, 2)} hint={`${fmtPct(s.improvementPercent, 2)} improvement`} tone="green" />
        <StatCard icon={Clock} label="Est. travel time" value={fmtMin(s.estimatedTimeMin)} hint={`road times, else ${plan.averageSpeedKmh} km/h`} />
        <StatCard icon={Package} label="Stops visited" value={`${s.stops}`} hint={`${data.delivery.stops.filter((x) => x.status === "completed").length} marked delivered`} tone="amber" />
        <StatCard icon={Cpu} label="Dijkstra runs" value={plan.dijkstraRuns} hint="1 reachability + (K+1) matrix" />
      </div>

      <div className="grid grid-main mt">
        <Card
          title="Route on the road network"
          icon={MapPinned}
          actions={
            <div className="seg">
              {(["optimised", "initial", "both"] as const).map((k) => (
                <button key={k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>
                  {k === "optimised" ? "Optimised" : k === "initial" ? "Initial" : "Compare both"}
                </button>
              ))}
            </div>
          }
        >
          <NetworkPanel
            locations={data.locations}
            roads={data.roads}
            warehouseId={plan.warehouse}
            stopOrder={stopOrder}
            unreachable={plan.unreachableStops}
            overlays={overlays}
            height={460}
          />
        </Card>

        <div className="stack">
          <Card title="Distance comparison" icon={BarChart3}>
            <BarChart bars={bars} />
            {exact.computed && exact.cost !== undefined ? (
              <p className="small muted">
                Gap to optimum: NN {fmtPct(exact.nnGapPercent, 2)}, 2-opt {fmtPct(exact.twoOptGapPercent, 2)}. NN and 2-opt are <b>heuristics</b>, so they are not guaranteed to be optimal. The exact Held–Karp DP (O(2ᴷ·K²)) runs only for K ≤ {exact.maxStops} as a benchmark.
              </p>
            ) : (
              <p className="small muted">The exact optimum is skipped for K &gt; {exact.maxStops} stops (2ᴷ grows too fast).</p>
            )}
            {s.improvementPercent === 0 && <div className="notice notice-info">2-opt found no improving move, so the nearest-neighbour tour is already 2-opt-optimal. Improvement: 0%.</div>}
          </Card>
          <Card title="Delivery sequence" icon={ListOrdered}>
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <div className="small muted">Initial (nearest neighbour) · {fmtKm(s.initialDistance, 2)}</div>
                <SequenceChips seq={init.sequence} nameOf={nameOf} tone="rose" />
              </div>
              <div>
                <div className="small muted">Optimised (2-opt) · {fmtKm(s.optimisedDistance, 2)}</div>
                <SequenceChips seq={opt.sequence} nameOf={nameOf} tone="teal" />
              </div>
              {exact.sequence && (
                <div>
                  <div className="small muted">Optimal (Held–Karp) · {fmtKm(exact.cost, 2)}</div>
                  <SequenceChips seq={exact.sequence} nameOf={nameOf} tone="amber" />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Legs of the optimised route (reconstructed shortest paths)" icon={RouteIcon} className="mt">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th className="num">#</th><th>From → To</th><th className="num">Distance</th><th className="num">Time</th><th>Road path (Dijkstra)</th><th>Status</th></tr>
            </thead>
            <tbody>
              {opt.legs.map((l, i) => (
                <tr key={i}>
                  <td className="num">{i + 1}</td>
                  <td><b>{nameOf(l.from)}</b> → <b>{nameOf(l.to)}</b></td>
                  <td className="num">{fmtKm(l.distance, 2)}</td>
                  <td className="num">{fmtMin(l.timeMin)}</td>
                  <td className="small">{l.path.map(nameOf).join(" › ")} <span className="muted mono">[{l.roads.join(", ")}]</span></td>
                  <td>{l.to === plan.warehouse ? <Badge tone="amber">return</Badge> : status.get(l.to) === "completed" ? <Badge tone="green">delivered</Badge> : <Badge>pending</Badge>}</td>
                </tr>
              ))}
              <tr>
                <td /><td><b>Total</b></td><td className="num"><b>{fmtKm(opt.distance, 2)}</b></td><td className="num"><b>{fmtMin(opt.timeMin)}</b></td>
                <td className="small muted" colSpan={2}>Full road walk: {opt.fullPath.length} vertices (no repeat where legs join)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-2 mt">
        <Card title="Nearest-neighbour construction" icon={Repeat2}>
          <p className="small muted" style={{ marginTop: 0 }}>At each step, scan every unvisited stop and pick the one with the smallest shortest-path distance (greedy choice, O(K) per step, O(K²) in total).</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="num">Step</th><th>From</th><th>Candidates (distance)</th></tr></thead>
              <tbody>
                {plan.nearestNeighbour!.steps.map((st, i) => (
                  <tr key={i}>
                    <td className="num">{i + 1}</td>
                    <td>{nameOf(st.from)}</td>
                    <td className="small">
                      {[...st.candidates]
                        .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
                        .map((c) => (
                          <span key={c.id} style={{ marginRight: 8, fontWeight: c.id === st.chosen ? 800 : 400, color: c.id === st.chosen ? "var(--teal-ink)" : undefined }}>
                            {c.id === st.chosen ? "✔ " : ""}{c.id} {fmtNum(c.distance)}
                          </span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="2-opt improvement log" icon={Scissors}>
          <p className="small muted" style={{ marginTop: 0 }}>
            For each pair of positions (i, j), reversing <span className="mono">seq[i..j]</span> swaps edges (a,b),(c,d) for (a,c),(b,d). The move is accepted only if{" "}
            <span className="complexity">Δ = d(a,c) + d(b,d) − d(a,b) − d(c,d) &lt; 0</span>
            {!plan.twoOpt!.symmetricMatrix && " (+ the change from reversing internal one-way edges)"}. Best-improvement: each pass evaluates every pair and applies only the most negative Δ.
          </p>
          <dl className="kv">
            <dt>Passes</dt><dd>{plan.twoOpt!.passes}</dd>
            <dt>Moves evaluated</dt><dd>{plan.twoOpt!.movesEvaluated}</dd>
            <dt>Moves accepted</dt><dd>{plan.twoOpt!.moves.length} (limit {plan.twoOpt!.maxIterations}{plan.twoOpt!.hitIterationLimit ? ", reached" : ""})</dd>
            <dt>Graph symmetric?</dt><dd>{plan.twoOpt!.symmetricMatrix ? "yes, using the O(1) delta" : "no (one-way roads), using the asymmetric delta"}</dd>
          </dl>
          {plan.twoOpt!.moves.length === 0 ? (
            <p className="muted mt">No improving move found.</p>
          ) : (
            <div className="table-wrap mt">
              <table>
                <thead><tr><th className="num">Pass</th><th className="num">i</th><th className="num">j</th><th className="num">Δ (km)</th><th className="num">Cost after</th></tr></thead>
                <tbody>
                  {plan.twoOpt!.moves.map((m, k) => (
                    <tr key={k}>
                      <td className="num">{m.pass}</td><td className="num">{m.i}</td><td className="num">{m.j}</td>
                      <td className="num" style={{ color: "var(--green)" }}>{m.delta.toFixed(2)}</td>
                      <td className="num">{m.costAfter.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={`Shortest-path distance matrix (${labels.length}×${labels.length}, from ${labels.length} Dijkstra runs)`} icon={Grid3x3} className="mt">
        <p className="small muted" style={{ marginTop: 0 }}>Row i, column j = Dijkstra distance from terminal i to terminal j (km). NN, 2-opt and Held–Karp all work on this matrix, which is the metric closure of the road graph restricted to the warehouse and the stops.</p>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr><th />{labels.map((l) => <th key={l}>{l}</th>)}</tr>
            </thead>
            <tbody>
              {plan.matrix!.values.map((row, i) => (
                <tr key={labels[i]}>
                  <th>{labels[i]}</th>
                  {row.map((v, j) => (
                    <td key={j} className={i === j ? "diag" : ""}>{fmtNum(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
