// Backend validation. Every mutation goes through these functions, even when the form
// has already checked the input in the browser. Each one throws ValidationError, which
// the API turns into HTTP 400 with per-field messages.
import {
  ROAD_TYPES,
  type Location,
  type LocationType,
  type Road,
  type RoadType,
  type Settings,
  type StoreData,
} from "./types";

export class ValidationError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
    public status = 400,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

// IDs travel to the C++ engine as whitespace-separated tokens, so they must not contain spaces.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_STOPS = 30;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function fail(fields: Record<string, string>): never {
  const first = Object.values(fields)[0];
  throw new ValidationError(first ?? "Invalid input", fields);
}

// ---- locations -------------------------------------------------------------

export function validateLocation(
  input: Record<string, unknown>,
  data: StoreData,
  editingId?: string,
): Location {
  const errors: Record<string, string> = {};
  const id = editingId ?? String(input.id ?? "").trim();
  const name = String(input.name ?? "").trim();
  const lat = toNumber(input.lat);
  const lng = toNumber(input.lng);
  const type = String(input.type ?? "delivery") as LocationType;

  if (!editingId) {
    if (!id) errors.id = "Location ID is required.";
    else if (!ID_PATTERN.test(id)) errors.id = "ID may use letters, digits, '_' and '-' only (max 32).";
    else if (data.locations.some((l) => l.id.toLowerCase() === id.toLowerCase()))
      errors.id = `A location with ID "${id}" already exists.`;
  }
  if (!name) errors.name = "Name is required.";
  else if (name.length > 80) errors.name = "Name must be at most 80 characters.";
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.lat = "Latitude must be between -90 and 90.";
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.lng = "Longitude must be between -180 and 180.";
  if (type !== "warehouse" && type !== "delivery") errors.type = "Type must be warehouse or delivery.";

  if (Object.keys(errors).length) fail(errors);
  return { id, name, lat, lng, type };
}

export function assertLocationDeletable(id: string, data: StoreData): void {
  const roads = data.roads.filter((r) => r.from === id || r.to === id).map((r) => r.id);
  if (roads.length)
    throw new ValidationError(
      `Cannot delete "${id}": it is used by ${roads.length} road(s) (${roads.join(", ")}). Delete those roads first.`,
    );
  if (data.delivery.warehouseId === id)
    throw new ValidationError(`Cannot delete "${id}": it is the selected warehouse.`);
  if (data.delivery.stops.some((s) => s.locationId === id))
    throw new ValidationError(`Cannot delete "${id}": it is a delivery stop. Remove the stop first.`);
}

// ---- roads -----------------------------------------------------------------

export function nextRoadId(data: StoreData): string {
  let max = 0;
  for (const r of data.roads) {
    const m = /^R(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `R${String(max + 1).padStart(2, "0")}`;
}

export function validateRoad(input: Record<string, unknown>, data: StoreData, editingId?: string): Road {
  const errors: Record<string, string> = {};
  const from = String(input.from ?? "").trim();
  const to = String(input.to ?? "").trim();
  const distanceKm = toNumber(input.distanceKm);
  const rawTime = input.travelTimeMin;
  const travelTimeMin = rawTime === null || rawTime === undefined || rawTime === "" ? null : toNumber(rawTime);
  const roadType = String(input.roadType ?? "other") as RoadType;
  const oneWay = input.oneWay === true || input.oneWay === "true";

  const exists = (id: string) => data.locations.some((l) => l.id === id);
  if (!from) errors.from = "Start location is required.";
  else if (!exists(from)) errors.from = `Location "${from}" does not exist.`;
  if (!to) errors.to = "End location is required.";
  else if (!exists(to)) errors.to = `Location "${to}" does not exist.`;
  if (from && to && from === to) errors.to = "A road must connect two different locations.";
  if (!Number.isFinite(distanceKm)) errors.distanceKm = "Distance must be a number.";
  else if (distanceKm < 0) errors.distanceKm = "Negative distances are not allowed (Dijkstra needs non-negative weights).";
  else if (distanceKm === 0) errors.distanceKm = "Distance must be greater than 0 km.";
  else if (distanceKm > 10000) errors.distanceKm = "Distance must be at most 10,000 km.";
  if (travelTimeMin !== null && (!Number.isFinite(travelTimeMin) || travelTimeMin <= 0))
    errors.travelTimeMin = "Travel time must be a positive number of minutes, or left empty.";
  if (!ROAD_TYPES.includes(roadType)) errors.roadType = `Road type must be one of: ${ROAD_TYPES.join(", ")}.`;

  // Duplicate-road policy: at most one road per pair of locations. The one exception is two
  // one-way roads in opposite directions, which together behave like a two-way road with
  // different lengths in each direction.
  if (!errors.from && !errors.to) {
    const clash = data.roads.find((r) => {
      if (r.id === editingId) return false;
      const samePair = (r.from === from && r.to === to) || (r.from === to && r.to === from);
      if (!samePair) return false;
      const oppositeOneWays = r.oneWay && oneWay && r.from === to && r.to === from;
      return !oppositeOneWays;
    });
    if (clash) errors.to = `A road between ${from} and ${to} already exists (${clash.id}). Edit that road instead.`;
  }

  if (Object.keys(errors).length) fail(errors);
  return {
    id: editingId ?? nextRoadId(data),
    from,
    to,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    travelTimeMin: travelTimeMin === null ? null : Math.round(travelTimeMin * 100) / 100,
    roadType,
    oneWay,
  };
}

// ---- delivery --------------------------------------------------------------

export function validateWarehouse(id: unknown, data: StoreData): string {
  const wh = String(id ?? "").trim();
  if (!wh) throw new ValidationError("Select a warehouse / starting location.", { warehouseId: "Required." });
  if (!data.locations.some((l) => l.id === wh))
    throw new ValidationError(`Location "${wh}" does not exist.`, { warehouseId: "Unknown location." });
  if (data.delivery.stops.some((s) => s.locationId === wh))
    throw new ValidationError(`"${wh}" is currently a delivery stop. Remove it from the stops first.`);
  return wh;
}

export function validateNewStop(id: unknown, data: StoreData): string {
  const stop = String(id ?? "").trim();
  if (!stop) throw new ValidationError("Choose a location to add as a stop.");
  if (!data.locations.some((l) => l.id === stop)) throw new ValidationError(`Location "${stop}" does not exist.`);
  if (stop === data.delivery.warehouseId)
    throw new ValidationError("The warehouse is the starting point. It cannot also be a delivery stop.");
  if (data.delivery.stops.some((s) => s.locationId === stop))
    throw new ValidationError(`"${stop}" is already in the delivery list.`);
  if (data.delivery.stops.length >= MAX_STOPS) throw new ValidationError(`At most ${MAX_STOPS} stops are supported.`);
  return stop;
}

export function validatePlanRequest(data: StoreData): void {
  if (!data.delivery.warehouseId) throw new ValidationError("Select a warehouse before planning a route.");
  if (!data.locations.some((l) => l.id === data.delivery.warehouseId))
    throw new ValidationError("The selected warehouse no longer exists.");
  if (data.delivery.stops.length === 0)
    throw new ValidationError("Add at least one delivery stop before planning a route.");
}

// ---- settings --------------------------------------------------------------

export function validateSettings(input: Record<string, unknown>, current: Settings): Settings {
  const errors: Record<string, string> = {};
  const speed = input.averageSpeedKmh === undefined ? current.averageSpeedKmh : toNumber(input.averageSpeedKmh);
  const iters = input.maxIterations === undefined ? current.maxIterations : toNumber(input.maxIterations);
  const ret = input.returnToWarehouse === undefined ? current.returnToWarehouse : input.returnToWarehouse === true;
  if (!Number.isFinite(speed) || speed < 1 || speed > 200) errors.averageSpeedKmh = "Average speed must be 1–200 km/h.";
  if (!Number.isInteger(iters) || iters < 0 || iters > 100000)
    errors.maxIterations = "2-opt iteration limit must be a whole number from 0 to 100000.";
  if (Object.keys(errors).length) fail(errors);
  return { averageSpeedKmh: speed, maxIterations: iters, returnToWarehouse: ret };
}

export function requireLocation(id: string, data: StoreData): Location {
  const loc = data.locations.find((l) => l.id === id);
  if (!loc) throw new ValidationError(`Location "${id}" does not exist.`, {}, 404);
  return loc;
}
