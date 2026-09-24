"use client";

import { toDevanagariDigits } from "@mero-pasal/shared/dates";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/features/session/locale";
import { STEP_TOTAL } from "./capture-machine";

/** Capture top bar (ui-ux §4): back, title, step counter "२/३", optional right slot. */
export function StepBar({
  title,
  step,
  onBack,
  dark = false,
  right,
}: {
  title: string;
  /** Omitted outside capture (e.g. correcting a bill): no "२/३" counter. */
  step?: number;
  onBack: () => void;
  dark?: boolean;
  right?: ReactNode;
}) {
  const { locale, t } = useLocale();
  const counter = step === undefined ? null : `${step}/${STEP_TOTAL}`;
  return (
    <div
      className={`flex min-h-[60px] items-center gap-1.5 px-2.5 py-1.5 ${dark ? "text-white" : ""}`}
    >
      <button
        type="button"
        aria-label={t("common.back")}
        onClick={onBack}
        className="grid size-12 flex-none place-items-center rounded-full active:bg-rule/40"
      >
        <Icon name="back" />
      </button>
      <h1 className="min-w-0 flex-1 truncate font-display text-[25px] leading-tight font-bold">
        {title}
      </h1>
      {counter ? (
        <span
          className={`px-1.5 text-[15px] font-semibold ${dark ? "text-white/80" : "text-ink-soft"}`}
        >
          {locale === "ne" ? toDevanagariDigits(counter) : counter}
        </span>
      ) : null}
      {right}
    </div>
  );
}
