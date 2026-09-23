"use client";

import { Stamp } from "@mero-pasal/ui/components/stamp";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLocale } from "@/features/session/locale";
import { useCapture } from "./capture-provider";

const SHOW_MS = 1300;

/**
 * F-03 / ui-ux §2.5: confirm with the thing itself: Buwa's own bill, stamped "राखियो ✓"
 * (the one animated moment; still with reduced motion). Then back to Today.
 */
export function SavedStep({ onDone }: { onDone: () => void }) {
  const { state } = useCapture();
  const { t } = useLocale();
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      onDone();
      router.replace("/");
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [onDone, router]);

  if (state.step !== "saved") return null;
  const thumb = state.pages[0]?.url;
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-4 bg-paper/95 p-6">
      <div className="relative w-48 shadow-xl">
        {/* biome-ignore lint/performance/noImgElement: the bill just saved (local object URL) */}
        {thumb ? <img src={thumb} alt="" className="block w-full rounded-sm" /> : null}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Stamp label={t("bill.saved")} />
        </span>
      </div>
    </main>
  );
}
