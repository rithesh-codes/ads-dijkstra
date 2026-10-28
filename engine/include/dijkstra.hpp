// dijkstra.hpp — Single-source shortest paths (Dijkstra, 1959) with path reconstruction.
//
// Precondition: every edge weight is >= 0 (Graph::addEdge enforces this).
// Complexity with the indexed binary heap: O((V + E) log V) time, O(V) extra space.
#pragma once

#include <limits>
#include <string>
#include <vector>

#include "graph.hpp"
#include "min_heap.hpp"

namespace route {

const double INF = std::numeric_limits<double>::infinity();

// Result of one Dijkstra run, a "shortest-path tree" rooted at the source.
struct ShortestPathTree {
    int source = -1;
    std::vector<double> dist;    // dist[v] = shortest distance source->v (INF if unreachable)
    std::vector<int> parent;     // parent[v] = previous vertex on the shortest path (-1 if none)
    std::vector<int> parentArc;  // index into neighbors(parent[v]) of the arc used to reach v
};

// One recorded algorithm event, used to animate Dijkstra in the UI.
struct TraceEvent {
    enum Type { INIT, POP, RELAX, NO_IMPROVE, SKIP_SETTLED } type;
    int u = -1, v = -1;
    double oldDist = INF, newDist = INF, weight = 0;
    std::vector<IndexedMinHeap::Node> heapAfter;  // heap array after this event
};

// Runs Dijkstra from `source`. If `trace` is non-null, every step is recorded.
ShortestPathTree dijkstra(const Graph& g, int source, std::vector<TraceEvent>* trace = nullptr);

// Walks parent[] back from target to source. Returns an empty vector if target is unreachable.
std::vector<int> reconstructPath(const ShortestPathTree& tree, int target);

// Arcs used by the reconstructed path (path.size() - 1 entries).
std::vector<const Edge*> pathArcs(const Graph& g, const ShortestPathTree& tree, int target);

}  // namespace route
