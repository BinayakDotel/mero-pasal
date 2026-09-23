/**
 * The rubber stamp "राखियो ✓" that lands on the saved bill (ui-ux §2.5, §3.4). The only
 * non-essential animation; with prefers-reduced-motion it simply appears.
 */
export function Stamp({ label }: { label: string }) {
  return (
    <span
      role="status"
      className="stamp inline-flex items-center gap-1.5 rounded-[10px] border-4 border-double border-sale bg-white/70 px-4 py-1 font-display text-[32px] font-extrabold whitespace-nowrap text-sale"
    >
      {label} <span aria-hidden="true">✓</span>
    </span>
  );
}
