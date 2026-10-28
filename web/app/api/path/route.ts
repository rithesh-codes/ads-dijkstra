import { handleError, ok, readJson } from "@/lib/http";
import { shortestPath } from "@/lib/service";
import { loadStore } from "@/lib/store";

// POST /api/path { source, target } — Dijkstra shortest path between two locations.
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    return ok(await shortestPath(loadStore(), body.source, body.target));
  } catch (e) {
    return handleError(e);
  }
}
