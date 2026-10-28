// Shared data shapes used by the API routes, the store, and the UI.
// Field names match data/demo_data.json and the engine's JSON output.

export type LocationType = "warehouse" | "delivery";
export type RoadType = "highway" | "arterial" | "local" | "congested" | "other";
export type StopStatus = "pending" | "completed";

export const ROAD_TYPES: RoadType[] = ["highway", "arterial", "local", "congested", "other"];

export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: LocationType;
}

export interface Road {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  travelTimeMin: number | null;
  roadType: RoadType;
  oneWay: boolean;
}

export interface DeliveryStop {
  locationId: string;
  status: StopStatus;
}

export interface Delivery {
  warehouseId: string | null;
  stops: DeliveryStop[];
}

export interface Settings {
  averageSpeedKmh: number;
  returnToWarehouse: boolean;
  maxIterations: number;
}

// ---- engine output -------------------------------------------------------

export interface Leg {
  from: string;
  to: string;
  distance: number;
  timeMin: number;
  path: string[];
  roads: string[];
}

export interface RouteDetail {
  sequence: string[];
  distance: number;
  timeMin: number;
  legs: Leg[];
  fullPath: string[];
}

export interface NNStep {
  from: string;
  chosen: string;
  distance: number;
  candidates: { id: string; distance: number | null }[];
}

export interface TwoOptMove {
  pass: number;
  i: number;
  j: number;
  delta: number;
  costAfter: number;
}

export interface PlanResult {
  ok: true;
  feasible: boolean;
  reason?: string;
  warehouse: string;
  returnToWarehouse: boolean;
  averageSpeedKmh: number;
  requestedStops: string[];
  plannedStops: string[];
  unreachableStops: string[];
  dijkstraRuns?: number;
  matrix?: { labels: string[]; values: (number | null)[][] };
  nearestNeighbour?: { steps: NNStep[]; sequence?: string[]; cost?: number };
  twoOpt?: {
    sequence: string[];
    cost: number;
    passes: number;
    movesEvaluated: number;
    maxIterations: number;
    hitIterationLimit: boolean;
    symmetricMatrix: boolean;
    moves: TwoOptMove[];
  };
  exact?: {
    computed: boolean;
    maxStops: number;
    sequence?: string[];
    cost?: number;
    nnGapPercent?: number;
    twoOptGapPercent?: number;
  };
  initial?: RouteDetail;
  optimised?: RouteDetail;
  stats?: {
    initialDistance: number;
    optimisedDistance: number;
    savedKm: number;
    improvementPercent: number;
    stops: number;
    estimatedTimeMin: number;
  };
  computedAt: string;
  engineMs: number;
}

export interface PathResult {
  source: string;
  target: string;
  reachable: boolean;
  distance: number | null;
  timeMin: number | null;
  path: string[];
  roads: string[];
  verticesSettled: number;
}

export interface ReachResult {
  source: string;
  reachable: { id: string; distance: number; hops: number; parent: string }[];
  unreachable: string[];
}

export interface TraceEvent {
  type: "init" | "pop" | "relax" | "no-improve" | "skip-settled";
  u: string;
  v: string;
  weight: number;
  oldDist: number | null;
  newDist: number | null;
  heap: { id: string; key: number }[];
}

export interface TraceResult {
  source: string;
  events: TraceEvent[];
  final: { id: string; distance: number | null; parent: string }[];
}

export interface GraphInfo {
  vertices: number;
  roads: number;
  arcs: number;
  symmetric: boolean;
  density: number;
  memory: { adjacencyListCells: number; adjacencyMatrixCells: number };
  adjacency: { id: string; degree: number; edges: { to: string; weight: number; roadId: string }[] }[];
  components: string[][];
}

// ---- persisted store -----------------------------------------------------

export interface StoreData {
  version: number;
  description?: string;
  locations: Location[];
  roads: Road[];
  delivery: Delivery;
  settings: Settings;
  lastPlan: PlanResult | null;
}
