import { z } from "zod";

const sectorValues = ["grosir", "retail", "fnb", "jasa", "apotek"] as const;

const loginIdentifierSchema = z
  .string()
  .regex(/^[^\s@]+@[^\s@]+$/, "Invalid email");

export const loginSchema = z.object({
  email: loginIdentifierSchema,
  password: z.string().min(8),
});

export const registerTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  sector: z.enum(sectorValues),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
