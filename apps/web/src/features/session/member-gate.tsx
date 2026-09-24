"use client";

import { SignOutButton, useAuth } from "@clerk/nextjs";
import { api } from "@mero-pasal/backend/convex/_generated/api";
import { t } from "@mero-pasal/shared/i18n";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getDb } from "@/features/sync/db";
import { decideGate, gateClerkUserId } from "./gate-decision";
import { LocaleProvider } from "./locale";
import { type MeState, useMe } from "./use-me";

type Me = Extract<MeState, { status: "member" }>["me"];
type Snapshot = { me: Me; clerkUserId: string };
/**
 * Who is using the app, as the gate decided it. `confirmed`: the server confirmed this member for
 * the current session (not just the phone's snapshot); only then may the outbox be sent.
 */
export type MemberIdentity = { memberId: string; clerkUserId: string; confirmed: boolean };
const MeContext = createContext<Me | null>(null);
const IdentityContext = createContext<MemberIdentity | null>(null);
const SNAPSHOT_KEY = "member";

/** The signed-in member and shop; only usable inside <MemberGate>. */
export function useMember(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMember must be used inside <MemberGate>");
  return me;
}

/**
 * The member's ids for the outbox owner guard (F-09). Not Clerk's live `userId`: offline, Clerk
 * drops it as soon as its short session token can't refresh, which must never stop a Save.
 */
export function useMemberIdentity(): MemberIdentity | null {
  return useContext(IdentityContext);
}

/**
 * Wraps Buwa's screens (F-01, architecture §8.4). Shows the member the server confirms; offline,
 * when the Clerk token can't refresh (or Clerk can't even load), keeps working as the member last
 * confirmed on this phone, unless Clerk says signed out or a different account is signed in.
 * Nothing reaches the server until it accepts the session again (the sync engine pauses).
 */
export function MemberGate({ children }: { children: ReactNode }) {
  const state = useMe();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);
  const setLocale = useMutation(api.members.setLocale);
  const persistLocale = useCallback(
    (locale: "ne" | "en") => void setLocale({ locale }).catch(() => undefined), // best effort
    [setLocale],
  );

  // Read the last confirmed member once.
  useEffect(() => {
    void getDb()
      .meta.get(SNAPSHOT_KEY)
      .then((row) => setSnapshot((row?.value as Snapshot | undefined) ?? null))
      .catch(() => setSnapshot(null));
  }, []);

  // Keep it up to date while the server confirms the member. Depend on the member data itself
  // (stable until it really changes), not the wrapper object useMe() rebuilds every render.
  const liveMe = state.status === "member" ? state.me : null;
  useEffect(() => {
    if (!liveMe || !userId) return;
    const next: Snapshot = { me: liveMe, clerkUserId: userId };
    setSnapshot((current) =>
      current?.me === liveMe && current.clerkUserId === userId ? current : next,
    );
    void getDb()
      .meta.put({ key: SNAPSHOT_KEY, value: next })
      .catch(() => undefined);
  }, [liveMe, userId]);

  const decision = decideGate({
    server:
      state.status === "member"
        ? "member"
        : state.status === "notInvited"
          ? "notInvited"
          : state.status === "signedOut"
            ? "unauthenticated"
            : "loading",
    clerkLoaded: isLoaded,
    clerkSignedIn: isSignedIn,
    clerkUserId: userId,
    snapshotClerkUserId: snapshot?.clerkUserId ?? null,
  });

  // A real sign-out or removal forgets the member on this phone (the outbox is kept, F-09).
  useEffect(() => {
    if (decision === "notInvited" || (isLoaded && isSignedIn === false)) {
      setSnapshot(null);
      void getDb()
        .meta.delete(SNAPSHOT_KEY)
        .catch(() => undefined);
    }
    if (decision === "notInvited") router.replace("/not-invited");
    // The shells are public (ADR-032): a visitor who isn't signed in goes to sign-in.
    if (isLoaded && isSignedIn === false) router.replace("/sign-in");
  }, [decision, isLoaded, isSignedIn, router]);

  const me =
    decision === "live" && state.status === "member"
      ? state.me
      : decision === "snapshot"
        ? snapshot?.me
        : null;
  const memberId = (me?.member._id as string | undefined) ?? null;
  const clerkUserId = gateClerkUserId({
    decision,
    memberId,
    clerkUserId: userId,
    snapshot: snapshot
      ? { memberId: snapshot.me.member._id as string, clerkUserId: snapshot.clerkUserId }
      : null,
  });
  const confirmed = decision === "live";
  const identity = useMemo(
    () => (memberId && clerkUserId ? { memberId, clerkUserId, confirmed } : null),
    [memberId, clerkUserId, confirmed],
  );

  if (me) {
    return (
      <MeContext.Provider value={me}>
        <IdentityContext.Provider value={identity}>
          <LocaleProvider initial={me.member.locale} onChange={persistLocale}>
            {children}
          </LocaleProvider>
        </IdentityContext.Provider>
      </MeContext.Provider>
    );
  }
  if (decision === "signedOut") {
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
