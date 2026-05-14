import type { ReactNode } from "react";

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="border-2 border-fg rounded-lg shadow-brutal bg-card text-fg overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-primary/20 border-b-2 border-fg font-display font-bold text-fg">{head}</thead>
        <tbody className="divide-y-2 divide-fg/20">{children}</tbody>
      </table>
    </div>
  );
}
