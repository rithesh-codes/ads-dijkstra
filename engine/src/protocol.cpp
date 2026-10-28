// protocol.cpp — parses requests and turns algorithm results into JSON responses.
#include "protocol.hpp"

#include <algorithm>
#include <queue>
#include <set>
#include <sstream>
#include <stdexcept>

#include "dijkstra.hpp"
#include "json_writer.hpp"
#include "route_optimizer.hpp"

namespace route {

const std::string& Request::param(const std::string& name) const {
    auto it = params.find(name);
    if (it == params.end() || it->second.empty())
        throw std::invalid_argument("missing parameter: " + name);
    return it->second.front();
}

namespace {

std::string expectWord(std::istream& in, const std::string& what) {
    std::string w;
    if (!(in >> w)) throw std::invalid_argument("unexpected end of input, expected " + what);
    return w;
}

void expectKeyword(std::istream& in, const std::string& kw) {
    std::string w = expectWord(in, kw);
    if (w != kw) throw std::invalid_argument("expected '" + kw + "' but found '" + w + "'");
}

int toInt(const std::string& s, const std::string& what) {
    std::istringstream ss(s);
    int v;
    if (!(ss >> v) || !ss.eof()) throw std::invalid_argument("invalid integer for " + what + ": " + s);
    return v;
}

double toDouble(const std::string& s, const std::string& what) {
    std::istringstream ss(s);
    double v;
    if (!(ss >> v) || !ss.eof()) throw std::invalid_argument("invalid number for " + what + ": " + s);
    return v;
}

void writeIdArray(JsonWriter& w, const Graph& g, const std::vector<int>& vertices) {
    w.beginArray();
    for (int v : vertices) w.value(g.idOf(v));
    w.endArray();
}

// Matrix-index sequence -> location IDs.
void writeSeq(JsonWriter& w, const Graph& g, const DistanceMatrix& m, const std::vector<int>& seq) {
    w.beginArray();
    for (int s : seq) w.value(g.idOf(m.terminals[s]));
    w.endArray();
}

void writeLegs(JsonWriter& w, const Graph& g, const DistanceMatrix& m, const std::vector<Leg>& legs) {
    w.beginArray();
    for (const Leg& leg : legs) {
        w.beginObject();
        w.field("from", g.idOf(m.terminals[leg.fromTerminal]));
        w.field("to", g.idOf(m.terminals[leg.toTerminal]));
        w.field("distance", leg.distance);
        w.field("timeMin", leg.timeMin);
        w.key("path"); writeIdArray(w, g, leg.path);
        w.key("roads").beginArray();
        for (const std::string& r : leg.roads) w.value(r);
        w.endArray();
        w.endObject();
    }
    w.endArray();
}

// Writes one full route (sequence, legs, stitched walk, totals) under the current key.
void writeRoute(JsonWriter& w, const Graph& g, const DistanceMatrix& m,
                const std::vector<int>& seq, double speedKmh) {
    std::vector<Leg> legs = buildLegs(g, m, seq, speedKmh);
    double dist = 0, time = 0;
    for (const Leg& l : legs) { dist += l.distance; time += l.timeMin; }
    w.beginObject();
    w.key("sequence"); writeSeq(w, g, m, seq);
    w.field("distance", dist);
    w.field("timeMin", time);
    w.key("legs"); writeLegs(w, g, m, legs);
    w.key("fullPath"); writeIdArray(w, g, stitchLegs(legs));
    w.endObject();
}

// Connected components of the undirected view of the graph, found with BFS: O(V + E).
std::vector<std::vector<int>> components(const Graph& g) {
    const int V = g.vertexCount();
    std::vector<std::vector<int>> undirected(V);
    for (int u = 0; u < V; ++u)
        for (const Edge& e : g.neighbors(u)) {
            undirected[u].push_back(e.to);
            undirected[e.to].push_back(u);
        }
    std::vector<int> comp(V, -1);
    std::vector<std::vector<int>> result;
    for (int s = 0; s < V; ++s) {
        if (comp[s] != -1) continue;
        std::vector<int> members;
        std::queue<int> q;
        q.push(s);
        comp[s] = static_cast<int>(result.size());
        while (!q.empty()) {
            int u = q.front(); q.pop();
            members.push_back(u);
            for (int v : undirected[u])
                if (comp[v] == -1) { comp[v] = comp[s]; q.push(v); }
        }
        result.push_back(members);
    }
    return result;
}

const char* eventName(TraceEvent::Type t) {
    switch (t) {
        case TraceEvent::INIT: return "init";
        case TraceEvent::POP: return "pop";
        case TraceEvent::RELAX: return "relax";
        case TraceEvent::NO_IMPROVE: return "no-improve";
        case TraceEvent::SKIP_SETTLED: return "skip-settled";
    }
    return "unknown";
}

// ---------------------------------------------------------------- commands

void cmdInfo(const Request& r, JsonWriter& w) {
    const Graph& g = r.graph;
    const int V = g.vertexCount();
    w.field("vertices", V);
    w.field("roads", g.roadCount());
    w.field("arcs", g.arcCount());
    w.field("symmetric", g.isSymmetric());
    w.field("density", V > 1 ? static_cast<double>(g.arcCount()) / (static_cast<double>(V) * (V - 1)) : 0.0);
    w.key("memory").beginObject();
    w.field("adjacencyListCells", V + g.arcCount());
    w.field("adjacencyMatrixCells", V * V);
    w.endObject();
    w.key("adjacency").beginArray();
    for (int u = 0; u < V; ++u) {
        w.beginObject();
        w.field("id", g.idOf(u));
        w.field("degree", static_cast<int>(g.neighbors(u).size()));
        w.key("edges").beginArray();
        for (const Edge& e : g.neighbors(u)) {
            w.beginObject();
            w.field("to", g.idOf(e.to));
            w.field("weight", e.weight);
            w.field("roadId", e.roadId);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    std::vector<std::vector<int>> comps = components(g);
    w.key("components").beginArray();
    for (const auto& c : comps) writeIdArray(w, g, c);
    w.endArray();
}

void cmdPath(const Request& r, JsonWriter& w) {
    const Graph& g = r.graph;
    int s = g.indexOf(r.param("source"));
    int t = g.indexOf(r.param("target"));
    double speed = r.hasParam("speed") ? toDouble(r.param("speed"), "speed") : 30.0;
    if (speed <= 0) throw std::invalid_argument("average speed must be positive");
    ShortestPathTree tree = dijkstra(g, s);
    std::vector<int> path = reconstructPath(tree, t);
    w.field("source", g.idOf(s));
    w.field("target", g.idOf(t));
    w.field("reachable", !path.empty());
    w.field("distance", tree.dist[t]);
    double time = 0;
    w.key("roads").beginArray();
    for (const Edge* e : pathArcs(g, tree, t)) {
        w.value(e->roadId);
        time += e->timeMin >= 0 ? e->timeMin : e->weight / speed * 60.0;
    }
    w.endArray();
    w.field("timeMin", path.empty() ? INF : time);
    w.key("path"); writeIdArray(w, g, path);
    int settled = 0;
    for (double d : tree.dist) if (d != INF) ++settled;
    w.field("verticesSettled", settled);
}

void cmdReach(const Request& r, JsonWriter& w) {
    const Graph& g = r.graph;
    int s = g.indexOf(r.param("source"));
    ShortestPathTree tree = dijkstra(g, s);
    w.field("source", g.idOf(s));
    w.key("reachable").beginArray();
    for (int v = 0; v < g.vertexCount(); ++v) {
        if (tree.dist[v] == INF) continue;
        w.beginObject();
        w.field("id", g.idOf(v));
        w.field("distance", tree.dist[v]);
        w.field("hops", static_cast<int>(reconstructPath(tree, v).size()) - 1);
        w.field("parent", tree.parent[v] == -1 ? std::string() : g.idOf(tree.parent[v]));
        w.endObject();
    }
    w.endArray();
    w.key("unreachable").beginArray();
    for (int v = 0; v < g.vertexCount(); ++v)
        if (tree.dist[v] == INF) w.value(g.idOf(v));
    w.endArray();
}

void cmdTrace(const Request& r, JsonWriter& w) {
    const Graph& g = r.graph;
    if (g.vertexCount() > 300) throw std::invalid_argument("trace is limited to 300 vertices");
    int s = g.indexOf(r.param("source"));
    std::vector<TraceEvent> events;
    ShortestPathTree tree = dijkstra(g, s, &events);
    w.field("source", g.idOf(s));
    w.key("events").beginArray();
    for (const TraceEvent& e : events) {
        w.beginObject();
        w.field("type", eventName(e.type));
        w.field("u", e.u >= 0 ? g.idOf(e.u) : std::string());
        w.field("v", e.v >= 0 ? g.idOf(e.v) : std::string());
        w.field("weight", e.weight);
        w.field("oldDist", e.oldDist);
        w.field("newDist", e.newDist);
        w.key("heap").beginArray();
        for (const IndexedMinHeap::Node& n : e.heapAfter) {
            w.beginObject();
            w.field("id", g.idOf(n.item));
            w.field("key", n.key);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    w.key("final").beginArray();
    for (int v = 0; v < g.vertexCount(); ++v) {
        w.beginObject();
        w.field("id", g.idOf(v));
        w.field("distance", tree.dist[v]);
        w.field("parent", tree.parent[v] == -1 ? std::string() : g.idOf(tree.parent[v]));
        w.endObject();
    }
    w.endArray();
}

void cmdPlan(const Request& r, JsonWriter& w) {
    const Graph& g = r.graph;
    const int wh = g.indexOf(r.param("warehouse"));
    const bool closed = r.hasParam("return") ? r.param("return") == "1" : true;
    const int maxIter = r.hasParam("maxiter") ? toInt(r.param("maxiter"), "maxiter") : 1000;
    const double speed = r.hasParam("speed") ? toDouble(r.param("speed"), "speed") : 30.0;
    if (maxIter < 0) throw std::invalid_argument("maxiter must be >= 0");
    if (speed <= 0) throw std::invalid_argument("average speed must be positive");

    // ---- validate the stop list: "stops <k> <id1> ... <idk>"
    if (!r.hasParam("stops")) throw std::invalid_argument("missing parameter: stops");
    const std::vector<std::string>& sp = r.params.at("stops");
    int k = toInt(sp.at(0), "stop count");
    if (k != static_cast<int>(sp.size()) - 1) throw std::invalid_argument("stop count does not match list");
    if (k == 0) throw std::invalid_argument("select at least one delivery stop");
    std::vector<int> stops;
    std::set<int> seen;
    for (int i = 1; i <= k; ++i) {
        int v = g.indexOf(sp[i]);
        if (v == wh) throw std::invalid_argument("the warehouse cannot also be a delivery stop: " + sp[i]);
        if (!seen.insert(v).second) throw std::invalid_argument("duplicate delivery stop: " + sp[i]);
        stops.push_back(v);
    }

    // ---- step 0: one Dijkstra from the warehouse to find unreachable stops
    ShortestPathTree fromWh = dijkstra(g, wh);
    int dijkstraRuns = 1;
    std::vector<int> terminals{wh};
    std::vector<int> unreachable;
    for (int v : stops) {
        if (fromWh.dist[v] == INF) unreachable.push_back(v);
        else terminals.push_back(v);
    }

    w.field("warehouse", g.idOf(wh));
    w.field("returnToWarehouse", closed);
    w.field("averageSpeedKmh", speed);
    w.key("requestedStops"); writeIdArray(w, g, stops);
    w.key("unreachableStops"); writeIdArray(w, g, unreachable);
    std::vector<int> planned(terminals.begin() + 1, terminals.end());
    w.key("plannedStops"); writeIdArray(w, g, planned);

    if (planned.empty()) {
        w.field("feasible", false);
        w.field("reason", "None of the selected stops can be reached from the warehouse.");
        return;
    }

    // ---- step 1: distance matrix (K' + 1 Dijkstra runs)
    DistanceMatrix m = buildDistanceMatrix(g, terminals);
    dijkstraRuns += m.size();
    w.field("dijkstraRuns", dijkstraRuns);
    w.key("matrix").beginObject();
    w.key("labels"); writeIdArray(w, g, terminals);
    w.key("values").beginArray();
    for (const auto& row : m.d) {
        w.beginArray();
        for (double x : row) w.value(x);
        w.endArray();
    }
    w.endArray();
    w.endObject();

    // ---- step 2: nearest neighbour
    std::vector<NNStep> nnSteps;
    std::vector<int> nnSeq = nearestNeighbour(m, closed, &nnSteps);
    w.key("nearestNeighbour").beginObject();
    w.key("steps").beginArray();
    for (const NNStep& st : nnSteps) {
        w.beginObject();
        w.field("from", g.idOf(m.terminals[st.from]));
        w.field("chosen", g.idOf(m.terminals[st.chosen]));
        w.field("distance", st.distance);
        w.key("candidates").beginArray();
        for (const auto& c : st.candidates) {
            w.beginObject();
            w.field("id", g.idOf(m.terminals[c.first]));
            w.field("distance", c.second);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    if (nnSeq.empty()) {
        w.endObject();
        w.field("feasible", false);
        w.field("reason", closed
            ? "One-way roads make it impossible to visit every reachable stop and return to the warehouse."
            : "One-way roads make it impossible to visit every reachable stop in a single trip.");
        return;
    }
    double nnCost = routeCost(m, nnSeq);
    w.key("sequence"); writeSeq(w, g, m, nnSeq);
    w.field("cost", nnCost);
    w.endObject();

    // ---- step 3: 2-opt improvement
    TwoOptResult opt = twoOpt(m, nnSeq, closed, maxIter);
    double optCost = routeCost(m, opt.seq);
    w.key("twoOpt").beginObject();
    w.key("sequence"); writeSeq(w, g, m, opt.seq);
    w.field("cost", optCost);
    w.field("passes", opt.passes);
    w.field("movesEvaluated", opt.movesEvaluated);
    w.field("maxIterations", maxIter);
    w.field("hitIterationLimit", opt.hitIterationLimit);
    w.field("symmetricMatrix", g.isSymmetric());
    w.key("moves").beginArray();
    for (const TwoOptMove& mv : opt.moves) {
        w.beginObject();
        w.field("pass", mv.pass);
        w.field("i", mv.i);
        w.field("j", mv.j);
        w.field("delta", mv.delta);
        w.field("costAfter", mv.costAfter);
        w.endObject();
    }
    w.endArray();
    w.endObject();

    // ---- step 4: exact benchmark (small K only)
    ExactResult ex = heldKarp(m, closed, 12);
    w.key("exact").beginObject();
    w.field("computed", ex.computed);
    w.field("maxStops", 12);
    if (ex.computed && !ex.seq.empty()) {
        w.key("sequence"); writeSeq(w, g, m, ex.seq);
        w.field("cost", ex.cost);
        w.field("nnGapPercent", ex.cost > 0 ? (nnCost - ex.cost) / ex.cost * 100.0 : 0.0);
        w.field("twoOptGapPercent", ex.cost > 0 ? (optCost - ex.cost) / ex.cost * 100.0 : 0.0);
    }
    w.endObject();

    // ---- step 5: reconstruct both routes on the real road network
    w.key("initial"); writeRoute(w, g, m, nnSeq, speed);
    w.key("optimised"); writeRoute(w, g, m, opt.seq, speed);

    std::vector<Leg> optLegs = buildLegs(g, m, opt.seq, speed);
    double timeMin = 0;
    for (const Leg& l : optLegs) timeMin += l.timeMin;
    double saved = nnCost - optCost;
    if (saved < 1e-9) saved = 0.0;
    w.key("stats").beginObject();
    w.field("initialDistance", nnCost);
    w.field("optimisedDistance", optCost);
    w.field("savedKm", saved);
    w.field("improvementPercent", improvementPercent(nnCost, optCost));
    w.field("stops", static_cast<int>(planned.size()));
    w.field("estimatedTimeMin", timeMin);
    w.endObject();
    w.field("feasible", true);
}

}  // namespace

Request parseRequest(std::istream& in) {
    Request r;
    expectKeyword(in, "COMMAND");
    r.command = expectWord(in, "command name");

    expectKeyword(in, "NODES");
    int n = toInt(expectWord(in, "node count"), "node count");
    if (n < 0) throw std::invalid_argument("node count must be >= 0");
    for (int i = 0; i < n; ++i) r.graph.addVertex(expectWord(in, "node id"));

    expectKeyword(in, "EDGES");
    int m = toInt(expectWord(in, "edge count"), "edge count");
    if (m < 0) throw std::invalid_argument("edge count must be >= 0");
    for (int i = 0; i < m; ++i) {
        std::string roadId = expectWord(in, "road id");
        std::string from = expectWord(in, "road start");
        std::string to = expectWord(in, "road end");
        double km = toDouble(expectWord(in, "distance"), "distance");
        double minutes = toDouble(expectWord(in, "time"), "time");
        std::string oneWay = expectWord(in, "one-way flag");
        r.graph.addEdge(from, to, km, minutes, oneWay == "1", roadId);
    }

    // PARAM lines until END. A parameter's values run to the end of its line.
    std::string word;
    while (in >> word) {
        if (word == "END") return r;
        if (word != "PARAM") throw std::invalid_argument("expected PARAM or END, found " + word);
        std::string name = expectWord(in, "parameter name");
        std::string rest;
        std::getline(in, rest);
        std::istringstream ls(rest);
        std::vector<std::string> values;
        std::string v;
        while (ls >> v) values.push_back(v);
        r.params[name] = values;
    }
    throw std::invalid_argument("missing END");
}

std::string handleRequest(std::istream& in) {
    JsonWriter w;
    try {
        Request r = parseRequest(in);
        JsonWriter body;
        body.beginObject();
        body.field("ok", true);
        body.field("command", r.command);
        if (r.command == "info") cmdInfo(r, body);
        else if (r.command == "path") cmdPath(r, body);
        else if (r.command == "reach") cmdReach(r, body);
        else if (r.command == "trace") cmdTrace(r, body);
        else if (r.command == "plan") cmdPlan(r, body);
        else throw std::invalid_argument("unknown command: " + r.command);
        body.endObject();
        return body.str();
    } catch (const std::exception& ex) {
        w.beginObject();
        w.field("ok", false);
        w.field("error", std::string(ex.what()));
        w.endObject();
        return w.str();
    }
}

}  // namespace route
