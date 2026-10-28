"use client";

// Lets the user switch between the street map (Leaflet/OSM) and the offline graph view,
// and shows a legend. If tiles fail to load (no internet), it suggests the graph view.
import dynamic from "next/dynamic";
import { useState } from "react";
import { Map as MapIcon, Share2, WifiOff } from "lucide-react";
import GraphView from "./GraphView";
import { COLORS, type NetworkViewProps } from "./types";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="map-frame graph-empty">Loading map…</div>,
});

export function NetworkPanel(props: NetworkViewProps & { defaultView?: "map" | "graph"; legend?: boolean }) {
  const [view, setView] = useState<"map" | "graph">(props.defaultView ?? "map");
  const [tilesFailed, setTilesFailed] = useState(false);
  const { legend = true, overlays = [] } = props;

  return (
    <div className="network-panel">
      <div className="view-toggle" role="tablist">
        <button role="tab" aria-selected={view === "map"} className={view === "map" ? "on" : ""} onClick={() => setView("map")}>
          <MapIcon size={14} /> Street map
        </button>
        <button role="tab" aria-selected={view === "graph"} className={view === "graph" ? "on" : ""} onClick={() => setView("graph")}>
          <Share2 size={14} /> Graph view
        </button>
      </div>
      {view === "map" && tilesFailed && (
        <div className="notice notice-warn">
          <WifiOff size={14} /> Map tiles could not load (offline?). The planner still works. Switch to{" "}
          <button className="link" onClick={() => setView("graph")}>
            Graph view
          </button>
          .
        </div>
      )}
      {view === "map" ? <LeafletMap {...props} onTileError={() => setTilesFailed(true)} /> : <GraphView {...props} />}
      {legend && (
        <div className="legend">
          <span><i className="lg-wh" /> Warehouse</span>
          <span><i className="lg-stop" /> Delivery stop</span>
          <span><i className="lg-other" /> Other location</span>
          <span><i className="lg-road" /> Road</span>
          <span><i className="lg-oneway" /> One-way road</span>
          {props.unreachable && props.unreachable.length > 0 && <span><i className="lg-unreach" /> Unreachable</span>}
          {overlays.map((o) => (
            <span key={o.label}>
              <i className="lg-line" style={{ background: o.dashed ? `repeating-linear-gradient(90deg, ${o.color} 0 8px, transparent 8px 13px)` : o.color }} /> {o.label}
            </span>
          ))}
          <span className="muted small">Distances are illustrative edge weights, not straight-line lengths.</span>
        </div>
      )}
    </div>
  );
}

export { COLORS };
