"use client";

import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type DraftSummary, useCapture } from "@/features/capture/capture-provider";
import { useLocale } from "@/features/session/locale";

/**
 * F-03 draft restore (M2, Binayak's choice: ask, don't auto-resume): if Chrome was killed in the
 * middle of a bill, Today offers to continue it or remove it.
 */
export function DraftCard() {
  const { state, draftSummary, restore, discard } = useCapture();
  const { t } = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<(DraftSummary & { url: string }) | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (state.step !== "idle") return;
    let url: string | null = null;
    let cancelled = false;
    void draftSummary().then((found) => {
      if (cancelled || !found) return setDraft(null);
      url = URL.createObjectURL(found.thumb);
      setDraft({ ...found, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [state.step, draftSummary]);

  if (!draft || state.step !== "idle") return null;
  const tone = draft.kind === "sale" ? "border-sale" : "border-buy";

  return (
    <section
      aria-label={t("draft.title")}
      className={`mx-4 mt-3.5 flex items-center gap-3 rounded-2xl border-2 bg-card p-3 ${tone}`}
    >
      {/* biome-ignore lint/performance/noImgElement: local blob thumbnail of the unfinished bill */}
      <img
        src={draft.url}
        alt=""
        className="h-16 w-12 flex-none rounded-md border border-rule object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl font-bold">{t("draft.title")}</p>
        <p className="text-[15px] text-ink-soft">{t("draft.sub")}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              if (await restore()) router.push("/capture");
            }}
            className="min-h-12 flex-1 rounded-xl bg-ink px-3 font-bold text-white"
          >
            {t("draft.continue")}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="min-h-12 rounded-xl border-2 border-bahi px-3 font-bold text-bahi"
          >
            {t("draft.discard")}
          </button>
        </div>
      </div>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t("draft.discardConfirm")}>
        <div className="grid gap-2.5">
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="min-h-16 rounded-btn bg-ink font-display text-[22px] font-bold text-white"
          >
            {t("draft.keep")}
          </button>
          <button
            type="button"
            onClick={async () => {
              setConfirm(false);
              await discard();
              setDraft(null);
            }}
            className="min-h-14 rounded-[14px] border-2 border-bahi bg-card text-lg font-bold text-bahi"
          >
            {t("draft.discard")}
          </button>
        </div>
      </Sheet>
    </section>
  );
}
