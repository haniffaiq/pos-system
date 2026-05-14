import { apiFetch } from "./api";
import { getSession } from "./auth";

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: string;
  sector: string;
}

export async function fetchTenantContext(): Promise<TenantContext> {
  const session = getSession();
  if (!session?.tenantId) throw new Error("no tenant session");

  return apiFetch<TenantContext>(`/t/${session.tenantId}/me`);
}
