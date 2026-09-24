"use client";

import { toDevanagariDigits } from "@mero-pasal/shared/dates";
import { useRef, useState } from "react";
import { useLocale } from "@/features/session/locale";
import { clampView, doubleTap, RESET, type View } from "./zoom";

const DOUBLE_TAP_MS = 300;

/**
 * F-08 / ui-ux §5.7: the bill photo full width on dark, double-tap or pinch to zoom, drag while
 * zoomed, page dots for multi-page bills. `urls` are full-size (or the thumbnail as a fallback).
 */
export function PhotoViewer({ urls }: { urls: readonly (string | null)[] }) {
  const { locale, t } = useLocale();
  const n = (value: number) =>
    locale === "ne" ? toDevanagariDigits(String(value)) : String(value);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<View>(RESET);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; view: View; x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  const size = () => {
    const rect = box.current?.getBoundingClientRect();
    return {
      w: rect?.width ?? 1,
      h: rect?.height ?? 1,
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
    };
  };
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { dist: distance(), view, x: e.clientX, y: e.clientY };
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        const { w, h, left, top } = size();
        setView(doubleTap(view, e.clientX - left - w / 2, e.clientY - top - h / 2, w, h));
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = gesture.current;
    const { w, h } = size();
    if (pointers.current.size >= 2 && start.dist > 0) {
      setView(
        clampView({ ...start.view, scale: (start.view.scale * distance()) / start.dist }, w, h),
      );
    } else if (start.view.scale > 1) {
      setView(
        clampView(
          {
            ...start.view,
            x: start.view.x + e.clientX - start.x,
            y: start.view.y + e.clientY - start.y,
          },
          w,
          h,
        ),
      );
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current = pointers.current.size
      ? { dist: distance(), view, x: e.clientX, y: e.clientY }
      : null;
  };

  const url = urls[page] ?? null;
  return (
    <div className="bg-ink">
      <div
        ref={box}
        className="relative aspect-[3/4] w-full touch-none overflow-hidden select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {url ? (
          // biome-ignore lint/performance/noImgElement: Convex storage URL or local blob, full size (F-08)
          <img
            src={url}
            alt={t("capture.photoAlt", { n: n(page + 1) })}
            draggable={false}
            className="size-full object-contain transition-transform duration-75"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          />
        ) : null}
      </div>
      {urls.length > 1 ? (
        <div className="flex justify-center gap-1 py-1">
          {urls.map((_, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: pages are positional
              key={i}
              type="button"
              aria-label={t("capture.page", { n: n(i + 1) })}
              aria-current={i === page}
              onClick={() => {
                setPage(i);
                setView(RESET);
              }}
              className="grid size-12 place-items-center"
            >
              <span
                className={`size-2.5 rounded-full ${i === page ? "bg-white" : "bg-white/40"}`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
