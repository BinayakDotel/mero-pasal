"use client";

import { type ReactNode, useEffect, useId } from "react";

/**
 * Bottom sheet (ui-ux §4): slides up, closes on Escape or a tap outside. Used for the new-name,
 * date, remove-confirm and sync-details sheets.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 size-full cursor-default bg-ink/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 max-h-[88%] overflow-auto rounded-t-sheet bg-card px-4 pt-2.5 pb-5 shadow-sheet"
      >
        <div className="mx-auto mb-2.5 h-[5px] w-11 rounded-full bg-rule" aria-hidden="true" />
        <h2 id={titleId} className="my-1 mb-2.5 font-display text-2xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
