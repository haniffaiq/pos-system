"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

interface RequireRoleProps {
  role: string;
  redirect: string;
  children: ReactNode;
}

export function RequireRole({ role, redirect, children }: RequireRoleProps) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== role) {
      setOk(false);
      router.replace(redirect);
      return;
    }

    setOk(true);
  }, [role, redirect, router]);

  return ok ? <>{children}</> : null;
}
