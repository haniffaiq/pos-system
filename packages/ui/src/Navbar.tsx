import type { ReactNode } from "react";
import { LogoChip } from "./LogoChip";

export function Navbar({ initials, title, right }: { initials: string; title: string; right?: ReactNode }) {
  return (
    <nav className="flex items-center justify-between border-b-2 border-fg bg-card px-4 py-3 text-fg shadow-brutal-sm">
      <div className="flex items-center gap-2">
        <LogoChip initials={initials} />
        <span className="font-display font-black text-lg text-fg">{title}</span>
      </div>
      {right}
    </nav>
  );
}
