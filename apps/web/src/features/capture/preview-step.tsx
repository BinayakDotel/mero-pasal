"use client";

import { toDevanagariDigits } from "@mero-pasal/shared/dates";
import { MAX_BILL_PAGES } from "@mero-pasal/shared/domain";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import { canAddPage, STEP_NUMBER } from "./capture-machine";
import { useCapture } from "./capture-provider";
import { StepBar } from "./step-bar";
import { useCamera } from "./use-camera";

/**
 * F-03 preview (ui-ux §5.2): the photo fills the width on a dark surface; ठीक छ (primary),
 * फेरि खिच्नुहोस् and अर्को पाना (secondary, side by side). Up to 5 pages.
 */
export function PreviewStep({ onBack }: { onBack: () => void }) {
  const { state, dispatch, toPage } = useCapture();
  const { locale, t } = useLocale();
  const retakeCam = useCamera((file) => dispatch({ type: "retake", page: toPage(file) }));
  const addCam = useCamera((file) => dispatch({ type: "addPage", page: toPage(file) }));
  if (state.step !== "preview") return null;

  const current = state.pages[state.viewing];
  const n = (value: number) =>
    locale === "ne" ? toDevanagariDigits(String(value)) : String(value);
  const tone = state.kind === "sale" ? "bg-sale" : "bg-buy";

  return (
    <main className="flex min-h-dvh flex-col bg-ink">
      <StepBar
        dark
        title={t("capture.page", { n: n(state.viewing + 1) })}
        step={STEP_NUMBER.preview}
        onBack={onBack}
      />

      <div className="grid min-h-0 flex-1 place-items-center p-3.5">
        {current ? (
          // biome-ignore lint/performance/noImgElement: a local object URL; next/image can't optimise it
          <img
            src={current.url}
            alt={t("capture.photoAlt", { n: n(state.viewing + 1) })}
            className="max-h-[62dvh] w-full rounded-md object-contain shadow-2xl"
          />
        ) : null}
      </div>

      {state.pages.length > 1 ? (
        <div className="flex justify-center gap-2 pb-2.5">
          {state.pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              aria-label={t("capture.page", { n: n(index + 1) })}
              aria-pressed={index === state.viewing}
              onClick={() => dispatch({ type: "view", index })}
              className={`h-14 w-12 overflow-hidden rounded-md border-2 ${index === state.viewing ? "border-white" : "border-white/35"}`}
            >
              {/* biome-ignore lint/performance/noImgElement: local object URL thumbnail */}
              <img src={page.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="paper grid gap-2.5 rounded-t-sheet p-4">
        <button
          type="button"
          onClick={() => dispatch({ type: "usePhotos" })}
          className={`flex min-h-16 w-full items-center justify-center gap-2.5 rounded-btn font-display text-2xl font-bold text-white ${tone}`}
        >
          <Icon name="check" />
          {t("photo.use")}
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={retakeCam.open}
            className="min-h-14 rounded-[14px] border-2 border-ink bg-card px-3.5 text-lg font-bold"
          >
            {t("photo.retake")}
          </button>
          <button
            type="button"
            onClick={addCam.open}
            disabled={!canAddPage(state)}
            className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] border-2 border-ink bg-card px-3.5 text-lg font-bold disabled:opacity-45"
          >
            <Icon name="plus" />
            {canAddPage(state)
              ? t("photo.addPage")
              : t("capture.maxPages", { n: n(MAX_BILL_PAGES) })}
          </button>
        </div>
      </div>
      {retakeCam.input}
      {addCam.input}
    </main>
  );
}
