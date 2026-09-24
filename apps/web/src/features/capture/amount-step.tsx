"use client";

import { useState } from "react";
import { useLocale } from "@/features/session/locale";
import { AmountPad } from "./amount-pad";
import { STEP_NUMBER } from "./capture-machine";
import { useCapture } from "./capture-provider";
import { type SaveResult, useSaveBill } from "./use-save-bill";

/** F-03 capture step 3: amount and date for the bill being made, then Save (NFR-02). */
export function AmountStep({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useCapture();
  const { t } = useLocale();
  const [problem, setProblem] = useState<Exclude<SaveResult, "saved"> | null>(null);
  const save = useSaveBill();
  if (state.step !== "amount" && state.step !== "saving") return null;

  const submit = async (withAmount: boolean) => {
    setProblem(null);
    const result = await save(withAmount);
    if (result !== "saved") setProblem(result);
  };
  const { party } = state;
  const who =
    party.type === "later"
      ? t("party.noName")
      : party.type === "existing" && party.isWalkIn
        ? t("party.walkIn")
        : party.displayName;

  return (
    <AmountPad
      title={who}
      kind={state.kind}
      thumb={state.pages[0]?.url}
      step={STEP_NUMBER.amount}
      onBack={onBack}
      digits={state.digits}
      onKey={(key) => dispatch({ type: "amountKey", key })}
      onBackspace={() => dispatch({ type: "amountBackspace" })}
      onClear={() => dispatch({ type: "amountClear" })}
      dateBs={state.dateBs}
      onDate={(dateBs) => dispatch({ type: "setDate", dateBs })}
      saving={state.step === "saving"}
      problem={
        problem === null
          ? null
          : t(
              problem === "full"
                ? "capture.storageFull"
                : problem === "unreadable"
                  ? "capture.unreadable"
                  : "capture.saveFailed",
            )
      }
      saveLabel={t("bill.save")}
      onSave={(withAmount) => void submit(withAmount)}
      laterLabel={t("amount.later")}
    />
  );
}
