"use client";

import { Sheet } from "@mero-pasal/ui/components/sheet";
import { useLocale } from "@/features/session/locale";

/** F-03: "बिल नराखी फर्कने?" once a photo exists. The only confirm in the flow (ui-ux §2.6). */
export function LeaveSheet({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const { t } = useLocale();
  return (
    <Sheet open={open} onClose={onStay} title={t("capture.leave")}>
      <p className="mb-4 text-ink-soft">{t("capture.leaveSub")}</p>
      <div className="grid gap-2.5">
        <button
          type="button"
          onClick={onStay}
          className="min-h-16 rounded-btn bg-ink font-display text-[22px] font-bold text-white"
        >
          {t("capture.leaveNo")}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="min-h-14 rounded-[14px] border-2 border-bahi bg-card text-lg font-bold text-bahi"
        >
          {t("capture.leaveYes")}
        </button>
      </div>
    </Sheet>
  );
}
