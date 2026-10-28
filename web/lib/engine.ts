// Bridge to the C++ core. Each call serialises the graph into the engine's text protocol,
// runs engine/bin/route_engine with the request on stdin, and parses the JSON it prints.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Location, Road } from "./types";

export class EngineError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export type EngineCommand = "plan" | "path" | "trace" | "reach" | "info";

export function enginePath(): string {
  if (process.env.ROUTE_ENGINE_PATH) return process.env.ROUTE_ENGINE_PATH;
  const exe = process.platform === "win32" ? "route_engine.exe" : "route_engine";
  return path.resolve(process.cwd(), "..", "engine", "bin", exe);
}

// Builds the request text, e.g.
//   COMMAND path
//   NODES 2
//   A
//   B
//   EDGES 1
//   R01 A B 2.5 -1 0
//   PARAM source A
//   PARAM target B
//   END
export function serializeRequest(
  command: EngineCommand,
  locations: Location[],
  roads: Road[],
  params: Record<string, string | number | boolean | string[]>,
): string {
  const lines: string[] = [`COMMAND ${command}`, `NODES ${locations.length}`];
  for (const l of locations) lines.push(l.id);
  lines.push(`EDGES ${roads.length}`);
  for (const r of roads) {
    const time = r.travelTimeMin === null ? -1 : r.travelTimeMin;
    lines.push(`${r.id} ${r.from} ${r.to} ${r.distanceKm} ${time} ${r.oneWay ? 1 : 0}`);
  }
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) lines.push(`PARAM ${name} ${value.length} ${value.join(" ")}`.trimEnd());
    else if (typeof value === "boolean") lines.push(`PARAM ${name} ${value ? 1 : 0}`);
    else lines.push(`PARAM ${name} ${value}`);
  }
  lines.push("END");
  return lines.join("\n") + "\n";
}

export async function runEngine<T>(
  command: EngineCommand,
  locations: Location[],
  roads: Road[],
  params: Record<string, string | number | boolean | string[]> = {},
): Promise<T & { engineMs: number }> {
  const exe = enginePath();
  if (!fs.existsSync(exe)) {
    throw new EngineError(
      `C++ engine not found at ${exe}. Build it with "npm run engine:build" (requires g++).`,
      503,
    );
  }
  const input = serializeRequest(command, locations, roads, params);
  const started = performance.now();

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(exe, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new EngineError("The C++ engine timed out after 15 s.", 504));
    }, 15000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new EngineError(`Could not start the C++ engine: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new EngineError(`C++ engine exited with code ${code}: ${err.trim()}`));
      else resolve(out);
    });
    child.stdin.end(input);
  });

  let parsed: { ok: boolean; error?: string } & T;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new EngineError("The C++ engine returned invalid JSON.");
  }
  if (!parsed.ok) throw new EngineError(parsed.error ?? "Engine error", 400);
  return { ...parsed, engineMs: Math.round((performance.now() - started) * 100) / 100 };
}
