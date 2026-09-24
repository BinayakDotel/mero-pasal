"use client";

import Link from "next/link";
import { useLocale } from "@/features/session/locale";

/** ui-ux §7 error state: one plain sentence and a way back (an account or bill that isn't there). */
export function NotFoundScreen({ backHref }: { backHref: string }) {
  const { t } = useLocale();
  return (
    <main className="grid flex-1 place-content-center gap-4 p-6 text-center">
      <p className="text-lg">{t("error.NOT_FOUND")}</p>
      <Link href={backHref} className="min-h-12 content-center font-semibold underline">
        {t("common.back")}
      </Link>
    </main>
  );
}
