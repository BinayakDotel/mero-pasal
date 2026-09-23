import type { ReactNode } from "react";

const TONE = {
  sale: "bg-sale border-sale-dk",
  purchase: "bg-buy border-buy-dk",
} as const;

/**
 * F-02: the two giant Today buttons (ui-ux §5.1). Colour, icon and label together, never colour
 * alone (ui-ux §2.9). About 112–120 px tall, full width.
 */
export function BigButton({
  kind,
  label,
  sub,
  icon,
  onClick,
  disabled = false,
}: {
  kind: keyof typeof TONE;
  label: string;
  sub: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`grid min-h-28 w-full grid-cols-[64px_1fr] items-center gap-3.5 rounded-bigbtn border-b-[5px] px-4.5 py-3.5 text-left text-white active:translate-y-[3px] active:border-b-2 disabled:opacity-60 disabled:active:translate-y-0 ${TONE[kind]}`}
    >
      <span className="grid size-16 place-items-center rounded-full bg-white/15" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block font-display text-[30px] leading-[1.05] font-extrabold">
          {label}
        </span>
        <span className="mt-0.5 block text-base opacity-90">{sub}</span>
      </span>
    </button>
  );
}
