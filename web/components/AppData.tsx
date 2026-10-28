"use client";

// App-wide client state: the persisted store (locations, roads, delivery, settings, plan),
// fetched from /api/state, plus toast notifications. Pages call refresh() after mutations.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Location, StoreData } from "@/lib/types";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };

interface AppDataValue {
  data: StoreData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: (d: StoreData) => void;
  locById: Map<string, Location>;
  nameOf: (id: string) => string;
  notify: (kind: Toast["kind"], text: string) => void;
}

const Ctx = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      setData(await api<StoreData>("/api/state"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const locById = useMemo(() => new Map((data?.locations ?? []).map((l) => [l.id, l])), [data]);
  const nameOf = useCallback((id: string) => locById.get(id)?.name ?? id, [locById]);

  const value = useMemo(
    () => ({ data, loading, error, refresh, setData, locById, nameOf, notify }),
    [data, loading, error, refresh, locById, nameOf, notify],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useAppData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData must be used inside AppDataProvider");
  return v;
}
