import { handleError, ok, readJson, type RouteCtx } from "@/lib/http";
import { removeStop, setStopStatus } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// PATCH /api/delivery/stops/:id { status } — mark as pending or completed.
export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const { data } = mutateStore((d) => setStopStatus(d, decodeURIComponent(id), body.status));
    return ok(data.delivery);
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/delivery/stops/:id — remove a stop.
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const { data } = mutateStore((d) => removeStop(d, decodeURIComponent(id)));
    return ok(data.delivery);
  } catch (e) {
    return handleError(e);
  }
}
