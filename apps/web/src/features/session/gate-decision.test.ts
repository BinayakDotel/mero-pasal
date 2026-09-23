import { describe, expect, it } from "vitest";
import { decideGate, type GateInput } from "./gate-decision";

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
