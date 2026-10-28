# EXPLANATION: How the Multi-Delivery Route Planner Works

*A study guide for presenting and defending this project. The focus is on the **Advanced
Data Structures** part: the graph, the heap, Dijkstra, nearest neighbour, 2-opt, and
Held–Karp. The web app gets only a short section at the end.*

Every number in this guide was produced by the actual engine on the actual data, so you
can reproduce all of them in the app.

---

## Contents

0. [The 60-second pitch](#0-the-60-second-pitch)
1. [Modelling the problem as a graph problem](#1-modelling-the-problem-as-a-graph-problem)
2. [The big picture: the pipeline and where each piece lives](#2-the-big-picture)
3. [Data structure 1: the weighted graph (adjacency list)](#3-data-structure-1-the-weighted-graph-adjacency-list)
4. [Data structure 2: the indexed binary min-heap](#4-data-structure-2-the-indexed-binary-min-heap)
5. [Algorithm 1: Dijkstra's shortest paths](#5-algorithm-1-dijkstras-shortest-paths)
6. [From shortest paths to a distance matrix](#6-from-shortest-paths-to-a-distance-matrix)
7. [Algorithm 2: nearest neighbour](#7-algorithm-2-nearest-neighbour-greedy-construction)
8. [Algorithm 3: 2-opt local search](#8-algorithm-3-2-opt-local-search)
9. [Algorithm 4: Held–Karp dynamic programming](#9-algorithm-4-heldkarp-dynamic-programming-exact-benchmark)
10. [Route reconstruction and stitching](#10-route-reconstruction-and-stitching)
11. [BFS connected components](#11-bfs-connected-components)
12. [Complexity analysis](#12-complexity-analysis)
13. [Edge cases and how each is handled](#13-edge-cases-and-how-each-is-handled)
14. [How the C++ engine talks to the web app](#14-how-the-c-engine-talks-to-the-web-app)
15. [The web layer in brief](#15-the-web-layer-in-brief)
16. [Testing: what is proven and how](#16-testing-what-is-proven-and-how)
17. [Demo script for the presentation](#17-demo-script-for-the-presentation)
18. [Viva questions and answers](#18-viva-questions-and-answers)
19. [Function reference (C++ engine)](#19-function-reference-c-engine)
20. [Glossary](#20-glossary)

---

## 0. The 60-second pitch

> "A delivery agent starts at a warehouse and must visit several stops. We model the city as a
> **weighted graph** stored as an **adjacency list**, because road networks are sparse.
> To know how far one stop really is from another, we run **Dijkstra's algorithm** with a
> **binary min-heap** that we wrote ourselves, including **decrease-key**. That gives a
> distance matrix between the warehouse and all stops. Choosing the visiting order is the
> **Travelling Salesman Problem**, which is NP-hard. So we build a quick tour with the
> **nearest-neighbour** greedy heuristic and improve it with **2-opt**, which keeps
> reversing a segment of the route while doing so makes it shorter. To prove we are not
> claiming optimality, we also compute the exact answer with **Held–Karp dynamic
> programming** for up to 12 stops and show the gap. Finally, we turn the visiting order back
> into the real road path by following the stored predecessor pointers."

---

## 1. Modelling the problem as a graph problem

| Real world | Graph term | In the code |
|---|---|---|
| A place (warehouse, shop, junction) | **vertex** | `Graph::addVertex`, index `0..V-1` |
| A road between two places | **edge** | `Graph::addEdge` |
| Road length in km | **edge weight** (≥ 0) | `Edge::weight` |
| A one-way street | **directed arc** (only u→v) | `oneWay = true` |
| A two-way street | two arcs (u→v and v→u) | `oneWay = false` |
| "How far is B from A by road?" | **shortest path distance** | `dijkstra()` |
| "In which order do I visit the stops?" | **TSP** on the stops | NN + 2-opt (+ Held–Karp) |

**Why not straight-line distance?** Roads bend, some are congested, and some are one-way.
In the demo, the direct road from the Warehouse to Mylapore is 10.8 km. Going
Warehouse → Saidapet → T. Nagar → Mylapore is only **9.5 km**. Only a graph algorithm can
find that.

---

## 2. The big picture

```
                 ┌─────────────── C++ engine (engine/) ───────────────┐
 graph text ───▶ │ 1. Build graph  (adjacency list)           graph.cpp │
                 │ 2. Dijkstra from warehouse: who is reachable?        │
                 │ 3. Dijkstra from warehouse + each stop               │
                 │      → (K+1)×(K+1) distance matrix  route_optimizer  │
                 │ 4. Nearest neighbour → initial order                 │
                 │ 5. 2-opt            → improved order                 │
                 │ 6. Held–Karp        → true optimum (K ≤ 12)          │
                 │ 7. Rebuild real road paths & stitch legs             │
                 └───────────────────────────── JSON ──────────────────┘
```

| File | What it holds |
|---|---|
| `engine/include/graph.hpp`, `src/graph.cpp` | the adjacency-list graph |
| `engine/include/min_heap.hpp` | the indexed binary min-heap (header-only) |
| `engine/include/dijkstra.hpp`, `src/dijkstra.cpp` | Dijkstra, path reconstruction, trace events |
| `engine/include/route_optimizer.hpp`, `src/route_optimizer.cpp` | distance matrix, NN, 2-opt, Held–Karp, legs |
| `engine/src/protocol.cpp` | reads a request, calls the algorithms, writes JSON; also BFS components |
| `engine/include/json_writer.hpp` | a 90-line JSON writer (no libraries) |
| `engine/src/main.cpp` | `stdin → handleRequest → stdout` |
| `engine/tests/test_engine.cpp` | 23 unit tests |

Everything in the engine is plain C++14 with only the standard library: no Boost and no JSON
library. Every algorithm can be explained line by line.

---

## 3. Data structure 1: the weighted graph (adjacency list)

### 3.1 What it looks like

```cpp
struct Edge {
    int to;              // index of the destination vertex
    double weight;       // distance in km (always >= 0)
    double timeMin;      // travel time in minutes, or -1 if unknown
    std::string roadId;  // which road record this arc came from
};

class Graph {
    std::vector<std::string> ids_;                 // index -> "TNAGAR"
    std::unordered_map<std::string, int> index_;   // "TNAGAR" -> index
    std::vector<std::vector<Edge>> adjacency_;     // THE adjacency list
};
```

`adjacency_[u]` is the list of arcs leaving vertex `u`. Part of the demo graph, as shown in the
Algorithm Lab:

```
WH [6]      → SAIDAPET:2.1  ASHOKNAGAR:4.6  PORUR:8.9  VELACHERY:3.7  ADYAR:5.1  MYLAPORE:10.8
TNAGAR [5]  → SAIDAPET:3.3  NUNGAM:2.5  KODAM:2.1  ASHOKNAGAR:3.5  MYLAPORE:4.1
VELACHERY[2]→ WH:3.7  TVMIYUR:5.8
PERUNGUDI[0]→ ∅            (isolated: no roads)
```

**Why two maps (`ids_` and `index_`)?** The algorithms need *dense integer indices*, so that
`dist[v]`, `parent[v]` and `pos[v]` can be plain arrays with O(1) access. Users think in
*string IDs*. The hash map converts ID → index in O(1) on average, and the vector converts
index → ID in O(1).

### 3.2 Adding roads: `Graph::addEdge`

```cpp
void Graph::addEdge(from, to, weight, timeMin, oneWay, roadId) {
    if (!hasVertex(from)) throw ...("unknown road endpoint");
    if (from == to)       throw ...("self-loop road not allowed");
    if (!std::isfinite(weight) || weight < 0.0)
        throw ...("negative or invalid edge weight ... (Dijkstra requires non-negative weights)");
    int u = index_.at(from), v = index_.at(to);
    addArc(u, v, ...);
    if (!oneWay) addArc(v, u, ...);   // a two-way road = two directed arcs
}
```

`addArc` handles **duplicate roads deterministically**. If an arc u→v already exists, it keeps
the *cheaper* weight instead of storing a parallel edge. The web layer also refuses duplicate
roads (see §13), so this is a second line of defence.

### 3.3 Why an adjacency list and not an adjacency matrix?

| | Adjacency list | Adjacency matrix |
|---|---|---|
| Memory | **O(V + E)** | O(V²) |
| List the neighbours of u | **O(deg(u))** | O(V), since you must scan the whole row |
| Is there an edge u→v? | O(deg(u)) | **O(1)** |
| Good for | **sparse** graphs (roads!) | dense graphs |

A road junction connects to only a handful of roads, so E is about c·V for a small c. Road
graphs are **sparse**. Dijkstra's inner loop is "for each neighbour of u", so the list makes the
whole of Dijkstra O((V+E) log V). With a matrix the scans alone cost O(V²).

**Demo numbers** (Algorithm Lab → "Adjacency list" card):
- V = 16 vertices, 28 roads → **E = 55 directed arcs** (27 two-way × 2 + 1 one-way)
- Adjacency-list cells: V + E = **71**
- Adjacency-matrix cells: V² = **256**, which is 3.6× more, and 22.9% density
- For a real city with V = 100,000 junctions and E ≈ 300,000: the list needs about 400 k
  cells, while the matrix needs 10¹⁰ cells (tens of GB). Only the list is feasible.

### 3.4 `isSymmetric()`

This returns true if every arc u→v has a matching v→u with the same weight, meaning there
are no one-way roads. The demo has one one-way road (R28, the Anna Nagar → Kodambakkam
flyover), so the demo graph is **not** symmetric. This matters for 2-opt (§8.4).

---

## 4. Data structure 2: the indexed binary min-heap

Dijkstra repeatedly asks: *"which unsettled vertex has the smallest tentative distance?"*
That is a **min-priority queue**. We implement it as a **binary heap** in
`engine/include/min_heap.hpp`.

### 4.1 Array representation of a complete binary tree

```
array:   index  0    1    2    3    4
                A:3  C:9  D:8  ...
tree:              A:3            ← index 0 = root = minimum
                  /    \
               C:9      D:8       ← indices 1, 2
```

For a node at index `i`:
- parent = `(i − 1) / 2`
- left child = `2i + 1`
- right child = `2i + 2`

No pointers are needed: the tree shape is implied by the array positions. Because the tree is
*complete* (filled level by level), its height is ⌊log₂ n⌋.

**Heap property:** `key(parent) ≤ key(child)` at every node, so the minimum is always at index 0.

### 4.2 The two repair operations

**sift-up** (after inserting at the bottom or after decreasing a key): while the node is
smaller than its parent, swap the two.

```cpp
void siftUp(int i) {
    while (i > 0) {
        int parent = (i - 1) / 2;
        if (!less(i, parent)) break;
        swapNodes(i, parent);
        i = parent;
    }
}
```

**sift-down** (after moving the last leaf to the root during pop): while the node is larger
than a child, swap it with the *smaller* child.

```cpp
void siftDown(int i) {
    while (true) {
        int left = 2*i + 1, right = 2*i + 2, smallest = i;
        if (left  < n && less(left,  smallest)) smallest = left;
        if (right < n && less(right, smallest)) smallest = right;
        if (smallest == i) break;
        swapNodes(i, smallest);
        i = smallest;
    }
}
```

Both loops climb or descend one level per iteration, so each costs **O(log n)**.

### 4.3 What makes it *indexed*: the `pos[]` array

```cpp
std::vector<Node> heap_;  // the tree, as an array of {item, key}
std::vector<int>  pos_;   // pos_[vertex] = where that vertex sits in heap_ (-1 = absent)
```

Every swap also updates `pos_`:

```cpp
void swapNodes(int a, int b) {
    std::swap(heap_[a], heap_[b]);
    pos_[heap_[a].item] = a;
    pos_[heap_[b].item] = b;
}
```

So `contains(v)` is O(1), and **`decreaseKey(v, newKey)` can find v in O(1)**, lower its key,
and sift it up in O(log V):

```cpp
void decreaseKey(int item, double newKey) {
    int i = pos_.at(item);
    if (i == -1) throw ...;
    if (newKey > heap_[i].key) throw ...("decreaseKey would increase key");
    heap_[i].key = newKey;
    siftUp(i);            // a smaller key can only move UP
}
```

### 4.4 Why not `std::priority_queue` or Python's `heapq`?

Those heaps have **no decrease-key**. The usual workaround is **lazy deletion**: push a
*duplicate* entry with the new distance, and when popping, skip entries that are already stale.

| | Indexed heap (ours) | Lazy deletion |
|---|---|---|
| Heap size | ≤ V | up to E |
| Pop / push cost | O(log V) | O(log E), which is still O(log V) since E ≤ V² |
| Extra memory | `pos[]` array, O(V) | duplicates, O(E) |
| Stale entries | none | must check `if (d > dist[u]) continue;` |

Both give O((V+E) log V). The indexed heap is cleaner, never holds more than V entries, and
shows a stronger data-structure technique. That is why we wrote it for an ADS project.

### 4.5 Deterministic tie-breaking

```cpp
bool less(int a, int b) const {
    if (heap_[a].key != heap_[b].key) return heap_[a].key < heap_[b].key;
    return heap_[a].item < heap_[b].item;   // equal keys → smaller vertex index first
}
```

With this rule, the same input always produces the same pop order. You can see it in the trace
in §5.4, step 13.

### 4.6 Operation costs

| Operation | Cost | How |
|---|---|---|
| `push(v, key)` | O(log V) | append at the end, then sift-up |
| `pop()` | O(log V) | save the root, move the last leaf to the root, sift-down |
| `decreaseKey(v, k)` | O(log V) | find via `pos[v]`, then sift-up |
| `top()`, `contains(v)`, `empty()` | O(1) | |
| `isValidHeap()` (tests only) | O(n) | checks the heap property and `pos[]` consistency |

---

## 5. Algorithm 1: Dijkstra's shortest paths

### 5.1 The idea

We keep a **tentative distance** `dist[v]` for each vertex. It starts at 0 for the source and ∞
for everyone else. Then we repeatedly **settle** the closest unsettled vertex u, so its
distance becomes final, and **relax** every road out of u:

> **Relaxation:** if `dist[u] + w(u,v) < dist[v]`, then going through u is a shorter way to v,
> so set `dist[v] = dist[u] + w(u,v)` and `parent[v] = u`.

### 5.2 The code (`engine/src/dijkstra.cpp`, simplified)

```cpp
ShortestPathTree dijkstra(const Graph& g, int source, std::vector<TraceEvent>* trace) {
    // INITIALISE
    t.dist.assign(V, INF);  t.parent.assign(V, -1);  t.parentArc.assign(V, -1);
    std::vector<bool> settled(V, false);
    IndexedMinHeap pq(V);
    t.dist[source] = 0.0;
    pq.push(source, 0.0);

    while (!pq.empty()) {
        Node node = pq.pop();               // EXTRACT-MIN: O(log V)
        int u = node.item;
        settled[u] = true;                  // dist[u] is now FINAL

        for (k = 0; k < adj(u).size(); ++k) {     // every arc u -> v
            const Edge& edge = adj(u)[k];
            int v = edge.to;
            if (settled[v]) continue;             // can never improve
            double candidate = t.dist[u] + edge.weight;
            if (candidate < t.dist[v]) {          // RELAX
                t.dist[v] = candidate;
                t.parent[v] = u;
                t.parentArc[v] = k;               // remember WHICH road, for time & road IDs
                if (pq.contains(v)) pq.decreaseKey(v, candidate);
                else                pq.push(v, candidate);
            }
        }
    }
    return t;   // vertices never pushed keep dist = INF → unreachable
}
```

The result is a **shortest-path tree**: `dist[]` holds the answers, and `parent[]` holds the
tree edges, which are used to rebuild the paths. `parentArc[]` remembers exactly which road
was used, so the planner can add up road travel times and list road IDs.

### 5.3 Why it is correct (proof sketch)

**Claim:** when u is popped, `dist[u]` equals the true shortest distance δ(s, u).

**Proof idea (greedy-choice property):** suppose there were a shorter path P to u. P starts
inside the settled set (at s) and must leave it somewhere: let (x, y) be the first arc of P
that leaves the set. Then x is settled, so y was relaxed through x, and therefore
`dist[y] ≤ δ(s, x) + w(x, y) ≤ length(P) < dist[u]`. But then y would have a smaller key than u
and would have been popped first, which is a contradiction. The step "the part of P after y has
length ≥ 0" holds **only if every weight is non-negative**.

**Why negative weights break it:** take A→B (2), A→C (5), C→B (−4). Dijkstra pops A, then B
(dist 2), and declares B final. But A→C→B = 1 is shorter. That is why `Graph::addEdge`
throws on negative weights, and why the web form rejects them with the message
"Dijkstra needs non-negative weights". (For graphs with negative weights you would use
Bellman–Ford, which runs in O(V·E).)

### 5.4 A full worked trace (verify it by hand)

Small graph: 5 vertices (W, A, B, C, D), 7 two-way roads:

| Road | W–A | W–B | B–A | A–C | B–C | B–D | C–D |
|---|---|---|---|---|---|---|---|
| km | 4 | 1 | 2 | 5 | 8 | 7 | 1 |

```
        W ───4─── A ───5─── C
         \       /          │
          1     2           1
           \   /            │
             B ──────7───── D        (plus a road B–C of 8)
```

The vertex indices are W=0, A=1, B=2, C=3, D=4. They matter for tie-breaking.

This is the exact output of the engine's `trace` command for source W (the Algorithm Lab
shows the same steps for the demo graph):

| # | Event | Meaning | Heap after (vertex:key) |
|---|---|---|---|
| 1 | init | dist[W]=0, push W | W:0 |
| 2 | **pop W** | W settled (0) | — |
| 3 | relax W→A | ∞ → 4, push A | A:4 |
| 4 | relax W→B | ∞ → 1, push B (sifts up above A) | B:1, A:4 |
| 5 | **pop B** | B settled (1) | A:4 |
| 6 | skip W | W already settled | A:4 |
| 7 | relax B→A | 4 → **3** (1+2), **decrease-key** | A:3 |
| 8 | relax B→C | ∞ → 9, push C | A:3, C:9 |
| 9 | relax B→D | ∞ → 8, push D | A:3, C:9, D:8 |
| 10 | **pop A** | A settled (3). The last leaf D moves to the root and stays (8 < 9) | D:8, C:9 |
| 11–12 | skip W, B | settled | D:8, C:9 |
| 13 | relax A→C | 9 → **8**, decrease-key. C ties with D at 8; **C has the smaller index**, so it sifts above D | C:8, D:8 |
| 14 | **pop C** | C settled (8) | D:8 |
| 15–16 | skip A, B | settled | D:8 |
| 17 | no-improve C→D | 8+1 = 9 ≥ 8, nothing changes | D:8 |
| 18 | **pop D** | D settled (8) | — |
| 19–20 | skip B, C | settled | — |

Final: `dist = {W:0, A:3, B:1, C:8, D:8}`, `parent = {A:B, B:W, C:A, D:B}`.

Things worth pointing out in the viva:
- **Step 7** is the whole point of decrease-key. A's key drops from 4 to 3 inside the heap,
  with no duplicate entry.
- **Step 10** shows pop's sift-down.
- **Step 17** shows that relaxation does not always improve a distance.
- Every vertex is popped **exactly once**. The unit test
  `dijkstra_trace_records_every_pop_once` checks this.

### 5.5 Path reconstruction

```cpp
std::vector<int> reconstructPath(const ShortestPathTree& tree, int target) {
    if (tree.dist[target] == INF) return {};                // unreachable → empty path
    for (int v = target; v != -1; v = tree.parent[v]) path.push_back(v);
    std::reverse(path.begin(), path.end());                 // parents run target → source
    return path;
}
```

For D: D → parent B → parent W → −1, which reverses to **W, B, D** (length 8). The cost is
O(path length).

### 5.6 Complexity: O((V + E) log V)

- Each vertex is pushed at most once and popped once: V pushes and V pops, at O(log V) each.
- Each arc is examined once, when its tail is popped: E relaxations, and each may call
  decrease-key at O(log V).
- Total: **O(V log V + E log V) = O((V + E) log V)**. Extra space: O(V) for dist, parent,
  settled, the heap, and pos.
- With a Fibonacci heap, decrease-key is O(1) amortised, which gives O(E + V log V). That
  is better in theory, but slower in practice for small graphs.

---

## 6. From shortest paths to a distance matrix

The route optimiser does not work on the road graph directly. It works on the **metric
closure** restricted to the *terminals* (the warehouse and the K stops): a complete
(K+1)×(K+1) table of shortest-path distances.

```cpp
DistanceMatrix buildDistanceMatrix(const Graph& g, const std::vector<int>& terminals) {
    for (int i = 0; i < T; ++i) {
        m.trees.push_back(dijkstra(g, terminals[i]));      // one full Dijkstra per terminal
        for (int j = 0; j < T; ++j) m.d[i][j] = m.trees[i].dist[terminals[j]];
    }
}
```

- **K + 1 Dijkstra runs**, one per terminal, cost **O(K (V+E) log V)**.
- We **keep every tree** (`m.trees`), so any leg i → j can later be expanded into real roads
  without running Dijkstra again.
- Index 0 is always the warehouse.
- Before building the matrix, `cmdPlan` runs one Dijkstra from the warehouse to find stops
  that are **unreachable** (dist = ∞). Those are reported and left out, so the demo shows
  **9 Dijkstra runs** for 7 stops (1 + 8).

Why not Floyd–Warshall (all pairs, O(V³))? We only need K+1 sources, not all V. Running
Dijkstra K+1 times costs O(K (V+E) log V), which is much less than V³ when K ≪ V. (Our tests
*do* use Floyd–Warshall, but only as an independent reference to check Dijkstra.)

**Demo matrix** (shortened). Note that it is **not symmetric** because of the one-way flyover:

| from \ to | WH | ANNANAGAR | KODAM | PORUR |
|---|---|---|---|---|
| WH | 0 | 11.7 | 7.1 | 8.9 |
| ANNANAGAR | 11.7 | 0 | **4.6** | 12.2 |
| KODAM | 7.1 | **7.2** | 0 | 9.2 |

Anna Nagar → Kodambakkam uses the one-way flyover (4.6 km). Kodambakkam → Anna Nagar
must go via Vadapalani (2.1 + 5.1 = 7.2 km).

---

## 7. Algorithm 2: nearest neighbour (greedy construction)

### 7.1 The idea

Start at the warehouse. Repeat: **drive to the closest stop you have not visited yet.** When
every stop is visited, optionally return to the warehouse.

```cpp
for (int placed = 1; placed < T; ++placed) {
    int best = -1; double bestDist = INF;
    for (int cand = 1; cand < T; ++cand) {           // scan all unvisited stops: O(K)
        if (visited[cand]) continue;
        if (m.d[current][cand] < bestDist) { bestDist = m.d[current][cand]; best = cand; }
    }
    if (best == -1) return {};                        // trapped by one-way roads
    visited[best] = true; seq.push_back(best); current = best;
}
if (returnToStart) { if (m.d[current][0] == INF) return {}; seq.push_back(0); }
```

Strict `<` means ties go to the lower index, so the result is deterministic.

### 7.2 Demo trace (Route Results → "Nearest-neighbour construction")

| Step | At | Nearest unvisited | Distance |
|---|---|---|---|
| 1 | Warehouse | Velachery | 3.7 |
| 2 | Velachery | Besant Nagar | 8.8 |
| 3 | Besant Nagar | Mylapore | 6.4 |
| 4 | Mylapore | Egmore | 5.7 |
| 5 | Egmore | Kodambakkam | 6.3 |
| 6 | Kodambakkam | Anna Nagar | 7.2 |
| 7 | Anna Nagar | Porur | 12.2 |
| — | Porur | (return) Warehouse | 8.9 |
| | | **Total** | **59.2 km** |

### 7.3 Complexity and weakness

- K steps × O(K) scan each = **O(K²)** time and O(K) space.
- **Myopic:** each choice is locally best but ignores the future. Look at step 5: Egmore →
  Kodambakkam (6.3) looks good, but it forces the expensive Kodambakkam → Anna Nagar (7.2,
  against the one-way direction) and the long Anna Nagar → Porur (12.2). Visiting Anna Nagar
  *before* Kodambakkam would have used the 4.6 km flyover.
- NN tours are typically 15–25% above optimal on random instances, and there are known
  worst-case families where the ratio grows like O(log K). **It is a heuristic, not an
  optimal algorithm.** Its job is to give 2-opt a reasonable starting point.

---

## 8. Algorithm 3: 2-opt local search

### 8.1 The idea

A route is a sequence `seq = [W, s₁, s₂, …, s_K, W]`. A **2-opt move** picks positions
i < j, removes the two edges around the segment `seq[i..j]`, and reconnects the route by
**reversing that segment**:

```
before:  … a → [ b → … → c ] → d …        edges removed: (a,b) and (c,d)
after :  … a → [ c → … → b ] → d …        edges added  : (a,c) and (b,d)
```

Geometrically, this "uncrosses" two crossing edges. In a symmetric metric, an optimal tour never
crosses itself.

### 8.2 The delta formula: O(1) per move

Only two edges change, so we never need to recompute the whole route:

```
Δ = [ d(a,c) + d(b,d) ] − [ d(a,b) + d(c,d) ]
```

If **Δ < 0**, the move shortens the route. In code (`route_optimizer.cpp`):

```cpp
int a = seq[i-1], b = seq[i], c = seq[j];
int dn = (j + 1 < L) ? seq[j+1] : -1;          // -1 = open route, no edge after c
double delta = m.d[a][c] + edgeCost(b, dn) - m.d[a][b] - edgeCost(c, dn);
```

`edgeCost(x, -1) = 0` handles **one-way trips** (no return to the warehouse), where the last
stop has no outgoing edge.

### 8.3 Worked example: uncrossing a square

Points W(0,0), A(0,1), B(1,1), C(1,0). The sides are 1 and the diagonals are 1.414.
The tour W → B → A → C → W crosses itself: 1.414 + 1 + 1.414 + 1 = **4.828**.

Take the move i=1, j=2 (segment [B, A]): a = W, b = B, c = A, d = C.
Δ = d(W,A) + d(B,C) − d(W,B) − d(A,C) = 1 + 1 − 1.414 − 1.414 = **−0.828** < 0, so we
accept it. The new tour W → A → B → C → W = **4.0** (the square's perimeter, which is optimal).
This is the unit test `two_opt_fixes_a_crossing_and_never_increases_cost`.

### 8.4 One-way roads: the asymmetric correction

If d(x,y) ≠ d(y,x), reversing the segment also **reverses every edge inside it**, which changes
their cost. So when the matrix is asymmetric we add:

```
Δ += Σ d(seq[k+1], seq[k])  −  Σ d(seq[k], seq[k+1])      for k = i … j−1
     (reverse internal cost)     (forward internal cost)
```

```cpp
if (!symmetric) {
    double forward = 0, reverse = 0;
    for (int k = i; k < j; ++k) { forward += m.d[seq[k]][seq[k+1]]; reverse += m.d[seq[k+1]][seq[k]]; }
    if (reverse == INF) continue;     // reversed segment impossible (one-way trap)
    delta += reverse - forward;
}
```

This makes each move O(K) instead of O(1), so a pass costs O(K³) instead of O(K²). It is only
needed when one-way roads exist. Moves that would use an impossible (∞) edge are skipped, so
2-opt never turns a feasible route into an infeasible one.

### 8.5 Best-improvement vs first-improvement

There are two standard strategies:
- **First-improvement:** apply the first move found with Δ < 0, then continue.
- **Best-improvement (steepest descent):** in each pass, evaluate **all** O(K²) moves and apply
  only the one with the **most negative Δ**. Repeat until no Δ < 0 exists.

We use **best-improvement**. We first tried first-improvement, and on the demo it took a
−2.6 km move (reversing the whole tour, which only helps because of the one-way flyover)
and got stuck at 56.6 km. Best-improvement takes the larger −4.5 km move and reaches
**54.7 km, which is the optimum**. This is a good thing to mention in the viva: *a local search
can end in different local optima depending on which move it takes.*

```cpp
while (true) {
    ++r.passes;
    int bestI = -1, bestJ = -1; double bestDelta = -EPS;
    for (int i = 1; i < lastStop; ++i)
        for (int j = i + 1; j <= lastStop; ++j) {
            /* compute delta as above */
            if (delta < bestDelta) { bestDelta = delta; bestI = i; bestJ = j; }
        }
    if (bestI == -1) break;                                     // 2-opt local optimum
    std::reverse(seq.begin() + bestI, seq.begin() + bestJ + 1); // apply best move
    if (++accepted >= maxIterations) { r.hitIterationLimit = true; break; }
}
```

The warehouse stays fixed: i starts at 1, and j stops at the last *stop*, never touching
the final return-to-warehouse position.

### 8.6 The demo move, computed by hand

NN route (positions): `0 WH, 1 VEL, 2 BES, 3 MYL, 4 EGM, 5 KOD, 6 ANN, 7 POR, 8 WH`.

The best move is **i = 5, j = 6** (segment [KOD, ANN]), with a = EGM, b = KOD, c = ANN, d = POR:

```
added   d(EGM,ANN) + d(KOD,POR) = 7.4 + 9.2  = 16.6
removed d(EGM,KOD) + d(ANN,POR) = 6.3 + 12.2 = 18.5
internal (asymmetric): reverse d(ANN,KOD) − forward d(KOD,ANN) = 4.6 − 7.2 = −2.6
Δ = 16.6 − 18.5 − 2.6 = −4.5 km
```

New route: WH → VEL → BES → MYL → EGM → **ANN → KOD** → POR → WH = 59.2 − 4.5 = **54.7 km**.
Pass 2 evaluates all 21 moves again, finds none with Δ < 0, and stops. That makes
**2 passes and 42 moves evaluated**, exactly what Route Results → "2-opt improvement log" shows.

### 8.7 Why 2-opt is still a heuristic: a real counter-example

Select the stops {Kodambakkam, Porur, Adyar, Mylapore, Nungambakkam, Vadapalani,
Anna Nagar} on the demo network and run the planner:

| | Distance |
|---|---|
| Nearest neighbour | 45.8 km |
| After 2-opt | 45.8 km (**0% improvement**: no single reversal helps) |
| Held–Karp optimum | **43.2 km** |

Here the NN route is already a **2-opt local optimum**, yet it is 6.0% above the global optimum.
Escaping would need a different kind of move (Or-opt, 3-opt) or a metaheuristic (simulated
annealing). The app reports **0% improvement honestly** instead of inventing one.

### 8.8 Guarantees and complexity

- **Never makes the route worse:** a move is applied only if Δ < −10⁻⁹. Tested on 40 random
  instances, including one-way roads.
- **Terminates:** each accepted move strictly lowers a finite cost, and there are finitely many
  orderings. The `maxIterations` limit (Deliveries page, default 1000; 0 disables 2-opt)
  bounds the work explicitly.
- **Keeps every stop:** a reversal only permutes the stops, so each one still appears exactly
  once. This is checked in tests.
- **Cost:** O(K²) per pass (symmetric) or O(K³) (asymmetric); O(P·K²) in total for P passes.

---

## 9. Algorithm 4: Held–Karp dynamic programming (exact benchmark)

TSP is **NP-hard**, so no known polynomial algorithm solves it exactly. Brute force tries all K!
orders. **Held–Karp** (1962) uses dynamic programming over subsets and is exponential, but
far better than K!.

### 9.1 State and recurrence

```
dp[S][j] = cheapest cost to start at the warehouse, visit EXACTLY the stops in set S,
           and end at stop j   (j ∈ S)

base:        dp[{j}][j] = d(W, j)
transition:  dp[S ∪ {k}][k] = min over j ∈ S of  dp[S][j] + d(j, k)       (k ∉ S)
answer:      min over j of dp[ALL][j] + d(j, W)     (round trip)
             min over j of dp[ALL][j]               (one-way trip)
```

### 9.2 Bitmasks

A set S of stops is stored as an integer: bit j is 1 if stop j is in S. With K = 3,
`S = 0b101` means {stop 0, stop 2}.
- Is j in S? `S & (1 << j)`
- Add k: `S | (1 << k)`
- Remove j: `S & ~(1 << j)`
- All stops: `(1 << K) − 1`

```cpp
for (int j = 0; j < K; ++j) dp[1 << j][j] = m.d[0][j + 1];
for (int S = 1; S <= FULL; ++S)
    for (int j = 0; j < K; ++j) {
        if (!(S & (1 << j)) || dp[S][j] == INF) continue;
        for (int k = 0; k < K; ++k) {
            if (S & (1 << k)) continue;
            double cand = dp[S][j] + m.d[j + 1][k + 1];
            if (cand < dp[S | (1 << k)][k]) { dp[S | (1 << k)][k] = cand; par[S | (1 << k)][k] = j; }
        }
    }
```

Processing S in increasing numeric order is valid because `S | (1<<k) > S`, so every subset
is finished before any of its supersets uses it. The `par[][]` table lets us walk back and
recover the optimal order.

### 9.3 Cost and why it is capped at K ≤ 12

- Time **O(2ᴷ · K²)**, space **O(2ᴷ · K)**.
- K = 7 (demo): 128 · 49 ≈ 6 thousand steps, which is instant.
- K = 12: 4,096 · 144 ≈ 0.59 million steps, against 12! ≈ 479 million brute-force orders.
- K = 20: about 420 million steps and about 20 million table cells, which is too slow and
  memory-hungry for an interactive app. So the engine skips it when K > 12 and the UI says so.

It is used **only as a benchmark** to compute the "gap to optimum" for NN and 2-opt. The
route itself always comes from NN + 2-opt, because those scale to any K. The unit test
`held_karp_equals_brute_force` checks it against full permutation search on 15 random
graphs.

---

## 10. Route reconstruction and stitching

The optimiser outputs an order of *terminals*, but the driver needs *roads*. For every
consecutive pair (i → j) in the sequence, we read the path from the **stored Dijkstra tree
of terminal i**:

```cpp
const ShortestPathTree& tree = m.trees[seq[k]];   // tree rooted at the leg's start
leg.path = reconstructPath(tree, m.terminals[seq[k+1]]);
for (const Edge* e : pathArcs(g, tree, target)) {  // the exact roads used
    leg.roads.push_back(e->roadId);
    leg.timeMin += e->timeMin >= 0 ? e->timeMin : e->weight / speedKmh * 60.0;
}
```

Then we **stitch** the legs into one walk. The first vertex of each leg equals the last vertex
of the previous one, so we skip it to avoid duplicates:

```cpp
for (size_t k = 0; k < legs.size(); ++k) {
    size_t startAt = (k == 0) ? 0 : 1;          // skip the shared boundary vertex
    for (size_t t = startAt; t < legs[k].path.size(); ++t) walk.push_back(legs[k].path[t]);
}
```

**Example** (the §5.4 graph, stops A, C, D, round trip): legs W→A = [W,B,A], A→C = [A,C],
C→D = [C,D], D→W = [D,B,W]. The stitched walk is **W, B, A, C, D, B, W**: 7 vertices = (3+2+2+3) − 3
shared boundaries. Vertices *can* repeat (B appears twice), because the driver passes through
B twice. What we avoid is the artificial duplicate at the leg boundaries.

**Travel time:** a road's own time if one was entered, otherwise distance ÷ average speed.
Demo highway roads have times computed at 45 km/h. Other roads use the setting (30 km/h).

---

## 11. BFS connected components

`components()` in `protocol.cpp` runs **breadth-first search** on the undirected view of the
graph (each arc counted both ways) to group vertices into connected components, in
**O(V + E)**. The Algorithm Lab shows "2 components, isolated: PERUNGUDI". This explains, at a
glance, why Dijkstra reports Perungudi as unreachable: it is in a different component.

---

## 12. Complexity analysis

Let **V** = vertices, **E** = directed arcs, **K** = delivery stops, **d** = max degree.

| Phase | Time | Space | Where |
|---|---|---|---|
| Parse + build graph | O(V + E·d) | O(V + E) | `parseRequest`, `Graph::addEdge` |
| One Dijkstra | O((V + E) log V) | O(V) | `dijkstra` |
| Reachability check | O((V + E) log V) | O(V) | `cmdPlan` step 0 |
| Distance matrix | O(K (V + E) log V) | O(K·V + K²) | `buildDistanceMatrix` |
| Nearest neighbour | O(K²) | O(K) | `nearestNeighbour` |
| 2-opt | O(P·K²), or O(P·K³) if asymmetric | O(K) | `twoOpt` |
| Held–Karp (K ≤ 12) | O(2ᴷ·K²) | O(2ᴷ·K) | `heldKarp` |
| Reconstruction | O(K·V) worst case | O(K·V) | `buildLegs`, `stitchLegs` |
| BFS components | O(V + E) | O(V + E) | `components` |

**Overall planning (excluding the benchmark):** O(K (V+E) log V + P·K²).

**How K affects performance:**
- For a big road network (V, E large) and a few stops, the **Dijkstra phase dominates**, and
  it grows **linearly** with K.
- For many stops on a small network, **2-opt dominates** (quadratic per pass).
- Only Held–Karp is **exponential** in K, which is why it is capped.

On the demo (V=16, E=55, K=7), one full plan takes about 50–70 ms. Almost all of that is the
time to start the process. The algorithms themselves take well under 1 ms.

---

## 13. Edge cases and how each is handled

| Case | Where it is caught | Behaviour |
|---|---|---|
| Negative distance | `validation.ts` and `Graph::addEdge` | rejected: "Dijkstra needs non-negative weights" |
| Zero distance | `validation.ts` | rejected (must be > 0). The engine itself allows 0 |
| Road to a nonexistent location | both layers | rejected: "does not exist" / "unknown road endpoint" |
| Self-loop | both layers | rejected |
| Duplicate road (either direction) | `validation.ts` | rejected, except two opposite one-way roads |
| Parallel arcs reaching the engine | `Graph::addArc` | keeps the cheaper one |
| Duplicate location ID | `validation.ts` (case-insensitive) and `Graph::addVertex` | rejected |
| IDs with spaces | `validation.ts` | rejected (the protocol separates tokens by whitespace) |
| Deleting a location used by roads or the plan | `assertLocationDeletable` | rejected with the list of roads |
| Empty delivery selection | `validatePlanRequest` and `cmdPlan` | "Add at least one delivery stop" |
| Warehouse chosen as a stop, duplicate stop | both layers | rejected |
| Disconnected (unreachable) stop | `cmdPlan` step 0 | skipped, listed in `unreachableStops`, warning shown |
| All stops unreachable | `cmdPlan` | `feasible:false` with a reason |
| One-way trap (no feasible order) | `nearestNeighbour` returns empty | `feasible:false` with a reason. The app never invents a route |
| Single vertex / single stop | Dijkstra / planner | dist 0; route W → s → W (tested) |
| 2-opt makes no improvement | `improvementPercent` | reports exactly 0%, never negative |
| 2-opt disabled (limit 0) | `twoOpt` | returns the NN route unchanged |

---

## 14. How the C++ engine talks to the web app

The engine is a command-line program. The Next.js server (`web/lib/engine.ts`) starts it,
writes a **text request** to its stdin, and reads **JSON** from its stdout:

```
COMMAND plan
NODES 3
W
A
B
EDGES 2
R01 W A 2.5 -1 0        ← roadId from to km minutes(-1 = none) oneWay(0/1)
R02 A B 1.0 5 1
PARAM warehouse W
PARAM stops 2 A B
PARAM return 1
PARAM maxiter 1000
PARAM speed 30
END
```

Commands: `plan` (the full pipeline), `path` (one shortest path), `reach` (reachability from a
source), `trace` (Dijkstra events + heap snapshots), and `info` (adjacency list, density, BFS
components). Errors come back as `{"ok":false,"error":"..."}`.

**Why a separate stateless process?**
1. The ADS core is pure C++, testable on its own, with zero dependencies.
2. The algorithms do not depend on storage. They get the whole graph each time, so they
   cannot be affected by stale state.
3. Any language could drive it, not just Node.

---

## 15. The web layer in brief

| Layer | Files | Role |
|---|---|---|
| Pages | `web/app/*/page.tsx` | Dashboard, Locations, Roads, Deliveries, Route Results, Path Explorer, Algorithm Lab |
| Map | `components/map/LeafletMap.tsx`, `GraphView.tsx` | OSM street map; an offline SVG node-link view drawn from the coordinates |
| API | `web/app/api/**/route.ts` | REST endpoints (README §6) |
| Rules | `lib/service.ts`, `lib/validation.ts` | every input re-validated on the server; a plan is invalidated when the graph or stops change |
| Storage | `lib/store.ts` | `data/store.json`, written atomically (temp file + rename), seeded from `demo_data.json` |
| Bridge | `lib/engine.ts` | serialises the graph, spawns the binary, parses the JSON |

The **Algorithm Lab** replays the trace events in the browser. To show step k, it replays
events 0…k to rebuild `dist[]`, `parent[]` and the settled set, then draws the heap snapshot
(as a tree and as an array) that the C++ engine recorded after that step.

---

## 16. Testing: what is proven and how

**C++ (23 tests, 15,149 checks)**, run with `npm run engine:test`:
- *Heap:* pops come out in sorted order and the heap invariant holds after every operation;
  decrease-key moves an item to the top; increasing a key is refused.
- *Graph:* negative or NaN weights, unknown endpoints, self-loops, and duplicate IDs are
  rejected; two arcs per two-way road; the cheaper duplicate is kept; the symmetry check works.
- *Dijkstra:* direct road; indirect path shorter than direct; disconnected vertex = ∞;
  single-vertex graph; one-way roads; **matches Floyd–Warshall on 25 random graphs**, and
  every reconstructed path is a real walk whose length equals dist[v]; the trace pops each
  vertex exactly once.
- *Routing:* NN visits each stop exactly once and picks the closest first; 2-opt uncrosses
  the square and every accepted move lowers the cost; **2-opt never makes a route worse
  on 40 random instances, including one-way roads**; the iteration limit is respected;
  **Held–Karp equals brute force**; multi-leg reconstruction has no boundary duplicates and
  only uses real roads; improvement % is exact and 0 when there is no gain.
- *Protocol:* end-to-end plan, unreachable stop reporting, and invalid requests (empty
  stops, duplicate stop, warehouse as a stop, negative weight, unknown endpoint, unknown location).

**Web (31 tests)**, run with `npm test`: validation rules, persistence (data survives a
"restart" with fresh modules on the same file; a failed mutation is not saved; demo reset;
recovery from a corrupted file), and integration with the real binary (indirect path <
direct road, statistics arithmetic, continuous route, unreachable stop skipped, 0% when 2-opt
is disabled).

---

## 17. Demo script for the presentation

1. **Dashboard:** "16 vertices, 28 roads, 7 stops." Click **Calculate & optimise route**.
2. **Route Results:**
   - The stat cards: NN 59.2 → 2-opt 54.7 km, **7.6% saved**.
   - The bar chart: the optimum is also 54.7 km, a 0% gap on this instance.
   - The **NN table:** "greedy, always the closest."
   - The **2-opt log:** one move, i=5, j=6, Δ = −4.5. Explain the formula (§8.6).
   - The **distance matrix:** "8 Dijkstra trees. Not symmetric, because of the flyover."
   - **Compare both** on the map; the legs table shows the actual roads.
3. **Path Explorer:** WH → Mylapore = 9.5 km via Saidapet and T. Nagar, while the direct road
   is 10.8 km. Then run reachability from WH, and Perungudi shows as unreachable.
4. **Algorithm Lab:** run a trace from WH. Step until a **relax** with decrease-key and show the
   heap tree reorder, the dist/parent table, and the orange relaxed edge. Then point at the
   adjacency list and the "71 vs 256 cells" comparison.
5. **The heuristic counter-example:** on Deliveries, reset the plan and add Kodambakkam,
   Porur, Adyar, Mylapore, Nungambakkam, Vadapalani, Anna Nagar. Run it: NN = 2-opt = 45.8
   km (0%) against an optimum of 43.2 km. "This is why we call them heuristics."
6. **Validation:** try adding a road with distance −3. It is rejected with the Dijkstra
   explanation.
7. Finish with **Reset to demo data** (sidebar).

---

## 18. Viva questions and answers

**Q1. Why did you use an adjacency list?**
Road networks are sparse (E ≈ c·V). A list uses O(V+E) memory and lets Dijkstra iterate over
neighbours in O(deg u). A matrix uses O(V²) memory and O(V) per neighbour scan. On our demo it
is 71 cells against 256. For a real city the matrix would not even fit in memory.

**Q2. What is the time complexity of your Dijkstra and why?**
O((V+E) log V). There are V pushes and pops, and up to E decrease-keys, each O(log V) on a
binary heap.

**Q3. Why does Dijkstra fail with negative edges?**
It finalises a vertex when it is popped, assuming that no later path can be cheaper. A negative
edge can make a later path cheaper. Example: A→B 2, A→C 5, C→B −4. Use Bellman–Ford instead.

**Q4. What is decrease-key and why do you need `pos[]`?**
It lowers a vertex's priority when a shorter path is found. To do that in O(log V) you must find
the vertex inside the heap array in O(1), and `pos[v]` stores its index. Every swap keeps
`pos[]` up to date.

**Q5. How is a heap stored in an array?**
As a complete binary tree. The children of i are at 2i+1 and 2i+2, and the parent is (i−1)/2. The
height is ⌊log₂ n⌋, which bounds sift-up and sift-down.

**Q6. Difference between your heap and `std::priority_queue`?**
`priority_queue` has no decrease-key, so you push duplicates and skip stale ones (lazy deletion).
That heap can hold up to E entries. Ours holds at most V and updates in place.

**Q7. How do you reconstruct the shortest path?**
Follow `parent[]` from the target back to the source, then reverse. The cost is O(path length).
If dist = ∞, there is no path.

**Q8. Why run Dijkstra K+1 times instead of Floyd–Warshall?**
We only need distances between the warehouse and the K stops. (K+1) Dijkstra runs cost
O(K (V+E) log V), which is much less than O(V³) when K ≪ V.

**Q9. Is your route optimal?**
Not guaranteed. NN and 2-opt are heuristics. That is why we compute the Held–Karp optimum for
K ≤ 12 and display the gap. On the demo, 2-opt hits the optimum. On another stop set, it is 6%
above it (45.8 against 43.2 km).

**Q10. Why is the delivery-order problem hard?**
It is the Travelling Salesman Problem, which is NP-hard. No polynomial exact algorithm is
known. Brute force is K!, and the best exact DP is O(2ᴷK²).

**Q11. Explain the 2-opt delta.**
Reversing seq[i..j] replaces edges (a,b) and (c,d) with (a,c) and (b,d). So
Δ = d(a,c)+d(b,d)−d(a,b)−d(c,d), and we accept the move if Δ < 0. It is O(1) because the
internal edges are unchanged when distances are symmetric.

**Q12. What changes with one-way roads?**
Reversing a segment reverses its internal edges, which now cost differently. We add
(reverse internal cost − forward internal cost) to Δ, so each move costs O(K). Moves that would
use an impossible (∞) edge are skipped.

**Q13. Does 2-opt always terminate? Can it make things worse?**
It terminates, because every accepted move strictly decreases a finite cost and there are
finitely many orders; there is also an explicit move limit. It never makes the route worse,
because we only apply moves with Δ < 0. We tested this on 40 random instances.

**Q14. First- vs best-improvement?**
First-improvement applies the first improving move found. Best-improvement scans all moves and
applies the steepest one. We use best-improvement. On our demo, first-improvement got stuck at
56.6 km, while best-improvement reached the 54.7 km optimum.

**Q15. Why is nearest neighbour sub-optimal?**
It is greedy and myopic: a cheap step now can force expensive steps later. In the demo,
Egmore → Kodambakkam (6.3) forced Kodambakkam → Anna Nagar against the flyover (7.2).

**Q16. Explain Held–Karp's state.**
dp[S][j] is the cheapest way to start at the warehouse, visit exactly the set S, and end at j.
The transition extends by one stop k ∉ S. It is O(2ᴷK²) time, compared with K! for brute force.

**Q17. How are sets represented in Held–Karp?**
As bitmasks. Bit j means stop j is in the set. Membership is `S & (1<<j)`, adding is
`S | (1<<k)`.

**Q18. How do you handle unreachable stops?**
One Dijkstra from the warehouse first. Any stop with dist = ∞ is reported and excluded, and the
UI warns about it. If nothing is reachable, or one-way roads trap the route, the response
is marked infeasible with a reason. We never invent a route.

**Q19. What does "stitching without duplicate vertices" mean?**
Consecutive legs share an endpoint. When concatenating, we skip the first vertex of each later
leg, so the shared stop is not listed twice.

**Q20. How do you know Dijkstra is implemented correctly?**
It is compared against an independent Floyd–Warshall on 25 random graphs (including one-way
roads), for every source and target pair, and every reconstructed path is checked to be a real
walk whose length equals dist[v].

**Q21. What is the space complexity of the whole plan?**
O(V+E) for the graph, O(K·V) for the K+1 stored trees, O(K²) for the matrix, and
O(2ᴷK) for Held–Karp when it runs.

**Q22. What is the role of BFS here?**
It finds connected components in O(V+E), which explains why some locations are unreachable
(the isolated Perungudi depot).

**Q23. Can you improve Dijkstra's complexity?**
A Fibonacci heap gives O(E + V log V) with O(1) amortised decrease-key. For point-to-point
queries, A* with a straight-line (haversine) heuristic explores fewer vertices.

**Q24. Why are the demo distances "illustrative"?**
They are generated from the coordinates: straight-line distance × a road-type detour factor
(highway 1.15, arterial 1.3, local 1.45, congested 2.0). They are consistent with the map but
are not surveyed road lengths. The algorithms work on whatever weights you enter.

**Q25. What happens when two vertices have the same distance in the heap?**
The tie is broken by the smaller vertex index, so the pop order, and therefore the trace, is
deterministic.

---

## 19. Function reference (C++ engine)

| Function | File | What it does | Cost |
|---|---|---|---|
| `Graph::addVertex(id)` | graph.cpp | add a vertex; reject empty or duplicate IDs | O(1) avg |
| `Graph::addEdge(from,to,w,t,oneWay,id)` | graph.cpp | validate, then add one or two arcs | O(deg) |
| `Graph::addArc(u,v,w,t,id)` | graph.cpp | append an arc, or keep the cheaper duplicate | O(deg u) |
| `Graph::indexOf / idOf / hasVertex` | graph.cpp | ID ↔ index | O(1) |
| `Graph::neighbors(u)` | graph.hpp | outgoing arcs of u | O(1) |
| `Graph::isSymmetric()` | graph.cpp | check that every arc has an equal reverse | O(E·d) |
| `IndexedMinHeap::push / pop / decreaseKey` | min_heap.hpp | priority-queue operations | O(log n) |
| `IndexedMinHeap::top / contains / empty / size` | min_heap.hpp | queries | O(1) |
| `IndexedMinHeap::siftUp / siftDown / swapNodes` | min_heap.hpp | heap repair | O(log n) |
| `IndexedMinHeap::isValidHeap()` | min_heap.hpp | invariant check (tests) | O(n) |
| `dijkstra(g, s, trace*)` | dijkstra.cpp | shortest-path tree; optional event log | O((V+E) log V) |
| `reconstructPath(tree, t)` | dijkstra.cpp | vertex path s → t (empty if unreachable) | O(path) |
| `pathArcs(g, tree, t)` | dijkstra.cpp | arcs (roads) along that path | O(path) |
| `buildDistanceMatrix(g, terminals)` | route_optimizer.cpp | K+1 Dijkstra runs → matrix + trees | O(K (V+E) log V) |
| `routeCost(m, seq)` | route_optimizer.cpp | sum of matrix legs | O(K) |
| `nearestNeighbour(m, closed, steps*)` | route_optimizer.cpp | greedy tour (empty if trapped) | O(K²) |
| `twoOpt(m, seq, closed, maxIter)` | route_optimizer.cpp | best-improvement 2-opt with log | O(P·K²) / O(P·K³) |
| `heldKarp(m, closed, maxStops)` | route_optimizer.cpp | exact optimum by bitmask DP | O(2ᴷK²) |
| `buildLegs(g, m, seq, speed)` | route_optimizer.cpp | road path, roads, distance, time per leg | O(K·V) |
| `stitchLegs(legs)` | route_optimizer.cpp | one continuous walk, no boundary duplicates | O(total) |
| `improvementPercent(a, b)` | route_optimizer.cpp | (a−b)/a·100, or 0 if there is no gain | O(1) |
| `parseRequest(in)` | protocol.cpp | text → Graph + params (with validation) | O(V + E·d) |
| `handleRequest(in)` | protocol.cpp | dispatch a command, catch errors → JSON | — |
| `components(g)` | protocol.cpp | BFS connected components | O(V+E) |
| `cmdPlan / cmdPath / cmdReach / cmdTrace / cmdInfo` | protocol.cpp | the five commands | see above |
| `JsonWriter` | json_writer.hpp | streaming JSON output; ∞ → `null` | O(output) |

---

## 20. Glossary

- **Adjacency list:** for each vertex, a list of its outgoing edges.
- **Arc:** a directed edge u→v.
- **Binary heap:** a complete binary tree in an array, with the heap property.
- **Decrease-key:** lowering an element's priority inside a priority queue.
- **Greedy algorithm:** makes the locally best choice at each step (Dijkstra and NN are greedy).
- **Heuristic:** a fast method that usually gives a good but not guaranteed-optimal answer.
- **Local optimum (2-opt optimal):** no single 2-opt move improves the route.
- **Metric closure:** a complete graph whose edge weights are shortest-path distances.
- **NP-hard:** at least as hard as every problem in NP; no polynomial exact algorithm is known.
- **Relaxation:** updating dist[v] if going through u is shorter.
- **Settled vertex:** a vertex whose shortest distance is final (it has been popped).
- **Shortest-path tree:** the parent pointers produced by Dijkstra.
- **Sparse graph:** E is much smaller than V² (road networks).
- **TSP:** the Travelling Salesman Problem: visit every city once with minimum total cost.
