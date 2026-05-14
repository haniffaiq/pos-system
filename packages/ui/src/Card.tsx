import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> { hover?: boolean }

export function Card({ hover = false, className = "", ...rest }: Props) {
  return (
    <div
      {...rest}
      className={
        `bg-card text-fg border-2 border-fg rounded-lg shadow-brutal p-5 ` +
        (hover
          ? `transition-all duration-150 ease-brutal hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-lg `
          : ``) +
        className
      }
    />
  );
}
