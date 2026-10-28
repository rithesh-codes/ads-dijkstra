// test_engine.cpp — unit tests for the C++ core. No framework needed:
//   g++ -std=c++14 -Iinclude src/graph.cpp src/dijkstra.cpp src/route_optimizer.cpp
//       src/protocol.cpp tests/test_engine.cpp -o bin/test_engine && bin/test_engine
//
// Every test checks computed values (distances, paths, orders), not just "it didn't crash".
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>

#include "dijkstra.hpp"
#include "graph.hpp"
#include "min_heap.hpp"
#include "protocol.hpp"
#include "route_optimizer.hpp"

using namespace route;

// ------------------------------------------------------------------ tiny test harness
static int g_failed = 0, g_checks = 0;
static std::string g_current;

#define CHECK(cond)                                                                    \
    do {                                                                               \
        ++g_checks;                                                                    \
        if (!(cond)) {                                                                 \
            ++g_failed;                                                                \
            std::cout << "    FAIL [" << g_current << "] line " << __LINE__ << ": " #cond \
                      << "\n";                                                         \
        }                                                                              \
    } while (0)
#define CHECK_NEAR(a, b) CHECK(std::fabs((a) - (b)) < 1e-6)
#define CHECK_THROWS(stmt)                                     \
    do {                                                       \
        bool threw = false;                                    \
        try { stmt; } catch (const std::exception&) { threw = true; } \
        CHECK(threw);                                          \
    } while (0)

struct TestCase { const char* name; std::function<void()> fn; };
static std::vector<TestCase>& registry() { static std::vector<TestCase> r; return r; }
struct Registrar { Registrar(const char* n, std::function<void()> f) { registry().push_back({n, f}); } };
#define TEST(name) static void name(); static Registrar reg_##name(#name, name); static void name()

// ------------------------------------------------------------------ helpers
static Graph makeGraph(const std::vector<std::string>& ids,
                       const std::vector<std::tuple<std::string, std::string, double>>& roads,
                       bool oneWay = false) {
    Graph g;
    for (const auto& id : ids) g.addVertex(id);
    int k = 0;
    for (const auto& r : roads)
        g.addEdge(std::get<0>(r), std::get<1>(r), std::get<2>(r), -1, oneWay, "R" + std::to_string(++k));
    return g;
}

static std::vector<std::string> ids(const Graph& g, const std::vector<int>& p) {
    std::vector<std::string> out;
    for (int v : p) out.push_back(g.idOf(v));
    return out;
}

// Simple pseudo-random generator (deterministic across platforms).
struct Lcg {
    unsigned long long s;
    explicit Lcg(unsigned long long seed) : s(seed) {}
    unsigned next() { s = s * 6364136223846793005ULL + 1442695040888963407ULL; return (unsigned)(s >> 33); }
    int range(int lo, int hi) { return lo + (int)(next() % (unsigned)(hi - lo + 1)); }
};

static Graph randomGraph(Lcg& rng, int V, int E, bool allowOneWay) {
    Graph g;
    for (int i = 0; i < V; ++i) g.addVertex("N" + std::to_string(i));
    for (int i = 1; i < V; ++i)  // spanning chain keeps the graph connected
        g.addEdge("N" + std::to_string(i - 1), "N" + std::to_string(i), rng.range(1, 30), -1, false, "C" + std::to_string(i));
    for (int e = 0; e < E; ++e) {
        int a = rng.range(0, V - 1), b = rng.range(0, V - 1);
        if (a == b) continue;
        g.addEdge("N" + std::to_string(a), "N" + std::to_string(b), rng.range(1, 40), -1,
                  allowOneWay && rng.range(0, 3) == 0, "X" + std::to_string(e));
    }
    return g;
}

// Floyd–Warshall reference, O(V^3), used to cross-check Dijkstra.
static std::vector<std::vector<double>> floyd(const Graph& g) {
    int V = g.vertexCount();
    std::vector<std::vector<double>> d(V, std::vector<double>(V, INF));
    for (int u = 0; u < V; ++u) {
        d[u][u] = 0;
        for (const Edge& e : g.neighbors(u)) d[u][e.to] = std::min(d[u][e.to], e.weight);
    }
    for (int k = 0; k < V; ++k)
        for (int i = 0; i < V; ++i)
            for (int j = 0; j < V; ++j)
                if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
    return d;
}

// Brute force over every permutation of stops: the true optimum, for checking Held–Karp.
static double bruteForce(const DistanceMatrix& m, bool closed) {
    std::vector<int> perm;
    for (int i = 1; i < m.size(); ++i) perm.push_back(i);
    double best = INF;
    do {
        std::vector<int> seq{0};
        seq.insert(seq.end(), perm.begin(), perm.end());
        if (closed) seq.push_back(0);
        best = std::min(best, routeCost(m, seq));
    } while (std::next_permutation(perm.begin(), perm.end()));
    return best;
}

static std::string runProtocol(const std::string& req) {
    std::istringstream in(req);
    return handleRequest(in);
}

// =================================================================== HEAP
TEST(heap_pops_in_sorted_order_and_keeps_invariant) {
    IndexedMinHeap h(10);
    double keys[] = {7, 3, 9, 1, 8, 2, 6, 5, 4, 0};
    for (int i = 0; i < 10; ++i) { h.push(i, keys[i]); CHECK(h.isValidHeap()); }
    double prev = -1;
    while (!h.empty()) {
        auto n = h.pop();
        CHECK(n.key >= prev);
        CHECK(h.isValidHeap());
        prev = n.key;
    }
}

TEST(heap_decrease_key_moves_item_to_top) {
    IndexedMinHeap h(5);
    for (int i = 0; i < 5; ++i) h.push(i, 10.0 + i);
    h.decreaseKey(4, 1.0);
    CHECK(h.isValidHeap());
    CHECK(h.top().item == 4);
    CHECK_NEAR(h.top().key, 1.0);
    CHECK_THROWS(h.decreaseKey(4, 50.0));  // increasing is not allowed
    CHECK(h.contains(2));
    h.pop();
    CHECK(!h.contains(4));
}

// =================================================================== GRAPH
TEST(graph_rejects_negative_weight_and_bad_endpoints) {
    Graph g;
    g.addVertex("A");
    g.addVertex("B");
    CHECK_THROWS(g.addEdge("A", "B", -1.0, -1, false, "R1"));
    CHECK_THROWS(g.addEdge("A", "Z", 2.0, -1, false, "R2"));      // unknown endpoint
    CHECK_THROWS(g.addEdge("A", "A", 2.0, -1, false, "R3"));      // self loop
    CHECK_THROWS(g.addVertex("A"));                               // duplicate id
    CHECK_THROWS(g.addEdge("A", "B", std::nan(""), -1, false, "R4"));
    CHECK(g.arcCount() == 0);
}

TEST(graph_undirected_stores_two_arcs_and_keeps_cheaper_duplicate) {
    Graph g = makeGraph({"A", "B"}, {{"A", "B", 5.0}});
    CHECK(g.arcCount() == 2);
    g.addEdge("B", "A", 3.0, -1, false, "R9");  // duplicate road, but cheaper
    CHECK(g.arcCount() == 2);                   // no parallel arcs were added
    CHECK_NEAR(g.neighbors(0)[0].weight, 3.0);
    CHECK(g.isSymmetric());
    g.addVertex("C");
    g.addEdge("A", "C", 2.0, -1, true, "R10");  // one-way
    CHECK(!g.isSymmetric());
}

// =================================================================== DIJKSTRA
TEST(dijkstra_direct_road) {
    Graph g = makeGraph({"A", "B"}, {{"A", "B", 4.0}});
    auto t = dijkstra(g, 0);
    CHECK_NEAR(t.dist[1], 4.0);
    CHECK((ids(g, reconstructPath(t, 1)) == std::vector<std::string>{"A", "B"}));
}

TEST(dijkstra_indirect_route_shorter_than_direct) {
    // A-C direct is 10, but A-B-C is 3 + 4 = 7
    Graph g = makeGraph({"A", "B", "C"}, {{"A", "C", 10.0}, {"A", "B", 3.0}, {"B", "C", 4.0}});
    auto t = dijkstra(g, 0);
    CHECK_NEAR(t.dist[2], 7.0);
    CHECK((ids(g, reconstructPath(t, 2)) == std::vector<std::string>{"A", "B", "C"}));
}

TEST(dijkstra_disconnected_vertex_is_unreachable) {
    Graph g = makeGraph({"A", "B", "ISO"}, {{"A", "B", 1.0}});
    auto t = dijkstra(g, 0);
    CHECK(t.dist[2] == INF);
    CHECK(reconstructPath(t, 2).empty());
    CHECK(t.parent[2] == -1);
}

TEST(dijkstra_single_vertex_graph) {
    Graph g;
    g.addVertex("ONLY");
    auto t = dijkstra(g, 0);
    CHECK_NEAR(t.dist[0], 0.0);
    CHECK((ids(g, reconstructPath(t, 0)) == std::vector<std::string>{"ONLY"}));
}

TEST(dijkstra_respects_one_way_roads) {
    Graph g = makeGraph({"A", "B"}, {{"A", "B", 2.0}}, /*oneWay=*/true);
    CHECK_NEAR(dijkstra(g, 0).dist[1], 2.0);
    CHECK(dijkstra(g, 1).dist[0] == INF);
}

TEST(dijkstra_matches_floyd_warshall_on_random_graphs) {
    Lcg rng(42);
    for (int trial = 0; trial < 25; ++trial) {
        Graph g = randomGraph(rng, 12, 25, true);
        auto ref = floyd(g);
        for (int s = 0; s < g.vertexCount(); ++s) {
            auto t = dijkstra(g, s);
            for (int v = 0; v < g.vertexCount(); ++v) {
                if (ref[s][v] == INF) { CHECK(t.dist[v] == INF); continue; }
                CHECK_NEAR(t.dist[v], ref[s][v]);
                // The reconstructed path must be a real walk whose length equals dist[v].
                auto path = reconstructPath(t, v);
                double len = 0;
                for (size_t k = 0; k + 1 < path.size(); ++k) {
                    double w = INF;
                    for (const Edge& e : g.neighbors(path[k])) if (e.to == path[k + 1]) w = e.weight;
                    CHECK(w != INF);
                    len += w;
                }
                CHECK_NEAR(len, t.dist[v]);
            }
        }
    }
}

TEST(dijkstra_trace_records_every_pop_once) {
    Graph g = makeGraph({"A", "B", "C", "D"}, {{"A", "B", 1}, {"B", "C", 2}, {"A", "C", 5}, {"C", "D", 1}});
    std::vector<TraceEvent> ev;
    dijkstra(g, 0, &ev);
    int pops = 0, relax = 0;
    for (auto& e : ev) { if (e.type == TraceEvent::POP) ++pops; if (e.type == TraceEvent::RELAX) ++relax; }
    CHECK(pops == 4);       // every reachable vertex is settled exactly once
    CHECK(relax == 4);      // A->B, A->C(5), B->C(3, improves), C->D
    CHECK(ev.front().type == TraceEvent::INIT);
    CHECK(ev.back().heapAfter.empty());
}

// =================================================================== ROUTE PLANNING
// A small city: W is the warehouse, the stops are P, Q, R, S.
static Graph cityGraph() {
    return makeGraph({"W", "P", "Q", "R", "S", "J"},
                     {{"W", "P", 2}, {"P", "Q", 2}, {"Q", "R", 2}, {"R", "S", 2}, {"S", "W", 2},
                      {"W", "J", 1}, {"J", "R", 2.5}, {"P", "S", 3.5}});
}

static DistanceMatrix cityMatrix(const Graph& g, std::vector<std::string> stops) {
    std::vector<int> terms{g.indexOf("W")};
    for (auto& s : stops) terms.push_back(g.indexOf(s));
    return buildDistanceMatrix(g, terms);
}

TEST(nearest_neighbour_visits_every_stop_exactly_once) {
    Graph g = cityGraph();
    auto m = cityMatrix(g, {"P", "Q", "R", "S"});
    auto seq = nearestNeighbour(m, true);
    CHECK(seq.size() == 6);
    CHECK(seq.front() == 0 && seq.back() == 0);
    std::set<int> inner(seq.begin() + 1, seq.end() - 1);
    CHECK(inner.size() == 4);  // all 4 stops, no duplicates
    CHECK(!inner.count(0));
}

TEST(nearest_neighbour_picks_closest_first) {
    Graph g = makeGraph({"W", "FAR", "NEAR"}, {{"W", "FAR", 9}, {"W", "NEAR", 1}, {"NEAR", "FAR", 3}});
    auto m = cityMatrix(g, {"FAR", "NEAR"});
    auto seq = nearestNeighbour(m, false);
    CHECK((seq == std::vector<int>{0, 2, 1}));  // W -> NEAR -> FAR
    CHECK_NEAR(routeCost(m, seq), 4.0);
}

TEST(two_opt_fixes_a_crossing_and_never_increases_cost) {
    // Four points on a square, with W at one corner. Route W->B->A->C->W crosses itself.
    // d: W(0,0) A(0,1) B(1,1) C(1,0); edges are complete, using Euclidean-like lengths.
    Graph g = makeGraph({"W", "A", "B", "C"},
                        {{"W", "A", 1}, {"A", "B", 1}, {"B", "C", 1}, {"C", "W", 1},
                         {"W", "B", 1.414}, {"A", "C", 1.414}});
    auto m = cityMatrix(g, {"A", "B", "C"});
    std::vector<int> crossed{0, 2, 1, 3, 0};  // W B A C W = 1.414+1+1.414+1 = 4.828
    double before = routeCost(m, crossed);
    auto r = twoOpt(m, crossed, true, 100);
    double after = routeCost(m, r.seq);
    CHECK(after <= before + 1e-9);
    CHECK_NEAR(after, 4.0);
    CHECK(!r.moves.empty());
    double prev = before;
    for (auto& mv : r.moves) {  // every accepted move must strictly lower the cost
        CHECK(mv.delta < 0);
        CHECK(mv.costAfter < prev);
        prev = mv.costAfter;
    }
}

TEST(two_opt_never_worse_on_random_instances_incl_one_way) {
    Lcg rng(7);
    for (int trial = 0; trial < 40; ++trial) {
        Graph g = randomGraph(rng, 14, 30, trial % 2 == 1);
        std::vector<int> terms;
        std::set<int> used;
        while ((int)terms.size() < 7) { int v = rng.range(0, 13); if (used.insert(v).second) terms.push_back(v); }
        auto m = buildDistanceMatrix(g, terms);
        for (int closed = 0; closed < 2; ++closed) {
            auto nn = nearestNeighbour(m, closed == 1);
            if (nn.empty()) continue;  // a one-way trap is allowed; it is reported elsewhere
            auto r = twoOpt(m, nn, closed == 1, 1000);
            CHECK(routeCost(m, r.seq) <= routeCost(m, nn) + 1e-9);
            CHECK(r.seq.front() == 0);
            CHECK(r.seq.size() == nn.size());
            std::set<int> s(r.seq.begin(), r.seq.end());
            CHECK((int)s.size() == m.size());  // every terminal is still present
            if (closed) CHECK(r.seq.back() == 0);
            // The exact optimum is a lower bound for every heuristic.
            auto ex = heldKarp(m, closed == 1);
            CHECK(ex.computed);
            CHECK(ex.cost <= routeCost(m, r.seq) + 1e-9);
        }
    }
}

TEST(two_opt_iteration_limit_is_respected) {
    Lcg rng(99);
    Graph g = randomGraph(rng, 20, 50, false);
    std::vector<int> terms;
    for (int i = 0; i < 10; ++i) terms.push_back(i * 2);
    auto m = buildDistanceMatrix(g, terms);
    std::vector<int> seq{0, 9, 1, 8, 2, 7, 3, 6, 4, 5, 0};  // deliberately bad order
    auto r = twoOpt(m, seq, true, 1);
    CHECK(r.moves.size() <= 1);
    auto r0 = twoOpt(m, seq, true, 0);  // 0 disables optimisation entirely
    CHECK(r0.moves.empty());
    CHECK(r0.seq == seq);
}

TEST(held_karp_equals_brute_force) {
    Lcg rng(2024);
    for (int trial = 0; trial < 15; ++trial) {
        Graph g = randomGraph(rng, 10, 18, trial % 3 == 0);
        std::vector<int> terms{0, 2, 4, 5, 7, 9};
        auto m = buildDistanceMatrix(g, terms);
        for (int closed = 0; closed < 2; ++closed) {
            auto ex = heldKarp(m, closed == 1);
            double bf = bruteForce(m, closed == 1);
            if (bf == INF) { CHECK(ex.cost == INF); continue; }
            CHECK_NEAR(ex.cost, bf);
            CHECK_NEAR(routeCost(m, ex.seq), bf);
        }
    }
}

TEST(route_reconstruction_across_multiple_segments) {
    Graph g = cityGraph();
    auto m = cityMatrix(g, {"Q", "S"});
    std::vector<int> seq{0, 1, 2, 0};  // W -> Q -> S -> W
    auto legs = buildLegs(g, m, seq, 30.0);
    CHECK(legs.size() == 3);
    CHECK((ids(g, legs[0].path) == std::vector<std::string>{"W", "P", "Q"}));
    double total = 0;
    for (auto& l : legs) total += l.distance;
    CHECK_NEAR(total, routeCost(m, seq));
    auto walk = stitchLegs(legs);
    // No repeated vertex where two legs meet, and the walk starts and ends at W.
    for (size_t k = 0; k + 1 < walk.size(); ++k) CHECK(walk[k] != walk[k + 1]);
    CHECK(g.idOf(walk.front()) == "W");
    CHECK(g.idOf(walk.back()) == "W");
    size_t expected = legs[0].path.size() + legs[1].path.size() + legs[2].path.size() - 2;
    CHECK(walk.size() == expected);
    // Each consecutive pair in the walk must be an actual road.
    for (size_t k = 0; k + 1 < walk.size(); ++k) {
        bool adj = false;
        for (const Edge& e : g.neighbors(walk[k])) if (e.to == walk[k + 1]) adj = true;
        CHECK(adj);
    }
    // Time: no times were given, so time = distance / 30 km/h * 60 min.
    CHECK_NEAR(legs[0].timeMin, 4.0 / 30.0 * 60.0);
}

TEST(improvement_percent_is_exact_and_zero_when_no_gain) {
    CHECK_NEAR(improvementPercent(20.0, 15.0), 25.0);
    CHECK_NEAR(improvementPercent(10.0, 10.0), 0.0);
    CHECK_NEAR(improvementPercent(0.0, 0.0), 0.0);
    CHECK_NEAR(improvementPercent(10.0, 12.0), 0.0);  // never report a negative "improvement"
}

// =================================================================== PROTOCOL / END-TO-END
static const char* kCity =
    "NODES 6\nW\nP\nQ\nR\nS\nISO\n"
    "EDGES 5\n"
    "r1 W P 2 -1 0\nr2 P Q 2 -1 0\nr3 Q R 2 -1 0\nr4 R S 2 -1 0\nr5 S W 2 -1 0\n";

TEST(protocol_plan_end_to_end) {
    std::string out = runProtocol(std::string("COMMAND plan\n") + kCity +
                                  "PARAM warehouse W\nPARAM stops 4 R P S Q\nPARAM return 1\n"
                                  "PARAM maxiter 100\nPARAM speed 30\nEND\n");
    CHECK(out.find("\"ok\":true") != std::string::npos);
    CHECK(out.find("\"feasible\":true") != std::string::npos);
    // The ring W-P-Q-R-S-W has length 10, and the optimum must equal it.
    CHECK(out.find("\"optimisedDistance\":10") != std::string::npos);
    CHECK(out.find("\"stops\":4") != std::string::npos);
}

TEST(protocol_plan_reports_unreachable_stop) {
    std::string out = runProtocol(std::string("COMMAND plan\n") + kCity +
                                  "PARAM warehouse W\nPARAM stops 2 Q ISO\nEND\n");
    CHECK(out.find("\"unreachableStops\":[\"ISO\"]") != std::string::npos);
    CHECK(out.find("\"plannedStops\":[\"Q\"]") != std::string::npos);
    CHECK(out.find("\"feasible\":true") != std::string::npos);
}

TEST(protocol_rejects_invalid_requests) {
    // Empty delivery selection
    std::string a = runProtocol(std::string("COMMAND plan\n") + kCity + "PARAM warehouse W\nPARAM stops 0\nEND\n");
    CHECK(a.find("\"ok\":false") != std::string::npos);
    // Duplicate stop
    std::string b = runProtocol(std::string("COMMAND plan\n") + kCity + "PARAM warehouse W\nPARAM stops 2 P P\nEND\n");
    CHECK(b.find("duplicate delivery stop") != std::string::npos);
    // Warehouse used as a stop
    std::string c = runProtocol(std::string("COMMAND plan\n") + kCity + "PARAM warehouse W\nPARAM stops 1 W\nEND\n");
    CHECK(c.find("\"ok\":false") != std::string::npos);
    // Negative weight
    std::string d = runProtocol("COMMAND path\nNODES 2\nA\nB\nEDGES 1\nr1 A B -3 -1 0\nPARAM source A\nPARAM target B\nEND\n");
    CHECK(d.find("negative") != std::string::npos);
    // Unknown endpoint
    std::string e = runProtocol("COMMAND info\nNODES 1\nA\nEDGES 1\nr1 A Z 3 -1 0\nEND\n");
    CHECK(e.find("unknown road endpoint") != std::string::npos);
    // Nonexistent location
    std::string f = runProtocol(std::string("COMMAND path\n") + kCity + "PARAM source W\nPARAM target NOPE\nEND\n");
    CHECK(f.find("unknown location id") != std::string::npos);
}

TEST(protocol_path_and_reach) {
    std::string p = runProtocol(std::string("COMMAND path\n") + kCity + "PARAM source W\nPARAM target R\nEND\n");
    CHECK(p.find("\"distance\":4") != std::string::npos);  // W-S-R = 4 (W-P-Q-R = 6)
    CHECK(p.find("\"path\":[\"W\",\"S\",\"R\"]") != std::string::npos);
    std::string r = runProtocol(std::string("COMMAND reach\n") + kCity + "PARAM source W\nEND\n");
    CHECK(r.find("\"unreachable\":[\"ISO\"]") != std::string::npos);
    std::string i = runProtocol(std::string("COMMAND path\n") + kCity + "PARAM source W\nPARAM target ISO\nEND\n");
    CHECK(i.find("\"reachable\":false") != std::string::npos);
    CHECK(i.find("\"distance\":null") != std::string::npos);
}

// ------------------------------------------------------------------ runner
int main() {
    int failedTests = 0;
    for (const TestCase& t : registry()) {
        g_current = t.name;
        int before = g_failed;
        try {
            t.fn();
        } catch (const std::exception& ex) {
            ++g_failed;
            std::cout << "    EXCEPTION [" << t.name << "]: " << ex.what() << "\n";
        }
        bool ok = g_failed == before;
        if (!ok) ++failedTests;
        std::cout << (ok ? "  PASS  " : "  FAIL  ") << t.name << "\n";
    }
    std::cout << "\n" << registry().size() - failedTests << "/" << registry().size() << " tests passed ("
              << g_checks << " checks, " << g_failed << " failed)\n";
    return failedTests == 0 ? 0 : 1;
}
