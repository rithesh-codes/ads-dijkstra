"use client";

import { useState } from "react";
import { ArrowLeftRight, ArrowRight, Pencil, Plus, Search, Trash2, Waypoints, X } from "lucide-react";
import { useAppData } from "@/components/AppData";
import { NetworkPanel } from "@/components/map/NetworkPanel";
import { Badge, Card, EmptyState, Field, LoadingBlock, PageHeader } from "@/components/ui";
import { ApiError, api } from "@/lib/client";
import { ROAD_TYPES, type Road, type RoadType } from "@/lib/types";

const EMPTY = { from: "", to: "", distanceKm: "", travelTimeMin: "", roadType: "local" as RoadType, oneWay: false };

export default function RoadsPage() {
  const { data, loading, refresh, notify, nameOf } = useAppData();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [dirFilter, setDirFilter] = useState<"all" | "two" | "one">("all");

  if (loading || !data) return <LoadingBlock />;

  const q = query.trim().toLowerCase();
  const rows = data.roads.filter((r) => {
    if (dirFilter === "one" && !r.oneWay) return false;
    if (dirFilter === "two" && r.oneWay) return false;
    if (!q) return true;
    return [r.id, r.from, r.to, nameOf(r.from), nameOf(r.to), r.roadType].some((s) => s.toLowerCase().includes(q));
  });

  function validateClient() {
    const e: Record<string, string> = {};
    if (!form.from) e.from = "Choose a start location.";
    if (!form.to) e.to = "Choose an end location.";
    if (form.from && form.from === form.to) e.to = "Start and end must differ.";
    const d = Number(form.distanceKm);
    if (form.distanceKm === "" || !Number.isFinite(d)) e.distanceKm = "Enter a distance in km.";
    else if (d <= 0) e.distanceKm = d < 0 ? "Negative distances are not allowed (Dijkstra needs non-negative weights)." : "Distance must be greater than 0.";
    if (form.travelTimeMin !== "" && !(Number(form.travelTimeMin) > 0)) e.travelTimeMin = "Must be a positive number, or left empty.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validateClient();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        distanceKm: Number(form.distanceKm),
        travelTimeMin: form.travelTimeMin === "" ? null : Number(form.travelTimeMin),
      };
      if (editing) await api(`/api/roads/${encodeURIComponent(editing)}`, "PUT", body);
      else await api("/api/roads", "POST", body);
      notify("success", editing ? `Road ${editing} updated.` : "Road added.");
      setForm(EMPTY);
      setEditing(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      notify("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r: Road) {
    setEditing(r.id);
    setErrors({});
    setForm({
      from: r.from,
      to: r.to,
      distanceKm: String(r.distanceKm),
      travelTimeMin: r.travelTimeMin === null ? "" : String(r.travelTimeMin),
      roadType: r.roadType,
      oneWay: r.oneWay,
    });
  }

  async function remove(r: Road) {
    if (!confirm(`Delete road ${r.id} (${nameOf(r.from)} – ${nameOf(r.to)})?`)) return;
    try {
      await api(`/api/roads/${encodeURIComponent(r.id)}`, "DELETE");
      notify("success", `Road ${r.id} deleted.`);
      if (editing === r.id) { setEditing(null); setForm(EMPTY); }
      await refresh();
    } catch (err) {
      notify("error", (err as Error).message);
    }
  }

  const locOptions = data.locations.map((l) => (
    <option key={l.id} value={l.id}>
      {l.name} ({l.id})
    </option>
  ));

  return (
    <>
      <PageHeader
        title="Road Network"
        subtitle="Roads are the weighted edges of the graph. A two-way road becomes two directed arcs (u→v and v→u) in the adjacency list. A one-way road becomes a single arc. Weights must be positive."
      />
      <div className="grid grid-side">
        <Card title={editing ? `Edit ${editing}` : "Add road"} icon={editing ? Pencil : Plus}>
          {data.locations.length < 2 ? (
            <EmptyState title="Need two locations" text="Add at least two locations before creating roads." />
          ) : (
            <form className="form" onSubmit={submit} noValidate>
              <Field label="From" error={errors.from}>
                <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
                  <option value="">Select…</option>
                  {locOptions}
                </select>
              </Field>
              <Field label="To" error={errors.to}>
                <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                  <option value="">Select…</option>
                  {locOptions}
                </select>
              </Field>
              <div className="form-row">
                <Field label="Distance (km)" error={errors.distanceKm}>
                  <input type="number" step="0.1" min="0" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value })} />
                </Field>
                <Field label="Travel time (min)" error={errors.travelTimeMin} hint="Optional">
                  <input type="number" step="0.1" min="0" value={form.travelTimeMin} onChange={(e) => setForm({ ...form, travelTimeMin: e.target.value })} />
                </Field>
              </div>
              <Field label="Road type" error={errors.roadType}>
                <select value={form.roadType} onChange={(e) => setForm({ ...form, roadType: e.target.value as RoadType })}>
                  {ROAD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <label className="check">
                <input type="checkbox" checked={form.oneWay} onChange={(e) => setForm({ ...form, oneWay: e.target.checked })} />
                One-way (only From → To)
              </label>
              <div className="row">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {editing ? <Pencil size={15} /> : <Plus size={15} />} {saving ? "Saving…" : editing ? "Save changes" : "Add road"}
                </button>
                {editing && (
                  <button className="btn" type="button" onClick={() => { setEditing(null); setForm(EMPTY); setErrors({}); }}>
                    <X size={15} /> Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </Card>

        <div className="stack">
          <Card
            title={`All roads (${data.roads.length})`}
            icon={Waypoints}
            actions={
              <>
                <div className="search">
                  <Search size={15} />
                  <input type="search" placeholder="Search road, location, type…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="seg">
                  {(["all", "two", "one"] as const).map((t) => (
                    <button key={t} className={dirFilter === t ? "on" : ""} onClick={() => setDirFilter(t)}>
                      {t === "all" ? "All" : t === "two" ? "Two-way" : "One-way"}
                    </button>
                  ))}
                </div>
                {(query || dirFilter !== "all") && <button className="btn btn-sm" onClick={() => { setQuery(""); setDirFilter("all"); }}>Reset filters</button>}
              </>
            }
          >
            {data.roads.length === 0 ? (
              <EmptyState title="No roads" text="Connect locations with roads to build the graph." />
            ) : rows.length === 0 ? (
              <EmptyState title="No matches" text="No road matches the current search and filter." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th><th>From</th><th /><th>To</th><th className="num">Distance</th><th className="num">Time</th><th>Type</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={editing === r.id ? "row-highlight" : ""}>
                        <td className="mono">{r.id}</td>
                        <td>{nameOf(r.from)}</td>
                        <td title={r.oneWay ? "one-way" : "two-way"}>{r.oneWay ? <ArrowRight size={15} /> : <ArrowLeftRight size={15} />}</td>
                        <td>{nameOf(r.to)}</td>
                        <td className="num">{r.distanceKm.toFixed(1)} km</td>
                        <td className="num">{r.travelTimeMin === null ? <span className="muted">auto</span> : `${r.travelTimeMin} min`}</td>
                        <td>
                          <Badge tone={r.roadType === "highway" ? "teal" : r.roadType === "congested" ? "rose" : "default"}>{r.roadType}</Badge>{" "}
                          {r.oneWay && <Badge tone="amber">one-way</Badge>}
                        </td>
                        <td className="actions">
                          <button className="btn btn-sm" onClick={() => startEdit(r)} aria-label={`Edit ${r.id}`}><Pencil size={13} /></button>{" "}
                          <button className="btn btn-sm btn-danger" onClick={() => remove(r)} aria-label={`Delete ${r.id}`}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {data.locations.length > 0 && (
            <Card title="Network graph" icon={Waypoints}>
              <NetworkPanel locations={data.locations} roads={data.roads} warehouseId={data.delivery.warehouseId} defaultView="graph" height={440} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
