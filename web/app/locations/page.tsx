"use client";

import { useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useAppData } from "@/components/AppData";
import { NetworkPanel } from "@/components/map/NetworkPanel";
import { Badge, Card, EmptyState, Field, LoadingBlock, PageHeader } from "@/components/ui";
import { ApiError, api } from "@/lib/client";
import type { Location, LocationType } from "@/lib/types";

const EMPTY = { id: "", name: "", lat: "", lng: "", type: "delivery" as LocationType };

export default function LocationsPage() {
  const { data, loading, refresh, notify } = useAppData();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | LocationType>("all");

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.roads ?? []) {
      m.set(r.from, (m.get(r.from) ?? 0) + 1);
      m.set(r.to, (m.get(r.to) ?? 0) + 1);
    }
    return m;
  }, [data]);

  if (loading || !data) return <LoadingBlock />;

  const q = query.trim().toLowerCase();
  const rows = data.locations.filter(
    (l) => (typeFilter === "all" || l.type === typeFilter) && (!q || l.id.toLowerCase().includes(q) || l.name.toLowerCase().includes(q)),
  );

  function validateClient(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!editing && !/^[A-Za-z0-9_-]{1,32}$/.test(form.id.trim())) e.id = "Use 1–32 letters, digits, '_' or '-'.";
    if (!form.name.trim()) e.name = "Name is required.";
    const lat = Number(form.lat), lng = Number(form.lng);
    if (form.lat === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = "Latitude must be between -90 and 90.";
    if (form.lng === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = "Longitude must be between -180 and 180.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validateClient();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { ...form, id: form.id.trim(), lat: Number(form.lat), lng: Number(form.lng) };
      if (editing) await api(`/api/locations/${encodeURIComponent(editing)}`, "PUT", body);
      else await api("/api/locations", "POST", body);
      notify("success", editing ? `Location ${editing} updated.` : `Location ${body.id} added.`);
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

  function startEdit(l: Location) {
    setEditing(l.id);
    setErrors({});
    setForm({ id: l.id, name: l.name, lat: String(l.lat), lng: String(l.lng), type: l.type });
  }

  async function remove(l: Location) {
    if (!confirm(`Delete location "${l.name}" (${l.id})?`)) return;
    try {
      await api(`/api/locations/${encodeURIComponent(l.id)}`, "DELETE");
      notify("success", `Location ${l.id} deleted.`);
      if (editing === l.id) { setEditing(null); setForm(EMPTY); }
      await refresh();
    } catch (err) {
      notify("error", (err as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Locations" subtitle="Each location is a vertex of the road graph. IDs are permanent keys used by roads and the C++ engine. Coordinates are used only for drawing; route lengths come from road weights." />
      <div className="grid grid-side">
        <Card title={editing ? `Edit ${editing}` : "Add location"} icon={editing ? Pencil : Plus}>
          <form className="form" onSubmit={submit} noValidate>
            <Field label="Location ID" error={errors.id} hint={editing ? "IDs cannot be changed." : "e.g. TAMBARAM"}>
              <input type="text" value={form.id} disabled={!!editing} onChange={(e) => setForm({ ...form, id: e.target.value })} />
            </Field>
            <Field label="Name" error={errors.name}>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="form-row">
              <Field label="Latitude" error={errors.lat}>
                <input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              </Field>
              <Field label="Longitude" error={errors.lng}>
                <input type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
              </Field>
            </div>
            <Field label="Type" error={errors.type}>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LocationType })}>
                <option value="delivery">Delivery point</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </Field>
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {editing ? <Pencil size={15} /> : <Plus size={15} />} {saving ? "Saving…" : editing ? "Save changes" : "Add location"}
              </button>
              {editing && (
                <button className="btn" type="button" onClick={() => { setEditing(null); setForm(EMPTY); setErrors({}); }}>
                  <X size={15} /> Cancel
                </button>
              )}
            </div>
          </form>
        </Card>

        <div className="stack">
          <Card
            title={`All locations (${data.locations.length})`}
            icon={MapPin}
            actions={
              <>
                <div className="search">
                  <Search size={15} />
                  <input type="search" placeholder="Search by name or ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="seg">
                  {(["all", "warehouse", "delivery"] as const).map((t) => (
                    <button key={t} className={typeFilter === t ? "on" : ""} onClick={() => setTypeFilter(t)}>
                      {t === "all" ? "All" : t === "warehouse" ? "Warehouses" : "Delivery"}
                    </button>
                  ))}
                </div>
                {(query || typeFilter !== "all") && (
                  <button className="btn btn-sm" onClick={() => { setQuery(""); setTypeFilter("all"); }}>Reset filters</button>
                )}
              </>
            }
          >
            {data.locations.length === 0 ? (
              <EmptyState title="No locations" text="Add your first location using the form." />
            ) : rows.length === 0 ? (
              <EmptyState title="No matches" text="No location matches the current search and filter." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th><th>Name</th><th>Type</th><th className="num">Lat</th><th className="num">Lng</th><th className="num">Roads</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id} className={editing === l.id ? "row-highlight" : ""}>
                        <td className="mono">{l.id}</td>
                        <td>{l.name}</td>
                        <td>{l.type === "warehouse" ? <Badge tone="amber">Warehouse</Badge> : <Badge tone="teal">Delivery</Badge>}</td>
                        <td className="num">{l.lat.toFixed(4)}</td>
                        <td className="num">{l.lng.toFixed(4)}</td>
                        <td className="num">{degree.get(l.id) ? degree.get(l.id) : <Badge tone="rose">isolated</Badge>}</td>
                        <td className="actions">
                          <button className="btn btn-sm" onClick={() => startEdit(l)} aria-label={`Edit ${l.id}`}><Pencil size={13} /></button>{" "}
                          <button className="btn btn-sm btn-danger" onClick={() => remove(l)} aria-label={`Delete ${l.id}`}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {data.locations.length > 0 && (
            <Card title="Location map" icon={MapPin}>
              <NetworkPanel locations={data.locations} roads={data.roads} warehouseId={data.delivery.warehouseId} stopIds={data.delivery.stops.map((s) => s.locationId)} height={360} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
