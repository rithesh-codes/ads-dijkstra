"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  MapPin,
  Package,
  Route as RouteIcon,
  Sparkles,
  Waypoints,
  Warehouse,
} from "lucide-react";
import { useAppData } from "@/components/AppData";
import { NetworkPanel, COLORS } from "@/components/map/NetworkPanel";
import { Badge, Card, EmptyState, LoadingBlock, PageHeader, SequenceChips, Spinner, StatCard } from "@/components/ui";
import { usePlanRunner } from "@/components/usePlanRunner";
import { fmtKm, fmtMin } from "@/lib/client";

export default function Dashboard() {
  const { data, loading, error, nameOf } = useAppData();
  const { run, running } = usePlanRunner();

  if (loading) return <LoadingBlock />;
  if (error || !data) return <div className="notice notice-error">Could not load data: {error}</div>;

  const plan = data.lastPlan;
  const stops = data.delivery.stops;
  const completed = stops.filter((s) => s.status === "completed").length;
  const stats = plan?.feasible ? plan.stats : undefined;

  let status: React.ReactNode = <Badge tone="slate">Not calculated</Badge>;
  if (plan && !plan.feasible) status = <Badge tone="rose">Infeasible</Badge>;
  else if (stats && stats.improvementPercent > 0) status = <Badge tone="green">Optimised · −{stats.improvementPercent.toFixed(1)}%</Badge>;
  else if (stats) status = <Badge tone="teal">Optimised · NN already 2-opt optimal</Badge>;

  const stopOrder: Record<string, number> = {};
  plan?.optimised?.sequence.forEach((id, i) => {
    if (i > 0 && id !== plan.warehouse) stopOrder[id] = i;
  });

  return (
    <>
      <PageHeader
        title="Delivery Operations"
        subtitle="Plan a route from the warehouse through every delivery stop. The C++ engine models roads as a weighted graph, runs Dijkstra (with a binary min-heap) between stops, builds a nearest-neighbour tour, and improves it with 2-opt."
        actions={
          <button className="btn btn-primary btn-lg" onClick={() => run()} disabled={running || stops.length === 0}>
            {running ? <Spinner label="Optimising…" /> : <><Sparkles size={16} /> Calculate &amp; optimise route</>}
          </button>
        }
      />

      <div className="grid grid-stats">
        <StatCard icon={MapPin} label="Locations" value={data.locations.length} hint="graph vertices (V)" />
        <StatCard icon={Waypoints} label="Roads" value={data.roads.length} hint={`${data.roads.filter((r) => r.oneWay).length} one-way · edges (E)`} />
        <StatCard icon={Package} label="Delivery stops" value={stops.length} hint="K selected destinations" tone="teal" />
        <StatCard icon={RouteIcon} label="Total route distance" value={stats ? fmtKm(stats.optimisedDistance) : "—"} hint={stats ? `NN: ${fmtKm(stats.initialDistance)}` : "run the planner"} tone="amber" />
        <StatCard icon={Clock} label="Est. travel time" value={stats ? fmtMin(stats.estimatedTimeMin) : "—"} hint={`at ${data.settings.averageSpeedKmh} km/h where no road time is set`} />
        <StatCard icon={CheckCircle2} label="Completed" value={`${completed} / ${stops.length}`} hint="deliveries marked done" tone="green" />
        <StatCard icon={Gauge} label="Optimisation" value={<span style={{ fontSize: 14 }}>{status}</span>} hint={plan ? `computed ${new Date(plan.computedAt).toLocaleTimeString()}` : "no plan yet"} />
      </div>

      <div className="grid grid-main mt">
        <Card title={plan?.feasible ? "Optimised route" : "Road network"} icon={RouteIcon}>
          {data.locations.length === 0 ? (
            <EmptyState title="No locations yet" text="Add locations and roads, or reset to the demo data." action={<Link className="btn" href="/locations">Add locations</Link>} />
          ) : (
            <NetworkPanel
              locations={data.locations}
              roads={data.roads}
              warehouseId={data.delivery.warehouseId}
              stopIds={stops.map((s) => s.locationId)}
              stopOrder={stopOrder}
              unreachable={plan?.unreachableStops}
              overlays={plan?.optimised ? [{ path: plan.optimised.fullPath, color: COLORS.optimised, label: "Optimised route (2-opt)" }] : []}
              height={430}
            />
          )}
        </Card>

        <div className="stack">
          <Card title="Current delivery plan" icon={Warehouse} actions={<Link className="btn btn-sm" href="/deliveries">Manage</Link>}>
            <dl className="kv">
              <dt>Warehouse</dt>
              <dd>{data.delivery.warehouseId ? nameOf(data.delivery.warehouseId) : "— not selected —"}</dd>
              <dt>Route type</dt>
              <dd>{data.settings.returnToWarehouse ? "Round trip (returns to warehouse)" : "One-way (ends at last stop)"}</dd>
              <dt>2-opt limit</dt>
              <dd>{data.settings.maxIterations} improving moves</dd>
            </dl>
            <div className="seq mt">
              {stops.length === 0 ? (
                <span className="muted">No stops selected.</span>
              ) : (
                stops.map((s) => (
                  <Badge key={s.locationId} tone={s.status === "completed" ? "green" : "default"}>
                    {s.status === "completed" ? "✓ " : ""}
                    {nameOf(s.locationId)}
                  </Badge>
                ))
              )}
            </div>
          </Card>

          <Card title="Latest result" icon={Sparkles} actions={plan && <Link className="btn btn-sm" href="/route">Details</Link>}>
            {!plan ? (
              <EmptyState title="No route calculated" text="Press “Calculate & optimise route” to run the C++ engine." />
            ) : !plan.feasible ? (
              <div className="notice notice-error">{plan.reason}</div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="small muted">Optimised sequence</div>
                <SequenceChips seq={plan.optimised!.sequence} nameOf={nameOf} />
                <div className="row small muted">
                  <span><Cpu size={13} /> {plan.dijkstraRuns} Dijkstra runs</span>
                  <span>· {plan.twoOpt!.moves.length} 2-opt moves</span>
                  <span>· engine {plan.engineMs} ms</span>
                </div>
                {plan.unreachableStops.length > 0 && (
                  <div className="notice notice-warn">Skipped unreachable: {plan.unreachableStops.map(nameOf).join(", ")}</div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="How the planner works (ADS pipeline)" icon={Cpu} className="mt">
        <div className="pipeline">
          {[
            ["01", "Weighted graph", "O(V + E) space", "Adjacency list: each location maps to its outgoing roads."],
            ["02", "Dijkstra × (K+1)", "O(K (V+E) log V)", "Indexed binary min-heap with decrease-key gives the K+1 shortest-path trees."],
            ["03", "Nearest neighbour", "O(K²)", "Greedy: always go to the closest unvisited stop next."],
            ["04", "2-opt", "O(K²) per pass", "Reverse a segment when d(a,c)+d(b,d) < d(a,b)+d(c,d)."],
            ["05", "Reconstruct", "O(total path length)", "Splice the predecessor-tree paths into one road route."],
          ].map(([n, t, c, p]) => (
            <div key={n} className="pipe-step">
              <div className="n">STEP {n}</div>
              <div className="t">{t}</div>
              <div className="c">{c}</div>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
