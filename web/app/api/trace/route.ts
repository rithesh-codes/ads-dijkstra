import { handleError, ok, readJson } from "@/lib/http";
import { dijkstraTrace } from "@/lib/service";
import { loadStore } from "@/lib/store";

// POST /api/trace { source } — step-by-step Dijkstra trace with a heap snapshot per step.
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    return ok(await dijkstraTrace(loadStore(), body.source));
  } catch (e) {
    return handleError(e);
  }
}
