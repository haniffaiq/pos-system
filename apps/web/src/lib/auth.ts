export interface Session {
  role: string;
  tenantId: string | null;
}

type SafeSessionInput = Session & { accessToken?: unknown; refreshToken?: unknown };

const SESSION_KEY = "owa.session";
const CSRF_COOKIE = "brs_csrf";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function sanitizeSession(value: unknown): Session | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SafeSessionInput>;
  if (typeof candidate.role !== "string") return null;
  if (candidate.tenantId !== null && typeof candidate.tenantId !== "string") return null;
  return { role: candidate.role, tenantId: candidate.tenantId };
}

export function getSession(): Session | null {
  const store = storage();
  if (!store) return null;
  window.localStorage.removeItem(SESSION_KEY);

  const raw = store.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = sanitizeSession(JSON.parse(raw));
    if (!session) {
      clearSession();
      return null;
    }
    store.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function setSession(session: SafeSessionInput): void {
  const store = storage();
  if (!store) return;

  window.localStorage.removeItem(SESSION_KEY);
  const safeSession: Session = { role: session.role, tenantId: session.tenantId };
  store.setItem(SESSION_KEY, JSON.stringify(safeSession));
}

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(CSRF_COOKIE.length + 1)) : null;
}

export function clearSession(): void {
  const store = storage();
  if (!store) return;

  window.localStorage.removeItem(SESSION_KEY);
  store.removeItem(SESSION_KEY);
}
