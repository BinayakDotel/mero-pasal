"use client";

import { formatBs, toDevanagariDigits } from "@mero-pasal/shared/dates";
import { canEditBill, UNDO_WINDOW_MS } from "@mero-pasal/shared/domain";
import { AmountText } from "@mero-pasal/ui/components/amount-text";
import { Sheet } from "@mero-pasal/ui/components/sheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { NotFoundScreen } from "@/features/nav/not-found-screen";
import { useLocale } from "@/features/session/locale";
import { useMember } from "@/features/session/member-gate";
import { CorrectFlow } from "./correct-flow";
import { PhotoViewer } from "./photo-viewer";
import { useBillDetail } from "./use-bill-detail";
import { type CorrectResult, useCorrectBill } from "./use-correct-bill";
import { useRemoveBill } from "./use-remove-bill";

const nptTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  hour: "2-digit",
  minute: "2-digit",
});

/** F-08 / ui-ux §5.7: the photo, then the bill's fields as ruled ledger lines. */
export function BillScreen({ clientId }: { clientId: string }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const bill = useBillDetail(clientId);
  const { member } = useMember();
  const digits = (text: string) => (locale === "ne" ? toDevanagariDigits(text) : text);
  const [correcting, setCorrecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Exclude<CorrectResult, "saved"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const correct = useCorrectBill(bill);
  const { remove, undo } = useRemoveBill(bill);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removal, setRemoval] = useState<string | null>(null);
  // F-08: हटाइयो + फर्काउनुहोस् for 6 s, then back to where he came from.
  useEffect(() => {
    if (!removal) return;
    const timer = setTimeout(() => router.back(), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [removal, router]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (bill === null) return <NotFoundScreen backHref="/bills" />;
  // F-08 matrix, same rule as the server (a bill still on the phone is always this member's).
  const editable =
    bill?.status === "active" &&
    canEditBill(
      { memberId: member._id, role: member.role },
      { createdBy: bill.capturedBy ?? member._id, capturedAt: bill.capturedAt },
      Date.now(),
    );
  if (bill && correcting) {
    return (
      <CorrectFlow
        bill={bill}
        photo={bill.photos[0] ?? null}
        saving={saving}
        problem={
          problem === null
            ? null
            : t(problem === "full" ? "capture.storageFull" : "capture.saveFailed")
        }
        onCancel={() => setCorrecting(false)}
        onSave={async (c) => {
          setSaving(true);
          setProblem(null);
          const result = await correct(c);
          setSaving(false);
          if (result !== "saved") return setProblem(result);
          setCorrecting(false);
          setNotice(t("bill.corrected"));
        }}
      />
    );
  }
  const name = bill?.isWalkIn ? t("party.walkIn") : (bill?.partyName ?? t("party.noName"));

  return (
    <main className="flex-1 pb-6">
      <header className="flex items-center gap-2 px-2 pt-2 pb-1">
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => router.back()}
          className="grid size-12 flex-none place-items-center rounded-full active:bg-rule/40"
        >
          <Icon name="back" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[25px] leading-tight font-bold">
          {bill ? name : ""}
        </h1>
      </header>
      {bill === undefined ? (
        <div aria-busy="true" className="aspect-[3/4] w-full animate-pulse bg-ink/80" />
      ) : (
        <>
          {bill.status === "deleted" ? (
            <p role="status" className="bg-bahi px-4 py-2 font-bold text-white">
              {t("bill.removed")}
            </p>
          ) : null}
          <PhotoViewer urls={bill.photos} />
          <dl className="ledger mx-4 mt-3 pr-3.5">
            <Field label={t("field.type")}>
              <span className={bill.kind === "sale" ? "text-sale" : "text-buy"}>
                {t(bill.kind === "sale" ? "kind.sale" : "kind.purchase")}
              </span>
            </Field>
            <Field label={t("field.name")}>
              {bill.partyId && !bill.pending ? (
                <Link href={`/accounts/${bill.partyId}`} className="underline">
                  {name}
                </Link>
              ) : (
                name
              )}
            </Field>
            <Field label={t("field.amount")}>
              {bill.amountPaisa === undefined ? (
                <span className="rounded-full bg-udharo-tint px-2.5 py-0.5 font-bold text-udharo-ink">
                  {t("bill.noAmount")}
                </span>
              ) : (
                <AmountText paisa={bill.amountPaisa} locale={locale} className="text-[21px]" />
              )}
            </Field>
            <Field label={t("date.label")}>{formatBs(bill.dateBs, locale, "long")}</Field>
            {bill.billNumber ? (
              <Field label={t("field.billNumber")}>{bill.billNumber}</Field>
            ) : null}
            <Field label={t("field.pages")}>{digits(String(bill.photos.length))}</Field>
            <Field label={t("field.capturedBy")}>{bill.capturedByName}</Field>
            <Field label={t("field.time")}>
              <span className="inline-flex items-center gap-1.5">
                {bill.pending ? (
                  <>
                    <Icon name="clock" className="size-4" />
                    <span className="sr-only">{t("sync.statusPending")}</span>
                  </>
                ) : null}
                {digits(nptTime.format(bill.capturedAt))}
              </span>
            </Field>
          </dl>
          {notice ? (
            <p
              role="status"
              className="mx-4 mt-3 rounded-xl bg-sale-tint px-3 py-2 font-bold text-sale"
            >
              {notice}
            </p>
          ) : null}
          {removal ? (
            <div
              role="status"
              className="fixed inset-x-4 bottom-6 z-20 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-2 text-white shadow-sheet"
            >
              <span className="font-bold">{t("bill.removed")}</span>
              <button
                type="button"
                onClick={async () => {
                  if (await undo(removal)) setRemoval(null);
                }}
                className="min-h-12 px-2 font-bold underline underline-offset-4"
              >
                {t("common.undo")}
              </button>
            </div>
          ) : null}
          {bill.status === "active" ? (
            <div className="mx-4 mt-4 grid gap-2.5">
              {editable ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCorrecting(true)}
                    className="min-h-14 rounded-[14px] border-2 border-ink bg-card text-lg font-bold"
                  >
                    {t("bill.correct")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="min-h-12 font-semibold text-bahi underline underline-offset-4"
                  >
                    {t("bill.remove")}
                  </button>
                </>
              ) : (
                <p className="text-center text-ink-soft">{t("bill.editWindow")}</p>
              )}
            </div>
          ) : null}
          <Sheet
            open={confirmRemove}
            onClose={() => setConfirmRemove(false)}
            title={t("bill.removeConfirm")}
          >
            <p className="mb-4 text-ink-soft">{t("bill.removeSub")}</p>
            <div className="grid gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  setConfirmRemove(false);
                  setRemoval(await remove());
                }}
                className="min-h-16 rounded-btn bg-bahi font-display text-[22px] font-bold text-white"
              >
                {t("bill.remove")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="min-h-14 rounded-[14px] border-2 border-ink bg-card text-lg font-bold"
              >
                {t("draft.keep")}
              </button>
            </div>
          </Sheet>
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between gap-2.5">
      <dt className="font-semibold text-ink-soft">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[19px] font-semibold">{children}</dd>
    </div>
  );
}
