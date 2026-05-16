export interface Session {
  accessToken?: string;
  refreshToken?: string;
  role: string;
  tenantId: string | null;
}

const SESSION_KEY = "owa.session";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function getSession(): Session | null {
  const store = storage();
  if (!store) return null;
  window.localStorage.removeItem(SESSION_KEY);

  const raw = store.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    clearSession();
    return null;
  }
}

export function setSession(session: Session): void {
  const store = storage();
  if (!store) return;

  window.localStorage.removeItem(SESSION_KEY);
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...safeSession } = session;
  store.setItem(SESSION_KEY, JSON.stringify(safeSession));
}

export function clearSession(): void {
  const store = storage();
  if (!store) return;

  window.localStorage.removeItem(SESSION_KEY);
  store.removeItem(SESSION_KEY);
}
