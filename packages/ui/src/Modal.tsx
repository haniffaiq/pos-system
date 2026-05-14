import type { ReactNode } from "react";

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40" onClick={onClose}>
      <div
        className="bg-card text-fg border-2 border-fg rounded-lg shadow-brutal-lg p-6 w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-xl font-display font-black mb-4 text-fg">{title}</h3>
        {children}
      </div>
    </div>
  );
}
