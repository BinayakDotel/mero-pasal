"use client";

import { CaptureScreen } from "@/features/capture/capture-screen";

// F-03 capture flow: its own route so its code stays out of Today's bundle (NFR-03).
export default function CapturePage() {
  return <CaptureScreen />;
}
