import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Each test gets its own temporary store file, so the real data/store.json is never touched.
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "route-store-"));
  process.env.ROUTE_STORE_PATH = path.join(dir, "store.json");
  vi.resetModules();
});

afterEach(() => {
  delete process.env.ROUTE_STORE_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("JSON persistence", () => {
  it("creates the store from demo data on first load", async () => {
    const { loadStore } = await import("@/lib/store");
    const data = loadStore();
    expect(fs.existsSync(process.env.ROUTE_STORE_PATH!)).toBe(true);
    expect(data.locations.length).toBeGreaterThanOrEqual(10);
    expect(data.roads.length).toBeGreaterThanOrEqual(15);
  });

  it("keeps changes after the application restarts (module reload)", async () => {
    const first = await import("@/lib/store");
    const service = await import("@/lib/service");
    first.mutateStore((d) => {
      service.addLocation(d, { id: "TAMBARAM", name: "Tambaram", lat: 12.92, lng: 80.1 });
      service.addRoad(d, { from: "TAMBARAM", to: "VELACHERY", distanceKm: 11.2, roadType: "arterial" });
      service.setStopStatus(d, "PORUR", "completed");
    });

    vi.resetModules(); // simulate a server restart: fresh modules, same file on disk
    const second = await import("@/lib/store");
    const reloaded = second.loadStore();
    expect(reloaded.locations.find((l) => l.id === "TAMBARAM")?.name).toBe("Tambaram");
    expect(reloaded.roads.find((r) => r.from === "TAMBARAM")?.distanceKm).toBe(11.2);
    expect(reloaded.delivery.stops.find((s) => s.locationId === "PORUR")?.status).toBe("completed");
  });

  it("does not save when a mutation fails validation", async () => {
    const { loadStore, mutateStore } = await import("@/lib/store");
    const service = await import("@/lib/service");
    const before = loadStore().locations.length;
    expect(() => mutateStore((d) => service.addLocation(d, { id: "WH", name: "dup", lat: 1, lng: 1 }))).toThrow();
    expect(loadStore().locations.length).toBe(before);
  });

  it("reset-to-demo restores the original dataset", async () => {
    const { loadStore, mutateStore, resetToDemo, loadDemo } = await import("@/lib/store");
    loadStore();
    mutateStore((d) => {
      d.roads = [];
    });
    expect(loadStore().roads).toHaveLength(0);
    resetToDemo();
    expect(loadStore().roads).toHaveLength(loadDemo().roads.length);
  });

  it("recovers from a corrupted store file", async () => {
    fs.writeFileSync(process.env.ROUTE_STORE_PATH!, "{ not json");
    const { loadStore } = await import("@/lib/store");
    expect(loadStore().locations.length).toBeGreaterThan(0);
    expect(fs.readdirSync(dir).some((f) => f.includes(".corrupt-"))).toBe(true);
  });
});
