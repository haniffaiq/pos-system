import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type JsonCatalog = Record<string, unknown>;

export type CatalogComparison = {
  totalIdKeys: number;
  totalEnKeys: number;
  missingInEn: string[];
  missingInId: string[];
};

export function collectLeafKeys(catalog: JsonCatalog, prefix = ""): string[] {
  return Object.entries(catalog)
    .flatMap(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        return collectLeafKeys(value as JsonCatalog, fullKey);
      }

      return [fullKey];
    })
    .sort();
}

export function compareCatalogKeys(idCatalog: JsonCatalog, enCatalog: JsonCatalog): CatalogComparison {
  const idKeys = collectLeafKeys(idCatalog);
  const enKeys = collectLeafKeys(enCatalog);
  const idKeySet = new Set(idKeys);
  const enKeySet = new Set(enKeys);

  return {
    totalIdKeys: idKeys.length,
    totalEnKeys: enKeys.length,
    missingInEn: idKeys.filter((key) => !enKeySet.has(key)),
    missingInId: enKeys.filter((key) => !idKeySet.has(key)),
  };
}

export function formatCoverageReport(result: CatalogComparison): string {
  if (!result.missingInEn.length && !result.missingInId.length) {
    return `i18n keys aligned: ${result.totalIdKeys}`;
  }

  return [
    `i18n key coverage mismatch (ID: ${result.totalIdKeys}, EN: ${result.totalEnKeys})`,
    `Missing in EN: ${result.missingInEn.length ? result.missingInEn.join(", ") : "none"}`,
    `Missing in ID: ${result.missingInId.length ? result.missingInId.join(", ") : "none"}`,
  ].join("\n");
}

function readCatalog(path: string): JsonCatalog {
  return JSON.parse(readFileSync(path, "utf8")) as JsonCatalog;
}

export function checkCatalogFiles(idPath = resolve("messages/id.json"), enPath = resolve("messages/en.json")): CatalogComparison {
  return compareCatalogKeys(readCatalog(idPath), readCatalog(enPath));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkCatalogFiles();
  const report = formatCoverageReport(result);

  if (result.missingInEn.length || result.missingInId.length) {
    console.error(report);
    process.exit(1);
  }

  console.log(report);
}
