// Helpers shared by the API route handlers: JSON bodies and error -> HTTP status mapping.
import { NextResponse } from "next/server";
import { EngineError } from "./engine";
import { ValidationError } from "./validation";

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleError(err: unknown) {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status });
  }
  if (err instanceof EngineError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

export type RouteCtx<P extends string = "id"> = { params: Promise<Record<P, string>> };
