"use client";

// Street-map view (Leaflet + OpenStreetMap tiles). Roads are drawn as straight segments
// between their endpoints. Road *lengths* come from the stored edge weights, never from
// the straight-line geometry on screen.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { COLORS, type NetworkViewProps } from "./types";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 13, { animate: false });
    else map.fitBounds(L.latLngBounds(points), { padding: [30, 30], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function markerIcon(kind: "warehouse" | "stop" | "other" | "unreachable", label?: string | number) {
  const html =
    kind === "warehouse"
      ? `<div class="mk mk-wh">W</div>`
      : kind === "stop"
        ? `<div class="mk mk-stop">${label ?? ""}</div>`
        : kind === "unreachable"
          ? `<div class="mk mk-unreach">!</div>`
          : `<div class="mk mk-other"></div>`;
  const size = kind === "other" ? 12 : 26;
  return L.divIcon({ html, className: "mk-wrap", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export default function LeafletMap(props: NetworkViewProps) {
  const { locations, roads, overlays = [], warehouseId, stopOrder = {}, stopIds = [], unreachable = [], height = 420 } = props;
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const points = locations.map((l) => [l.lat, l.lng] as [number, number]);
  const center: [number, number] = points[0] ?? [13.04, 80.23];

  return (
    <div style={{ height }} className="map-frame">
      {/* Gentle zoom: fractional quarter-level steps, and three times more scrolling per
          zoom level than Leaflet's default (wheelPxPerZoomLevel 60). */}
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={180}
        wheelDebounceTime={60}
        zoomAnimation={false}
        markerZoomAnimation={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => props.onTileError?.() }}
        />
        <FitBounds points={points} />
        {roads.map((r) => {
          const a = byId.get(r.from);
          const b = byId.get(r.to);
          if (!a || !b) return null;
          return (
            <Polyline
              key={r.id}
              positions={[
                [a.lat, a.lng],
                [b.lat, b.lng],
              ]}
              pathOptions={{ color: COLORS.road, weight: 3, opacity: 0.75, dashArray: r.oneWay ? "6 6" : undefined }}
            >
              <Tooltip sticky>
                {r.id}: {a.name} {r.oneWay ? "→" : "↔"} {b.name} · {r.distanceKm} km
              </Tooltip>
            </Polyline>
          );
        })}
        {overlays.map((o, idx) => {
          const pts = o.path.map((id) => byId.get(id)).filter(Boolean).map((l) => [l!.lat, l!.lng] as [number, number]);
          return (
            <Polyline
              key={`${o.label}-${idx}`}
              positions={pts}
              pathOptions={{ color: o.color, weight: o.weight ?? 6, opacity: 0.85, dashArray: o.dashed ? "10 8" : undefined }}
            >
              <Tooltip sticky>{o.label}</Tooltip>
            </Polyline>
          );
        })}
        {locations.map((l) => {
          const isWh = l.id === warehouseId;
          const order = stopOrder[l.id];
          const isStop = order !== undefined || stopIds.includes(l.id);
          const isUnreach = unreachable.includes(l.id);
          const kind = isWh ? "warehouse" : isUnreach ? "unreachable" : isStop ? "stop" : "other";
          return (
            <Marker key={l.id} position={[l.lat, l.lng]} icon={markerIcon(kind, order)}>
              <Popup>
                <strong>{l.name}</strong>
                <br />
                ID: {l.id} · {isWh ? "Warehouse" : l.type === "warehouse" ? "Warehouse (not selected)" : "Delivery point"}
                {order !== undefined && (
                  <>
                    <br />
                    Visit order: #{order}
                  </>
                )}
                {isUnreach && (
                  <>
                    <br />
                    <span style={{ color: COLORS.unreachable }}>Unreachable from the warehouse</span>
                  </>
                )}
                <br />
                {l.lat.toFixed(4)}, {l.lng.toFixed(4)}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
