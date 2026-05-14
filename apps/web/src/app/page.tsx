import React from "react";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="rounded-lg border-2 border-fg bg-card px-8 py-6 shadow-brutal">
        <h1 className="text-3xl font-black">Operational Web App</h1>
        <p className="mt-2 text-fg/70">Go to /admin/login or /t/&lt;slug&gt;/login</p>
      </div>
    </main>
  );
}
