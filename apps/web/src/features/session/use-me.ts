"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type MeState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notInvited" }
  | { status: "member"; me: NonNullable<FunctionReturnType<typeof api.members.me>> };

/**
 * F-01: who is using the app. Waits for Convex to accept the Clerk token before asking
 * `members.me`, so a slow token never looks like "not invited".
 */
export function useMe(): MeState {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.members.me, isAuthenticated ? {} : "skip");
  if (isLoading) return { status: "loading" };
  if (!isAuthenticated) return { status: "signedOut" };
  if (me === undefined) return { status: "loading" };
  if (me === null) return { status: "notInvited" };
  return { status: "member", me };
}
