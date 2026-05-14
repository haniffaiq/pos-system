import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> { initials: string }

export function LogoChip({ initials, className = "", ...rest }: Props) {
  return (
    <div
      {...rest}
      className={`flex h-8 w-8 items-center justify-center bg-primary border-2 border-fg rounded font-display font-black text-sm text-fg shadow-brutal-sm ${className}`}
    >
      {initials}
    </div>
  );
}
