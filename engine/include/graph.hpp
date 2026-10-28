// graph.hpp — Weighted road network stored as an ADJACENCY LIST.
//
// Each location is a vertex. Each road is an edge carrying a non-negative distance in km.
// Internally, vertices are dense integers 0..V-1 so the algorithms can index plain
// vectors (dist[], parent[], heap positions). A hash map translates the
// human-readable location IDs ("WH", "TNAGAR") to and from those indices.
//
//   adjacency[u] = { Edge{to=v, weight=w, ...}, ... }
//
// Memory: O(V + E), compared with O(V^2) for an adjacency matrix. Road networks are sparse
// (each junction meets only a few roads), so the list is much smaller, and iterating over
// the neighbours of u costs O(deg(u)) instead of O(V).
#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace route {

// One directed arc in the adjacency list. An undirected road is stored as two arcs.
struct Edge {
    int to;              // index of the destination vertex
    double weight;       // distance in km (always >= 0)
    double timeMin;      // travel time in minutes, or -1 if unknown
    std::string roadId;  // ID of the road record this arc came from
};

class Graph {
public:
    // Adds a vertex and returns its index. Throws std::invalid_argument on a duplicate ID.
    int addVertex(const std::string& id);

    // Adds a road. If oneWay is false, it adds both u->v and v->u.
    // Throws if an endpoint is unknown, if u == v, or if the weight is negative or not finite
    // (Dijkstra's correctness proof needs non-negative weights).
    // If an arc u->v already exists, only the smaller weight is kept (deterministic
    // handling of duplicate roads).
    void addEdge(const std::string& from, const std::string& to, double weight,
                 double timeMin, bool oneWay, const std::string& roadId);

    bool hasVertex(const std::string& id) const;
    int indexOf(const std::string& id) const;  // throws if not found
    const std::string& idOf(int index) const;

    int vertexCount() const { return static_cast<int>(ids_.size()); }
    int arcCount() const { return arcCount_; }    // directed arcs stored
    int roadCount() const { return roadCount_; }  // road records added

    const std::vector<Edge>& neighbors(int u) const { return adjacency_[u]; }

    // True if every arc u->v has a matching v->u with the same weight.
    // 2-opt uses a cheaper O(1) cost formula when this holds.
    bool isSymmetric() const;

private:
    void addArc(int u, int v, double weight, double timeMin, const std::string& roadId);

    std::vector<std::string> ids_;                 // index -> ID
    std::unordered_map<std::string, int> index_;   // ID -> index
    std::vector<std::vector<Edge>> adjacency_;     // the adjacency list
    int arcCount_ = 0;
    int roadCount_ = 0;
};

}  // namespace route
