import { handleError, ok } from "@/lib/http";
import { reachability } from "@/lib/service";
import { loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET /api/reach?source=WH — which locations can or cannot be reached from the source.
export async function GET(req: Request) {
  try {
    const source = new URL(req.url).searchParams.get("source");
    return ok(await reachability(loadStore(), source));
  } catch (e) {
    return handleError(e);
  }
}
