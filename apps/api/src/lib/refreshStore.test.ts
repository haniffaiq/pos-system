import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const describeWithRedis = process.env.REDIS_URL ? describe : describe.skip;

let redis: typeof import("./redis")["redis"];
let saveRefresh: typeof import("./refreshStore")["saveRefresh"];
let isRefreshValid: typeof import("./refreshStore")["isRefreshValid"];
let revokeRefresh: typeof import("./refreshStore")["revokeRefresh"];

const testNamespace = `test-${process.pid}-${Date.now()}`;
const user = (suffix: string) => `${testNamespace}:${suffix}`;
const refreshPattern = `refresh:${testNamespace}:*`;

async function cleanupRefreshKeys(): Promise<void> {
  if (!redis) {
    return;
  }

  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", refreshPattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

describeWithRedis("refresh store", () => {
  beforeAll(async () => {
    ({ redis } = await import("./redis"));
    ({ saveRefresh, isRefreshValid, revokeRefresh } = await import("./refreshStore"));
  });

  afterEach(async () => {
    await cleanupRefreshKeys();
  });

  afterAll(async () => {
    await cleanupRefreshKeys();
    await redis?.quit();
  });

  it("saves a jti with ttl then validates it", async () => {
    await saveRefresh(user("user1"), "jti-1", 60);

    expect(await isRefreshValid(user("user1"), "jti-1")).toBe(true);
    expect(await redis.ttl(`refresh:${user("user1")}:jti-1`)).toBeGreaterThan(0);
  });

  it("returns false for an unknown jti", async () => {
    expect(await isRefreshValid(user("user1"), "nope")).toBe(false);
  });

  it("revokes a jti", async () => {
    await saveRefresh(user("user2"), "jti-2", 60);

    await revokeRefresh(user("user2"), "jti-2");

    expect(await isRefreshValid(user("user2"), "jti-2")).toBe(false);
  });
});
