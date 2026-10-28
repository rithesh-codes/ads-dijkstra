// Generates data/demo_data.json — the sample Chennai delivery network.
//
//   node scripts/generate-demo-data.mjs
//
// Distances are ILLUSTRATIVE, not surveyed road lengths:
//   distance = haversine(straight line) × detour factor for the road type
// so they stay consistent with the coordinates drawn on the map.
// One deliberately congested link (R26) has a large factor, so Dijkstra
// finds an indirect route that beats the direct road.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const locations = [
  ["WH", "Guindy Central Warehouse", 13.0067, 80.2206, "warehouse"],
  ["TNAGAR", "T. Nagar", 13.0418, 80.2341, "delivery"],
  ["ADYAR", "Adyar", 13.0012, 80.2565, "delivery"],
  ["VELACHERY", "Velachery", 12.9815, 80.218, "delivery"],
  ["MYLAPORE", "Mylapore", 13.0339, 80.2619, "delivery"],
  ["ANNANAGAR", "Anna Nagar", 13.085, 80.2101, "delivery"],
  ["EGMORE", "Egmore", 13.0732, 80.2609, "delivery"],
  ["NUNGAM", "Nungambakkam", 13.0569, 80.2425, "delivery"],
  ["KODAM", "Kodambakkam", 13.0521, 80.2255, "delivery"],
  ["SAIDAPET", "Saidapet", 13.0213, 80.2231, "delivery"],
  ["VADAPALANI", "Vadapalani", 13.05, 80.2121, "delivery"],
  ["ASHOKNAGAR", "Ashok Nagar", 13.0373, 80.2123, "delivery"],
  ["BESANT", "Besant Nagar", 13.0003, 80.2667, "delivery"],
  ["PORUR", "Porur", 13.0382, 80.1565, "delivery"],
  ["TVMIYUR", "Thiruvanmiyur", 12.983, 80.2594, "delivery"],
  ["ENNORE", "Ennore Depot (not yet linked)", 13.2146, 80.3203, "delivery"],
];

const FACTOR = { highway: 1.15, arterial: 1.3, local: 1.45, congested: 2.0 };
const HIGHWAY_SPEED_KMH = 45;

// [id, from, to, type, oneWay]
const roads = [
  ["R01", "WH", "SAIDAPET", "arterial", false],
  ["R02", "SAIDAPET", "TNAGAR", "arterial", false],
  ["R03", "TNAGAR", "NUNGAM", "arterial", false],
  ["R04", "NUNGAM", "EGMORE", "arterial", false],
  ["R05", "EGMORE", "ANNANAGAR", "arterial", false],
  ["R06", "ANNANAGAR", "VADAPALANI", "arterial", false],
  ["R07", "VADAPALANI", "KODAM", "local", false],
  ["R08", "KODAM", "TNAGAR", "local", false],
  ["R09", "KODAM", "NUNGAM", "local", false],
  ["R10", "VADAPALANI", "ASHOKNAGAR", "local", false],
  ["R11", "ASHOKNAGAR", "WH", "arterial", false],
  ["R12", "ASHOKNAGAR", "TNAGAR", "local", false],
  ["R13", "PORUR", "VADAPALANI", "highway", false],
  ["R14", "PORUR", "WH", "highway", false],
  ["R15", "WH", "VELACHERY", "arterial", false],
  ["R16", "VELACHERY", "TVMIYUR", "arterial", false],
  ["R17", "TVMIYUR", "ADYAR", "arterial", false],
  ["R18", "ADYAR", "BESANT", "local", false],
  ["R19", "BESANT", "TVMIYUR", "local", false],
  ["R20", "ADYAR", "MYLAPORE", "arterial", false],
  ["R21", "MYLAPORE", "TNAGAR", "arterial", false],
  ["R22", "MYLAPORE", "NUNGAM", "local", false],
  ["R23", "MYLAPORE", "EGMORE", "arterial", false],
  ["R24", "WH", "ADYAR", "arterial", false],
  ["R25", "SAIDAPET", "ADYAR", "local", false],
  ["R26", "WH", "MYLAPORE", "congested", false],
  ["R27", "SAIDAPET", "KODAM", "local", false],
  ["R28", "ANNANAGAR", "KODAM", "highway", true], // one-way flyover
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const byId = Object.fromEntries(locations.map((l) => [l[0], l]));
const round1 = (x) => Math.round(x * 10) / 10;

const data = {
  version: 1,
  description:
    "Illustrative Chennai delivery network. Distances = straight-line × road-type detour factor; they are NOT surveyed road distances.",
  locations: locations.map(([id, name, lat, lng, type]) => ({ id, name, lat, lng, type })),
  roads: roads.map(([id, from, to, type, oneWay]) => {
    const a = byId[from];
    const b = byId[to];
    const km = round1(haversineKm(a[2], a[3], b[2], b[3]) * FACTOR[type]);
    return {
      id,
      from,
      to,
      distanceKm: km,
      travelTimeMin: type === "highway" ? round1((km / HIGHWAY_SPEED_KMH) * 60) : null,
      roadType: type,
      oneWay,
    };
  }),
  delivery: {
    warehouseId: "WH",
    stops: ["ANNANAGAR", "MYLAPORE", "PORUR", "VELACHERY", "EGMORE", "BESANT", "KODAM"].map((id) => ({
      locationId: id,
      status: "pending",
    })),
  },
  settings: { averageSpeedKmh: 30, returnToWarehouse: true, maxIterations: 1000 },
  lastPlan: null,
};

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "demo_data.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
console.log(`wrote ${out}: ${data.locations.length} locations, ${data.roads.length} roads`);
