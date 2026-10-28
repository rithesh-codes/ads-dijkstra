import type { Location, Road } from "@/lib/types";

// A path drawn on top of the road network (e.g. the optimised route or one shortest path).
export interface RouteOverlay {
  path: string[];
  color: string;
  label: string;
  dashed?: boolean;
  weight?: number;
}

export type NodeState = "settled" | "frontier" | "current";

export interface NetworkViewProps {
  locations: Location[];
  roads: Road[];
  overlays?: RouteOverlay[];
  warehouseId?: string | null;
  stopOrder?: Record<string, number>; // number shown on the marker (visit order)
  stopIds?: string[]; // delivery stops without an order yet
  unreachable?: string[];
  nodeState?: Record<string, NodeState>; // Algorithm Lab colouring (graph view)
  nodeLabels?: Record<string, string>; // extra label under a node, e.g. "d=4.2"
  activeEdge?: [string, string] | null;
  height?: number;
  showWeights?: boolean;
  onTileError?: () => void;
}

export const COLORS = {
  warehouse: "#f59e0b",
  stop: "#0d9488",
  other: "#64748b",
  road: "#94a3b8",
  optimised: "#0d9488",
  initial: "#e11d48",
  path: "#7c3aed",
  unreachable: "#dc2626",
};
