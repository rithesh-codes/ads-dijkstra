import { handleError, ok, readJson } from "@/lib/http";
import { addLocation } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// POST /api/locations — create a location (vertex).
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { result } = mutateStore((d) => addLocation(d, body));
    return ok(result, 201);
  } catch (e) {
    return handleError(e);
  }
}
