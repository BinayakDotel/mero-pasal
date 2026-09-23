"use client";

import { SignOutButton } from "@clerk/nextjs";
import { api } from "@mero-pasal/backend/convex/_generated/api";
import { t } from "@mero-pasal/shared/i18n";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect } from "react";
import { LocaleProvider } from "./locale";
import { type MeState, useMe } from "./use-me";

type Me = Extract<MeState, { status: "member" }>["me"];
const MeContext = createContext<Me | null>(null);

/** The signed-in member and shop; only usable inside <MemberGate>. */
export function useMember(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMember must be used inside <MemberGate>");
  return me;
}

/**
 * Wraps Buwa's screens: skeleton while loading, "Not invited" for non-members (F-01), and a
 * plain sign-in-again message if Convex rejects the Clerk session (ui-ux §7).
 * M2 note: capture must not be gated on Clerk once the offline shell lands (architecture §8.4).
 */
export function MemberGate({ children }: { children: ReactNode }) {
  const state = useMe();
  const router = useRouter();
  const setLocale = useMutation(api.members.setLocale);
  const persistLocale = useCallback(
    (locale: "ne" | "en") => void setLocale({ locale }).catch(() => undefined), // best effort
    [setLocale],
  );

  useEffect(() => {
    if (state.status === "notInvited") router.replace("/not-invited");
  }, [state.status, router]);

  if (state.status === "member") {
    return (
      <MeContext.Provider value={state.me}>
        <LocaleProvider initial={state.me.member.locale} onChange={persistLocale}>
          {children}
        </LocaleProvider>
      </MeContext.Provider>
    );
  }
  if (state.status === "signedOut") {
    return (
      <main className="grid min-h-dvh place-content-center gap-4 p-6 text-center">
        <p className="text-lg">{t("ne", "error.UNAUTHENTICATED")}</p>
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className="min-h-12 font-semibold underline underline-offset-4">
            {t("ne", "auth.signOut")}
          </button>
        </SignOutButton>
      </main>
    );
  }
  return <LoadingSkeleton />;
}

/** ui-ux §7: skeleton rows on ruled lines, no spinner. */
function LoadingSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse p-4 motion-reduce:animate-none">
      <div className="mb-3 h-9 w-2/3 rounded bg-rule/70" />
      <div className="mb-3 h-28 rounded-bigbtn bg-rule/60" />
      <div className="mb-6 h-28 rounded-bigbtn bg-rule/60" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-12 border-b border-rule" />
      ))}
    </div>
  );
}
