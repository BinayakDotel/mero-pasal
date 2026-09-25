import { describe, expect, it } from "vitest";
import {
  decideGate,
  type GateInput,
  gateClerkUserId,
  gateServer,
  nextClaim,
} from "./gate-decision";

const base: GateInput = {
  server: "loading",
  clerkLoaded: true,
  clerkSignedIn: true,
  clerkUserId: "user_buwa",
  snapshotClerkUserId: "user_buwa",
};

describe("decideGate (architecture §8.4 offline shell)", () => {
  it("uses the live member whenever the server confirms it", () => {
    expect(decideGate({ ...base, server: "member" })).toBe("live");
    expect(decideGate({ ...base, server: "member", snapshotClerkUserId: null })).toBe("live");
  });

  it("offline, the token can't refresh: keep working as the same member (the reported bug)", () => {
    expect(decideGate({ ...base, server: "unauthenticated" })).toBe("snapshot");
  });

  it("offline cold start (Clerk never loads): work from the snapshot", () => {
    expect(
      decideGate({
        ...base,
        server: "loading",
        clerkLoaded: false,
        clerkSignedIn: undefined,
        clerkUserId: undefined,
      }),
    ).toBe("snapshot");
  });

  it("a real sign-out wins over the snapshot", () => {
    expect(decideGate({ ...base, server: "unauthenticated", clerkSignedIn: false })).toBe(
      "signedOut",
    );
  });

  it("a different Google account never sees the previous member's shop", () => {
    expect(decideGate({ ...base, server: "unauthenticated", clerkUserId: "user_other" })).toBe(
      "signedOut",
    );
    expect(decideGate({ ...base, server: "loading", clerkUserId: "user_other" })).toBe("loading");
  });

  it("not invited (or deactivated) wins over the snapshot", () => {
    expect(decideGate({ ...base, server: "notInvited" })).toBe("notInvited");
  });

  it("without a snapshot: loading, then the sign-in-again message", () => {
    expect(decideGate({ ...base, snapshotClerkUserId: null })).toBe("loading");
    expect(decideGate({ ...base, server: "unauthenticated", snapshotClerkUserId: null })).toBe(
      "signedOut",
    );
  });
});

describe("gateClerkUserId (F-09 owner guard, offline Save)", () => {
  const snapshot = { memberId: "m_buwa", clerkUserId: "user_buwa" };
  const live = { decision: "live" as const, memberId: "m_buwa", snapshot };

  it("uses Clerk's userId while it has one", () => {
    expect(gateClerkUserId({ ...live, clerkUserId: "user_buwa" })).toBe("user_buwa");
  });

  it("offline, Clerk drops its userId: the same member's saved Clerk user (the e2e bug)", () => {
    expect(gateClerkUserId({ ...live, clerkUserId: null })).toBe("user_buwa");
  });

  it("never borrows another member's Clerk user", () => {
    expect(gateClerkUserId({ ...live, memberId: "m_other", clerkUserId: null })).toBeNull();
  });

  it("snapshot mode uses the snapshot; loading or signed out has no owner", () => {
    expect(gateClerkUserId({ ...live, decision: "snapshot", clerkUserId: undefined })).toBe(
      "user_buwa",
    );
    expect(gateClerkUserId({ ...live, decision: "loading", clerkUserId: "user_buwa" })).toBeNull();
    expect(gateClerkUserId({ ...live, decision: "signedOut", clerkUserId: null })).toBeNull();
  });
});

describe("gateServer (F-13 / ADR-034 invite claim)", () => {
  it("a not-invited answer is checked for an invite before it counts", () => {
    expect(gateServer("notInvited", "idle")).toBe("claiming");
    expect(gateServer("notInvited", "trying")).toBe("claiming");
    expect(gateServer("notInvited", "none")).toBe("notInvited");
    expect(gateServer("member", "trying")).toBe("member");
    expect(gateServer("signedOut", "idle")).toBe("unauthenticated");
    expect(gateServer("loading", "none")).toBe("loading");
  });

  it("while claiming, a deactivated member's snapshot is never shown", () => {
    // The server has already said this session is not an active member.
    expect(decideGate({ ...base, server: "claiming" })).toBe("loading");
  });

  it("claims once, and checks again after a claimed member is later deactivated", () => {
    let claim = nextClaim("notInvited", "idle");
    expect(claim).toBe("trying");
    expect(nextClaim("notInvited", claim)).toBe("trying"); // no second call while it runs
    claim = nextClaim("member", claim); // claimed → members.me confirms the member
    expect(claim).toBe("idle");
    claim = nextClaim("notInvited", claim); // an admin deactivated them
    expect(claim).toBe("trying");
    expect(gateServer("notInvited", "none")).toBe("notInvited"); // the retry found no invite
    expect(nextClaim("loading", "none")).toBe("none");
  });
});
