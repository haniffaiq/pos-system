import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string }

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { id, label, error, className = "", ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const { "aria-describedby": ariaDescribedBy, ...inputProps } = rest;
  const describedBy = [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="block text-fg">
      {label && (
        <label htmlFor={inputId} className="mb-1 block font-display font-bold text-sm text-fg">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        {...inputProps}
        aria-invalid={error ? true : inputProps["aria-invalid"]}
        aria-describedby={describedBy}
        className={`w-full border-2 border-fg rounded-md bg-card px-3 py-2 text-fg shadow-brutal-sm focus:outline-none focus:-translate-y-[1px] ${className}`}
      />
      {error && <span id={errorId} className="mt-1 block text-xs text-accent font-bold">{error}</span>}
    </div>
  );
});
