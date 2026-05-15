import type { ReactNode } from "react";
import { LogoChip } from "./LogoChip";

export function Navbar({ initials, title, left, right }: { initials: string; title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <nav className="flex items-center justify-between gap-2 border-b-2 border-fg bg-card px-3 py-3 text-fg shadow-brutal-sm sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        {left}
        <LogoChip initials={initials} />
        <span className="truncate font-display text-base font-black text-fg sm:text-lg">{title}</span>
      </div>
      <div className="shrink-0">{right}</div>
    </nav>
  );
}
