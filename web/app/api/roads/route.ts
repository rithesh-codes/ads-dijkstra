import { handleError, ok, readJson } from "@/lib/http";
import { addRoad } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// POST /api/roads — create a road (weighted edge). The ID is assigned by the server.
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { result } = mutateStore((d) => addRoad(d, body));
    return ok(result, 201);
  } catch (e) {
    return handleError(e);
  }
}
