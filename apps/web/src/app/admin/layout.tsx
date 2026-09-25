"use client";

import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/admin-shell";
import { MemberGate } from "@/features/session/member-gate";

/** Binayak's console (architecture §12): signed in (proxy.ts), a member, and an admin. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <MemberGate>
      <AdminShell>{children}</AdminShell>
    </MemberGate>
  );
}
