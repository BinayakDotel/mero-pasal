"use client";

import { useRef } from "react";

/**
 * ADR-009: the phone's own camera via a file input (rear camera, full sensor quality). `open()`
 * must run inside a tap handler. Cancelling the camera simply calls nothing.
 */
export function useCamera(onPhoto: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
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
        if (file) onPhoto(file);
      }}
    />
  );
  return { input, open: () => inputRef.current?.click() };
}
