// Line icons from the mockup (docs/mockups/father-app.html, ICONS). Decorative: the label
// always sits next to them (ui-ux §2.9), so they are aria-hidden.

const PATHS = {
  bagOut: (
    <>
      <path d="M6 8h12l-1.2 12H7.2z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      <path d="M12 17.5v-6" />
      <path d="M9.5 14 12 11.5 14.5 14" />
    </>
  ),
  boxIn: (
    <>
      <path d="M4 8.5 12 5l8 3.5v8L12 20l-8-3.5z" />
      <path d="M4 8.5 12 12l8-3.5" />
      <path d="M12 12v8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  book: (
    <>
      <path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z" />
      <path d="M5 20a2 2 0 0 0 2 2h12v-4" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`flex-none fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
