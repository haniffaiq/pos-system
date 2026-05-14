import { withTenant } from "../../db/withTenant";
import { AppError } from "../../lib/errors";

export interface NotificationRow {
  id: string;
  type: "low_stock" | "export_ready";
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: Date;
}

export interface CreateNotificationInput {
  type: "low_stock" | "export_ready";
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
}

export function createNotification(tenantId: string, input: CreateNotificationInput): Promise<NotificationRow> {
  return withTenant(tenantId, async (q) => {
    const result = await q<NotificationRow>(
      `insert into notifications (tenant_id, type, title, body, metadata)
       values (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4::jsonb)
       returning id, type, title, body, metadata, is_read, created_at`,
      [input.type, input.title, input.body ?? null, JSON.stringify(input.metadata ?? {})],
    );
    return result.rows[0]!;
  });
}

export function listNotifications(
  tenantId: string,
  filter: { unreadOnly?: boolean } = {},
): Promise<NotificationRow[]> {
  return withTenant(tenantId, async (q) => {
    const unreadWhere = filter.unreadOnly ? " where is_read = false" : "";
    const result = await q<NotificationRow>(
      `select id, type, title, body, metadata, is_read, created_at
       from notifications${unreadWhere}
       order by created_at desc, id desc
       limit 100`,
    );
    return result.rows;
  });
}

export async function markRead(tenantId: string, id: string): Promise<void> {
  await withTenant(tenantId, async (q) => {
    const result = await q("update notifications set is_read = true where id = $1", [id]);
    if (!result.rowCount) {
      throw new AppError(404, "not_found", "Notification not found");
    }
  });
}
