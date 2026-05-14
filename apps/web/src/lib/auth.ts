export interface Session {
  accessToken: string;
  refreshToken: string;
  role: string;
  tenantId: string | null;
}

const SESSION_KEY = "owa.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    clearSession();
    return null;
  }
}

export function setSession(session: Session): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(SESSION_KEY);
}
