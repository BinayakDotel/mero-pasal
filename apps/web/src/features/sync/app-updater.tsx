"use client";

import { ClerkFailed } from "@clerk/nextjs";
import { useSerwist } from "@serwist/turbopack/react";
import { useEffect, useRef, useState } from "react";
import { useCapture } from "@/features/capture/capture-provider";
import { isCameraOpen } from "@/features/capture/use-camera";
import { useConnection } from "./use-connection";

/** How long the app must sit idle and on screen before it updates or reloads. */
const SETTLE_MS = 3_000;
/** Held (shared) by every tab while a bill is open; an update needs it free in all tabs. */
const BUSY_LOCK = "mp-capture-busy";
/** At most one recovery reload this often, so an unreachable Clerk can't cause a reload loop. */
const RECOVERY_GAP_MS = 5 * 60_000;
const RECOVERY_KEY = "mp-recovery-reload";

type Action = "skipWaiting" | "reload" | "recover";

/**
 * Architecture §8.4: the app never swaps code or reloads while a bill is being made.
 * - A new version waits until no tab has a bill open and this one is idle and on screen, then
 *   takes over; each tab reloads once it is idle too.
 * - After an offline cold start, Clerk's script failed to load and won't retry; once the server
 *   connection comes back (also "Wi-Fi was on, internet returned"), the app reloads when idle
 *   so sign-in and sync start again.
 */
export function AppUpdater() {
  const { serwist } = useSerwist();
  const { state } = useCapture();
  const idle = state.step === "idle";
  const [update, setUpdate] = useState<"none" | "waiting" | "active">("none");
  const [reconnected, setReconnected] = useState(false);
  const sawWaiting = useRef(false);

  useEffect(() => (idle ? undefined : holdBusy()), [idle]);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => {
      sawWaiting.current = true;
      setUpdate((u) => (u === "active" ? u : "waiting"));
    };
    const onControlling = (event: { isUpdate?: boolean }) => {
      // Not the very first install (the page that did the first install has isUpdate false).
      if (event.isUpdate || sawWaiting.current) setUpdate("active");
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    // A version may already be waiting (found on an earlier visit, or before this listener).
    void navigator.serviceWorker
      ?.getRegistration()
      .then((registration) => {
        if (registration?.waiting) onWaiting();
      })
      .catch(() => undefined);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, [serwist]);

  const action: Action | null =
    update === "active"
      ? "reload"
      : reconnected
        ? "recover"
        : update === "waiting"
          ? "skipWaiting"
          : null;

  useEffect(() => {
    if (!action || !idle) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        if (isCameraOpen()) return arm(); // a photo is on its way into a bill
        if (action === "skipWaiting")
          void skipWaiting().then((sent) => sent || arm()); // another tab has a bill open
        else reload(action === "reload");
      }, SETTLE_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    window.addEventListener("pointerdown", arm, { passive: true }); // Buwa is tapping: wait
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
      window.removeEventListener("pointerdown", arm);
    };
  }, [action, idle]);

  return (
    <ClerkFailed>
      <OnReconnect onReconnect={() => setReconnected(true)} />
    </ClerkFailed>
  );
}

/** Calls `onReconnect` when the server connection comes back (not if it was already up). */
function OnReconnect({ onReconnect }: { onReconnect: () => void }) {
  const connected = useConnection();
  const was = useRef(connected);
  useEffect(() => {
    if (connected && !was.current) onReconnect();
    was.current = connected;
  }, [connected, onReconnect]);
  return null;
}

/** An update always reloads; a recovery reload at most once per RECOVERY_GAP_MS. */
function reload(isUpdate: boolean): void {
  if (!isUpdate) {
    try {
      const last = Number(sessionStorage.getItem(RECOVERY_KEY) ?? 0);
      if (Date.now() - last < RECOVERY_GAP_MS) return;
      sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    } catch {
      // no storage: reload anyway (one reload per reconnect)
    }
  }
  window.location.reload();
}

/** Mark this tab busy until the returned release is called. */
function holdBusy(): () => void {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  void navigator.locks?.request(BUSY_LOCK, { mode: "shared" }, () => held).catch(() => undefined);
  return release;
}

/** Tell the waiting version to take over, only if no tab has a bill open. */
async function skipWaiting(): Promise<boolean> {
  const send = async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    return true;
  };
  if (!navigator.locks) return send();
  return navigator.locks.request(BUSY_LOCK, { ifAvailable: true }, (lock) =>
    lock ? send() : false,
  );
}
