import { handleError, ok, readJson, type RouteCtx } from "@/lib/http";
import { deleteRoad, updateRoad } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// PUT /api/roads/:id — edit a road.
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const { result } = mutateStore((d) => updateRoad(d, decodeURIComponent(id), body));
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/roads/:id — delete a road.
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    mutateStore((d) => deleteRoad(d, decodeURIComponent(id)));
    return ok({ deleted: id });
  } catch (e) {
    return handleError(e);
  }
}
