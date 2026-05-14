import type { HTMLAttributes } from "react";

export function Chip({ className = "", ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={`inline-block text-[10px] font-display font-bold text-fg border-2 border-fg rounded bg-card px-1.5 py-0.5 shadow-brutal-sm ${className}`}
    />
  );
}
