// protocol.hpp — text request in, JSON response out.
//
// The engine is stateless. Every request carries the whole graph:
//
//   COMMAND <plan|path|trace|reach|info>
//   NODES <n>
//   <locationId>                       (n lines)
//   EDGES <m>
//   <roadId> <from> <to> <km> <minutes|-1> <oneWay 0|1>   (m lines)
//   PARAM <name> <values...>           (any number of lines)
//   END
//
// IDs contain no whitespace (the web layer validates this).
#pragma once

#include <istream>
#include <map>
#include <string>
#include <vector>

#include "graph.hpp"

namespace route {

struct Request {
    std::string command;
    Graph graph;
    std::map<std::string, std::vector<std::string>> params;

    bool hasParam(const std::string& name) const { return params.count(name) > 0; }
    const std::string& param(const std::string& name) const;  // first value, throws if missing
};

// Parses a request. Throws std::invalid_argument with a readable message on malformed input.
Request parseRequest(std::istream& in);

// Runs the command and returns the JSON response. Errors become {"ok":false,"error":...}.
std::string handleRequest(std::istream& in);

}  // namespace route
