import { beforeAll, describe, expect, it } from "vitest";
import { signAccess, signRefresh, verifyAccess, verifyRefresh } from "./jwt";

const payload = { sub: "u1", tenantId: "t1", role: "owner" as const };

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test_access";
  process.env.JWT_REFRESH_SECRET = "test_refresh";
  process.env.ACCESS_TOKEN_TTL = "900";
  process.env.REFRESH_TOKEN_TTL = "1209600";
});

describe("jwt", () => {
  it("signs and verifies an access token", async () => {
    const token = await signAccess(payload);

    const decoded = await verifyAccess(token);

    expect(decoded.sub).toBe("u1");
    expect(decoded.tenantId).toBe("t1");
    expect(decoded.role).toBe("owner");
  });

  it("signs and verifies a refresh token with a jti", async () => {
    const { token, jti } = await signRefresh(payload);

    const decoded = await verifyRefresh(token);

    expect(decoded.sub).toBe("u1");
    expect(decoded.tenantId).toBe("t1");
    expect(decoded.role).toBe("owner");
    expect(decoded.jti).toBe(jti);
  });

  it("rejects an access token verified as refresh", async () => {
    const token = await signAccess(payload);

    await expect(verifyRefresh(token)).rejects.toThrow(/refresh token/i);
  });

  it("rejects a refresh token verified as access", async () => {
    const { token } = await signRefresh(payload);

    await expect(verifyAccess(token)).rejects.toThrow(/access token/i);
  });
});
