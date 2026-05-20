import { afterAll, describe, expect, it } from "vitest";

import { adminPool, tenantPool } from "../../db/pool";
import { withAdmin } from "../../db/withTenant";
import { AppError } from "../../lib/errors";
import { createNotification, listNotifications, markRead } from "./notifications.service";

const databaseUrl = process.env.DATABASE_URL;

const describeWithDatabase = databaseUrl ? describe : describe.skip;

async function createTenant(slugPrefix: string): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  return withAdmin(async (q) => {
    const tenant = await q<{ id: string }>(
      "insert into tenants(name, slug, sector) values ($1, $2, 'grosir') returning id",
      [`${slugPrefix} ${suffix}`, `${slugPrefix.toLowerCase()}-${suffix}`],
    );
    return tenant.rows[0]!.id;
  });
}

describeWithDatabase("notifications service", () => {
  afterAll(async () => {
    await Promise.all([tenantPool.end(), adminPool.end()]);
  });

  it("creates, lists, and marks a tenant notification read", async () => {
    const tenantId = await createTenant("NotifCo");

    const notification = await createNotification(tenantId, {
      type: "low_stock",
      title: "Stok menipis",
      body: "Beras",
    });

    expect(notification).toMatchObject({
      type: "low_stock",
      title: "Stok menipis",
      body: "Beras",
      is_read: false,
    });

    let unread = await listNotifications(tenantId, { unreadOnly: true });
    expect(unread.map((row) => row.id)).toContain(notification.id);

    await markRead(tenantId, notification.id);

    unread = await listNotifications(tenantId, { unreadOnly: true });
    expect(unread.map((row) => row.id)).not.toContain(notification.id);
    await expect(listNotifications(tenantId, {})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: notification.id, is_read: true })]),
    );
  });

  it("keeps unread lists tenant-scoped", async () => {
    const tenantA = await createTenant("TenantA");
    const tenantB = await createTenant("TenantB");
    const notificationA = await createNotification(tenantA, {
      type: "low_stock",
      title: "Tenant A stock",
    });
    const notificationB = await createNotification(tenantB, {
      type: "low_stock",
      title: "Tenant B stock",
    });

    await expect(listNotifications(tenantA, { unreadOnly: true })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: notificationA.id })]),
    );
    await expect(listNotifications(tenantA, { unreadOnly: true })).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: notificationB.id })]),
    );
  });

  it("does not mark another tenant notification as read", async () => {
    const tenantA = await createTenant("ReadA");
    const tenantB = await createTenant("ReadB");
    const notificationB = await createNotification(tenantB, {
      type: "low_stock",
      title: "Tenant B stock",
    });

    await expect(markRead(tenantA, notificationB.id)).rejects.toMatchObject<AppError>({
      status: 404,
      code: "not_found",
    });
    await expect(listNotifications(tenantB, { unreadOnly: true })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: notificationB.id, is_read: false })]),
    );
  });
});
