import { handleError, ok, readJson } from "@/lib/http";
import { updateSettings } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// PUT /api/settings { averageSpeedKmh, returnToWarehouse, maxIterations }
export async function PUT(req: Request) {
  try {
    const body = await readJson(req);
    const { result } = mutateStore((d) => updateSettings(d, body));
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
