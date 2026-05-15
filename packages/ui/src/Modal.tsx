import type { ReactNode } from "react";

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-lg border-2 border-fg bg-card p-4 text-fg shadow-brutal-lg sm:max-w-lg sm:rounded-lg sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-4 font-display text-xl font-black text-fg">{title}</h3>
        {children}
      </div>
    </div>
  );
}
