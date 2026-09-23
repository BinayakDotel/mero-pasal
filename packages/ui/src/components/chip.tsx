import type { ReactNode } from "react";

/** Filter and payment chips: full pill, ≥ 48 px tall (ui-ux §3.3). */
export function Chip({
  selected = false,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-12 flex-none items-center gap-1.5 rounded-full border-2 px-4 text-[17px] font-bold ${
        selected ? "border-ink bg-ink text-white" : "border-rule bg-card text-ink"
      }`}
    >
      {children}
    </button>
  );
}
