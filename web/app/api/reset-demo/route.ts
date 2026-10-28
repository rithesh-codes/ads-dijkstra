import { handleError, ok } from "@/lib/http";
import { resetToDemo } from "@/lib/store";

// POST /api/reset-demo — replace all data with data/demo_data.json.
export async function POST() {
  try {
    return ok(resetToDemo());
  } catch (e) {
    return handleError(e);
  }
}
