"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Package, Plus, RotateCcw, Settings2, Sparkles, Trash2, Warehouse } from "lucide-react";
import { useAppData } from "@/components/AppData";
import { NetworkPanel } from "@/components/map/NetworkPanel";
import { Badge, Card, EmptyState, Field, LoadingBlock, PageHeader, Spinner } from "@/components/ui";
import { usePlanRunner } from "@/components/usePlanRunner";
import { ApiError, api } from "@/lib/client";
import type { StopStatus } from "@/lib/types";

export default function DeliveriesPage() {
  const { data, loading, refresh, notify, nameOf } = useAppData();
  const { run, running } = usePlanRunner();
  const [newStop, setNewStop] = useState("");
  const [filter, setFilter] = useState<"all" | StopStatus>("all");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ averageSpeedKmh: "30", maxIterations: "1000", returnToWarehouse: true });
  const [settingsErr, setSettingsErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data)
      setSettings({
        averageSpeedKmh: String(data.settings.averageSpeedKmh),
        maxIterations: String(data.settings.maxIterations),
        returnToWarehouse: data.settings.returnToWarehouse,
      });
  }, [data]);

  if (loading || !data) return <LoadingBlock />;

  const { delivery } = data;
  const stopIds = new Set(delivery.stops.map((s) => s.locationId));
  const candidates = data.locations.filter((l) => l.id !== delivery.warehouseId && !stopIds.has(l.id));
  const shown = delivery.stops.filter((s) => filter === "all" || s.status === filter);
  const completed = delivery.stops.filter((s) => s.status === "completed").length;
  const planOrder = new Map<string, number>();
  data.lastPlan?.optimised?.sequence.forEach((id, i) => {
    if (i > 0 && id !== delivery.warehouseId) planOrder.set(id, i);
  });

  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      notify("success", success);
      await refresh();
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const sp = Number(settings.averageSpeedKmh);
    const it = Number(settings.maxIterations);
    if (!(sp >= 1 && sp <= 200)) err.averageSpeedKmh = "1–200 km/h";
    if (!Number.isInteger(it) || it < 0 || it > 100000) err.maxIterations = "Whole number 0–100000";
    setSettingsErr(err);
    if (Object.keys(err).length) return;
    try {
      await api("/api/settings", "PUT", { averageSpeedKmh: sp, maxIterations: it, returnToWarehouse: settings.returnToWarehouse });
      notify("success", "Planner settings saved.");
      await refresh();
    } catch (ex) {
      if (ex instanceof ApiError) setSettingsErr(ex.fields);
      notify("error", (ex as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Deliveries"
        subtitle="Choose the warehouse (the source vertex) and the delivery stops (the K destinations). The planner must visit every reachable stop exactly once."
        actions={
          <>
            <button className="btn" disabled={busy || delivery.stops.length === 0} onClick={() => confirm("Remove all stops and clear the computed route?") && act(() => api("/api/delivery/reset", "POST"), "Delivery plan reset.")}>
              <RotateCcw size={15} /> Reset plan
            </button>
            <button className="btn btn-primary" onClick={() => run()} disabled={running || delivery.stops.length === 0 || !delivery.warehouseId}>
              {running ? <Spinner label="Optimising…" /> : <><Sparkles size={15} /> Calculate &amp; optimise</>}
            </button>
          </>
        }
      />

      <div className="grid grid-side">
        <div className="stack">
          <Card title="Warehouse / start" icon={Warehouse}>
            <Field label="Starting location" hint="Locations marked as warehouses are listed first.">
              <select
                value={delivery.warehouseId ?? ""}
                disabled={busy}
                onChange={(e) => act(() => api("/api/delivery", "PUT", { warehouseId: e.target.value }), `Warehouse set to ${nameOf(e.target.value)}.`)}
              >
                <option value="" disabled>Select…</option>
                {[...data.locations]
                  .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "warehouse" ? -1 : 1))
                  .map((l) => (
                    <option key={l.id} value={l.id} disabled={stopIds.has(l.id)}>
                      {l.type === "warehouse" ? "🏭 " : ""}
                      {l.name} ({l.id}){stopIds.has(l.id) ? " — is a stop" : ""}
                    </option>
                  ))}
              </select>
            </Field>
          </Card>

          <Card title="Add delivery stop" icon={Plus}>
            {candidates.length === 0 ? (
              <p className="muted">Every location is already selected.</p>
            ) : (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newStop) return notify("error", "Choose a location to add.");
                  act(() => api("/api/delivery/stops", "POST", { locationId: newStop }), `${nameOf(newStop)} added.`).then(() => setNewStop(""));
                }}
              >
                <select value={newStop} onChange={(e) => setNewStop(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Select location…</option>
                  {candidates.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
                  ))}
                </select>
                <button className="btn btn-dark" disabled={busy || !newStop}><Plus size={15} /> Add</button>
              </form>
            )}
          </Card>

          <Card title="Planner settings" icon={Settings2}>
            <form className="form" onSubmit={saveSettings} noValidate>
              <div className="form-row">
                <Field label="Average speed (km/h)" error={settingsErr.averageSpeedKmh} hint="Used where a road has no time">
                  <input type="number" value={settings.averageSpeedKmh} onChange={(e) => setSettings({ ...settings, averageSpeedKmh: e.target.value })} />
                </Field>
                <Field label="2-opt move limit" error={settingsErr.maxIterations} hint="0 disables 2-opt">
                  <input type="number" value={settings.maxIterations} onChange={(e) => setSettings({ ...settings, maxIterations: e.target.value })} />
                </Field>
              </div>
              <label className="check">
                <input type="checkbox" checked={settings.returnToWarehouse} onChange={(e) => setSettings({ ...settings, returnToWarehouse: e.target.checked })} />
                Return to warehouse after the last stop (closed tour)
              </label>
              <div><button className="btn" type="submit">Save settings</button></div>
            </form>
          </Card>
        </div>

        <div className="stack">
          <Card
            title={`Delivery stops (${delivery.stops.length}) · ${completed} completed`}
            icon={Package}
            actions={
              <div className="seg">
                {(["all", "pending", "completed"] as const).map((f) => (
                  <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            }
          >
            {delivery.stops.length === 0 ? (
              <EmptyState title="No delivery stops" text="Add stops from the panel on the left." />
            ) : shown.length === 0 ? (
              <EmptyState title={`No ${filter} stops`} action={<button className="btn btn-sm" onClick={() => setFilter("all")}>Show all</button>} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th className="num">Route #</th><th>Location</th><th>ID</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s.locationId}>
                        <td className="num">{planOrder.get(s.locationId) ?? <span className="muted">—</span>}</td>
                        <td>{nameOf(s.locationId)}</td>
                        <td className="mono">{s.locationId}</td>
                        <td>{s.status === "completed" ? <Badge tone="green">Completed</Badge> : <Badge tone="amber">Pending</Badge>}</td>
                        <td className="actions">
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () => api(`/api/delivery/stops/${encodeURIComponent(s.locationId)}`, "PATCH", { status: s.status === "completed" ? "pending" : "completed" }),
                                s.status === "completed" ? `${nameOf(s.locationId)} marked pending.` : `${nameOf(s.locationId)} delivered ✓`,
                              )
                            }
                          >
                            {s.status === "completed" ? <><Circle size={13} /> Mark pending</> : <><CheckCircle2 size={13} /> Mark delivered</>}
                          </button>{" "}
                          <button className="btn btn-sm btn-danger" disabled={busy} aria-label={`Remove ${s.locationId}`} onClick={() => act(() => api(`/api/delivery/stops/${encodeURIComponent(s.locationId)}`, "DELETE"), `${nameOf(s.locationId)} removed.`)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Selected stops on the map" icon={Package}>
            <NetworkPanel
              locations={data.locations}
              roads={data.roads}
              warehouseId={delivery.warehouseId}
              stopIds={delivery.stops.map((s) => s.locationId)}
              stopOrder={Object.fromEntries(planOrder)}
              height={380}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
