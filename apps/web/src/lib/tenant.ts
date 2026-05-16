import { apiFetch } from "./api";
import { getSession } from "./auth";

export interface TenantContext {
  userId: string;
  tenantId: string;
  tenantSlug?: string | null;
  role: string;
  sector: string;
}

type TenantQueryPart = string | number | boolean | null | undefined;

export function tenantContextKey(slug: string) {
  return ["tenant-ctx", slug] as const;
}

export function tenantQueryKey(tenantId: string | null | undefined, ...parts: TenantQueryPart[]) {
  return ["tenant", tenantId ?? "unknown", ...parts] as const;
}

export async function fetchTenantContext(expectedSlug?: string): Promise<TenantContext> {
  const session = getSession();
  if (!session?.tenantId) throw new Error("no tenant session");
  if (expectedSlug && session.tenantSlug && session.tenantSlug !== expectedSlug) {
    throw new Error("tenant slug mismatch");
  }

  const context = await apiFetch<Omit<TenantContext, "tenantSlug"> & { tenantSlug?: string | null }>(`/t/${session.tenantId}/me`);
  const tenantSlug = context.tenantSlug ?? session.tenantSlug ?? null;
  if (expectedSlug && tenantSlug && tenantSlug !== expectedSlug) {
    throw new Error("tenant slug mismatch");
  }

  return { ...context, tenantSlug };
}
