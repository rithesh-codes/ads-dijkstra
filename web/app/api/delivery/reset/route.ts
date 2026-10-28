import { handleError, ok } from "@/lib/http";
import { resetDeliveryPlan } from "@/lib/service";
import { mutateStore } from "@/lib/store";

// POST /api/delivery/reset — clear all stops and the computed route (keeps the warehouse).
export async function POST() {
  try {
    const { data } = mutateStore((d) => resetDeliveryPlan(d));
    return ok(data.delivery);
  } catch (e) {
    return handleError(e);
  }
}
