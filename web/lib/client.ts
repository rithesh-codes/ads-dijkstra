// Browser-side helpers: a fetch wrapper that turns API errors into exceptions, plus formatters.

export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const p = (payload ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(p.error ?? `Request failed (${res.status})`, p.fields ?? {});
  }
  return payload as T;
}

export function fmtKm(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "∞";
  return `${x.toFixed(digits)} km`;
}

export function fmtNum(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "∞";
  return x.toFixed(digits);
}

export function fmtMin(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const m = Math.round(x);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${x.toFixed(digits)}%`;
}
