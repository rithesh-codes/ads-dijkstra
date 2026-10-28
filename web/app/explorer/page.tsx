"use client";

import { useState } from "react";
import { ArrowRightLeft, Ban, Compass, Navigation, RotateCcw, Search } from "lucide-react";
import { useAppData } from "@/components/AppData";
import { NetworkPanel, COLORS } from "@/components/map/NetworkPanel";
import { Badge, Card, EmptyState, Field, LoadingBlock, PageHeader, Spinner } from "@/components/ui";
import { api, fmtKm, fmtMin } from "@/lib/client";
import type { PathResult, ReachResult } from "@/lib/types";

export default function ExplorerPage() {
  const { data, loading, nameOf, notify } = useAppData();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [path, setPath] = useState<PathResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [reachSrc, setReachSrc] = useState("");
  const [reach, setReach] = useState<ReachResult | null>(null);
  const [reachBusy, setReachBusy] = useState(false);
  const [query, setQuery] = useState("");

  if (loading || !data) return <LoadingBlock />;
  const options = data.locations.map((l) => (
    <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
  ));
  const direct = path
    ? data.roads.find((r) => (r.from === path.source && r.to === path.target) || (!r.oneWay && r.from === path.target && r.to === path.source))
    : undefined;

  async function findPath(e: React.FormEvent) {
    e.preventDefault();
    if (!source || !target) return notify("error", "Choose both a start and an end location.");
    setBusy(true);
    try {
      setPath(await api<PathResult>("/api/path", "POST", { source, target }));
    } catch (err) {
      notify("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function findReach(e: React.FormEvent) {
    e.preventDefault();
    if (!reachSrc) return notify("error", "Choose a source location.");
    setReachBusy(true);
    try {
      setReach(await api<ReachResult>(`/api/reach?source=${encodeURIComponent(reachSrc)}`));
    } catch (err) {
      notify("error", (err as Error).message);
    } finally {
      setReachBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const reachRows = (reach?.reachable ?? []).filter((r) => !q || r.id.toLowerCase().includes(q) || nameOf(r.id).toLowerCase().includes(q));

  return (
    <>
      <PageHeader title="Path Explorer" subtitle="Run Dijkstra between any two locations, or from one source to every vertex, to see shortest distances and which locations are unreachable." />
      <div className="grid grid-side">
        <div className="stack">
          <Card title="Shortest path" icon={Navigation}>
            <form className="form" onSubmit={findPath}>
              <Field label="From">
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Select…</option>{options}
                </select>
              </Field>
              <Field label="To">
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Select…</option>{options}
                </select>
              </Field>
              <div className="row">
                <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner label="Running…" /> : <><Search size={15} /> Find shortest path</>}</button>
                <button type="button" className="btn" onClick={() => { setSource(target); setTarget(source); }} title="Swap"><ArrowRightLeft size={15} /></button>
                {path && <button type="button" className="btn" onClick={() => { setPath(null); setSource(""); setTarget(""); }}><RotateCcw size={15} /> Reset</button>}
              </div>
            </form>
            {path && (
              <div className="mt">
                {path.reachable ? (
                  <div className="notice notice-ok" style={{ display: "block" }}>
                    <div><b>{fmtKm(path.distance, 2)}</b> · {fmtMin(path.timeMin)} · {path.path.length - 1} road(s)</div>
                    <div className="small">{path.path.map(nameOf).join(" › ")}</div>
                    <div className="small mono muted">roads: {path.roads.join(", ") || "none (same place)"}</div>
                    {direct && path.path.length > 2 && (
                      <div className="small" style={{ marginTop: 6 }}>
                        A direct road {direct.id} exists ({direct.distanceKm} km), but this indirect path saves <b>{(direct.distanceKm - path.distance!).toFixed(2)} km</b>.
                      </div>
                    )}
                    <div className="small muted">Dijkstra settled {path.verticesSettled} reachable vertices.</div>
                  </div>
                ) : (
                  <div className="notice notice-error"><Ban size={14} /> {nameOf(path.target)} is <b>unreachable</b> from {nameOf(path.source)}: no sequence of roads connects them (distance = ∞).</div>
                )}
              </div>
            )}
          </Card>

          <Card title="Reachability from a source" icon={Compass}>
            <form className="row" onSubmit={findReach}>
              <select value={reachSrc} onChange={(e) => setReachSrc(e.target.value)} style={{ flex: 1 }}>
                <option value="">Select source…</option>{options}
              </select>
              <button className="btn btn-dark" disabled={reachBusy}>{reachBusy ? <Spinner /> : "Run"}</button>
            </form>
            {reach && (
              <div className="mt">
                <div className="small muted">Unreachable from {nameOf(reach.source)}</div>
                {reach.unreachable.length === 0 ? (
                  <Badge tone="green">Every location is reachable</Badge>
                ) : (
                  <div className="seq">{reach.unreachable.map((id) => <Badge key={id} tone="rose">{nameOf(id)}</Badge>)}</div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Network" icon={Navigation}>
            <NetworkPanel
              locations={data.locations}
              roads={data.roads}
              warehouseId={path?.source ?? reach?.source ?? data.delivery.warehouseId}
              stopIds={path ? [path.target] : []}
              unreachable={reach?.unreachable ?? (path && !path.reachable ? [path.target] : [])}
              overlays={path?.reachable ? [{ path: path.path, color: COLORS.path, label: `Shortest path ${path.source} → ${path.target}` }] : []}
              height={420}
            />
          </Card>
          {reach && (
            <Card
              title={`Shortest distances from ${nameOf(reach.source)}`}
              icon={Compass}
              actions={
                <div className="search">
                  <Search size={15} />
                  <input type="search" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              }
            >
              {reachRows.length === 0 ? (
                <EmptyState title="No matches" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Location</th><th className="num">Distance</th><th className="num">Hops</th><th>Predecessor (parent[])</th></tr></thead>
                    <tbody>
                      {[...reachRows].sort((a, b) => a.distance - b.distance).map((r) => (
                        <tr key={r.id}>
                          <td>{nameOf(r.id)} <span className="muted mono">{r.id}</span></td>
                          <td className="num">{fmtKm(r.distance, 2)}</td>
                          <td className="num">{r.hops}</td>
                          <td className="mono">{r.parent || "— (source)"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
