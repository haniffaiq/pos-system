import type { HTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "secondary" | "accent";
const tones: Record<Tone, string> = { primary: "bg-primary", secondary: "bg-secondary", accent: "bg-accent" };

interface Props extends HTMLAttributes<HTMLDivElement> { tone?: Tone; children: ReactNode }

export function IconTile({ tone = "primary", children, className = "", ...rest }: Props) {
  return (
    <div
      {...rest}
      className={`flex h-12 w-12 items-center justify-center text-fg border-2 border-fg rounded-md shadow-brutal-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
