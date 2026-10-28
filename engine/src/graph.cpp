// graph.cpp — adjacency-list graph implementation.
#include "graph.hpp"

#include <cmath>
#include <stdexcept>

namespace route {

int Graph::addVertex(const std::string& id) {
    if (id.empty()) throw std::invalid_argument("vertex id must not be empty");
    if (index_.count(id)) throw std::invalid_argument("duplicate vertex id: " + id);
    int idx = static_cast<int>(ids_.size());
    ids_.push_back(id);
    index_[id] = idx;
    adjacency_.emplace_back();  // a new vertex starts with an empty neighbour list
    return idx;
}

void Graph::addEdge(const std::string& from, const std::string& to, double weight,
                    double timeMin, bool oneWay, const std::string& roadId) {
    if (!hasVertex(from)) throw std::invalid_argument("unknown road endpoint: " + from);
    if (!hasVertex(to)) throw std::invalid_argument("unknown road endpoint: " + to);
    if (from == to) throw std::invalid_argument("self-loop road not allowed at " + from);
    if (!std::isfinite(weight) || weight < 0.0)
        throw std::invalid_argument("negative or invalid edge weight on road " + roadId +
                                    " (Dijkstra requires non-negative weights)");
    int u = index_.at(from);
    int v = index_.at(to);
    addArc(u, v, weight, timeMin, roadId);
    if (!oneWay) addArc(v, u, weight, timeMin, roadId);
    ++roadCount_;
}

void Graph::addArc(int u, int v, double weight, double timeMin, const std::string& roadId) {
    // Duplicate road u->v: keep the cheaper one, so parallel edges never change the result.
    for (Edge& e : adjacency_[u]) {
        if (e.to == v) {
            if (weight < e.weight) {
                e.weight = weight;
                e.timeMin = timeMin;
                e.roadId = roadId;
            }
            return;
        }
    }
    adjacency_[u].push_back(Edge{v, weight, timeMin, roadId});
    ++arcCount_;
}

bool Graph::hasVertex(const std::string& id) const { return index_.count(id) > 0; }

int Graph::indexOf(const std::string& id) const {
    auto it = index_.find(id);
    if (it == index_.end()) throw std::invalid_argument("unknown location id: " + id);
    return it->second;
}

const std::string& Graph::idOf(int index) const { return ids_.at(index); }

bool Graph::isSymmetric() const {
    for (int u = 0; u < vertexCount(); ++u) {
        for (const Edge& e : adjacency_[u]) {
            bool found = false;
            for (const Edge& back : adjacency_[e.to]) {
                if (back.to == u && back.weight == e.weight) { found = true; break; }
            }
            if (!found) return false;
        }
    }
    return true;
}

}  // namespace route
