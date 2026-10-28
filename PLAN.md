# Implementation Plan — Multi-Delivery Route Planner (ADS Project)

## 0. Deviations from the original prompt (requested by the user)

| Original prompt | This build | Why |
|---|---|---|
| Python + Flask backend | **C++14 algorithm engine** + thin **Next.js (TypeScript) API layer** | The user asked for C++ as the core. All of the ADS work (graph, heap, Dijkstra, NN, 2-opt, DP) is in C++. |
| HTML templates + vanilla JS | **Next.js 16 + React 19** web UI | The user asked for React/Next. |
| `heapq` priority queue | A **hand-written indexed binary min-heap with `decreaseKey`** | A library heap is a black box. Writing it by hand is the core of the ADS work, and with decrease-key the heap never holds more than V entries. |
| — | **Held–Karp bitmask DP** (exact optimum for K ≤ 12) | This measures how far NN and 2-opt are from the true optimum, so we never *claim* they are optimal. |
| — | **Algorithm Lab** page | Steps through Dijkstra one operation at a time and shows a live heap snapshot and the adjacency list, so the teacher can see each structure working. |

## 1. Architecture

```
Browser (React UI)  ──fetch──▶  Next.js API routes (TypeScript)
                                   │  validation + JSON persistence (data/store.json)
                                   │  serialises graph into a text protocol
                                   ▼
                          engine/bin/route_engine(.exe)   ← C++ core (stdin → stdout JSON)
                          Graph · IndexedMinHeap · Dijkstra · NearestNeighbour · 2-opt · Held–Karp
```

- **C++ engine** is stateless. Each request hands it a full graph and one command
  (`plan`, `path`, `trace`, `reach`, `info`), and it answers with JSON.
- **Next.js server** owns CRUD, input validation (repeated on the backend, as the prompt
  requires), and persistence. It spawns the engine with `execFile`.
- **UI** has these pages: Dashboard, Locations, Roads, Deliveries, Route Results (with the
  comparison view), Path Explorer (shortest path between two places and the unreachable
  list), and Algorithm Lab. The map uses Leaflet + OpenStreetMap, and an offline SVG graph
  view is available when no tiles can be loaded.

## 2. Directory layout

```
ADS/
  PLAN.md  README.md  EXPLANATION.md  docs/REPORT.md
  engine/                      C++ core
    include/  graph.hpp min_heap.hpp dijkstra.hpp route_optimizer.hpp json_writer.hpp protocol.hpp
    src/      graph.cpp dijkstra.cpp route_optimizer.cpp protocol.cpp main.cpp
    tests/    test_engine.cpp  (self-contained test runner, no dependencies)
    CMakeLists.txt
  web/                         Next.js app
    app/ (pages + api routes)  components/  lib/  data/demo_data.json  tests/  scripts/build-engine.mjs
```

## 3. Stages (each stage is one commit)

1. **Scaffold**: git init, .gitignore, this plan.
2. **C++ core**: graph (adjacency list), indexed min-heap, Dijkstra with a trace option,
   path reconstruction, distance matrix, nearest neighbour, 2-opt (handles asymmetric
   one-way roads), Held–Karp, route reconstruction, statistics, text protocol, JSON writer.
3. **C++ tests**: direct and indirect paths, disconnected graph, single vertex, negative
   weights, multiple stops, reconstruction, all stops visited, 2-opt never makes the route
   worse, statistics, heap invariants, Held–Karp checked against brute force.
4. **Next.js backend**: types, validation, JSON store with demo reset, engine bridge, API routes.
5. **Demo dataset**: 16 Chennai locations (1 isolated depot to show unreachability) and
   about 28 roads (one of them one-way), with illustrative distances derived from the
   coordinates.
6. **UI**: all pages, map and graph view, charts, toasts, loading/empty states, search and filters.
7. **Web tests (Vitest)**: validation, duplicates, invalid endpoints, empty delivery,
   persistence across a store reload, and an end-to-end engine integration test.
8. **Docs**: README (setup), docs/REPORT.md (abstract → screenshots list), EXPLANATION.md
   (ADS-focused study guide).
9. **Verification**: build the engine, run both test suites, run `next build`, and
   smoke-test the API.

## 4. Key algorithm decisions

- **Graph**: `vector<vector<Edge>>` plus an `unordered_map<string,int>` that maps an ID to
  a vertex index. If the same road is added twice, only the cheaper copy is kept, so
  results are deterministic. Negative or non-finite weights throw an error.
- **Dijkstra**: the indexed heap stores (key = tentative distance, item = vertex), plus a
  `pos[]` array so `decreaseKey` runs in O(log V). Total cost: O((V+E) log V).
- **Planning**: run Dijkstra K+1 times, which gives a (K+1)×(K+1) shortest-path matrix
  with stored predecessor trees. Then build an NN tour, improve it with 2-opt (stopping
  when there is no improvement or at the iteration limit), compute the Held–Karp optimum
  when K ≤ 12, and stitch the legs together without repeating a vertex where two legs meet.
- **Unreachable stops**: reported and left out of the route, with a warning. If one-way
  roads leave no possible order of visits, the response is marked `feasible:false` with a
  reason, rather than inventing a route.
- **Statistics**: computed from real paths only. Improvement % = saved / initial × 100.
  It is exactly 0 when 2-opt finds nothing better.

## 5. Status

All nine stages are complete:

- C++ engine: 23 unit tests, 15,149 checks, all passing.
- Web: 31 Vitest tests passing. `next build` is clean.
- Smoke tests: every API route and every page was checked against the production server.
- Change made during the build: 2-opt now uses **best-improvement** instead of
  first-improvement. First-improvement stopped at a worse local optimum on the demo
  (56.6 km). Best-improvement reaches the 54.7 km optimum. See EXPLANATION.md §8.5.
