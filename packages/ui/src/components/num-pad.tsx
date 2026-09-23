"use client";

import { useRef } from "react";

const LONG_PRESS_MS = 500;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"] as const;
export type NumPadKey = (typeof DIGITS)[number];

/**
 * F-03 amount pad (ui-ux §5.4): 3×4 grid of 64 px+ keys, `00` for whole rupees, ⌫ deletes and a
 * long-press on ⌫ clears everything. It only reports keys; the amount state lives in the flow.
 */
export function NumPad({
  onKey,
  onBackspace,
  onClear,
  backspaceLabel,
}: {
  onKey: (key: NumPadKey) => void;
  onBackspace: () => void;
  onClear: () => void;
  /** Accessible name for ⌫ in the active language. */
  backspaceLabel: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);

  const startPress = () => {
    cleared.current = false;
    timer.current = setTimeout(() => {
      cleared.current = true;
      onClear();
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const key =
    "h-16 rounded-[14px] border border-rule bg-card font-display text-[29px] font-bold tabular-nums active:bg-rule";
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {DIGITS.map((digit) => (
        <button key={digit} type="button" className={key} onClick={() => onKey(digit)}>
          {digit}
        </button>
      ))}
      <button
        type="button"
        aria-label={backspaceLabel}
        className={key}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onClick={() => {
          if (!cleared.current) onBackspace();
        }}
      >
        ⌫
      </button>
    </div>
  );
}
