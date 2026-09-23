import { SignIn } from "@clerk/nextjs";
import { t } from "@mero-pasal/shared/i18n";

// F-01: Google only, invite-only (Clerk dashboard settings). Shown in Nepali first because
// nobody's locale is known before sign-in.
export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-content-center justify-items-center gap-6 p-6 text-center">
      <div>
        <h1 className="font-display text-4xl font-extrabold">{t("ne", "app.name")}</h1>
        <p className="text-ink-soft">{t("ne", "auth.signInSub")}</p>
        <p className="text-[15px] text-ink-soft" lang="en">
          {t("en", "auth.signInSub")}
        </p>
      </div>
      <SignIn routing="path" path="/sign-in" />
    </main>
  );
}
