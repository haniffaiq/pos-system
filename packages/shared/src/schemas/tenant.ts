import { z } from "zod";

export const tenantStatusSchema = z.enum(["active", "suspended"]);
export const updateTenantStatusSchema = z.object({
  status: tenantStatusSchema,
});

export type TenantStatusInput = z.infer<typeof tenantStatusSchema>;
export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;
