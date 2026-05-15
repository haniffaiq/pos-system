import type { ReactNode } from "react";

export function Table({ head, children, minWidth = "min-w-[640px]" }: { head: ReactNode; children: ReactNode; minWidth?: string }) {
  return (
    <div className="border-2 border-fg rounded-lg shadow-brutal bg-card text-fg overflow-x-auto">
      <table className={`w-full ${minWidth} text-left text-sm`}>
        <thead className="bg-primary/20 border-b-2 border-fg font-display font-bold text-fg">{head}</thead>
        <tbody className="divide-y-2 divide-fg/20">{children}</tbody>
      </table>
    </div>
  );
}
