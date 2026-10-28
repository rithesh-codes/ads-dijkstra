"use client";

import { useEffect, useMemo, useState } from "react";
import { Binary, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FlaskConical, Layers, ListTree, Pause, Play, Sigma } from "lucide-react";
import { useAppData } from "@/components/AppData";
import GraphView from "@/components/map/GraphView";
import type { NodeState } from "@/components/map/types";
import { Badge, Card, EmptyState, LoadingBlock, PageHeader, Spinner } from "@/components/ui";
import { api, fmtNum } from "@/lib/client";
import type { GraphInfo, TraceEvent, TraceResult } from "@/lib/types";

// Draws the heap array as the complete binary tree it represents: parent(i) = (i-1)/2.
function HeapTree({ heap }: { heap: { id: string; key: number }[] }) {
  if (heap.length === 0) return <p className="muted small">Heap is empty.</p>;
  const levels = Math.floor(Math.log2(heap.length)) + 1;
  const W = 600, LH = 62, H = levels * LH + 14;
  const pos = heap.map((_, i) => {
    const depth = Math.floor(Math.log2(i + 1));
    const idxInLevel = i - (2 ** depth - 1);
    return { x: ((idxInLevel + 0.5) * W) / 2 ** depth, y: depth * LH + 26 };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="heap-tree">
      {heap.map((_, i) => (i > 0 ? <line key={`l${i}`} x1={pos[i].x} y1={pos[i].y} x2={pos[(i - 1) >> 1].x} y2={pos[(i - 1) >> 1].y} /> : null))}
      {heap.map((n, i) => (
        <g key={n.id}>
          <rect x={pos[i].x - 35} y={pos[i].y - 20} width={70} height={40} rx={8} className={`hn ${i === 0 ? "root" : ""}`} />
          <text x={pos[i].x} y={pos[i].y - 2} style={{ fontWeight: 700 }}>{n.id.length > 8 ? n.id.slice(0, 7) + "…" : n.id}</text>
          <text x={pos[i].x} y={pos[i].y + 14}>{fmtNum(n.key, 1)}</text>
        </g>
      ))}
    </svg>
  );
}

function describe(e: TraceEvent, nameOf: (id: string) => string) {
  switch (e.type) {
    case "init":
      return <>dist[<b>{e.u}</b>] = 0, every other dist = ∞. Push {e.u} onto the min-heap.</>;
    case "pop":
      return <>EXTRACT-MIN → <b>{e.u}</b> ({nameOf(e.u)}) with key {fmtNum(e.newDist, 2)}. Its distance is now <b>final</b> (settled).</>;
    case "relax":
      return <>RELAX {e.u} → {e.v} (w = {fmtNum(e.weight, 1)}): {fmtNum(e.newDist, 2)} &lt; {fmtNum(e.oldDist, 2)}, so update dist[<b>{e.v}</b>] and parent[{e.v}] = {e.u}, then {e.oldDist === null ? "push" : "decrease-key"} in the heap.</>;
    case "no-improve":
      return <>Check {e.u} → {e.v} (w = {fmtNum(e.weight, 1)}): {fmtNum(e.newDist, 2)} ≥ {fmtNum(e.oldDist, 2)}, so there is no improvement and nothing changes.</>;
    case "skip-settled":
      return <>Skip {e.u} → {e.v}: {e.v} is already settled, so its distance cannot improve.</>;
  }
}

export default function LabPage() {
  const { data, loading, nameOf, notify } = useAppData();
  const [source, setSource] = useState("");
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<GraphInfo | null>(null);

  useEffect(() => {
    if (!data) return;
    api<GraphInfo>("/api/graph-info").then(setInfo).catch((e) => notify("error", (e as Error).message));
    if (!source && data.delivery.warehouseId) setSource(data.delivery.warehouseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!playing || !trace) return;
    if (step >= trace.events.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(t);
  }, [playing, step, trace]);

  // Replay events 0..step to rebuild dist[], parent[], and the settled set at this moment.
  const state = useMemo(() => {
    const dist = new Map<string, number>();
    const parent = new Map<string, string>();
    const settled = new Set<string>();
    if (!trace) return { dist, parent, settled };
    for (let k = 0; k <= step && k < trace.events.length; k++) {
      const e = trace.events[k];
      if (e.type === "init") dist.set(e.u, 0);
      if (e.type === "pop") settled.add(e.u);
      if (e.type === "relax") { dist.set(e.v, e.newDist!); parent.set(e.v, e.u); }
    }
    return { dist, parent, settled };
  }, [trace, step]);

  if (loading || !data) return <LoadingBlock />;

  async function runTrace(e: React.FormEvent) {
    e.preventDefault();
    if (!source) return notify("error", "Choose a source vertex.");
    setBusy(true);
    try {
      const t = await api<TraceResult>("/api/trace", "POST", { source });
      setTrace(t);
      setStep(0);
      setPlaying(false);
    } catch (err) {
      notify("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ev = trace?.events[step];
  const nodeState: Record<string, NodeState> = {};
  const nodeLabels: Record<string, string> = {};
  if (trace && ev) {
    for (const h of ev.heap) nodeState[h.id] = "frontier";
    for (const s of state.settled) nodeState[s] = "settled";
    if (ev.type === "pop" || ev.type === "init") nodeState[ev.u] = "current";
    for (const [id, d] of state.dist) nodeLabels[id] = `d=${fmtNum(d, 1)}`;
  }
  const activeEdge: [string, string] | null = ev && ev.v ? [ev.u, ev.v] : null;
  const pathEdges = trace && ev ? [...state.parent.entries()].map(([v, u]) => [u, v]) : [];

  return (
    <>
      <PageHeader title="Algorithm Lab" subtitle="Step through Dijkstra's algorithm as it runs in the C++ engine. Every heap operation and edge relaxation is recorded, together with a snapshot of the indexed binary min-heap after each step." />

      <Card title="Dijkstra step-by-step" icon={FlaskConical}>
        <form className="lab-controls" onSubmit={runTrace}>
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 280 }}>
            <option value="">Source vertex…</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner label="Tracing…" /> : "Run trace"}</button>
          {trace && (
            <>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => setStep(0)} aria-label="First"><ChevronsLeft size={15} /></button>
              <button type="button" className="btn btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} aria-label="Previous"><ChevronLeft size={15} /></button>
              <button type="button" className="btn btn-sm btn-dark" onClick={() => { if (step >= trace.events.length - 1) setStep(0); setPlaying((p) => !p); }}>
                {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setStep((s) => Math.min(trace.events.length - 1, s + 1))} aria-label="Next"><ChevronRight size={15} /></button>
              <button type="button" className="btn btn-sm" onClick={() => setStep(trace.events.length - 1)} aria-label="Last"><ChevronsRight size={15} /></button>
              <span className="small muted mono">step {step + 1}/{trace.events.length}</span>
            </>
          )}
        </form>
        {trace && <input className="range mt" type="range" min={0} max={trace.events.length - 1} value={step} onChange={(e) => setStep(Number(e.target.value))} />}

        {!trace ? (
          <EmptyState title="No trace yet" text="Pick a source vertex and press “Run trace”." />
        ) : (
          <div className="grid grid-main mt">
            <div className="stack">
              <div className="event-box">
                <span className={`ev-type ev-${ev!.type}`}>{ev!.type}</span>
                {describe(ev!, nameOf)}
              </div>
              <GraphView
                locations={data.locations}
                roads={data.roads}
                warehouseId={trace.source}
                nodeState={nodeState}
                nodeLabels={nodeLabels}
                activeEdge={activeEdge}
                overlays={pathEdges.map(([u, v]) => ({ path: [u, v], color: "#0d9488", label: `tree ${u}→${v}`, weight: 4 }))}
                showWeights
                height={460}
              />
              <div className="legend">
                <span><i className="lg-wh" /> Source</span>
                <span><i style={{ width: 12, height: 12, borderRadius: "50%", background: "#f97316" }} /> Just extracted</span>
                <span><i style={{ width: 12, height: 12, borderRadius: "50%", background: "#0f766e" }} /> Settled (final)</span>
                <span><i style={{ width: 12, height: 12, borderRadius: "50%", background: "#fde68a", border: "2px solid #d97706" }} /> In heap (frontier)</span>
                <span><i className="lg-line" style={{ background: "#0d9488" }} /> Shortest-path tree (parent[])</span>
                <span><i className="lg-line" style={{ background: "#f97316" }} /> Edge being relaxed</span>
              </div>
            </div>
            <div className="stack">
              <Card title={`Min-heap (size ${ev!.heap.length})`} icon={Binary}>
                <HeapTree heap={ev!.heap} />
                <div className="heap-array">
                  {ev!.heap.map((h, i) => (
                    <div key={h.id} className={`heap-cell ${i === 0 ? "root" : ""}`}>
                      <span className="idx">[{i}]</span>{h.id}<br />{fmtNum(h.key, 1)}
                    </div>
                  ))}
                </div>
                <p className="small muted">Array layout: children of index i are at 2i+1 and 2i+2. The root [0] always holds the minimum key. <span className="mono">pos[]</span> maps each vertex to its slot, which is what makes decrease-key O(log V).</p>
              </Card>
              <Card title="dist[] and parent[]" icon={Layers}>
                <div className="table-wrap" style={{ maxHeight: 300, overflow: "auto" }}>
                  <table>
                    <thead><tr><th>Vertex</th><th className="num">dist</th><th>parent</th><th>state</th></tr></thead>
                    <tbody>
                      {data.locations.map((l) => (
                        <tr key={l.id} className={ev!.u === l.id || ev!.v === l.id ? "row-highlight" : ""}>
                          <td className="mono">{l.id}</td>
                          <td className="num">{state.dist.has(l.id) ? fmtNum(state.dist.get(l.id), 2) : "∞"}</td>
                          <td className="mono">{state.parent.get(l.id) ?? "—"}</td>
                          <td>{state.settled.has(l.id) ? <Badge tone="teal">settled</Badge> : nodeState[l.id] === "frontier" ? <Badge tone="amber">in heap</Badge> : <Badge>unseen</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-2 mt">
        <Card title="Adjacency list (as stored in C++)" icon={ListTree}>
          {!info ? (
            <Spinner label="Loading…" />
          ) : (
            <>
              <dl className="kv">
                <dt>Vertices V</dt><dd>{info.vertices}</dd>
                <dt>Roads</dt><dd>{info.roads}</dd>
                <dt>Directed arcs E</dt><dd>{info.arcs} (each two-way road = 2 arcs)</dd>
                <dt>Density E / V(V−1)</dt><dd>{(info.density * 100).toFixed(1)}%, so the graph is sparse</dd>
                <dt>Adjacency list cells</dt><dd>{info.memory.adjacencyListCells} (V + E)</dd>
                <dt>Adjacency matrix cells</dt><dd>{info.memory.adjacencyMatrixCells} (V²): {(info.memory.adjacencyMatrixCells / Math.max(info.memory.adjacencyListCells, 1)).toFixed(1)}× more</dd>
                <dt>Connected components</dt><dd>{info.components.length} (BFS){info.components.length > 1 && <> · isolated: {info.components.filter((c) => c.length === 1).map((c) => c[0]).join(", ") || "none"}</>}</dd>
                <dt>Symmetric</dt><dd>{info.symmetric ? "yes" : "no (has one-way roads)"}</dd>
              </dl>
              <div className="adj-list mt">
                {info.adjacency.map((a) => (
                  <div key={a.id} className="adj-row">
                    <span className="adj-head">{a.id} [{a.degree}]</span>→
                    {a.edges.length === 0 ? <span className="muted">∅ (no outgoing roads)</span> : a.edges.map((e) => <span key={e.to} className="adj-node">{e.to}:{e.weight}</span>)}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="Complexity summary" icon={Sigma}>
          <p className="small muted" style={{ marginTop: 0 }}>V = vertices, E = arcs, K = delivery stops. These match the C++ implementation.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Operation</th><th>Time</th><th>Space</th></tr></thead>
              <tbody>
                {[
                  ["Build adjacency list", "O(V + E·deg)*", "O(V + E)"],
                  ["Heap push / pop / decrease-key", "O(log V)", "O(V)"],
                  ["Dijkstra (one source)", "O((V + E) log V)", "O(V)"],
                  ["Distance matrix (K+1 sources)", "O(K (V + E) log V)", "O(K·V + K²)"],
                  ["Nearest neighbour", "O(K²)", "O(K)"],
                  ["2-opt, one pass", "O(K²) symmetric, O(K³) asymmetric", "O(K)"],
                  ["Held–Karp (benchmark)", "O(2ᴷ · K²)", "O(2ᴷ · K)"],
                  ["Route reconstruction", "O(K · V) worst case", "O(K · V)"],
                  ["Connected components (BFS)", "O(V + E)", "O(V + E)"],
                ].map(([op, t, s]) => (
                  <tr key={op}><td>{op}</td><td><span className="complexity">{t}</span></td><td><span className="complexity">{s}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">* Adding an arc scans u&apos;s list once to merge duplicate roads, which costs O(deg(u)) per road (deg is small in road networks).</p>
        </Card>
      </div>
    </>
  );
}
