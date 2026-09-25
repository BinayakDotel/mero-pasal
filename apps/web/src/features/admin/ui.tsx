"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

// Admin console building blocks (ui-ux §6): the phone app's tokens, denser. English only
// (ADR-034).

export function Panel({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-card">
      <h2 className="flex items-center justify-between gap-2.5 border-b-2 border-ink px-4 py-3 font-display text-[19px] font-bold">
        {title}
        {aside ? (
          <span className="font-sans text-[13px] font-semibold text-ink-soft">{aside}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

const BUTTON = {
  default: "border-ink bg-card",
  primary: "border-ink bg-ink text-white",
  sale: "border-sale bg-sale text-white",
  danger: "border-bahi bg-card text-bahi",
  ghost: "border-rule bg-card",
} as const;

export function Button({
  tone = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BUTTON }) {
  return (
    <button
      type="button"
      {...props}
      className={`h-[38px] rounded-lg border px-3.5 font-bold disabled:opacity-45 ${BUTTON[tone]} ${className}`}
    />
  );
}

export const inputClass =
  "h-[38px] rounded-lg border border-rule bg-card px-2.5 disabled:opacity-60";

/** A dense table (40 px rows, tabular numbers). */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-left tabular-nums">
      <thead>
        <tr className="border-b border-rule text-[13px] text-ink-soft">
          {head.map((h, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
            <th key={i} className="px-3 py-2 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export const rowClass = "h-10 border-b border-rule/70";
export const cellClass = "px-3 py-1.5 align-middle";

export function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
        <tr key={r} className={rowClass} aria-busy="true">
          <td colSpan={columns} className={cellClass}>
            <span className="block h-4 w-2/3 animate-pulse rounded bg-rule/60 motion-reduce:animate-none" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function EmptyRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="px-3 py-6 text-center text-ink-soft">
        {children}
      </td>
    </tr>
  );
}

// ui-ux §7 admin errors: code and message in a toast; details in the console.
const ToastContext = createContext<(error: unknown) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((error: unknown) => {
    console.error(error);
    const data = (error as { data?: { code?: string; message?: string } }).data;
    setMessage(
      data?.code
        ? `${data.code}${data.message ? `: ${data.message}` : ""}`
        : error instanceof Error
          ? error.message
          : String(error),
    );
    setTimeout(() => setMessage(null), 6000);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div
          role="alert"
          className="fixed right-6 bottom-6 z-50 max-w-md rounded-xl bg-bahi px-4 py-3 font-semibold text-white shadow-sheet"
        >
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/** Show a failed admin action to Binayak (code + message). */
export function useShowError(): (error: unknown) => void {
  return useContext(ToastContext);
}
