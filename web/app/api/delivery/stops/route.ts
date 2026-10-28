import { handleError, ok, readJson } from "@/lib/http";
import { addStop } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// POST /api/delivery/stops { locationId } — add a delivery stop.
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const { data } = mutateStore((d) => addStop(d, body.locationId));
    return ok(data.delivery, 201);
  } catch (e) {
    return handleError(e);
  }
}
