"use client";

// Offline graph view: draws the road network as a node-link diagram in SVG, using the
// stored coordinates (equirectangular projection). It needs no tiles or network access.
import { useMemo } from "react";
import { COLORS, type NetworkViewProps } from "./types";

const W = 900;
const PAD = 48;

export default function GraphView(props: NetworkViewProps) {
  const {
    locations,
    roads,
    overlays = [],
    warehouseId,
    stopOrder = {},
    stopIds = [],
    unreachable = [],
    nodeState = {},
    nodeLabels = {},
    activeEdge = null,
    height = 420,
    showWeights = true,
  } = props;

  const { pos, H } = useMemo(() => {
    const lats = locations.map((l) => l.lat);
    const lngs = locations.map((l) => l.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const spanX = Math.max((maxLng - minLng) * Math.cos(midLat), 1e-6);
    const spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = (W - 2 * PAD) / spanX;
    const h = Math.min(Math.max(spanY * scale + 2 * PAD, 320), 900);
    const sy = Math.min(scale, (h - 2 * PAD) / spanY);
    const p = new Map<string, { x: number; y: number }>();
    for (const l of locations) {
      p.set(l.id, {
        x: PAD + (l.lng - minLng) * Math.cos(midLat) * scale,
        y: PAD + (maxLat - l.lat) * sy,
      });
    }
    return { pos: p, H: h };
  }, [locations]);

  if (locations.length === 0) return <div className="map-frame graph-empty">No locations to draw.</div>;

  const isActive = (a: string, b: string) =>
    !!activeEdge && ((activeEdge[0] === a && activeEdge[1] === b) || (activeEdge[0] === b && activeEdge[1] === a));

  return (
    <div className="map-frame graph-frame" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Road network graph">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS.road} />
          </marker>
        </defs>
        {roads.map((r) => {
          const a = pos.get(r.from), b = pos.get(r.to);
          if (!a || !b) return null;
          const active = isActive(r.from, r.to);
          // Pull a one-way arrowhead back so it is not hidden under the node circle.
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
          const ex = r.oneWay ? b.x - (dx / len) * 16 : b.x;
          const ey = r.oneWay ? b.y - (dy / len) * 16 : b.y;
          return (
            <g key={r.id}>
              <line
                x1={a.x} y1={a.y} x2={ex} y2={ey}
                stroke={active ? "#f97316" : COLORS.road}
                strokeWidth={active ? 5 : 2.2}
                strokeDasharray={r.oneWay ? "6 5" : undefined}
                markerEnd={r.oneWay ? "url(#arrow)" : undefined}
              />
              {showWeights && (
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="edge-label">
                  {r.distanceKm}
                </text>
              )}
            </g>
          );
        })}
        {overlays.map((o, idx) => {
          const pts = o.path.map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
          if (pts.length < 2) return null;
          return (
            <polyline
              key={`${o.label}-${idx}`}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={o.color}
              strokeWidth={o.weight ?? 6}
              strokeOpacity={0.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={o.dashed ? "12 9" : undefined}
            >
              <title>{o.label}</title>
            </polyline>
          );
        })}
        {locations.map((l) => {
          const p = pos.get(l.id)!;
          const isWh = l.id === warehouseId;
          const order = stopOrder[l.id];
          const isStop = order !== undefined || stopIds.includes(l.id);
          const isUnreach = unreachable.includes(l.id);
          const state = nodeState[l.id];
          let fill = isWh ? COLORS.warehouse : isStop ? COLORS.stop : "#fff";
          let stroke = isWh ? "#b45309" : isStop ? "#115e59" : COLORS.other;
          if (state === "settled") { fill = "#0f766e"; stroke = "#134e4a"; }
          if (state === "frontier") { fill = "#fde68a"; stroke = "#d97706"; }
          if (state === "current") { fill = "#f97316"; stroke = "#9a3412"; }
          if (isUnreach) stroke = COLORS.unreachable;
          const r = isWh || isStop || state ? 13 : 8;
          return (
            <g key={l.id}>
              {isWh ? (
                <rect x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} rx={4} fill={fill} stroke={stroke} strokeWidth={2.5} />
              ) : (
                <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={stroke} strokeWidth={isUnreach ? 3.5 : 2.2} strokeDasharray={isUnreach ? "3 2" : undefined} />
              )}
              {(isWh || order !== undefined) && (
                <text x={p.x} y={p.y + 4} className="node-num">
                  {isWh ? "W" : order}
                </text>
              )}
              <text x={p.x} y={p.y - r - 6} className="node-label">
                {l.id}
              </text>
              {nodeLabels[l.id] && (
                <text x={p.x} y={p.y + r + 14} className="node-sub">
                  {nodeLabels[l.id]}
                </text>
              )}
              <title>{`${l.name} (${l.id})`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
