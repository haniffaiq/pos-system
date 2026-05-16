import { clearSession, getCsrfToken, getSession, setSession } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface UniformErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  code?: string;
  message?: string;
  details?: unknown;
  metric?: string;
  limit?: number;
  current?: number;
  upgrade_url?: string;
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

function withCsrf(headers: Headers, method = "GET"): Headers {
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) && !headers.has("x-csrf-token")) {
    const csrf = getCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  return headers;
}

async function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  const headers = withCsrf(new Headers({ "content-type": "application/json" }), "POST");
  const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    clearSession();
    return false;
  }

  await readJson(response);
  setSession(session);
  return true;
}

function normalizeError(body: unknown): { code: string; message: string; details?: unknown } {
  const data = body as UniformErrorBody | null;
  const code = data?.error?.code ?? data?.code ?? "unknown";
  const message = data?.error?.message ?? data?.message ?? "Request failed";
  const details = data?.error?.details ?? data?.details ?? (data?.metric ? data : undefined);
  return { code, message, details };
}

function redirectTenantToBilling() {
  if (typeof window === "undefined") return;
  const [, tenantPrefix, tenantSlug] = window.location.pathname.split("/");
  if (tenantPrefix !== "t" || !tenantSlug) return;
  const billingPath = `/t/${tenantSlug}/billing`;
  if (window.location.pathname !== billingPath) {
    window.history.pushState({}, "", billingPath);
  }
}

function handleQuotaOrSubscriptionError(body: unknown, status: number) {
  const error = normalizeError(body);
  if (status === 403 && error.code === "QUOTA_EXCEEDED" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("quota-exceeded", { detail: error.details ?? body }));
  }
  if (status === 402 && error.code === "SUBSCRIPTION_INACTIVE") {
    redirectTenantToBilling();
  }
  return error;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(apiUrl(path), { ...init, headers: withCsrf(headers, init.method), credentials: "include" });

  if (response.status === 401 && !retried && session && (await refreshTokens())) {
    return apiFetch<T>(path, init, true);
  }

  const body = await readJson(response);
  if (!response.ok) {
    const error = handleQuotaOrSubscriptionError(body, response.status);
    throw new ApiError(error.code, error.message, response.status, error.details);
  }

  return body as T;
}
