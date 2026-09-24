// M2 offline shell (plan PR 8, architecture §8.4): which screen the app shell shows. Offline, the
// Clerk token can't refresh and Convex reports "not authenticated" — that must NOT lock Buwa out.

export type GateInput = {
  /** What Convex + members.me say right now. */
  server: "loading" | "member" | "notInvited" | "unauthenticated";
  /** Clerk: undefined until its script has loaded (never, on an offline cold start). */
  clerkLoaded: boolean;
  clerkSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
  /** The member last confirmed by the server on this phone, if any. */
  snapshotClerkUserId: string | null;
};

export type GateDecision = "live" | "snapshot" | "loading" | "notInvited" | "signedOut";

/**
 * - Confirmed by the server now → the live member.
 * - The server says not invited / deactivated → Not invited (and the snapshot is dropped).
 * - Clerk has loaded and positively says signed out → the sign-out screen.
 * - Otherwise, with a snapshot of the SAME Clerk user (or Clerk not loaded yet) → keep working as
 *   that member. Nothing reaches the server until it accepts the session again (sync pauses).
 */
export function decideGate(input: GateInput): GateDecision {
  if (input.server === "member") return "live";
  if (input.server === "notInvited") return "notInvited";
  if (input.clerkLoaded && input.clerkSignedIn === false) return "signedOut";
  const sameUser =
    !input.clerkLoaded || !input.clerkUserId || input.clerkUserId === input.snapshotClerkUserId;
  if (input.snapshotClerkUserId && sameUser) return "snapshot";
  if (input.server === "loading") return "loading";
  return "signedOut";
}

export type IdentityInput = {
  decision: GateDecision;
  /** The member being shown (live or snapshot). */
  memberId: string | null;
  /** Clerk's live userId: gone offline as soon as its short session token can't refresh. */
  clerkUserId: string | null | undefined;
  snapshot: { memberId: string; clerkUserId: string } | null;
};

/**
 * The Clerk user the outbox is saved under (F-09 owner guard). Offline, Clerk drops its userId,
 * which must never stop a Save: fall back to the Clerk user saved with this same member.
 */
export function gateClerkUserId(input: IdentityInput): string | null {
  const { decision, memberId, clerkUserId, snapshot } = input;
  if (decision === "snapshot") return snapshot?.clerkUserId ?? null;
  if (decision !== "live") return null;
  if (clerkUserId) return clerkUserId;
  return snapshot && snapshot.memberId === memberId ? snapshot.clerkUserId : null;
}
