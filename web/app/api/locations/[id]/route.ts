import { handleError, ok, readJson, type RouteCtx } from "@/lib/http";
import { deleteLocation, updateLocation } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// PUT /api/locations/:id — edit name, coordinates, or type (the ID cannot change).
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const { result } = mutateStore((d) => updateLocation(d, decodeURIComponent(id), body));
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/locations/:id — refused while any road or the delivery plan still uses it.
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    mutateStore((d) => deleteLocation(d, decodeURIComponent(id)));
    return ok({ deleted: id });
  } catch (e) {
    return handleError(e);
  }
}
