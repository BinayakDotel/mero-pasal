"use client";

import { useEffect, useRef } from "react";

/** A camera left open this long is treated as closed (a missed cancel must not block updates). */
const CAMERA_MAX_MS = 120_000;
let openSince: number | null = null;

/** The phone's camera is open for this app (architecture §8.4: no update or reload meanwhile). */
export function isCameraOpen(now = Date.now()): boolean {
  return openSince !== null && now - openSince < CAMERA_MAX_MS;
}

/**
 * ADR-009: the phone's own camera via a file input (rear camera, full sensor quality). `open()`
 * must run inside a tap handler. Cancelling the camera simply calls nothing.
 */
export function useCamera(onPhoto: (file: File) => void | Promise<void>) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    const closed = () => {
      openSince = null;
    };
    input?.addEventListener("cancel", closed);
    return () => input?.removeEventListener("cancel", closed);
  }, []);

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // the same photo can be chosen again after a retake
        if (!file) {
          openSince = null;
          return;
        }
        // Still "open" until the photo is in the bill, so nothing reloads in between.
        void Promise.resolve(onPhoto(file)).finally(() => {
          openSince = null;
        });
      }}
    />
  );
  return {
    input,
    open: () => {
      openSince = Date.now();
      inputRef.current?.click();
    },
  };
}
