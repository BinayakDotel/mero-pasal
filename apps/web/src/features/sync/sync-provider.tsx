"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useConvex, useConvexAuth } from "convex/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMemberIdentity } from "@/features/session/member-gate";
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
  const identity = useMemberIdentity();
  const { isAuthenticated } = useConvexAuth();
  // Saving needs only who the member is (snapshot is fine offline); sending also needs the
  // server to have confirmed that member for this session, so another account's session can
  // never carry these items (architecture §8.4).
  const owner = useMemo(
    () => (identity ? { memberId: identity.memberId, clerkId: identity.clerkUserId } : null),
    [identity],
  );
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const canSend = Boolean(identity?.confirmed && isAuthenticated);
  const senderRef = useRef(canSend ? owner : null);
  senderRef.current = canSend ? owner : null;
  useEffect(() => {
    senderRef.current = canSend ? owner : null; // again here: Strict Mode re-runs the cleanup
    return () => {
      senderRef.current = null; // leaving the app shell: an in-flight pass stops here
    };
  }, [canSend, owner]);
  const [report, setReport] = useState<PassReport | null>(null);
  const lastBeat = useRef<{ at: number; drained: boolean } | null>(null);
  // Wake the engine when its next item is due (a removal's undo window, a backoff), instead of
  // waiting for the minute tick.
  const wake = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const kickRef = useRef<() => void>(() => undefined);

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
      correctTx: ({ partyRef, ...rest }) =>
        convex.mutation(api.transactions.correct, {
          ...rest,
          ...(partyRef === undefined
            ? {}
            : { partyRef: "id" in partyRef ? { id: partyRef.id as Id<"parties"> } : partyRef }),
        }),
      removeTx: (args) => convex.mutation(api.transactions.remove, args),
    };
    return new SyncEngine({
      db: getDb(),
      deps,
      now: () => Date.now(),
      isConnected: () => navigator.onLine && convex.connectionState().isWebSocketConnected,
      identity: () => senderRef.current,
      owner: () => ownerRef.current,
      withLock: async (fn) => {
        if (!navigator.locks) return fn();
        await navigator.locks.request("mp-sync", { ifAvailable: true }, async (lock) => {
          if (lock) await fn();
        });
      },
      onPass: (next) => {
        setReport(next);
        clearTimeout(wake.current);
        const wakeAt = Math.min(
          next.nextDueAt ?? Number.POSITIVE_INFINITY,
          next.pausedUntil > Date.now() ? next.pausedUntil : Number.POSITIVE_INFINITY,
        );
        if (wakeAt < Number.POSITIVE_INFINITY) {
          wake.current = setTimeout(() => kickRef.current(), wakeAt - Date.now() + 50);
        }
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
  kickRef.current = () => void engine.kick();
  useEffect(() => () => clearTimeout(wake.current), []);

  useEffect(() => {
    void requestPersistence();
    const kick = () => void engine.kick();
    const onVisible = () => document.visibilityState === "visible" && kick();
    kick();
    window.addEventListener(OUTBOX_CHANGED, kick);
    const reconnected = () => void engine.resumeAfterReconnect();
    window.addEventListener("online", reconnected);
    document.addEventListener("visibilitychange", onVisible);
    // Only a real disconnected → connected change ends a backoff (the state reports often).
    let wasConnected = convex.connectionState().isWebSocketConnected;
    const unsubscribe = convex.subscribeToConnectionState((s) => {
      if (s.isWebSocketConnected && !wasConnected) reconnected();
      else if (s.isWebSocketConnected) kick();
      wasConnected = s.isWebSocketConnected;
    });
    const timer = setInterval(kick, TICK_MS);
    return () => {
      window.removeEventListener(OUTBOX_CHANGED, kick);
      window.removeEventListener("online", reconnected);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
      clearInterval(timer);
    };
  }, [engine, convex]);

  // The server confirming the member for this session: end any auth pause and send now.
  useEffect(() => {
    if (canSend) void engine.resumeAfterAuth();
  }, [canSend, engine]);

  const value = useMemo(() => ({ report, engine, owner }), [report, engine, owner]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside <SyncProvider>");
  return value;
}
