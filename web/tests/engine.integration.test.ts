// End-to-end tests: TypeScript bridge -> real C++ binary -> JSON. These need the engine
// to be built first (npm run engine:build).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { enginePath, serializeRequest } from "@/lib/engine";
import { computePlan, reachability, shortestPath } from "@/lib/service";
import type { StoreData } from "@/lib/types";

const demo = (): StoreData =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "demo_data.json"), "utf8"));

const hasEngine = fs.existsSync(enginePath());

function roadBetween(d: StoreData, a: string, b: string) {
  return d.roads.find((r) => (r.from === a && r.to === b) || (!r.oneWay && r.from === b && r.to === a));
}

describe("engine protocol serialisation", () => {
  it("writes nodes, edges, and params in the documented format", () => {
    const text = serializeRequest(
      "path",
      [
        { id: "A", name: "A", lat: 0, lng: 0, type: "warehouse" },
        { id: "B", name: "B", lat: 0, lng: 1, type: "delivery" },
      ],
      [{ id: "R1", from: "A", to: "B", distanceKm: 2.5, travelTimeMin: null, roadType: "local", oneWay: true }],
      { source: "A", stops: ["B"], return: false },
    );
    expect(text).toBe(
      "COMMAND path\nNODES 2\nA\nB\nEDGES 1\nR1 A B 2.5 -1 1\nPARAM source A\nPARAM stops 1 B\nPARAM return 0\nEND\n",
    );
  });
});

describe.skipIf(!hasEngine)("C++ engine integration", () => {
  it("finds an indirect path that is shorter than the direct road", async () => {
    const d = demo();
    const direct = roadBetween(d, "WH", "MYLAPORE")!;
    const r = await shortestPath(d, "WH", "MYLAPORE");
    expect(r.reachable).toBe(true);
    expect(r.distance!).toBeLessThan(direct.distanceKm);
    expect(r.path).not.toEqual(["WH", "MYLAPORE"]);
    // The distance must equal the sum of the roads on the returned path.
    const sum = r.path.slice(1).reduce((acc, v, i) => acc + roadBetween(d, r.path[i], v)!.distanceKm, 0);
    expect(r.distance!).toBeCloseTo(sum, 6);
  });

  it("reports the isolated depot as unreachable", async () => {
    const r = await reachability(demo(), "WH");
    expect(r.unreachable).toEqual(["PERUNGUDI"]);
    const p = await shortestPath(demo(), "WH", "PERUNGUDI");
    expect(p.reachable).toBe(false);
    expect(p.distance).toBeNull();
  });

  it("plans a multi-stop route that visits every selected stop exactly once", async () => {
    const d = demo();
    const plan = await computePlan(d);
    expect(plan.feasible).toBe(true);
    const seq = plan.optimised!.sequence;
    expect(seq[0]).toBe("WH");
    expect(seq.at(-1)).toBe("WH"); // returnToWarehouse is true in the demo settings
    const visited = seq.slice(1, -1);
    expect([...visited].sort()).toEqual(d.delivery.stops.map((s) => s.locationId).sort());
    expect(new Set(visited).size).toBe(visited.length);
  });

  it("computes statistics from real distances", async () => {
    const plan = await computePlan(demo());
    const s = plan.stats!;
    expect(s.optimisedDistance).toBeLessThanOrEqual(s.initialDistance + 1e-9); // 2-opt never makes it worse
    expect(s.savedKm).toBeCloseTo(s.initialDistance - s.optimisedDistance, 6);
    expect(s.improvementPercent).toBeCloseTo((s.savedKm / s.initialDistance) * 100, 6);
    const legSum = plan.optimised!.legs.reduce((a, l) => a + l.distance, 0);
    expect(plan.optimised!.distance).toBeCloseTo(legSum, 6);
    expect(plan.optimised!.distance).toBeCloseTo(s.optimisedDistance, 6);
    expect(plan.exact!.computed).toBe(true);
    expect(plan.exact!.cost!).toBeLessThanOrEqual(s.optimisedDistance + 1e-9); // the optimum is a lower bound
  });

  it("reconstructs a continuous road route across all segments", async () => {
    const d = demo();
    const plan = await computePlan(d);
    const walk = plan.optimised!.fullPath;
    for (let i = 0; i + 1 < walk.length; i++) {
      expect(walk[i]).not.toBe(walk[i + 1]); // no duplicate vertex where legs meet
      expect(roadBetween(d, walk[i], walk[i + 1]), `${walk[i]}->${walk[i + 1]}`).toBeDefined();
    }
    const expectedLen = plan.optimised!.legs.reduce((a, l) => a + l.path.length, 0) - (plan.optimised!.legs.length - 1);
    expect(walk).toHaveLength(expectedLen);
  });

  it("skips unreachable stops and reports them", async () => {
    const d = demo();
    d.delivery.stops.push({ locationId: "PERUNGUDI", status: "pending" });
    const plan = await computePlan(d);
    expect(plan.unreachableStops).toEqual(["PERUNGUDI"]);
    expect(plan.optimised!.sequence).not.toContain("PERUNGUDI");
  });

  it("shows zero improvement when 2-opt is disabled", async () => {
    const d = demo();
    d.settings.maxIterations = 0;
    const plan = await computePlan(d);
    expect(plan.stats!.improvementPercent).toBe(0);
    expect(plan.stats!.savedKm).toBe(0);
    expect(plan.optimised!.sequence).toEqual(plan.initial!.sequence);
  });

  it("handles a single stop", async () => {
    const d = demo();
    d.delivery.stops = [{ locationId: "TNAGAR", status: "pending" }];
    const plan = await computePlan(d);
    expect(plan.optimised!.sequence).toEqual(["WH", "TNAGAR", "WH"]);
    const p = await shortestPath(d, "WH", "TNAGAR");
    expect(plan.stats!.optimisedDistance).toBeCloseTo(2 * p.distance!, 6);
  });
});
