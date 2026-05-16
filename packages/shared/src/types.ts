export type Role = "owner" | "manager" | "cashier";
export type Sector = "grosir" | "retail" | "fnb" | "jasa" | "apotek";
export type TenantStatus = "active" | "suspended";

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: Role | "platform_admin";
  sessionJti?: string;
}
