import { handleError, ok } from "@/lib/http";
import { loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET /api/state — everything the UI needs: locations, roads, delivery, settings, last plan.
export async function GET() {
  try {
    return ok(loadStore());
  } catch (e) {
    return handleError(e);
  }
}
