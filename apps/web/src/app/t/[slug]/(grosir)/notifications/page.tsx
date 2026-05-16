"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@app/ui";
import { grosirApi } from "@/lib/grosir";
import { fetchTenantContext, tenantContextKey, tenantQueryKey } from "@/lib/tenant";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata?: {
    product_id?: string;
    stock_qty?: number;
    min_stock?: number;
  } | null;
  is_read: boolean;
  created_at: string;
}

function lowStockMeta(notification: Notification): string | null {
  if (notification.type !== "low_stock") return null;
  const stockQty = notification.metadata?.stock_qty;
  const minStock = notification.metadata?.min_stock;
  if (typeof stockQty !== "number" || typeof minStock !== "number") return null;
  return `Stok saat ini ${stockQty}, minimum ${minStock}`;
}

export default function NotificationsPage({ params }: { params: { slug: string } }) {
  const qc = useQueryClient();
  const { data: ctx } = useQuery({ queryKey: tenantContextKey(params.slug), queryFn: () => fetchTenantContext(params.slug) });
  const queryKey = tenantQueryKey(ctx?.tenantId, "grosir-notifications");
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => grosirApi<Notification[]>("/notifications"),
    enabled: Boolean(ctx?.tenantId),
  });
  const unreadLowStockCount = data.filter((notification) => notification.type === "low_stock" && !notification.is_read).length;
  const markRead = useMutation({
    mutationFn: (id: string) => grosirApi<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-3xl font-black">Notifikasi</h1>
        <p className="text-sm text-fg/70">Pantau alert tenant grosir.</p>
        <p className="text-sm text-fg/70">Low-stock scanner membuat maksimal satu notifikasi unread per produk.</p>
        {unreadLowStockCount > 0 ? <Badge tone="accent">{unreadLowStockCount} stok menipis unread</Badge> : null}
      </div>

      <div className="space-y-3">
        {isLoading ? <p className="text-sm text-fg/70">Loading…</p> : null}
        {!isLoading && data.length === 0 ? <p className="text-fg/70">Belum ada notifikasi.</p> : null}
        {data.map((notification) => {
          const stockMeta = lowStockMeta(notification);
          return (
            <Card key={notification.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black">{notification.title}</p>
                  {!notification.is_read && <Badge tone="accent">baru</Badge>}
                  {notification.type === "low_stock" && <Badge tone="soft">low stock</Badge>}
                </div>
                {notification.body ? <p className="text-sm text-fg/70">{notification.body}</p> : null}
                {stockMeta ? <p className="text-xs font-bold text-fg/70">{stockMeta}</p> : null}
              </div>
              {!notification.is_read ? (
                <Button
                  variant="white"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(notification.id)}
                >
                  Tandai dibaca
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
