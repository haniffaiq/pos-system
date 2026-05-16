"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@app/shared";
import { Button, Input, Select } from "@app/ui";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { grosirApi } from "@/lib/grosir";
import { tenantQueryKey } from "@/lib/tenant";

interface Named {
  id: string;
  name: string;
}

type ProductFormInitial = ProductInput & { id: string };

interface ProductFormProps {
  initial?: ProductFormInitial;
  onDone: () => void;
  tenantId?: string;
}

function emptyToUndefined(value: unknown): unknown {
  return value === "" || Number.isNaN(value) ? undefined : value;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === "" || value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function cleanProductInput(values: ProductInput): ProductInput {
  const cleaned = {
    ...values,
    categoryId: emptyToUndefined(values.categoryId) as string | undefined,
    bulkUnitId: emptyToUndefined(values.bulkUnitId) as string | undefined,
    bulkConversion: emptyToUndefined(values.bulkConversion) as number | undefined,
  };
  return productSchema.parse(cleaned);
}

export function ProductForm({ initial, onDone, tenantId }: ProductFormProps) {
  const { data: units = [] } = useQuery({
    queryKey: tenantQueryKey(tenantId, "grosir-masterdata", "/masterdata/units"),
    queryFn: () => grosirApi<Named[]>("/masterdata/units"),
    enabled: Boolean(tenantId),
  });
  const { data: categories = [] } = useQuery({
    queryKey: tenantQueryKey(tenantId, "grosir-masterdata", "/masterdata/categories"),
    queryFn: () => grosirApi<Named[]>("/masterdata/categories"),
    enabled: Boolean(tenantId),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ?? {
      sku: "",
      name: "",
      categoryId: undefined,
      baseUnitId: "",
      bulkUnitId: undefined,
      bulkConversion: undefined,
      buyPrice: 0,
      sellPriceEceran: 0,
      sellPriceGrosir: 0,
      minStock: 0,
    },
  });

  async function onSubmit(values: ProductInput) {
    const body = JSON.stringify(cleanProductInput(values));
    if (initial) {
      await grosirApi(`/products/${initial.id}`, { method: "PUT", body });
    } else {
      await grosirApi("/products", { method: "POST", body });
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <Input label="SKU" {...register("sku")} error={errors.sku?.message} />
      <Input label="Nama" {...register("name")} error={errors.name?.message} />
      <Select label="Kategori" {...register("categoryId", { setValueAs: emptyToUndefined })} error={errors.categoryId?.message}>
        <option value="">— pilih —</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Select label="Satuan dasar (eceran)" {...register("baseUnitId")} error={errors.baseUnitId?.message}>
        <option value="">— pilih —</option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name}
          </option>
        ))}
      </Select>
      <Select label="Satuan grosir (opsional)" {...register("bulkUnitId", { setValueAs: emptyToUndefined })} error={errors.bulkUnitId?.message}>
        <option value="">— tidak ada —</option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name}
          </option>
        ))}
      </Select>
      <Input
        label="Konversi grosir (isi ke base)"
        type="number"
        min={2}
        {...register("bulkConversion", { setValueAs: optionalInteger })}
        error={errors.bulkConversion?.message}
      />
      <Input label="Harga beli (per eceran)" type="number" min={0} step={1} {...register("buyPrice", { valueAsNumber: true })} error={errors.buyPrice?.message} />
      <Input
        label="Harga jual eceran"
        type="number"
        min={0}
        step={1}
        {...register("sellPriceEceran", { valueAsNumber: true })}
        error={errors.sellPriceEceran?.message}
      />
      <Input
        label="Harga jual grosir (per satuan grosir)"
        type="number"
        min={0}
        step={1}
        {...register("sellPriceGrosir", { valueAsNumber: true })}
        error={errors.sellPriceGrosir?.message}
      />
      <Input label="Stok minimum" type="number" min={0} step={1} {...register("minStock", { valueAsNumber: true })} error={errors.minStock?.message} />
      <Button type="submit" variant="primary" disabled={isSubmitting}>
        Simpan
      </Button>
    </form>
  );
}
