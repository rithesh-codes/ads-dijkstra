// dijkstra.cpp — Dijkstra's algorithm on the adjacency list, using the indexed min-heap.
#include "dijkstra.hpp"

#include <algorithm>
#include <stdexcept>

namespace route {

ShortestPathTree dijkstra(const Graph& g, int source, std::vector<TraceEvent>* trace) {
    const int V = g.vertexCount();
    if (source < 0 || source >= V) throw std::invalid_argument("dijkstra: source out of range");

    // Step 1 — INITIALISE: dist[source] = 0, every other dist = infinity.
    ShortestPathTree t;
    t.source = source;
    t.dist.assign(V, INF);
    t.parent.assign(V, -1);
    t.parentArc.assign(V, -1);
    std::vector<bool> settled(V, false);  // true once dist[v] is final

    IndexedMinHeap pq(V);  // min-priority queue keyed by tentative distance
    t.dist[source] = 0.0;
    pq.push(source, 0.0);

    if (trace) {
        TraceEvent e;
        e.type = TraceEvent::INIT;
        e.u = source;
        e.newDist = 0.0;
        e.heapAfter = pq.raw();
        trace->push_back(e);
    }

    // Step 2 — MAIN LOOP: repeatedly settle the closest unsettled vertex.
    while (!pq.empty()) {
        IndexedMinHeap::Node node = pq.pop();  // EXTRACT-MIN, O(log V)
        int u = node.item;
        settled[u] = true;
        // Greedy-choice property: with non-negative weights, no later path can reach u
        // more cheaply, so dist[u] is now final.

        if (trace) {
            TraceEvent e;
            e.type = TraceEvent::POP;
            e.u = u;
            e.newDist = node.key;
            e.heapAfter = pq.raw();
            trace->push_back(e);
        }

        // Step 3 — RELAX every outgoing arc u->v.
        const std::vector<Edge>& adj = g.neighbors(u);
        for (int k = 0; k < static_cast<int>(adj.size()); ++k) {
            const Edge& edge = adj[k];
            int v = edge.to;
            if (settled[v]) {
                if (trace) {
                    TraceEvent e;
                    e.type = TraceEvent::SKIP_SETTLED;
                    e.u = u; e.v = v; e.weight = edge.weight;
                    e.oldDist = t.dist[v]; e.newDist = t.dist[v];
                    e.heapAfter = pq.raw();
                    trace->push_back(e);
                }
                continue;
            }
            double candidate = t.dist[u] + edge.weight;
            double old = t.dist[v];
            if (candidate < old) {
                // A shorter path to v goes through u: update dist, parent, and the heap.
                t.dist[v] = candidate;
                t.parent[v] = u;
                t.parentArc[v] = k;
                if (pq.contains(v)) pq.decreaseKey(v, candidate);  // O(log V)
                else pq.push(v, candidate);                       // first time we see v
            }
            if (trace) {
                TraceEvent e;
                e.type = candidate < old ? TraceEvent::RELAX : TraceEvent::NO_IMPROVE;
                e.u = u; e.v = v; e.weight = edge.weight;
                e.oldDist = old; e.newDist = candidate;
                e.heapAfter = pq.raw();
                trace->push_back(e);
            }
        }
    }
    // Vertices that were never pushed keep dist = INF: they are unreachable.
    return t;
}

std::vector<int> reconstructPath(const ShortestPathTree& tree, int target) {
    std::vector<int> path;
    if (target < 0 || target >= static_cast<int>(tree.dist.size())) return path;
    if (tree.dist[target] == INF) return path;  // unreachable: no path
    for (int v = target; v != -1; v = tree.parent[v]) path.push_back(v);
    std::reverse(path.begin(), path.end());     // parent pointers run target -> source
    return path;
}

std::vector<const Edge*> pathArcs(const Graph& g, const ShortestPathTree& tree, int target) {
    std::vector<const Edge*> arcs;
    if (tree.dist.at(target) == INF) return arcs;
    for (int v = target; tree.parent[v] != -1; v = tree.parent[v])
        arcs.push_back(&g.neighbors(tree.parent[v])[tree.parentArc[v]]);
    std::reverse(arcs.begin(), arcs.end());
    return arcs;
}

}  // namespace route
