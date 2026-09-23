"use client";

import { SignOutButton } from "@clerk/nextjs";
import { t } from "@mero-pasal/shared/i18n";

// F-01 / ui-ux §7: a signed-in Google account without a member row. No shop data is shown.
export default function NotInvitedPage() {
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-5 p-6 text-center">
      <h1 className="font-display text-3xl font-extrabold">{t("ne", "app.name")}</h1>
      <p className="max-w-sm text-lg">{t("ne", "auth.notInvited")}</p>
      <p className="max-w-sm text-[15px] text-ink-soft" lang="en">
        {t("en", "auth.notInvited")}
      </p>
      <SignOutButton redirectUrl="/sign-in">
        <button
          type="button"
          className="min-h-14 rounded-[14px] border-2 border-ink bg-card px-5 text-lg font-bold"
        >
          {t("ne", "auth.signOut")} · {t("en", "auth.signOut")}
        </button>
      </SignOutButton>
    </main>
  );
}
