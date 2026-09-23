"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useConvex } from "convex/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMember } from "@/features/session/member-gate";
import { getDb, requestPersistence } from "./db";
import type { OutboxDeps } from "./outbox";
import { OUTBOX_CHANGED } from "./outbox-store";
import { type PassReport, SyncEngine } from "./sync-engine";
import { uploadBlob } from "./upload";

const TICK_MS = 60_000;
const HEARTBEAT_MS = 5 * 60_000;

type SyncValue = {
  report: PassReport | null;
  engine: SyncEngine;
  owner: { memberId: string; clerkId: string } | null;
};
const SyncContext = createContext<SyncValue | null>(null);

/** Runs the one sync engine for this device (F-09) while Buwa's app is open. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const convex = useConvex();
  const { userId } = useAuth();
  const { member } = useMember();
  const owner = useMemo(
    () => (userId ? { memberId: member._id as string, clerkId: userId } : null),
    [member._id, userId],
  );
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [report, setReport] = useState<PassReport | null>(null);
  const lastBeat = useRef<{ at: number; drained: boolean } | null>(null);

  const engine = useMemo(() => {
    const deps: OutboxDeps = {
      createParty: (args) => convex.mutation(api.parties.create, args),
      generateUploadUrl: () => convex.mutation(api.files.generateUploadUrl, {}),
      upload: uploadBlob,
      createTx: ({ partyRef, photos, ...rest }) =>
        convex.mutation(api.transactions.createFromClient, {
          ...rest,
          ...(partyRef === undefined
            ? {}
            : { partyRef: "id" in partyRef ? { id: partyRef.id as Id<"parties"> } : partyRef }),
          photos: photos.map((p) => ({
            ...p,
            storageId: p.storageId as Id<"_storage">,
            thumbId: p.thumbId as Id<"_storage">,
          })),
        }),
    };
    return new SyncEngine({
      db: getDb(),
      deps,
      now: () => Date.now(),
      isConnected: () => navigator.onLine && convex.connectionState().isWebSocketConnected,
      identity: () => ownerRef.current,
      withLock: async (fn) => {
        if (!navigator.locks) return fn();
        await navigator.locks.request("mp-sync", { ifAvailable: true }, async (lock) => {
          if (lock) await fn();
        });
      },
      onPass: (next) => {
        setReport(next);
        const beat = lastBeat.current;
        const now = Date.now();
        if (!beat || beat.drained !== next.drained || now - beat.at > HEARTBEAT_MS) {
          lastBeat.current = { at: now, drained: next.drained };
          void convex
            .mutation(api.members.heartbeat, {
              drained: next.drained,
              pending: next.pending,
              failed: next.failed,
              foreignPending: next.foreignPending,
              ...(next.oldestPendingAt === undefined
                ? {}
                : { oldestPendingAt: next.oldestPendingAt }),
            })
            .catch(() => undefined); // best effort
        }
      },
    });
  }, [convex]);

  useEffect(() => {
    void requestPersistence();
    const kick = () => void engine.kick();
    const onVisible = () => document.visibilityState === "visible" && kick();
    kick();
    window.addEventListener(OUTBOX_CHANGED, kick);
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = convex.subscribeToConnectionState((s) => s.isWebSocketConnected && kick());
    const timer = setInterval(kick, TICK_MS);
    return () => {
      window.removeEventListener(OUTBOX_CHANGED, kick);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
      clearInterval(timer);
    };
  }, [engine, convex]);

  // Signing in (or the Clerk token arriving) is a reason to try again.
  useEffect(() => {
    if (owner) void engine.kick();
  }, [owner, engine]);

  const value = useMemo(() => ({ report, engine, owner }), [report, engine, owner]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside <SyncProvider>");
  return value;
}
