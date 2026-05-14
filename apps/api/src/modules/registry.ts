import type { Sector } from "@app/shared";
import type { Hono } from "hono";

/** A sector module exposes a Hono router mounted under /api/v1/t/:tenantId/m. */
export interface SectorModule {
  sector: Sector;
  router: Hono<any>;
}

const registry = new Map<Sector, SectorModule>();

export function registerModule(mod: SectorModule): void {
  registry.set(mod.sector, mod);
}

export function getModule(sector: Sector): SectorModule | undefined {
  return registry.get(sector);
}
