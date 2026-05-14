import type { HTMLAttributes } from "react";

type Tone = "primary" | "secondary" | "accent" | "soft";
const tones: Record<Tone, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  soft: "bg-primary/20",
};

interface Props extends HTMLAttributes<HTMLSpanElement> { tone?: Tone }

export function Badge({ tone = "primary", className = "", ...rest }: Props) {
  return (
    <span
      {...rest}
      className={`inline-block text-xs font-display font-bold text-fg border-2 border-fg rounded-full px-2.5 py-0.5 shadow-brutal-sm ${tones[tone]} ${className}`}
    />
  );
}
