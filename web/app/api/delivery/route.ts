import { handleError, ok, readJson } from "@/lib/http";
import { setWarehouse } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// PUT /api/delivery { warehouseId } — choose the starting location.
export async function PUT(req: Request) {
  try {
    const body = await readJson(req);
    const { data } = mutateStore((d) => setWarehouse(d, body.warehouseId));
    return ok(data.delivery);
  } catch (e) {
    return handleError(e);
  }
}
