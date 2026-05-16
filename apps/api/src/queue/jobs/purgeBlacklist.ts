import { purgeExpiredRefreshTokenBlacklist } from "../../lib/refreshBlacklist";

export { purgeExpiredRefreshTokenBlacklist };

export const purgeBlacklistProcessor = async (): Promise<void> => {
  await purgeExpiredRefreshTokenBlacklist();
};
