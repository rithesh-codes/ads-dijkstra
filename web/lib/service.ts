// Delivery service: business rules on top of the store. The mutation functions
// change StoreData in place (and are easy to unit test). The planning functions call
// the C++ engine.
import { runEngine } from "./engine";
import type {
  GraphInfo,
  PathResult,
  PlanResult,
  ReachResult,
  StopStatus,
  StoreData,
  TraceResult,
} from "./types";
import {
  ValidationError,
  assertLocationDeletable,
  requireLocation,
  validateLocation,
  validateNewStop,
  validatePlanRequest,
  validateRoad,
  validateSettings,
  validateWarehouse,
} from "./validation";

// Any change to the graph or the delivery plan makes the stored route out of date.
function invalidatePlan(data: StoreData) {
  data.lastPlan = null;
}

// ---- locations
export function addLocation(data: StoreData, input: Record<string, unknown>) {
  const loc = validateLocation(input, data);
  data.locations.push(loc);
  invalidatePlan(data);
  return loc;
}

export function updateLocation(data: StoreData, id: string, input: Record<string, unknown>) {
  requireLocation(id, data);
  const loc = validateLocation(input, data, id);
  data.locations = data.locations.map((l) => (l.id === id ? loc : l));
  invalidatePlan(data);
  return loc;
}

export function deleteLocation(data: StoreData, id: string) {
  requireLocation(id, data);
  assertLocationDeletable(id, data);
  data.locations = data.locations.filter((l) => l.id !== id);
  invalidatePlan(data);
}

// ---- roads
export function addRoad(data: StoreData, input: Record<string, unknown>) {
  const road = validateRoad(input, data);
  data.roads.push(road);
  invalidatePlan(data);
  return road;
}

export function updateRoad(data: StoreData, id: string, input: Record<string, unknown>) {
  if (!data.roads.some((r) => r.id === id)) throw new ValidationError(`Road "${id}" does not exist.`, {}, 404);
  const road = validateRoad(input, data, id);
  data.roads = data.roads.map((r) => (r.id === id ? road : r));
  invalidatePlan(data);
  return road;
}

export function deleteRoad(data: StoreData, id: string) {
  if (!data.roads.some((r) => r.id === id)) throw new ValidationError(`Road "${id}" does not exist.`, {}, 404);
  data.roads = data.roads.filter((r) => r.id !== id);
  invalidatePlan(data);
}

// ---- delivery
export function setWarehouse(data: StoreData, id: unknown) {
  data.delivery.warehouseId = validateWarehouse(id, data);
  invalidatePlan(data);
}

export function addStop(data: StoreData, id: unknown) {
  const stop = validateNewStop(id, data);
  data.delivery.stops.push({ locationId: stop, status: "pending" });
  invalidatePlan(data);
}

export function removeStop(data: StoreData, id: string) {
  if (!data.delivery.stops.some((s) => s.locationId === id))
    throw new ValidationError(`"${id}" is not a delivery stop.`, {}, 404);
  data.delivery.stops = data.delivery.stops.filter((s) => s.locationId !== id);
  invalidatePlan(data);
}

// Marking a stop delivered does not change the route, so the plan stays valid.
export function setStopStatus(data: StoreData, id: string, status: unknown) {
  if (status !== "pending" && status !== "completed")
    throw new ValidationError("Status must be pending or completed.");
  const stop = data.delivery.stops.find((s) => s.locationId === id);
  if (!stop) throw new ValidationError(`"${id}" is not a delivery stop.`, {}, 404);
  stop.status = status as StopStatus;
}

export function resetDeliveryPlan(data: StoreData) {
  data.delivery.stops = [];
  invalidatePlan(data);
}

export function updateSettings(data: StoreData, input: Record<string, unknown>) {
  data.settings = validateSettings(input, data.settings);
  invalidatePlan(data);
  return data.settings;
}

// ---- engine-backed queries
export async function computePlan(data: StoreData): Promise<PlanResult> {
  validatePlanRequest(data);
  const result = await runEngine<Omit<PlanResult, "computedAt" | "engineMs">>("plan", data.locations, data.roads, {
    warehouse: data.delivery.warehouseId!,
    stops: data.delivery.stops.map((s) => s.locationId),
    return: data.settings.returnToWarehouse,
    maxiter: data.settings.maxIterations,
    speed: data.settings.averageSpeedKmh,
  });
  return { ...result, computedAt: new Date().toISOString() } as PlanResult;
}

export async function shortestPath(data: StoreData, source: unknown, target: unknown) {
  const s = String(source ?? "");
  const t = String(target ?? "");
  if (!s || !t) throw new ValidationError("Choose both a start and an end location.");
  requireLocation(s, data);
  requireLocation(t, data);
  return runEngine<PathResult>("path", data.locations, data.roads, {
    source: s,
    target: t,
    speed: data.settings.averageSpeedKmh,
  });
}

export async function reachability(data: StoreData, source: unknown) {
  const s = String(source ?? "");
  if (!s) throw new ValidationError("Choose a source location.");
  requireLocation(s, data);
  return runEngine<ReachResult>("reach", data.locations, data.roads, { source: s });
}

export async function dijkstraTrace(data: StoreData, source: unknown) {
  const s = String(source ?? "");
  if (!s) throw new ValidationError("Choose a source location.");
  requireLocation(s, data);
  return runEngine<TraceResult>("trace", data.locations, data.roads, { source: s });
}

export async function graphInfo(data: StoreData) {
  return runEngine<GraphInfo>("info", data.locations, data.roads);
}
