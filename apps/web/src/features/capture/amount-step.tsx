"use client";

import { formatBs } from "@mero-pasal/shared/dates";
import { LARGE_AMOUNT_CONFIRM_PAISA } from "@mero-pasal/shared/domain";
import { formatNpr } from "@mero-pasal/shared/money";
import { NumPad } from "@mero-pasal/ui/components/num-pad";
import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import { useTodayBs } from "@/features/today/use-today-bs";
import { digitsToPaisa } from "./amount-entry";
import { STEP_NUMBER } from "./capture-machine";
import { useCapture } from "./capture-provider";
import { DateSheet } from "./date-sheet";
import { StepBar } from "./step-bar";
import { type SaveResult, useSaveBill } from "./use-save-bill";

/**
 * F-03 / F-05 amount step (ui-ux §5.4): "जम्मा कति?" over a double rule, the number pad, the
 * date chip, and the bill photo one tap away so Buwa can read the total off it (ui-ux §2.4).
 * Save sends the bill; amounts of रु 5,00,000 or more ask once "रु X — ठीक हो?" (F-03).
 */
export function AmountStep({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useCapture();
  const { locale, t } = useLocale();
  const today = useTodayBs();
  const [dateOpen, setDateOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [problem, setProblem] = useState<Exclude<SaveResult, "saved"> | null>(null);
  const save = useSaveBill();
  if (state.step !== "amount" && state.step !== "saving") return null;
  const saving = state.step === "saving";

  const submit = async (withAmount: boolean) => {
    setProblem(null);
    const result = await save(withAmount);
    if (result !== "saved") setProblem(result);
  };

  const { party, kind } = state;
  const who =
    party.type === "later"
      ? t("party.noName")
      : party.type === "existing" && party.isWalkIn
        ? t("party.walkIn")
        : party.displayName;
  const paisa = digitsToPaisa(state.digits);
  const dateBs = state.dateBs ?? today;
  const dateWord = state.dateBs === null ? t("date.today") : formatBs(dateBs, locale, "dayMonth");
  const thumb = state.pages[0]?.url;
  const onSave = () => {
    if (paisa !== undefined && paisa >= LARGE_AMOUNT_CONFIRM_PAISA) setConfirmLarge(true);
    else void submit(true);
  };
  const tone = kind === "sale" ? "bg-sale" : "bg-buy";

  return (
    <main className="paper flex min-h-dvh flex-col">
      <StepBar
        title={who}
        step={STEP_NUMBER.amount}
        onBack={onBack}
        right={
          thumb ? (
            <button
              type="button"
              aria-label={t("photo.enlarge")}
              onClick={() => setPhotoOpen(true)}
              className="h-14 w-11 flex-none overflow-hidden rounded-md border border-rule bg-white"
            >
              {/* biome-ignore lint/performance/noImgElement: local object URL thumbnail of the bill */}
              <img src={thumb} alt="" className="size-full object-cover" />
            </button>
          ) : null
        }
      />
      <div className="px-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[15px] font-bold ${kind === "sale" ? "bg-sale-tint text-sale" : "bg-buy-tint text-buy"}`}
        >
          <Icon name={kind === "sale" ? "bagOut" : "boxIn"} className="size-[18px]" />
          {t(kind === "sale" ? "kind.sale" : "kind.purchase")}
        </span>
      </div>

      <div className="px-4 pt-2">
        <p className="text-[17px] font-semibold text-ink-soft">{t("amount.title")}</p>
        <output
          aria-live="polite"
          className={`double-rule block min-h-[66px] px-0.5 py-1 text-right font-display text-5xl leading-tight font-extrabold tabular-nums ${paisa === undefined ? "text-ink-soft/60" : ""}`}
        >
          {formatNpr(paisa ?? 0, { locale })}
        </output>
      </div>

      <div className="px-4 pt-2.5">
        <button
          type="button"
          onClick={() => setDateOpen(true)}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 border-rule bg-card px-4 text-[17px] font-bold"
        >
          {t("date.label")}: {dateWord}
          <Icon name="chevron" className="size-[18px]" />
        </button>
      </div>

      <div className="px-4 pt-2.5">
        <NumPad
          onKey={(key) => dispatch({ type: "amountKey", key })}
          onBackspace={() => dispatch({ type: "amountBackspace" })}
          onClear={() => dispatch({ type: "amountClear" })}
          backspaceLabel={t("amount.delete")}
        />
      </div>

      <div className="paper mt-auto flex flex-col gap-2 border-t border-rule px-4 pt-3 pb-4">
        {problem ? (
          <p
            role="alert"
            className="rounded-xl bg-udharo-tint px-3 py-2 text-center font-semibold text-udharo-ink"
          >
            {t(
              problem === "offline"
                ? "capture.saveOffline"
                : problem === "unreadable"
                  ? "capture.unreadable"
                  : "capture.saveFailed",
            )}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(false)}
          className="min-h-12 text-[17px] font-semibold text-ink-soft underline underline-offset-4 disabled:opacity-50"
        >
          {t("amount.later")}
        </button>
        <button
          type="button"
          disabled={saving || paisa === undefined}
          onClick={onSave}
          className={`min-h-16 w-full rounded-btn font-display text-2xl font-bold text-white disabled:opacity-50 ${tone}`}
        >
          {saving ? t("capture.saving") : t("bill.save")}
        </button>
      </div>

      <Sheet
        open={confirmLarge}
        onClose={() => setConfirmLarge(false)}
        title={t("amount.confirmLarge", { amount: formatNpr(paisa ?? 0, { locale }) })}
      >
        <div className="grid gap-2.5">
          <button
            type="button"
            onClick={() => {
              setConfirmLarge(false);
              void submit(true);
            }}
            className={`min-h-16 rounded-btn font-display text-[22px] font-bold text-white ${tone}`}
          >
            {t("amount.confirmYes")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmLarge(false)}
            className="min-h-14 rounded-[14px] border-2 border-ink bg-card text-lg font-bold"
          >
            {t("amount.confirmNo")}
          </button>
        </div>
      </Sheet>

      <DateSheet
        open={dateOpen}
        today={today}
        value={state.dateBs}
        onPick={(picked) => {
          dispatch({ type: "setDate", dateBs: picked });
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />

      {photoOpen && thumb ? (
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => setPhotoOpen(false)}
          className="fixed inset-0 z-30 grid place-items-center bg-ink p-3"
        >
          {/* biome-ignore lint/performance/noImgElement: full-size local photo */}
          <img
            src={thumb}
            alt={t("capture.photoAlt", { n: "1" })}
            className="max-h-full max-w-full object-contain"
          />
        </button>
      ) : null}
    </main>
  );
}
