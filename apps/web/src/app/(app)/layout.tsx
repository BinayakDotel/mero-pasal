"use client";

import type { ReactNode } from "react";
import { MemberGate } from "@/features/session/member-gate";

/** Buwa's app (architecture §12): every screen here needs an active member. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MemberGate>
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">{children}</div>
    </MemberGate>
  );
}
