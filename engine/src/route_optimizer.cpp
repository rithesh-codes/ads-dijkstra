// route_optimizer.cpp — distance matrix, nearest neighbour, 2-opt, Held-Karp, reconstruction.
#include "route_optimizer.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace route {

namespace {
const double EPS = 1e-9;  // tolerance for floating-point "is it strictly better" checks

bool matrixIsSymmetric(const DistanceMatrix& m) {
    for (int i = 0; i < m.size(); ++i)
        for (int j = i + 1; j < m.size(); ++j) {
            double a = m.d[i][j], b = m.d[j][i];
            if (a == INF || b == INF) { if (a != b) return false; continue; }
            if (std::fabs(a - b) > EPS) return false;
        }
    return true;
}
}  // namespace

// ---------------------------------------------------------------------------
// 1. Distance matrix: one Dijkstra run per terminal -> O(T * (V + E) log V), T = K + 1.
// ---------------------------------------------------------------------------
DistanceMatrix buildDistanceMatrix(const Graph& g, const std::vector<int>& terminals) {
    DistanceMatrix m;
    m.terminals = terminals;
    const int T = static_cast<int>(terminals.size());
    m.d.assign(T, std::vector<double>(T, INF));
    m.trees.reserve(T);
    for (int i = 0; i < T; ++i) {
        m.trees.push_back(dijkstra(g, terminals[i]));  // full tree from terminal i
        for (int j = 0; j < T; ++j) m.d[i][j] = m.trees[i].dist[terminals[j]];
    }
    return m;
}

double routeCost(const DistanceMatrix& m, const std::vector<int>& seq) {
    double total = 0;
    for (size_t k = 0; k + 1 < seq.size(); ++k) total += m.d[seq[k]][seq[k + 1]];
    return total;  // INF if any leg is impossible
}

// ---------------------------------------------------------------------------
// 2. Nearest neighbour heuristic — O(K^2).
//    From the current location, always drive to the closest unvisited stop.
// ---------------------------------------------------------------------------
std::vector<int> nearestNeighbour(const DistanceMatrix& m, bool returnToStart,
                                  std::vector<NNStep>* steps) {
    const int T = m.size();
    std::vector<int> seq;
    seq.push_back(0);  // start at the warehouse
    std::vector<bool> visited(T, false);
    visited[0] = true;
    int current = 0;

    for (int placed = 1; placed < T; ++placed) {
        int best = -1;
        double bestDist = INF;
        NNStep step;
        step.from = current;
        for (int cand = 1; cand < T; ++cand) {  // scan every unvisited stop: O(K)
            if (visited[cand]) continue;
            step.candidates.push_back(std::make_pair(cand, m.d[current][cand]));
            // Strict '<' breaks ties by the lower index, so the result is deterministic.
            if (m.d[current][cand] < bestDist) {
                bestDist = m.d[current][cand];
                best = cand;
            }
        }
        if (best == -1) return std::vector<int>();  // trapped by one-way roads
        step.chosen = best;
        step.distance = bestDist;
        if (steps) steps->push_back(step);
        visited[best] = true;
        seq.push_back(best);
        current = best;
    }
    if (returnToStart) {
        if (m.d[current][0] == INF) return std::vector<int>();  // cannot get back
        seq.push_back(0);
    }
    return seq;
}

// ---------------------------------------------------------------------------
// 3. 2-opt local search.
//
//    Reversing the segment seq[i..j] removes two edges and adds two new ones:
//
//        before:  ... a -> [b ... c] -> d ...
//        after :  ... a -> [c ... b] -> d ...
//
//        delta = d(a,c) + d(b,d) - d(a,b) - d(c,d)
//
//    If delta < 0 the new route is shorter, so we keep it. If the matrix is not
//    symmetric (one-way roads), the edges inside the segment also change direction, so we
//    add the difference (reverse internal cost - forward internal cost).
// ---------------------------------------------------------------------------
TwoOptResult twoOpt(const DistanceMatrix& m, std::vector<int> seq, bool returnToStart,
                    int maxIterations) {
    TwoOptResult r;
    if (maxIterations <= 0) { r.seq = seq; return r; }  // optimisation disabled
    const int L = static_cast<int>(seq.size());
    // Position of the last delivery stop (the warehouse at 0, and at L-1 when closed, is fixed).
    const int lastStop = returnToStart ? L - 2 : L - 1;
    const bool symmetric = matrixIsSymmetric(m);
    int accepted = 0;

    auto edgeCost = [&](int from, int to) -> double {
        return to < 0 ? 0.0 : m.d[from][to];  // to == -1 means "no next node" (open route end)
    };

    bool improved = true;
    while (improved && !r.hitIterationLimit) {
        improved = false;
        ++r.passes;
        for (int i = 1; i < lastStop && !r.hitIterationLimit; ++i) {
            for (int j = i + 1; j <= lastStop && !r.hitIterationLimit; ++j) {
                ++r.movesEvaluated;
                int a = seq[i - 1], b = seq[i], c = seq[j];
                int dn = (j + 1 < L) ? seq[j + 1] : -1;

                double added1 = m.d[a][c], added2 = edgeCost(b, dn);
                if (added1 == INF || added2 == INF) continue;  // new route would be infeasible
                double removed = m.d[a][b] + edgeCost(c, dn);
                double delta = added1 + added2 - removed;

                if (!symmetric) {
                    double forward = 0, reverse = 0;
                    for (int k = i; k < j; ++k) {
                        forward += m.d[seq[k]][seq[k + 1]];
                        reverse += m.d[seq[k + 1]][seq[k]];
                    }
                    if (reverse == INF) continue;
                    delta += reverse - forward;
                }

                if (delta < -EPS) {  // strictly better: apply the move
                    std::reverse(seq.begin() + i, seq.begin() + j + 1);
                    ++accepted;
                    improved = true;
                    TwoOptMove mv;
                    mv.pass = r.passes;
                    mv.i = i; mv.j = j;
                    mv.delta = delta;
                    mv.costAfter = routeCost(m, seq);
                    r.moves.push_back(mv);
                    if (accepted >= maxIterations) r.hitIterationLimit = true;
                }
            }
        }
    }
    r.seq = seq;
    return r;
}

// ---------------------------------------------------------------------------
// 4. Held-Karp dynamic programming (exact optimum, used only as a benchmark).
//
//    dp[S][j] = cheapest cost to start at the warehouse, visit exactly the stops in
//               bitmask S, and end at stop j (j in S).
//    dp[{j}][j] = d(0, j)
//    dp[S][j]   = min over i in S\{j} of dp[S\{j}][i] + d(i, j)
//    answer     = min over j of dp[ALL][j] (+ d(j, 0) if the route returns)
// ---------------------------------------------------------------------------
ExactResult heldKarp(const DistanceMatrix& m, bool returnToStart, int maxStops) {
    ExactResult res;
    const int K = m.size() - 1;
    if (K > maxStops || K < 0) return res;  // too many stops: 2^K grows too fast
    res.computed = true;
    if (K == 0) {
        res.seq = returnToStart ? std::vector<int>{0, 0} : std::vector<int>{0};
        res.cost = 0;
        return res;
    }
    const int FULL = (1 << K) - 1;
    std::vector<std::vector<double>> dp(1 << K, std::vector<double>(K, INF));
    std::vector<std::vector<int>> par(1 << K, std::vector<int>(K, -1));

    for (int j = 0; j < K; ++j) dp[1 << j][j] = m.d[0][j + 1];

    for (int S = 1; S <= FULL; ++S) {
        for (int j = 0; j < K; ++j) {
            if (!(S & (1 << j)) || dp[S][j] == INF) continue;
            for (int k = 0; k < K; ++k) {
                if (S & (1 << k)) continue;
                int S2 = S | (1 << k);
                double cand = dp[S][j] + m.d[j + 1][k + 1];
                if (cand < dp[S2][k]) { dp[S2][k] = cand; par[S2][k] = j; }
            }
        }
    }

    int bestEnd = -1;
    double best = INF;
    for (int j = 0; j < K; ++j) {
        double c = dp[FULL][j] + (returnToStart ? m.d[j + 1][0] : 0.0);
        if (c < best) { best = c; bestEnd = j; }
    }
    if (bestEnd == -1) return res;  // computed, but no feasible tour exists (cost stays INF)

    // Walk the parent table backwards to recover the order of stops.
    std::vector<int> rev;
    int S = FULL, j = bestEnd;
    while (j != -1) {
        rev.push_back(j + 1);
        int pj = par[S][j];
        S &= ~(1 << j);
        j = pj;
    }
    res.seq.push_back(0);
    for (int k = static_cast<int>(rev.size()) - 1; k >= 0; --k) res.seq.push_back(rev[k]);
    if (returnToStart) res.seq.push_back(0);
    res.cost = best;
    return res;
}

// ---------------------------------------------------------------------------
// 5. Route reconstruction: expand matrix legs back into real road paths.
// ---------------------------------------------------------------------------
std::vector<Leg> buildLegs(const Graph& g, const DistanceMatrix& m, const std::vector<int>& seq,
                           double speedKmh) {
    if (speedKmh <= 0) throw std::invalid_argument("average speed must be positive");
    std::vector<Leg> legs;
    for (size_t k = 0; k + 1 < seq.size(); ++k) {
        Leg leg;
        leg.fromTerminal = seq[k];
        leg.toTerminal = seq[k + 1];
        const ShortestPathTree& tree = m.trees[seq[k]];  // reuse the stored predecessor tree
        int target = m.terminals[seq[k + 1]];
        leg.path = reconstructPath(tree, target);
        leg.distance = tree.dist[target];
        for (const Edge* e : pathArcs(g, tree, target)) {
            leg.roads.push_back(e->roadId);
            leg.timeMin += e->timeMin >= 0 ? e->timeMin : e->weight / speedKmh * 60.0;
        }
        legs.push_back(leg);
    }
    return legs;
}

std::vector<int> stitchLegs(const std::vector<Leg>& legs) {
    std::vector<int> walk;
    for (size_t k = 0; k < legs.size(); ++k) {
        const std::vector<int>& p = legs[k].path;
        // The first vertex of each later leg is the last vertex of the previous leg, so skip it.
        size_t startAt = (k == 0) ? 0 : 1;
        for (size_t t = startAt; t < p.size(); ++t) walk.push_back(p[t]);
    }
    return walk;
}

double improvementPercent(double initialCost, double optimisedCost) {
    if (!(initialCost > 0) || initialCost == INF) return 0.0;
    double saved = initialCost - optimisedCost;
    if (saved < EPS) return 0.0;  // no improvement: report exactly zero
    return saved / initialCost * 100.0;
}

}  // namespace route
