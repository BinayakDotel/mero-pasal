"use client";

import { Chip } from "@mero-pasal/ui/components/chip";
import { useState } from "react";
import { backspace, digitsToPaisa, pressKey } from "@/features/capture/amount-entry";
import { AmountPad } from "@/features/capture/amount-pad";
import type { PartyChoice } from "@/features/capture/capture-machine";
import { PartyPicker } from "@/features/capture/party-picker";
import { useLocale } from "@/features/session/locale";
import { useTodayBs } from "@/features/today/use-today-bs";
import type { BillDetail } from "./use-bill-detail";

export type Correction = {
  kind: "sale" | "purchase";
  party: PartyChoice;
  dateBs: string;
  amountPaisa: number | undefined;
};

/** The account the bill has now, as a picker choice (so "back" from the amount keeps it). */
function currentParty(bill: BillDetail): PartyChoice {
  if (!bill.partyId) return { type: "later" };
  return {
    type: "existing",
    id: bill.partyId,
    displayName: bill.partyName ?? "",
    isWalkIn: bill.isWalkIn,
  };
}

/**
 * F-08 correct (UC-08, mockup: "reopens the same name and amount steps"): the name picker, then
 * the amount step with this bill's amount and date, plus a बेचेको/किनेको switch. Photos stay.
 */
export function CorrectFlow({
  bill,
  photo,
  saving,
  problem,
  onCancel,
  onSave,
}: {
  bill: BillDetail;
  photo: string | null;
  saving: boolean;
  problem: string | null;
  onCancel: () => void;
  onSave: (correction: Correction) => void;
}) {
  const { t } = useLocale();
  const today = useTodayBs();
  const [step, setStep] = useState<"party" | "amount">("party");
  const [kind, setKind] = useState(bill.kind);
  const [party, setParty] = useState<PartyChoice>(() => currentParty(bill));
  const [digits, setDigits] = useState(
    bill.amountPaisa === undefined ? "" : String(Math.round(bill.amountPaisa / 100)),
  );
  const [dateBs, setDateBs] = useState<string | null>(bill.dateBs === today ? null : bill.dateBs);

  if (step === "party") {
    return (
      <PartyPicker
        kind={kind}
        thumb={photo}
        onBack={onCancel}
        onPick={(picked) => {
          setParty(picked);
          setStep("amount");
        }}
      />
    );
  }
  const who =
    party.type === "later"
      ? t("party.noName")
      : party.type === "existing" && party.isWalkIn
        ? t("party.walkIn")
        : party.displayName;
  return (
    <AmountPad
      title={who}
      kind={kind}
      thumb={photo}
      onBack={() => setStep("party")}
      digits={digits}
      onKey={(key) => setDigits((d) => pressKey(d, key))}
      onBackspace={() => setDigits(backspace)}
      onClear={() => setDigits("")}
      dateBs={dateBs}
      onDate={setDateBs}
      saving={saving}
      problem={problem}
      saveLabel={t("bill.correct")}
      onSave={(withAmount) =>
        onSave({
          kind,
          party,
          dateBs: dateBs ?? today,
          amountPaisa: withAmount ? digitsToPaisa(digits) : undefined,
        })
      }
      laterLabel={t("amount.later")}
      extra={
        <span className="ml-2 inline-flex gap-1.5 align-middle">
          {(["sale", "purchase"] as const)
            .filter((k) => k !== kind)
            .map((k) => (
              <Chip key={k} onClick={() => setKind(k)}>
                {t(k === "sale" ? "kind.sale" : "kind.purchase")}
              </Chip>
            ))}
        </span>
      }
    />
  );
}
