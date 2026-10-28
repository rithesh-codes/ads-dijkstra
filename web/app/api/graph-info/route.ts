import { handleError, ok } from "@/lib/http";
import { graphInfo } from "@/lib/service";
import { loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET /api/graph-info — adjacency list, density, memory comparison, connected components.
export async function GET() {
  try {
    return ok(await graphInfo(loadStore()));
  } catch (e) {
    return handleError(e);
  }
}
