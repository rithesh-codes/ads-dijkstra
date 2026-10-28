# Optional CMake build (the web app builds the engine with web/scripts/build-engine.mjs).
#   cmake -S . -B build && cmake --build build && ./build/test_engine
cmake_minimum_required(VERSION 3.10)
project(route_engine CXX)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(route_core STATIC src/graph.cpp src/dijkstra.cpp src/route_optimizer.cpp src/protocol.cpp)
target_include_directories(route_core PUBLIC include)

add_executable(route_engine src/main.cpp)
target_link_libraries(route_engine route_core)

add_executable(test_engine tests/test_engine.cpp)
target_link_libraries(test_engine route_core)

enable_testing()
add_test(NAME engine_tests COMMAND test_engine)
