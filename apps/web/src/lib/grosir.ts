import { apiFetch } from "./api";
import { getSession } from "./auth";

function tenantId(): string {
  const session = getSession();
  if (!session?.tenantId) throw new Error("no tenant session");
  return session.tenantId;
}

/** Calls the grosir module, which is mounted at /t/:tenantId/m/... on the API. */
export function grosirApi<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/t/${tenantId()}/m${path}`, init);
}
