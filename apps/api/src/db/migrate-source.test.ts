import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrateSourcePath = resolve(__dirname, "../../../../db/migrate.ts");

describe("raw SQL migration runner source contract", () => {
  it("creates the migration ledger and applies sorted sql files transactionally", () => {
    const source = readFileSync(migrateSourcePath, "utf8");

    expect(source).toContain("create table if not exists _migrations");
    expect(source).toContain("readdirSync(dir)");
    expect(source).toContain(".filter((file) => file.endsWith(\".sql\"))");
    expect(source).toContain(".sort()");
    expect(source).toContain('await client.query("begin")');
    expect(source).toContain("await client.query(sql)");
    expect(source).toContain("insert into _migrations(name) values ($1)");
    expect(source).toContain('await client.query("commit")');
    expect(source).toContain('await client.query("rollback")');
  });
});
