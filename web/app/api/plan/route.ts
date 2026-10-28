import { handleError, ok } from "@/lib/http";
import { computePlan } from "@/lib/service";
import { loadStore, mutateStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/plan — run the full C++ pipeline (Dijkstra matrix -> NN -> 2-opt -> Held-Karp)
// on the current delivery selection and save the result.
export async function POST() {
  try {
    const plan = await computePlan(loadStore());
    mutateStore((d) => {
      d.lastPlan = plan;
    });
    return ok(plan);
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/plan — discard the computed route.
export async function DELETE() {
  try {
    mutateStore((d) => {
      d.lastPlan = null;
    });
    return ok({ cleared: true });
  } catch (e) {
    return handleError(e);
  }
}
