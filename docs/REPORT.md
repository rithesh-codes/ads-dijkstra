# Multi-Delivery Route Planner Using Graphs, Dijkstra's Algorithm, a Priority Queue, and Route Optimisation

*Project report material. For the in-depth algorithm study guide, see [../EXPLANATION.md](../EXPLANATION.md).*

---

## 1. Abstract

Delivery agents leaving a warehouse must visit several destinations and want the shortest
total distance. This project models the road network as a **weighted graph** stored as an
**adjacency list**. It computes shortest road distances between the warehouse and every
stop with **Dijkstra's algorithm**, driven by a hand-written **indexed binary min-heap**. On
these distances it builds a delivery order with the **nearest-neighbour** greedy heuristic,
then improves the order with **2-opt** local search. An exact **Held–Karp dynamic program**
(run for up to 12 stops) serves as a benchmark that measures how close the heuristics come to
the true optimum. All algorithms are implemented from scratch in a C++14 engine. A Next.js/React
web application provides data management, validation, persistence, an interactive map, a
route comparison, and a step-by-step visualiser for Dijkstra and the heap. On the
7-stop demo, 2-opt reduces the nearest-neighbour route from 59.2 km to 54.7 km (7.6%) and
reaches the optimum. On another stop set, both heuristics stop at 45.8 km while the optimum
is 43.2 km. That case shows why they are called heuristics.

## 2. Problem statement

Given:
- a road network *G = (V, E)* in which every road has a non-negative length,
- a warehouse *w ∈ V*,
- a set of *K* delivery stops *S ⊆ V*,

find an order in which to visit every stop in *S*, starting at *w* (and optionally returning
to it), that minimises the total road distance. Then report the actual road path.

The problem has two layers:
1. **Shortest paths:** the distance between two stops is the length of the shortest road
   path between them, not the straight line. This is solved exactly by Dijkstra.
2. **Visiting order:** choosing the order is the *Travelling Salesman Problem* on the stops.
   TSP is NP-hard, so an efficient heuristic (NN + 2-opt) is used. Its quality is checked
   against an exact algorithm when *K* is small.

## 3. Objectives and scope

**Objectives**
1. Represent a road network as a weighted graph using an adjacency list.
2. Implement Dijkstra's algorithm with a min-priority queue (binary heap) from scratch.
3. Plan a route visiting multiple destinations from a warehouse.
4. Reduce the total distance with nearest neighbour followed by 2-opt.
5. Visualise locations, roads, shortest paths, and the final route.
6. Compare route distances before and after optimisation.
7. Analyse and demonstrate the time and space complexity.

**Scope**
- In scope: undirected and one-way roads, unreachable locations, round trips and one-way
  trips, a 2-opt iteration limit, delivery status tracking, JSON persistence, and offline use.
- Out of scope: live traffic, time windows, vehicle capacity, multiple vehicles, and
  real-road routing services. The demo distances are illustrative.

## 4. Existing system and proposed system

| Existing practice / limitation | Proposed system |
|---|---|
| Stops visited in the order they were received, or guessed by the driver | The order is computed by NN, then improved by 2-opt |
| Straight-line (as-the-crow-flies) estimates | Real graph distances from Dijkstra over the road network |
| Commercial routing APIs need keys, internet, and payment | Runs locally, with no keys. An offline graph view replaces the map tiles |
| Black-box results | Every step is visible: NN choices, 2-opt moves, distance matrix, Dijkstra trace |
| No way to judge route quality | An exact Held–Karp benchmark shows the gap to the optimum (K ≤ 12) |
| One-way streets often ignored | Directed arcs; 2-opt uses an asymmetric delta |

## 5. System architecture

```
┌──────────────────────── Browser (React 19) ────────────────────────┐
│ Dashboard · Locations · Roads · Deliveries · Route Results ·        │
│ Path Explorer · Algorithm Lab · Leaflet map / SVG graph view        │
└───────────────▲───────────────────────────────┬────────────────────┘
                │ JSON (fetch)                  │
┌───────────────┴──── Next.js server (TypeScript) ───────────────────┐
│ app/api/*  →  lib/service.ts (rules) → lib/validation.ts           │
│            →  lib/store.ts  (data/store.json, atomic writes)        │
│            →  lib/engine.ts (serialise graph, spawn C++ process)    │
└───────────────────────────────┬────────────────────────────────────┘
                                │ stdin: text protocol / stdout: JSON
┌───────────────────────────────▼──── C++14 engine ─────────────────┐
│ protocol.cpp  → parse request, dispatch, write JSON                │
│ graph.cpp     → adjacency list                                     │
│ min_heap.hpp  → indexed binary min-heap                            │
│ dijkstra.cpp  → shortest-path trees, path reconstruction, trace    │
│ route_optimizer.cpp → matrix, NN, 2-opt, Held–Karp, legs, stitching │
└────────────────────────────────────────────────────────────────────┘
```

The engine is **stateless**: every call receives the whole graph. That keeps the algorithms
independent of storage and makes them easy to unit-test.

## 6. Data structures and algorithms (summary)

| Component | Implementation | Purpose |
|---|---|---|
| Weighted graph | `vector<vector<Edge>>` + `unordered_map<string,int>` | Sparse road network in O(V+E) space |
| Min-priority queue | Indexed binary heap with `pos[]` array | O(log V) extract-min and decrease-key for Dijkstra |
| Dijkstra | Greedy settle + relax, parent pointers | Single-source shortest paths and route reconstruction |
| Distance matrix | K+1 Dijkstra runs | Metric closure over warehouse + stops |
| Nearest neighbour | Greedy O(K²) | Feasible initial tour |
| 2-opt | Best-improvement segment reversal | Local improvement of the tour |
| Held–Karp | Bitmask DP O(2ᴷK²) | Exact optimum (benchmark) |
| Route stitching | Concatenate legs, skip boundary duplicates | Continuous road walk |
| BFS | Queue-based traversal | Connected components / isolated locations |

All of these are explained in detail in [EXPLANATION.md](../EXPLANATION.md).

## 7. Complexity analysis

*V* = vertices, *E* = directed arcs, *K* = delivery stops.

| Step | Time | Space |
|---|---|---|
| Graph creation | O(V + E·d) (d = max degree, for merging duplicate roads) | O(V + E) |
| One Dijkstra | O((V + E) log V) | O(V) |
| Distance matrix (K+1 runs) | O(K (V + E) log V) | O(K·V) trees + O(K²) matrix |
| Nearest neighbour | O(K²) | O(K) |
| 2-opt, one pass | O(K²) symmetric, O(K³) with one-way roads | O(K) |
| 2-opt total | O(P·K²), where P = passes (bounded by the move limit) | O(K) |
| Held–Karp | O(2ᴷ·K²) | O(2ᴷ·K) |
| Route reconstruction | O(K·V) worst case (each leg has ≤ V vertices) | O(K·V) |

**Effect of K:** the Dijkstra phase grows linearly in *K* and dominates for large road networks.
NN and 2-opt grow polynomially (K², K² per pass). Only the exact benchmark grows
exponentially, which is why it is capped at K ≤ 12 (2¹²·12² ≈ 0.59 M steps, against 12! ≈ 479 M
permutations for brute force).

## 8. Sample inputs and outputs

**Input (demo dataset):** warehouse `WH` (Guindy), with stops Anna Nagar, Mylapore, Porur,
Velachery, Egmore, Besant Nagar, and Kodambakkam. The route is a round trip at 30 km/h.

| Output | Value |
|---|---|
| Dijkstra runs | 9 (1 reachability check + 8 for the 8×8 matrix) |
| Initial sequence (NN) | WH → Velachery → Besant Nagar → Mylapore → Egmore → Kodambakkam → Anna Nagar → Porur → WH |
| Initial distance | 59.2 km |
| Optimised sequence (2-opt) | WH → Velachery → Besant Nagar → Mylapore → Egmore → **Anna Nagar → Kodambakkam** → Porur → WH |
| Optimised distance | 54.7 km |
| Saved | 4.5 km (7.60%) |
| 2-opt moves | 1 move (i = 5, j = 6, Δ = −4.5) in pass 1; pass 2 finds no improvement |
| Held–Karp optimum | 54.7 km (gap 0%) |
| Estimated time | ≈ 96 min (road times where given, otherwise 30 km/h) |

**Shortest path query:** WH → Mylapore = **9.5 km** via Saidapet → T. Nagar, although a
direct road of 10.8 km exists. Dijkstra picks the cheaper indirect route.

**Unreachable:** `PERUNGUDI` (no roads) is reported as unreachable from every other location.

**Heuristic gap example:** with stops {Kodambakkam, Porur, Adyar, Mylapore, Nungambakkam,
Vadapalani, Anna Nagar}, NN gives 45.8 km and 2-opt finds no improvement (0%). The optimum
is 43.2 km, so both heuristics are 6.0% above it.

## 9. Testing

| Suite | Tool | Count | Highlights |
|---|---|---|---|
| C++ engine | own harness (`engine/tests/test_engine.cpp`) | 23 tests, 15,149 checks | direct and indirect paths, disconnected graph, single vertex, negative-weight rejection, one-way roads, Dijkstra vs Floyd–Warshall on 25 random graphs, heap invariants, NN visits each stop once, 2-opt never increases cost (40 random instances), iteration limit, Held–Karp equals brute force, leg stitching, improvement % |
| Validation | Vitest | 17 tests | duplicate or invalid locations, invalid road endpoints, negative or zero distance, duplicate roads, empty delivery, duplicate stop, warehouse as a stop, settings |
| Persistence | Vitest | 5 tests | first-run seeding, data survives a module reload (restart), failed mutation not saved, demo reset, corrupted-file recovery |
| Integration | Vitest + real binary | 9 tests | protocol format, indirect < direct, unreachable depot, every stop visited once, stats arithmetic, continuous route, unreachable stop skipped, 0% when 2-opt is disabled, single stop |

Result: **all 54 tests pass.** Commands: `npm run engine:test` and `npm test` (inside `web/`).

## 10. Conclusion and future enhancements

The project shows how classic data structures fit together in a real logistics task. The
adjacency list keeps the sparse road network compact. The indexed min-heap makes Dijkstra
O((V+E) log V). Greedy construction plus local search gives good routes in polynomial time.
The exact DP shows how good they really are.

**Future work**
- **Or-opt / 3-opt** moves, or **simulated annealing**, to escape 2-opt local optima.
- **A\*** search with a haversine heuristic for faster point-to-point queries.
- **Fibonacci or pairing heap**, giving O(E + V log V) Dijkstra.
- **Vehicle Routing Problem (VRP)** with several vehicles and capacities, plus delivery time windows.
- Real road distances from OpenStreetMap data (for example, importing OSRM extracts).
- Traffic-dependent edge weights (time-dependent shortest paths).

## 11. Screenshots to capture for the final report

1. **Dashboard** after running the planner: the stat cards, the optimised route on the map, and the pipeline card.
2. **Locations** page: the table with search in use, the add-location form, and one validation error (e.g., duplicate ID).
3. **Road Network** page: the road table, plus the graph view with weights and the dashed one-way road.
4. **Deliveries** page: the stop table with one stop marked *Completed*, and the planner settings.
5. **Route Results** (top): the six stat cards, the map with *Compare both* selected, and the bar chart.
6. **Route Results** (middle): the legs table showing the reconstructed road paths.
7. **Route Results** (bottom): the NN steps table, the 2-opt move log, and the distance matrix.
8. **Path Explorer**: WH → Mylapore with the "indirect path saves 1.3 km" note.
9. **Path Explorer**: reachability from WH listing Perungudi Depot as unreachable.
10. **Algorithm Lab**: Dijkstra paused on a *relax* step (heap tree, dist/parent table, graph colouring).
11. **Algorithm Lab**: the adjacency list and the memory comparison (list 71 cells against a 256-cell matrix).
12. **Graph view offline**: the app with the Street map showing the "tiles could not load" notice.
13. **Terminal**: the output of `npm run engine:test` (23/23 passed) and `npm test` (31 passed).
14. **Heuristic gap**: Route Results for the stop set in section 8, showing NN = 2-opt > optimum.
