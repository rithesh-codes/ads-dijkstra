// route_optimizer.hpp — Multi-delivery route planning on top of Dijkstra.
//
// The delivery problem is a Travelling-Salesman-style problem on the metric closure of
// the road graph. The pipeline is:
//
//   1. Distance matrix : Dijkstra from the warehouse and from every stop -> (K+1)x(K+1)
//   2. Nearest neighbour: greedy initial order (fast, but not optimal in general)
//   3. 2-opt           : local search that reverses segments while doing so lowers the cost
//   4. Held-Karp DP    : exact optimum for small K, used only as a benchmark
//   5. Reconstruction  : splice the shortest road paths between consecutive stops
//
// Matrix index 0 is always the warehouse; indices 1..K are the delivery stops.
#pragma once

#include <string>
#include <vector>

#include "dijkstra.hpp"
#include "graph.hpp"

namespace route {

// All-pairs shortest distances between the "terminals" (warehouse + stops).
struct DistanceMatrix {
    std::vector<int> terminals;               // graph vertex of each matrix index
    std::vector<std::vector<double>> d;       // d[i][j] = shortest distance terminal i -> j
    std::vector<ShortestPathTree> trees;      // trees[i] = Dijkstra tree rooted at terminal i
    int size() const { return static_cast<int>(terminals.size()); }
};

DistanceMatrix buildDistanceMatrix(const Graph& g, const std::vector<int>& terminals);

// A route is a sequence of matrix indices: seq[0] = 0 (warehouse), then each stop once,
// then 0 again if the route returns to the warehouse.
double routeCost(const DistanceMatrix& m, const std::vector<int>& seq);

struct NNStep {
    int from;                 // matrix index we are at
    int chosen;               // matrix index picked next
    double distance;          // d[from][chosen]
    std::vector<std::pair<int, double>> candidates;  // every unvisited stop and its distance
};

// Greedy nearest neighbour. Returns an empty sequence if one-way roads trap the route
// (no unvisited stop reachable from the current one).
std::vector<int> nearestNeighbour(const DistanceMatrix& m, bool returnToStart,
                                  std::vector<NNStep>* steps = nullptr);

struct TwoOptMove {
    int pass;           // which pass over all (i, j) pairs
    int i, j;           // positions in seq whose segment seq[i..j] was reversed
    double delta;       // change in cost (always < 0 for an accepted move)
    double costAfter;
};

struct TwoOptResult {
    std::vector<int> seq;
    int passes = 0;            // number of full passes over the (i, j) pairs
    int movesEvaluated = 0;    // candidate reversals examined
    std::vector<TwoOptMove> moves;  // accepted improving moves
    bool hitIterationLimit = false;
};

// 2-opt local search, first-improvement strategy. The warehouse stays fixed at position 0
// (and at the end, if the route is a closed tour). maxIterations caps the number of
// accepted moves.
TwoOptResult twoOpt(const DistanceMatrix& m, std::vector<int> seq, bool returnToStart,
                    int maxIterations);

struct ExactResult {
    bool computed = false;
    std::vector<int> seq;
    double cost = INF;
};

// Held-Karp bitmask dynamic programming: O(2^K * K^2) time, O(2^K * K) space.
// Only run when K <= maxStops (default 12).
ExactResult heldKarp(const DistanceMatrix& m, bool returnToStart, int maxStops = 12);

// One leg of the final route: the road path between two consecutive terminals.
struct Leg {
    int fromTerminal, toTerminal;     // matrix indices
    std::vector<int> path;            // graph vertices, including both endpoints
    std::vector<std::string> roads;   // road IDs used
    double distance = 0;
    double timeMin = 0;
};

// Builds legs for a sequence. Time for each arc is its stored time, or
// distance / speedKmh * 60 when no time was given.
std::vector<Leg> buildLegs(const Graph& g, const DistanceMatrix& m, const std::vector<int>& seq,
                           double speedKmh);

// Joins the legs into one continuous vertex walk without repeating the vertex
// where one leg ends and the next begins.
std::vector<int> stitchLegs(const std::vector<Leg>& legs);

double improvementPercent(double initialCost, double optimisedCost);

}  // namespace route
