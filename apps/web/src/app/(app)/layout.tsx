"use client";

import type { ReactNode } from "react";
import { CaptureProvider } from "@/features/capture/capture-provider";
import { MemberGate } from "@/features/session/member-gate";
import { SyncProvider } from "@/features/sync/sync-provider";

/** Buwa's app (architecture §12): every screen here needs an active member. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MemberGate>
      <SyncProvider>
        <CaptureProvider>
          <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">{children}</div>
        </CaptureProvider>
      </SyncProvider>
    </MemberGate>
  );
}
