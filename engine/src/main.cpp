// main.cpp — route_engine executable: reads one request from stdin, writes JSON to stdout.
//
//   route_engine < request.txt
//
// The Next.js server spawns this process once per algorithm request.
#include <iostream>

#include "protocol.hpp"

int main() {
    std::ios::sync_with_stdio(false);
    std::cout << route::handleRequest(std::cin) << std::endl;
    return 0;
}
