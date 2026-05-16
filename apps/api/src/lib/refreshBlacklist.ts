import type { JwtPayload } from "@app/shared";

import { withAdmin } from "../db/withTenant";

export type RefreshBlacklistReason = "logout" | "rotation_reuse" | "admin_revoked" | "compromised";
export type DecodedRefreshToken = JwtPayload & { jti: string; exp: number };

export async function isRefreshBlacklisted(jti: string): Promise<boolean> {
  const result = await withAdmin((q) =>
    q<{ exists: number }>(
      "select 1 as exists from refresh_token_blacklist where jti = $1 and expires_at > now() limit 1",
      [jti],
    ),
  );
  return Boolean(result.rows[0]);
}

export async function blacklistRefreshToken(
  token: DecodedRefreshToken,
  reason: RefreshBlacklistReason = "logout",
): Promise<void> {
  const userId = token.role === "platform_admin" ? null : token.sub;
  const adminId = token.role === "platform_admin" ? token.sub : null;

  await withAdmin((q) =>
    q(
      `insert into refresh_token_blacklist (jti, user_id, admin_id, expires_at, reason)
       values ($1, $2, $3, to_timestamp($4), $5)
       on conflict (jti) do nothing`,
      [token.jti, userId, adminId, token.exp, reason],
    ),
  );
}

export async function purgeExpiredRefreshTokenBlacklist(): Promise<number> {
  const result = await withAdmin((q) => q("delete from refresh_token_blacklist where expires_at < now()"));
  return result.rowCount ?? 0;
}
