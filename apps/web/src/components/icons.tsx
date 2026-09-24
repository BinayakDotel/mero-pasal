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
  back: <path d="M15 5l-7 7 7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" />
    </>
  ),
  cloudOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M8 8.5A5 5 0 0 0 7 18h10.5M13 7a5 5 0 0 1 4.9 4A3.5 3.5 0 0 1 20 17" />
    </>
  ),
  chevron: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
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
