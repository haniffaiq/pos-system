import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "accent" | "white";
const fills: Record<Variant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  accent: "bg-accent",
  white: "bg-card",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

export function Button({ variant = "primary", icon, children, className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={
        `inline-flex items-center gap-2 font-display font-bold text-fg ` +
        `border-2 border-fg rounded-md ${fills[variant]} px-4 py-2 shadow-brutal ` +
        `transition-all duration-150 ease-brutal ` +
        `hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal-btn-hover ` +
        `disabled:opacity-50 disabled:pointer-events-none ${className}`
      }
    >
      {icon}
      {children}
    </button>
  );
}
