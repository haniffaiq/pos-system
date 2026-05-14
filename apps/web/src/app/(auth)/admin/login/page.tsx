import React from "react";
import { LoginForm } from "@/components/LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <LoginForm mode="admin" />
    </main>
  );
}
