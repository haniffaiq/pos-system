import * as argon2 from "argon2";
import { Pool } from "pg";

async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password) {
    console.error("usage: tsx db/seeds/seed-admin.ts <email> <password> [name]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to seed a platform admin");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c app.platform_mode=on",
  });
  try {
    await pool.query(
      `insert into platform_admins(email, password_hash, name)
       values ($1, $2, $3)
       on conflict (email) do update
         set password_hash = excluded.password_hash,
             name = excluded.name`,
      [email, await argon2.hash(password), name ?? "Platform Admin"],
    );
    console.log(`platform admin ready: ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
