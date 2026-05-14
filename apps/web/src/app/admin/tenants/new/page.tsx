"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerTenantSchema, type RegisterTenantInput } from "@app/shared";
import { Button, Card, Input, Select } from "@app/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, apiFetch } from "@/lib/api";

const SECTORS = ["grosir", "retail", "fnb", "jasa", "apotek"] as const;

export default function NewTenantPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterTenantInput>({
    resolver: zodResolver(registerTenantSchema),
    defaultValues: { sector: "grosir" },
  });

  async function onSubmit(values: RegisterTenantInput) {
    setServerError(null);
    try {
      const tenant = await apiFetch<{ id: string }>("/admin/tenants", {
        method: "POST",
        body: JSON.stringify(values),
      });
      router.push(`/admin/tenants/${tenant.id}`);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Failed to register tenant");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg/70">Platform tenants</p>
        <h1 className="font-display text-3xl font-black text-fg">Register tenant</h1>
        <p className="mt-1 font-bold text-fg/70">Create the tenant, owner user, provisioning job, and welcome email trigger.</p>
      </div>

      <Card className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Company name" placeholder="Toko Sumber" {...register("name")} error={errors.name?.message} />
          <Input label="Slug" placeholder="toko-sumber" {...register("slug")} error={errors.slug?.message} />
          <Select label="Sector" {...register("sector")} error={errors.sector?.message}>
            {SECTORS.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </Select>
          <Input
            label="Owner email"
            type="email"
            placeholder="owner@example.com"
            {...register("ownerEmail")}
            error={errors.ownerEmail?.message}
          />
          <Input
            label="Owner password"
            type="password"
            autoComplete="new-password"
            {...register("ownerPassword")}
            error={errors.ownerPassword?.message}
          />
          {serverError ? <p className="font-bold text-accent">{serverError}</p> : null}
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create tenant"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
