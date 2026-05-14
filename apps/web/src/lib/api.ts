import { clearSession, getSession, setSession } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface UniformErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/api") ? path : `/api/v1${path}`}`;
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  return JSON.parse(text) as unknown;
}

async function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  if (!response.ok) {
    clearSession();
    return false;
  }

  const tokens = (await readJson(response)) as RefreshResponse;
  setSession({ ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  return true;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (session) {
    headers.set("authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(apiUrl(path), { ...init, headers });

  if (response.status === 401 && !retried && session && (await refreshTokens())) {
    return apiFetch<T>(path, init, true);
  }

  const body = await readJson(response);
  if (!response.ok) {
    const uniform = body as UniformErrorBody | null;
    const error = uniform?.error;
    throw new ApiError(error?.code ?? "unknown", error?.message ?? "Request failed", response.status, error?.details);
  }

  return body as T;
}
