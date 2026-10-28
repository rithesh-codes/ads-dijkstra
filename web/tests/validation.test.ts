import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  addLocation,
  addRoad,
  addStop,
  deleteLocation,
  removeStop,
  setStopStatus,
  setWarehouse,
  updateSettings,
} from "@/lib/service";
import { ValidationError, validatePlanRequest } from "@/lib/validation";
import type { StoreData } from "@/lib/types";

const demo = (): StoreData =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "demo_data.json"), "utf8"));

function expectInvalid(fn: () => unknown, match: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as Error).message).toMatch(match);
    return;
  }
  throw new Error("expected a ValidationError");
}

describe("location validation", () => {
  it("adds a valid location", () => {
    const d = demo();
    const n = d.locations.length;
    addLocation(d, { id: "TAMBARAM", name: "Tambaram", lat: 12.9249, lng: 80.1, type: "delivery" });
    expect(d.locations).toHaveLength(n + 1);
    expect(d.locations.at(-1)).toEqual({ id: "TAMBARAM", name: "Tambaram", lat: 12.9249, lng: 80.1, type: "delivery" });
  });

  it("rejects duplicate IDs (case-insensitive)", () => {
    expectInvalid(() => addLocation(demo(), { id: "wh", name: "Dup", lat: 13, lng: 80 }), /already exists/);
  });

  it("rejects missing names and invalid coordinates", () => {
    expectInvalid(() => addLocation(demo(), { id: "X1", name: "  ", lat: 13, lng: 80 }), /Name is required/);
    expectInvalid(() => addLocation(demo(), { id: "X2", name: "Bad", lat: 95, lng: 80 }), /Latitude/);
    expectInvalid(() => addLocation(demo(), { id: "X3", name: "Bad", lat: 13, lng: "abc" }), /Longitude/);
  });

  it("rejects IDs with spaces (they would break the engine protocol)", () => {
    expectInvalid(() => addLocation(demo(), { id: "NEW STOP", name: "x", lat: 1, lng: 1 }), /letters, digits/);
  });

  it("refuses to delete a location that roads still reference", () => {
    expectInvalid(() => deleteLocation(demo(), "TNAGAR"), /used by \d+ road/);
  });

  it("deletes an unreferenced location", () => {
    const d = demo();
    deleteLocation(d, "PERUNGUDI");
    expect(d.locations.some((l) => l.id === "PERUNGUDI")).toBe(false);
  });
});

describe("road validation", () => {
  it("rejects nonexistent endpoints", () => {
    expectInvalid(() => addRoad(demo(), { from: "WH", to: "NOWHERE", distanceKm: 3 }), /does not exist/);
  });

  it("rejects negative and zero distances", () => {
    expectInvalid(() => addRoad(demo(), { from: "WH", to: "PERUNGUDI", distanceKm: -4 }), /Negative/);
    expectInvalid(() => addRoad(demo(), { from: "WH", to: "PERUNGUDI", distanceKm: 0 }), /greater than 0/);
  });

  it("rejects self loops", () => {
    expectInvalid(() => addRoad(demo(), { from: "WH", to: "WH", distanceKm: 1 }), /two different/);
  });

  it("rejects duplicate roads in either direction", () => {
    expectInvalid(() => addRoad(demo(), { from: "SAIDAPET", to: "WH", distanceKm: 9 }), /already exists \(R01\)/);
  });

  it("allows two opposite one-way roads but not a second road in the same direction", () => {
    const d = demo();
    // R28 is ANNANAGAR -> KODAM, one-way.
    const r = addRoad(d, { from: "KODAM", to: "ANNANAGAR", distanceKm: 5.5, oneWay: true, roadType: "local" });
    expect(r.id).toBe("R29");
    expectInvalid(() => addRoad(d, { from: "ANNANAGAR", to: "KODAM", distanceKm: 4, oneWay: true }), /already exists/);
  });
});

describe("delivery validation", () => {
  it("rejects an empty delivery selection when planning", () => {
    const d = demo();
    d.delivery.stops = [];
    expect(() => validatePlanRequest(d)).toThrow(/at least one delivery stop/);
  });

  it("rejects duplicate stops, unknown stops, and the warehouse as a stop", () => {
    const d = demo();
    expectInvalid(() => addStop(d, "MYLAPORE"), /already in the delivery list/);
    expectInvalid(() => addStop(d, "ZZZ"), /does not exist/);
    expectInvalid(() => addStop(d, "WH"), /warehouse/);
  });

  it("adds, completes, and removes a stop", () => {
    const d = demo();
    addStop(d, "TNAGAR");
    expect(d.delivery.stops.at(-1)).toEqual({ locationId: "TNAGAR", status: "pending" });
    setStopStatus(d, "TNAGAR", "completed");
    expect(d.delivery.stops.find((s) => s.locationId === "TNAGAR")?.status).toBe("completed");
    removeStop(d, "TNAGAR");
    expect(d.delivery.stops.some((s) => s.locationId === "TNAGAR")).toBe(false);
  });

  it("cannot make a current stop the warehouse", () => {
    expectInvalid(() => setWarehouse(demo(), "PORUR"), /currently a delivery stop/);
  });

  it("invalidates the saved plan when stops change but not when status changes", () => {
    const d = demo();
    d.lastPlan = { feasible: true } as StoreData["lastPlan"];
    setStopStatus(d, "PORUR", "completed");
    expect(d.lastPlan).not.toBeNull();
    removeStop(d, "PORUR");
    expect(d.lastPlan).toBeNull();
  });

  it("validates settings", () => {
    expectInvalid(() => updateSettings(demo(), { averageSpeedKmh: 0 }), /speed/);
    expectInvalid(() => updateSettings(demo(), { maxIterations: 2.5 }), /whole number/);
    const d = demo();
    expect(updateSettings(d, { averageSpeedKmh: 40, returnToWarehouse: false })).toEqual({
      averageSpeedKmh: 40,
      returnToWarehouse: false,
      maxIterations: 1000,
    });
  });
});
