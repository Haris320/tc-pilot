/**
 * Single fetch wrapper. All frontend → FastAPI traffic goes through here.
 * - Reads NEXT_PUBLIC_API_URL (set in .env.local)
 * - Forwards the patient_id cookie as X-Patient-Id (server-side reads the cookie directly)
 * - Throws ApiError on non-2xx so callers can surface a toast
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

type RequestOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  patientId?: string;
  signal?: AbortSignal;
};

export async function api<T = unknown>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const pid = opts.patientId ?? readCookie("patient_id");
  if (pid) headers["X-Patient-Id"] = pid;

  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: "include",
  });

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data,
      typeof data === "object" && data && "message" in data
        ? String((data as { message: unknown }).message)
        : `${res.status} ${res.statusText}`,
    );
  }
  return data as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}
