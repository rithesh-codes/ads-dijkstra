"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { PlanResult } from "@/lib/types";
import { useAppData } from "./AppData";

// Calls POST /api/plan (the C++ pipeline), refreshes state, and optionally opens the results page.
export function usePlanRunner() {
  const { refresh, notify } = useAppData();
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run(goToResults = true) {
    setRunning(true);
    try {
      const plan = await api<PlanResult>("/api/plan", "POST");
      await refresh();
      if (!plan.feasible) notify("error", plan.reason ?? "No feasible route.");
      else
        notify(
          "success",
          `Route optimised: ${plan.stats!.optimisedDistance.toFixed(1)} km (${plan.stats!.improvementPercent.toFixed(1)}% shorter than nearest neighbour).`,
        );
      if (goToResults) router.push("/route");
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return { run, running };
}
