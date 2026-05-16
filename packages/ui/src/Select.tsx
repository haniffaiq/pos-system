import { forwardRef, useId, type SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string }

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { id, label, error, className = "", children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const { "aria-describedby": ariaDescribedBy, ...selectProps } = rest;
  const describedBy = [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="block text-fg">
      {label && (
        <label htmlFor={selectId} className="mb-1 block font-display font-bold text-sm text-fg">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        {...selectProps}
        aria-invalid={error ? true : selectProps["aria-invalid"]}
        aria-describedby={describedBy}
        className={`w-full border-2 border-fg rounded-md bg-card px-3 py-2 text-fg shadow-brutal-sm focus:outline-none ${className}`}
      >
        {children}
      </select>
      {error && <span id={errorId} className="mt-1 block text-xs text-accent font-bold">{error}</span>}
    </div>
  );
});
