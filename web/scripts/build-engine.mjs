// Compiles the C++ engine (and optionally its tests) with g++.
//
//   node scripts/build-engine.mjs              build engine/bin/route_engine
//   node scripts/build-engine.mjs --test       build and run engine/bin/test_engine
//   node scripts/build-engine.mjs --if-missing build only if the binary does not exist
//
// Set CXX to use a different compiler, e.g. CXX=clang++.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "engine");
const bin = path.join(root, "bin");
const exe = (name) => path.join(bin, process.platform === "win32" ? `${name}.exe` : name);
const cxx = process.env.CXX || "g++";
const sources = ["graph.cpp", "dijkstra.cpp", "route_optimizer.cpp", "protocol.cpp"].map((f) =>
  path.join(root, "src", f),
);
// Static linking on Windows means the .exe does not need MinGW DLLs on PATH at runtime.
const flags = ["-std=c++14", "-O2", "-Wall", "-Wextra", `-I${path.join(root, "include")}`];
if (process.platform === "win32") flags.push("-static");

const args = process.argv.slice(2);
mkdirSync(bin, { recursive: true });

function compile(output, extra) {
  console.log(`[engine] ${cxx} -> ${path.relative(process.cwd(), output)}`);
  execFileSync(cxx, [...flags, ...sources, ...extra, "-o", output], { stdio: "inherit" });
}

try {
  if (args.includes("--if-missing") && existsSync(exe("route_engine"))) process.exit(0);
  compile(exe("route_engine"), [path.join(root, "src", "main.cpp")]);
  if (args.includes("--test")) {
    compile(exe("test_engine"), [path.join(root, "tests", "test_engine.cpp")]);
    execFileSync(exe("test_engine"), [], { stdio: "inherit" });
  }
} catch (e) {
  console.error(`[engine] build or test failed: ${e.message}`);
  process.exit(1);
}
